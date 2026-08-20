// use std::collections::{HashMap};

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::{
    api::{
        request::ResponseType,
        slot_channel_list::{
            ChannelIndex, Module, Slot, SlotChannelList, SlotChannelListUpdate, SlotIndex, Systems,
        },
    },
    debug::DEBUG,
    model::trigger_model_block::TriggerModelBlock,
    Catalog, IpcData,
};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerFlowState {
    pub catalog: Option<Catalog>,
    pub slot_channel_list: SlotChannelList,
    pub models: IndexMap<String, TriggerModelState>,
    pub state_type: Option<StateType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
pub enum StateType {
    Evaluate,
    Recall,
    Systems,
    Init,
}

/// Kinds of model-level errors surfaced to the UI.
/// Reason is encoded in the accompanying message string.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelErrorKind {
    /// Blocking: binding cannot resolve at all against current hardware
    /// (no snapshot, node missing, slot missing, or slot vacated to Empty).
    /// Blocks script generation and validation.
    SystemConfig,
    /// Warning: slot is still populated but the installed module differs
    /// from the snapshot taken when the model was bound. Model remains
    /// functional.
    ModuleChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerModelState {
    #[serde(rename = "trigger_model_name")]
    pub model_name: String,
    pub slot_index: SlotIndex,
    pub node_id: String,
    pub blocks: Vec<TriggerModelBlock>,
    /// Module snapshot taken when the model was created or re-assigned
    /// to a different slot.
    /// `None` on legacy sessions; backfilled on recall from the saved
    /// `slot_channel_list` in the payload.
    #[serde(default)]
    pub slot_module: Option<Module>,
    /// Derived errors. Absent from the wire when empty; repopulated by
    /// `TriggerFlowState::recompute_all_model_errors` after every state change.
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub model_error: Vec<(ModelErrorKind, String)>,
}

impl TriggerModelState {
    /// True when the binding no longer matches current hardware in any way
    /// (blocking OR warning). Prefer `has_system_config_error()` for the
    /// script-gen and validator gate; this predicate keeps existing
    /// direct-diagnose tests short.
    pub fn is_stale(&self, list: &SlotChannelList) -> bool {
        self.diagnose(list).is_some()
    }

    /// Module currently installed at this model's `(node_id, slot_index)`,
    /// or `None` if the slot no longer exists in `list`.
    fn current_module(&self, list: &SlotChannelList) -> Option<Module> {
        let slots: &[Slot] = if self.node_id == "localnode" {
            &list.slots
        } else {
            list.nodes
                .iter()
                .find(|n| n.node_id == self.node_id)
                .and_then(|n| n.slots.as_deref())
                .unwrap_or(&[])
        };
        slots
            .iter()
            .find(|s| s.slot_id == self.slot_index)
            .map(|s| s.module)
    }

    /// Classify the binding against `list`. Returns the error kind + message,
    /// or `None` when the binding is healthy.
    ///
    /// Precedence (first match wins):
    /// 1. Snapshot missing               -> `SystemConfig` (blocking)
    /// 2. Referenced node missing        -> `SystemConfig` (blocking)
    /// 3. Referenced slot missing        -> `SystemConfig` (blocking)
    /// 4. Slot present but module Empty  -> `SystemConfig` (blocking)
    /// 5. Slot present, module differs   -> `ModuleChanged` (warning)
    /// 6. Otherwise                      -> None (healthy)
    fn diagnose(&self, list: &SlotChannelList) -> Option<(ModelErrorKind, String)> {
        let Some(expected) = self.slot_module else {
            return Some((
                ModelErrorKind::SystemConfig,
                format!(
                    "Model '{}' has no slot binding. Rebind to recover.",
                    self.model_name,
                ),
            ));
        };

        let node_exists =
            self.node_id == "localnode" || list.nodes.iter().any(|n| n.node_id == self.node_id);
        if !node_exists {
            return Some((
                ModelErrorKind::SystemConfig,
                format!(
                    "TSP-Link node '{}' is no longer connected. Rebind to recover.",
                    self.node_id,
                ),
            ));
        }

        match self.current_module(list) {
            None => Some((
                ModelErrorKind::SystemConfig,
                format!(
                    "Slot {} on '{}' is no longer available. Rebind to recover.",
                    self.slot_index.0, self.node_id,
                ),
            )),
            Some(Module::Empty) => Some((
                ModelErrorKind::SystemConfig,
                format!(
                    "Slot {} on '{}' is empty. Rebind to recover.",
                    self.slot_index.0, self.node_id,
                ),
            )),
            Some(m) if m != expected => Some((
                ModelErrorKind::ModuleChanged,
                format!(
                    "Module at slot {} changed from {:?} to {:?}. Some parameters may need adjustment.",
                    self.slot_index.0, expected, m,
                ),
            )),
            Some(_) => None,
        }
    }

    /// Rewrites `model_error` from scratch.
    pub fn recompute_error(&mut self, list: &SlotChannelList) {
        self.model_error.clear();
        if let Some(entry) = self.diagnose(list) {
            self.model_error.push(entry);
        }
    }

    /// Blocking gate for validators and script generation.
    /// Warning-only kinds (e.g. `ModuleChanged`) do not fire this.
    pub fn has_system_config_error(&self) -> bool {
        self.model_error
            .iter()
            .any(|(k, _)| matches!(k, ModelErrorKind::SystemConfig))
    }

    /// True when the model carries a `ModuleChanged` warning (module differs
    /// from snapshot but slot is still populated). Informational; does not
    /// gate script generation or the block parameters panel.
    pub fn has_module_changed_warning(&self) -> bool {
        self.model_error
            .iter()
            .any(|(k, _)| matches!(k, ModelErrorKind::ModuleChanged))
    }
}

impl TriggerFlowState {
    /// Recompute the response payload after a Systems message arrives.
    ///
    /// Semantics:
    /// - Initial state (`state_type == None`): parses a new `SlotChannelList`,
    ///   sets `state_type` to `Init`, attaches the catalog, and emits
    ///   `evaluate_response`.
    /// - Existing state: updates the existing `SlotChannelList`, sets
    ///   `state_type` to `Systems`, removes any existing catalog, and emits
    ///   `evaluate_response`.
    /// - Invalid config (parse-fail or `!is_valid_config()`): resets
    ///   `slot_channel_list`, recomputes model errors, and emits
    ///   `empty_system_config_error` with the reason in `additional_info`.
    pub fn process_system_config(&mut self, systems: &Systems, catalog: &Catalog) -> String {
        if DEBUG {
            println!(
                "### process_system_config called with system_config: {:?}",
                self.slot_channel_list
            );
        }

        let is_initial_state = self.state_type.is_none();

        let build_result = if is_initial_state {
            println!("### process_system_config: initial state");
            SlotChannelList::new(systems)
        } else {
            println!("### process_system_config: updating existing state");
            SlotChannelList::update_slot_channel_list(
                &mut self.slot_channel_list,
                SlotChannelListUpdate::SystemConfig(systems.clone()),
            )
        };

        match build_result {
            Err(error) => {
                eprintln!("process_system_config: failed to parse Systems payload: {error}");
                self.emit_empty_config(&error)
            }

            Ok(list) if !list.is_valid_config() => {
                println!("### process_system_config: invalid config detected");
                self.emit_empty_config("No valid hardware in system config")
            }

            Ok(list) => {
                self.slot_channel_list = list;

                if is_initial_state {
                    self.state_type = Some(StateType::Init);
                    self.catalog = Some(catalog.clone());

                    println!("### process_system_config: initial state created with catalog");
                } else {
                    self.state_type = Some(StateType::Systems);
                    if self.catalog.is_some() {
                        self.catalog = None;
                    }

                    println!(
                    "### process_system_config: existing state updated without attaching catalog"
                );
                }

                self.reconcile_derived_state(catalog);

                let response = ResponseType::EvaluateResponse {
                    trigger_flow_state: self.clone(),
                };

                let json_value = match serde_json::to_string(&response) {
                    Ok(value) => value,
                    Err(_) => {
                        return "{\"error\":\"Response serialization failed\"}".to_string();
                    }
                };

                let ipc = IpcData {
                    request_type: "evaluate_response".to_string(),
                    additional_info: String::new(),
                    json_value,
                };

                serde_json::to_string(&ipc)
                    .unwrap_or_else(|_| "{\"error\":\"Serialization failed\"}".to_string())
            }
        }
    }

    /// Common exit for the invalid-config paths (parse-fail and
    /// `!is_valid_config()`). Resets `slot_channel_list` to default so a
    /// subsequent recompute mass-flags every model, then emits
    /// `empty_system_config_error` carrying the full state in `json_value`.
    /// The state is always shipped (even with an empty models map) so the
    /// UI sees the reset `slot_channel_list` and refreshes downstream
    /// widgets like the create-new-model slot dropdown. Catalog is left as-is
    /// so the UI can still render any pre-existing stale models.
    fn emit_empty_config(&mut self, reason: &str) -> String {
        self.slot_channel_list = SlotChannelList::default();
        self.recompute_all_model_errors();

        let response = ResponseType::EvaluateResponse {
            trigger_flow_state: self.clone(),
        };
        let json_value = serde_json::to_string(&response).unwrap_or_default();

        let ipc = IpcData {
            request_type: "empty_system_config_error".to_string(),
            additional_info: reason.to_string(),
            json_value,
        };
        serde_json::to_string(&ipc)
            .unwrap_or_else(|_| "{\"error\":\"Serialization failed\"}".to_string())
    }

    pub fn is_channel_in_use(&self, slot_index: SlotIndex, channel_index: ChannelIndex) -> bool {
        for model in self.models.values() {
            if model.slot_index == slot_index {
                for block in &model.blocks {
                    let used_channels = block.get_used_channels();
                    if used_channels.contains(&channel_index.0) {
                        return true;
                    }
                }
            }
        }
        false
    }
    pub fn reset(&mut self) {
        self.catalog = None;
        self.slot_channel_list = SlotChannelList::default();
        self.models.clear();
    }

    /// Rewrites every model's `model_error` against current hardware.
    /// Must run after any mutation to `slot_channel_list` or `models`,
    /// before validation or response cloning.
    pub fn recompute_all_model_errors(&mut self) {
        let list = &self.slot_channel_list;
        for model in self.models.values_mut() {
            model.recompute_error(list);
        }
    }

    /// Rebuild all derived state (`model_error`, `block_error` clamp notes)
    /// against the current `slot_channel_list`. Order-sensitive: model errors
    /// gate the clamp pass, so recompute must precede clamp.
    ///
    /// Must run after any mutation to `slot_channel_list` or `models`,
    /// before validation or response cloning.
    pub fn reconcile_derived_state(&mut self, catalog: &Catalog) {
        self.recompute_all_model_errors();
        self.clamp_module_constrained_params(catalog);
    }

    /// Walk every model's event-ref parameters and clamp any value whose
    /// catalog constraint depends on the module family (SMU/PSU) currently
    /// installed at the referenced slot. Emits a `block_error` note per
    /// clamp so the user sees the change on the affected block.
    ///
    /// Runs after `recompute_all_model_errors` on any Systems / evaluate /
    /// recall path. Handles both single event refs (`event_id`) and event
    /// lists (`event`). Silently no-ops when the referenced slot is missing
    /// or has no module.
    pub fn clamp_module_constrained_params(&mut self, catalog: &Catalog) {
        // Disjoint-field borrow: iterate models while reading slot_channel_list.
        let TriggerFlowState {
            slot_channel_list,
            models,
            ..
        } = self;
        for model in models.values_mut() {
            // Stale models keep their existing block_error entries. Matches
            // ValidationChain's skip-stale rule and preserves the last-known
            // diagnostic context until the user rebinds.
            if model.has_system_config_error() {
                continue;
            }
            let node_id = model.node_id.as_str();
            for block in model.blocks.iter_mut() {
                // Drop only the previous hardware-origin entries (identified
                // by the `CLAMP_NOTE_PREFIX` marker) before re-adding. This
                // preserves validator-origin errors and any other note left
                // on `block_error` by upstream writers
                if let Some(entries) = block.block_error.as_mut() {
                    entries.retain(|(_, msg)| !msg.starts_with(CLAMP_NOTE_PREFIX));
                    if entries.is_empty() {
                        block.block_error = None;
                    }
                }
                let mut notes: Vec<String> = Vec::new();
                for value in block.block_parameters.values_mut() {
                    clamp_event_refs_in(value, node_id, slot_channel_list, catalog, &mut notes);
                }
                for note in notes {
                    block.add_error(note);
                }
            }
        }
    }
}

/// Prefix marker for every note added by `clamp_module_constrained_params`.
/// Lets the clamp pass identify and remove its own prior entries without
/// touching entries added by validators or other writers. Also consulted
/// by `ValidationChain::validate` so its pre-validation wipe preserves
/// hardware-origin notes across the evaluate / recall round-trip.
///
/// TODO(follow-up): replace with a typed `BlockErrorKind::Clamp` variant on
/// the `block_error` tuple. String matching is fragile if another writer
/// ever produces a message with the same prefix.
pub const CLAMP_NOTE_PREFIX: &str = "Hardware: ";

/// Clamp module-constrained fields inside every event ref reachable from
/// `value`. Handles a single ref (object) or a top-level array of refs.
fn clamp_event_refs_in(
    value: &mut serde_json::Value,
    model_node_id: &str,
    list: &SlotChannelList,
    catalog: &Catalog,
    notes: &mut Vec<String>,
) {
    match value {
        serde_json::Value::Object(_) => {
            clamp_one_event_ref(value, model_node_id, list, catalog, notes);
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                clamp_one_event_ref(item, model_node_id, list, catalog, notes);
            }
        }
        _ => {}
    }
}

/// Rewrite in place any module-constrained fields on the event ref object
/// `{ type, params }`. Pushes one note into `notes` per clamped field.
fn clamp_one_event_ref(
    event_ref: &mut serde_json::Value,
    model_node_id: &str,
    list: &SlotChannelList,
    catalog: &Catalog,
    notes: &mut Vec<String>,
) {
    let Some(obj) = event_ref.as_object_mut() else {
        return;
    };
    let Some(event_type) = obj.get("type").and_then(|v| v.as_str()).map(String::from) else {
        return;
    };
    let Some(event_def) = catalog.trigger_events.get(&event_type) else {
        return;
    };
    let Some(params) = obj.get_mut("params").and_then(|v| v.as_object_mut()) else {
        return;
    };

    // Event params may serialize `slot_index` as a JSON number or numeric string.
    let Some(slot_index) = params.get("slot_index").and_then(|v| {
        v.as_u64()
            .map(|n| n as u8)
            .or_else(|| v.as_str().and_then(|s| s.parse::<u8>().ok()))
    }) else {
        return;
    };

    let event_label = event_def.label.as_deref().unwrap_or(&event_type);

    // When the referenced slot has no usable module, emit a note but leave
    // the stored value alone: we have no valid target to clamp against, and
    // silently rewriting the slot binding would erase the user's intent.
    let family = match current_module_at(model_node_id, slot_index, list) {
        None => {
            notes.push(format!(
                "{}{} event references slot {} which is no longer present in the current hardware. Update the slot binding or delete this block.",
                CLAMP_NOTE_PREFIX, event_label, slot_index,
            ));
            return;
        }
        Some(Module::Empty) => {
            notes.push(format!(
                "{}{} event references slot {} which has no module installed. Update the slot binding, install a module, or delete this block.",
                CLAMP_NOTE_PREFIX, event_label, slot_index,
            ));
            return;
        }
        Some(m) => match m.catalog_family() {
            Some(f) => f,
            None => return,
        },
    };

    for cat_param in &event_def.parameters {
        let Some(constraints) = &cat_param.constraints else {
            continue;
        };
        let Some(branch) = constraints.get(family) else {
            continue;
        };
        let Some(allowed) = branch.options.as_ref().filter(|o| !o.is_empty()) else {
            continue;
        };

        // Compare current value (as a string) against the allowed values.
        let current_str = params.get(&cat_param.name).and_then(|v| {
            v.as_str()
                .map(String::from)
                .or_else(|| v.as_u64().map(|n| n.to_string()))
        });
        if current_str
            .as_ref()
            .is_some_and(|s| allowed.iter().any(|opt| &opt.value == s))
        {
            continue;
        }

        // Clamp to first allowed. Stored as string to match on-wire shape
        // (the UI serializes these as strings; see `notify_event_number`
        // options in `triggerBlocks.yaml`).
        let new_value = allowed[0].value.clone();
        let was = current_str.unwrap_or_else(|| "<missing>".to_string());
        params.insert(
            cat_param.name.clone(),
            serde_json::Value::String(new_value.clone()),
        );
        notes.push(format!(
            "{}Auto-clamped '{}' from '{}' to '{}' (out of range for {})",
            CLAMP_NOTE_PREFIX, cat_param.name, was, new_value, family
        ));
    }
}

/// Module currently installed at `(node_id, slot_index)` in `list`, or
/// `None` if the slot is not present.
fn current_module_at(node_id: &str, slot_index: u8, list: &SlotChannelList) -> Option<Module> {
    let slots: &[Slot] = if node_id == "localnode" {
        &list.slots
    } else {
        list.nodes
            .iter()
            .find(|n| n.node_id == node_id)
            .and_then(|n| n.slots.as_deref())
            .unwrap_or(&[])
    };
    slots
        .iter()
        .find(|s| s.slot_id.0 == slot_index)
        .map(|s| s.module)
}

#[cfg(test)]
mod is_stale_tests {
    use super::*;
    use crate::api::slot_channel_list::{Channel, ChannelIndex, Nodes};

    fn slot(id: u8, module: Module) -> Slot {
        Slot {
            slot_id: SlotIndex(id),
            module,
            channels: vec![Channel {
                channel_index: ChannelIndex(1),
                in_use: false,
            }],
        }
    }

    fn list_with_local_slot(id: u8, module: Module) -> SlotChannelList {
        SlotChannelList {
            localnode: "MP5".to_string(),
            slots: vec![slot(id, module)],
            nodes: vec![],
        }
    }

    fn model(node_id: &str, slot_index: u8, snapshot: Option<Module>) -> TriggerModelState {
        TriggerModelState {
            model_name: "tm1".to_string(),
            slot_index: SlotIndex(slot_index),
            node_id: node_id.to_string(),
            blocks: vec![],
            slot_module: snapshot,
            model_error: vec![],
        }
    }

    #[test]
    fn not_stale_when_snapshot_matches_current_module() {
        let list = list_with_local_slot(1, Module::MSMU60_2);
        let m = model("localnode", 1, Some(Module::MSMU60_2));
        assert!(!m.is_stale(&list));
    }

    #[test]
    fn stale_when_module_differs() {
        let list = list_with_local_slot(1, Module::MPSU50_2ST);
        let m = model("localnode", 1, Some(Module::MSMU60_2));
        assert!(m.is_stale(&list));
    }

    #[test]
    fn stale_when_slot_missing_from_list() {
        let list = list_with_local_slot(2, Module::MSMU60_2);
        let m = model("localnode", 1, Some(Module::MSMU60_2));
        assert!(m.is_stale(&list));
    }

    #[test]
    fn stale_when_snapshot_is_none() {
        let list = list_with_local_slot(1, Module::MSMU60_2);
        let m = model("localnode", 1, None);
        assert!(m.is_stale(&list));
    }

    #[test]
    fn stale_when_referenced_node_missing() {
        let list = SlotChannelList {
            localnode: "MP5".to_string(),
            slots: vec![],
            nodes: vec![Nodes {
                node_id: "node[3]".to_string(),
                mainframe: "MP5".to_string(),
                slots: Some(vec![slot(1, Module::MSMU60_2)]),
            }],
        };
        let m = model("node[5]", 1, Some(Module::MSMU60_2));
        assert!(m.is_stale(&list));
    }

    #[test]
    fn not_stale_on_elevated_node_match() {
        let list = SlotChannelList {
            localnode: "MP5".to_string(),
            slots: vec![],
            nodes: vec![Nodes {
                node_id: "node[3]".to_string(),
                mainframe: "MP5".to_string(),
                slots: Some(vec![slot(1, Module::MSMU60_2)]),
            }],
        };
        let m = model("node[3]", 1, Some(Module::MSMU60_2));
        assert!(!m.is_stale(&list));
    }
}

#[cfg(test)]
mod model_error_tests {
    use super::*;
    use crate::api::slot_channel_list::{Channel, ChannelIndex, Nodes};

    fn slot(id: u8, module: Module) -> Slot {
        Slot {
            slot_id: SlotIndex(id),
            module,
            channels: vec![Channel {
                channel_index: ChannelIndex(1),
                in_use: false,
            }],
        }
    }

    fn list_with_local_slot(id: u8, module: Module) -> SlotChannelList {
        SlotChannelList {
            localnode: "MP5".to_string(),
            slots: vec![slot(id, module)],
            nodes: vec![],
        }
    }

    fn model(node_id: &str, slot_index: u8, snapshot: Option<Module>) -> TriggerModelState {
        TriggerModelState {
            model_name: "tm1".to_string(),
            slot_index: SlotIndex(slot_index),
            node_id: node_id.to_string(),
            blocks: vec![],
            slot_module: snapshot,
            model_error: vec![],
        }
    }

    #[test]
    fn recompute_error_empty_when_healthy() {
        let list = list_with_local_slot(1, Module::MSMU60_2);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));
        m.recompute_error(&list);
        assert!(m.model_error.is_empty());
        assert!(!m.has_system_config_error());
    }

    #[test]
    fn recompute_error_missing_snapshot_message() {
        let list = list_with_local_slot(1, Module::MSMU60_2);
        let mut m = model("localnode", 1, None);
        m.recompute_error(&list);
        assert_eq!(m.model_error.len(), 1);
        assert!(matches!(m.model_error[0].0, ModelErrorKind::SystemConfig));
        assert!(
            m.model_error[0].1.contains("no slot binding"),
            "got: {}",
            m.model_error[0].1
        );
        assert!(m.has_system_config_error());
    }

    #[test]
    fn recompute_error_missing_node_message() {
        let list = SlotChannelList {
            localnode: "MP5".to_string(),
            slots: vec![],
            nodes: vec![Nodes {
                node_id: "node[3]".to_string(),
                mainframe: "MP5".to_string(),
                slots: Some(vec![slot(1, Module::MSMU60_2)]),
            }],
        };
        let mut m = model("node[5]", 1, Some(Module::MSMU60_2));
        m.recompute_error(&list);
        assert_eq!(m.model_error.len(), 1);
        assert!(
            m.model_error[0].1.contains("no longer connected"),
            "got: {}",
            m.model_error[0].1
        );
    }

    #[test]
    fn recompute_error_missing_slot_message() {
        let list = list_with_local_slot(2, Module::MSMU60_2);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));
        m.recompute_error(&list);
        assert_eq!(m.model_error.len(), 1);
        assert!(
            m.model_error[0].1.contains("no longer available"),
            "got: {}",
            m.model_error[0].1
        );
    }

    #[test]
    fn recompute_error_module_mismatch_is_warning() {
        let list = list_with_local_slot(1, Module::MPSU50_2ST);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));
        m.recompute_error(&list);
        assert_eq!(m.model_error.len(), 1);
        assert!(matches!(m.model_error[0].0, ModelErrorKind::ModuleChanged));
        assert!(
            m.model_error[0].1.contains("changed from"),
            "got: {}",
            m.model_error[0].1
        );
        assert!(!m.has_system_config_error());
        assert!(m.has_module_changed_warning());
    }

    #[test]
    fn recompute_error_slot_vacated_to_empty_is_blocking() {
        let list = list_with_local_slot(1, Module::Empty);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));
        m.recompute_error(&list);
        assert_eq!(m.model_error.len(), 1);
        assert!(matches!(m.model_error[0].0, ModelErrorKind::SystemConfig));
        assert!(
            m.model_error[0].1.contains("is empty"),
            "got: {}",
            m.model_error[0].1
        );
        assert!(m.has_system_config_error());
        assert!(!m.has_module_changed_warning());
    }

    #[test]
    fn recompute_error_clears_on_second_call_when_healed() {
        // Slot vacated (Module::Empty) is blocking; slot repopulated with the
        // snapshot module clears the error.
        let stale_list = list_with_local_slot(1, Module::Empty);
        let healthy_list = list_with_local_slot(1, Module::MSMU60_2);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));

        m.recompute_error(&stale_list);
        assert!(m.has_system_config_error());

        m.recompute_error(&healthy_list);
        assert!(m.model_error.is_empty());
        assert!(!m.has_system_config_error());
    }

    #[test]
    fn recompute_error_warning_clears_when_module_restored() {
        let stale_list = list_with_local_slot(1, Module::MPSU50_2ST);
        let healthy_list = list_with_local_slot(1, Module::MSMU60_2);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));

        m.recompute_error(&stale_list);
        assert!(m.has_module_changed_warning());

        m.recompute_error(&healthy_list);
        assert!(m.model_error.is_empty());
        assert!(!m.has_module_changed_warning());
    }

    #[test]
    fn model_error_absent_from_wire_when_empty() {
        let m = model("localnode", 1, Some(Module::MSMU60_2));
        let json = serde_json::to_string(&m).expect("serialize");
        assert!(
            !json.contains("model_error"),
            "empty model_error should be omitted, got: {}",
            json
        );
    }

    #[test]
    fn model_error_present_on_wire_when_non_empty() {
        let list = list_with_local_slot(1, Module::MPSU50_2ST);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));
        m.recompute_error(&list);
        assert!(!m.model_error.is_empty());

        let json = serde_json::to_string(&m).expect("serialize");
        assert!(
            json.contains("model_error"),
            "non-empty model_error should appear on the wire, got: {}",
            json
        );

        let round_tripped: TriggerModelState = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(round_tripped.model_error.len(), 1);
    }
}

#[cfg(test)]
mod process_system_config_tests {
    use super::*;
    use crate::api::slot_channel_list::{SlotJson, SystemConfigJson, Systems};
    use crate::trigger_model_blocks::catalog::ScriptTemplate;
    use std::collections::HashMap;

    fn empty_catalog() -> Catalog {
        Catalog {
            script_template: ScriptTemplate::default(),
            blocks: HashMap::new(),
            trigger_events: HashMap::new(),
            templates: HashMap::new(),
            custom_types: HashMap::new(),
        }
    }

    fn systems_active_mp5_with_module(module: &str) -> Systems {
        Systems {
            systems: vec![SystemConfigJson {
                name: "sys1".to_string(),
                localnode: "MP5103".to_string(),
                is_active: Some(true),
                slots: Some(vec![SlotJson {
                    slot_id: "slot[1]".to_string(),
                    module: module.to_string(),
                }]),
                nodes: None,
            }],
        }
    }

    fn systems_no_active() -> Systems {
        Systems {
            systems: vec![SystemConfigJson {
                name: "sys1".to_string(),
                localnode: "MP5103".to_string(),
                is_active: Some(false),
                slots: None,
                nodes: None,
            }],
        }
    }

    fn systems_non_mp5() -> Systems {
        // Parses fine but is_valid_config() returns false: non-MP5 mainframe.
        Systems {
            systems: vec![SystemConfigJson {
                name: "sys1".to_string(),
                localnode: "2450".to_string(),
                is_active: Some(true),
                slots: None,
                nodes: None,
            }],
        }
    }

    fn state_with_one_model(snapshot: Option<Module>) -> TriggerFlowState {
        let mut state = TriggerFlowState {
            catalog: None,
            slot_channel_list: SlotChannelList::default(),
            models: IndexMap::new(),
            state_type: None,
        };
        state.models.insert(
            "tm1".to_string(),
            TriggerModelState {
                model_name: "tm1".to_string(),
                slot_index: SlotIndex(1),
                node_id: "localnode".to_string(),
                blocks: vec![],
                slot_module: snapshot,
                model_error: vec![],
            },
        );
        state
    }

    fn parse_ipc(response: &str) -> serde_json::Value {
        serde_json::from_str(response).expect("response is valid JSON")
    }

    #[test]
    fn fresh_init_valid_config_emits_evaluate_response() {
        let catalog = empty_catalog();
        let mut state = TriggerFlowState {
            catalog: None,
            slot_channel_list: SlotChannelList::default(),
            models: IndexMap::new(),
            state_type: None,
        };

        let response =
            state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);
        let ipc = parse_ipc(&response);

        assert_eq!(ipc["request_type"], "evaluate_response");
        assert!(!state.slot_channel_list.slots.is_empty());
        assert!(state.catalog.is_some());
    }

    #[test]
    fn fresh_init_parse_fail_emits_empty_error_without_state() {
        let catalog = empty_catalog();
        let mut state = TriggerFlowState {
            catalog: None,
            slot_channel_list: SlotChannelList::default(),
            models: IndexMap::new(),
            state_type: None,
        };

        let response = state.process_system_config(&systems_no_active(), &catalog);
        let ipc = parse_ipc(&response);

        assert_eq!(ipc["request_type"], "empty_system_config_error");
        assert!(
            ipc["additional_info"]
                .as_str()
                .unwrap_or("")
                .contains("No active system"),
            "expected reason in additional_info, got: {}",
            ipc["additional_info"]
        );
        // json_value carries the reset state so the UI refreshes its cached
        // slot_channel_list even though there are no models to ship.
        let payload: serde_json::Value =
            serde_json::from_str(ipc["json_value"].as_str().expect("string")).expect("valid JSON");
        assert!(payload["slot_channel_list"]["slots"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(payload["models"].as_object().unwrap().is_empty());
    }

    #[test]
    fn fresh_init_invalid_config_emits_empty_error_without_state() {
        let catalog = empty_catalog();
        let mut state = TriggerFlowState {
            catalog: None,
            slot_channel_list: SlotChannelList::default(),
            models: IndexMap::new(),
            state_type: None,
        };

        let response = state.process_system_config(&systems_non_mp5(), &catalog);
        let ipc = parse_ipc(&response);

        assert_eq!(ipc["request_type"], "empty_system_config_error");
        assert!(
            ipc["additional_info"]
                .as_str()
                .unwrap_or("")
                .contains("No valid hardware"),
            "got: {}",
            ipc["additional_info"]
        );
        // State carries the reset slot list so the UI refreshes.
        let payload: serde_json::Value =
            serde_json::from_str(ipc["json_value"].as_str().expect("string")).expect("valid JSON");
        assert!(payload["slot_channel_list"]["slots"]
            .as_array()
            .unwrap()
            .is_empty());
        // slot_channel_list must be reset so a later Systems retriggers fresh init.
        assert!(state.slot_channel_list.slots.is_empty());
        assert!(state.slot_channel_list.nodes.is_empty());
    }

    #[test]
    fn in_session_valid_update_keeps_models_healthy() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        // Seed prior valid state so we take the in-session branch.
        state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);
        assert!(
            !state.models["tm1"].has_system_config_error(),
            "model should be healthy after matching init"
        );

        // Same module still installed: model stays healthy.
        let response =
            state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);
        let ipc = parse_ipc(&response);
        assert_eq!(ipc["request_type"], "evaluate_response");
        assert!(!state.models["tm1"].has_system_config_error());
    }

    #[test]
    fn in_session_parse_fail_mass_stales_and_carries_state() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);

        let response = state.process_system_config(&systems_no_active(), &catalog);
        let ipc = parse_ipc(&response);

        assert_eq!(ipc["request_type"], "empty_system_config_error");
        assert!(
            ipc["additional_info"]
                .as_str()
                .unwrap_or("")
                .contains("No active system"),
            "got: {}",
            ipc["additional_info"]
        );

        // State reset to default; model must now be stale.
        assert!(state.slot_channel_list.slots.is_empty());
        assert!(state.models["tm1"].has_system_config_error());

        // json_value must carry the mass-stale state so the UI can render it.
        let payload_str = ipc["json_value"].as_str().expect("json_value is string");
        assert!(!payload_str.is_empty());
        let payload: serde_json::Value =
            serde_json::from_str(payload_str).expect("json_value is valid JSON");
        assert!(payload["models"]["tm1"]["model_error"].is_array());
        assert_eq!(
            payload["models"]["tm1"]["model_error"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn in_session_invalid_config_mass_stales_and_carries_state() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);

        let response = state.process_system_config(&systems_non_mp5(), &catalog);
        let ipc = parse_ipc(&response);

        assert_eq!(ipc["request_type"], "empty_system_config_error");
        assert!(state.slot_channel_list.slots.is_empty());
        assert!(state.models["tm1"].has_system_config_error());

        let payload: serde_json::Value =
            serde_json::from_str(ipc["json_value"].as_str().unwrap()).unwrap();
        assert!(payload["models"]["tm1"]["model_error"]
            .as_array()
            .is_some_and(|a| !a.is_empty()));
    }

    #[test]
    fn healed_after_reconfigure_clears_error() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);

        // Break it: mid-session invalid config.
        state.process_system_config(&systems_non_mp5(), &catalog);
        assert!(state.models["tm1"].has_system_config_error());

        // Reconfigure: valid MP5 with matching module. Note: state is now
        // fresh-init-shaped (empty list), so this goes through the fresh-init
        // path and the recall-completion catalog-attach branch fires.
        let response =
            state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);
        let ipc = parse_ipc(&response);
        assert_eq!(ipc["request_type"], "evaluate_response");
        assert!(!state.models["tm1"].has_system_config_error());
    }

    #[test]
    fn recall_completion_attaches_catalog() {
        let catalog = empty_catalog();
        // Models present but slot list empty: this is the recall-completion
        // shape after handle_recall_request set models before Systems arrived.
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        assert!(state.slot_channel_list.slots.is_empty());
        assert!(state.catalog.is_none());

        let response =
            state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);
        let ipc = parse_ipc(&response);
        assert_eq!(ipc["request_type"], "evaluate_response");
        assert!(
            state.catalog.is_some(),
            "recall completion must attach catalog"
        );
    }

    #[test]
    fn in_session_normal_update_clears_catalog() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);
        assert!(state.catalog.is_some());

        // Now delete the seeded model so the next update doesn't look like
        // recall-completion (which would keep catalog attached).
        state.models.clear();

        state.process_system_config(&systems_active_mp5_with_module("MSMU60-2"), &catalog);
        assert!(
            state.catalog.is_none(),
            "in-session update with no models must clear catalog"
        );
    }
}

#[cfg(test)]
mod clamp_module_constrained_params_tests {
    use super::*;
    use crate::api::slot_channel_list::{Channel, ChannelIndex, SlotChannelList};
    use crate::model::trigger_model_block::{BlockPosition, TriggerModelBlock};
    use crate::trigger_model_blocks::catalog::{
        EventDefinition, Parameter, ParameterConstraint, ParameterOptions, ScriptTemplate,
    };
    use crate::trigger_model_blocks::param_types::ParamTypeName;
    use std::collections::HashMap;

    /// Build a catalog containing only `event_notify_n` with its SMU/PSU
    /// branched constraints on `notify_event_number`.
    fn catalog_with_notify_constraints() -> Catalog {
        fn opt(value: &str) -> ParameterOptions {
            ParameterOptions {
                label: value.to_string(),
                value: value.to_string(),
            }
        }

        let smu_options: Vec<ParameterOptions> = (1u8..=8).map(|n| opt(&n.to_string())).collect();
        let psu_options: Vec<ParameterOptions> = (1u8..=16).map(|n| opt(&n.to_string())).collect();

        let notify_event_number = Parameter {
            name: "notify_event_number".to_string(),
            label: Some("Event Number".to_string()),
            param_type: ParamTypeName::NotifyEventNumber,
            required: true,
            options: None,
            constraints: Some(HashMap::from([
                (
                    "SMU".to_string(),
                    ParameterConstraint {
                        options: Some(smu_options),
                    },
                ),
                (
                    "PSU".to_string(),
                    ParameterConstraint {
                        options: Some(psu_options),
                    },
                ),
            ])),
            default: Some(serde_json::json!("1")),
            range: None,
        };

        let slot_index = Parameter {
            name: "slot_index".to_string(),
            label: Some("Slot".to_string()),
            param_type: ParamTypeName::SlotIndex,
            required: true,
            options: None,
            constraints: None,
            default: None,
            range: None,
        };

        let event_notify_n = EventDefinition {
            label: Some("Notify".to_string()),
            parameters: vec![slot_index, notify_event_number],
            syntax: "slot[{{slot_index}}].trigger.model.EVENT_NOTIFY{{notify_event_number}}"
                .to_string(),
        };

        Catalog {
            script_template: ScriptTemplate::default(),
            blocks: HashMap::new(),
            trigger_events: HashMap::from([("event_notify_n".to_string(), event_notify_n)]),
            templates: HashMap::new(),
            custom_types: HashMap::new(),
        }
    }

    fn slot(id: u8, module: Module) -> Slot {
        Slot {
            slot_id: SlotIndex(id),
            module,
            channels: vec![Channel {
                channel_index: ChannelIndex(1),
                in_use: false,
            }],
        }
    }

    fn notify_block(event_number: &str) -> TriggerModelBlock {
        let event_ref = serde_json::json!({
            "type": "event_notify_n",
            "params": {
                "slot_index": "1",
                "notify_event_number": event_number,
            }
        });
        TriggerModelBlock {
            block_id: "notify1".to_string(),
            block_type: "notify".to_string(),
            block_parameters: HashMap::from([
                (
                    "trigger_block_name".to_string(),
                    serde_json::json!("Notify"),
                ),
                ("event_id".to_string(), event_ref),
            ]),
            incoming: None,
            outgoing: None,
            block_position: BlockPosition { x: 0.0, y: 0.0 },
            block_error: None,
        }
    }

    fn state_with_notify(slot_module: Module, stored_event_number: &str) -> TriggerFlowState {
        let mut state = TriggerFlowState {
            catalog: None,
            slot_channel_list: SlotChannelList {
                localnode: "MP5".to_string(),
                slots: vec![slot(1, slot_module)],
                nodes: vec![],
            },
            models: IndexMap::new(),
            state_type: None,
        };
        state.models.insert(
            "tm1".to_string(),
            TriggerModelState {
                model_name: "tm1".to_string(),
                slot_index: SlotIndex(1),
                node_id: "localnode".to_string(),
                blocks: vec![notify_block(stored_event_number)],
                slot_module: Some(slot_module),
                model_error: vec![],
            },
        );
        state
    }

    fn stored_notify_number(state: &TriggerFlowState) -> String {
        state.models["tm1"].blocks[0]
            .block_parameters
            .get("event_id")
            .and_then(|v| v.get("params"))
            .and_then(|v| v.get("notify_event_number"))
            .and_then(|v| v.as_str())
            .expect("notify_event_number stored as string")
            .to_string()
    }

    #[test]
    fn clamps_out_of_range_value_for_smu() {
        // Slot 1 is SMU (max event 8) but the stored notify targets 13 (only valid on PSU).
        let mut state = state_with_notify(Module::MSMU60_2, "13");
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        assert_eq!(stored_notify_number(&state), "1");
        let errs = state.models["tm1"].blocks[0]
            .block_error
            .as_ref()
            .expect("block_error should carry the clamp note");
        assert_eq!(errs.len(), 1);
        assert!(
            errs[0].1.contains("13") && errs[0].1.contains("SMU"),
            "clamp note should reference old value and family: {}",
            errs[0].1
        );
    }

    #[test]
    fn leaves_in_range_value_untouched() {
        let mut state = state_with_notify(Module::MSMU60_2, "5");
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        assert_eq!(stored_notify_number(&state), "5");
        assert!(state.models["tm1"].blocks[0].block_error.is_none());
    }

    #[test]
    fn psu_accepts_high_values_no_clamp() {
        let mut state = state_with_notify(Module::MPSU50_2ST, "13");
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        assert_eq!(stored_notify_number(&state), "13");
        assert!(state.models["tm1"].blocks[0].block_error.is_none());
    }

    #[test]
    fn flags_but_no_clamp_when_slot_module_is_empty() {
        // Empty module has no family; nothing to clamp against. The
        // stored value stays put and a block_error note explains why.
        let mut state = state_with_notify(Module::Empty, "13");
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        assert_eq!(stored_notify_number(&state), "13");
        let errs = state.models["tm1"].blocks[0]
            .block_error
            .as_ref()
            .expect("empty slot should flag the block");
        assert!(
            errs.iter()
                .any(|(_, msg)| msg.contains("no module installed")),
            "expected 'no module installed' note, got: {:?}",
            errs
        );
    }

    #[test]
    fn flags_but_no_clamp_when_referenced_slot_missing() {
        // Event params point at slot 1 but the list has no slot 1.
        // No valid target to clamp against; flag it and preserve the
        // user's stored binding so they see and fix it explicitly.
        let mut state = state_with_notify(Module::MSMU60_2, "13");
        state.slot_channel_list.slots.clear();
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        assert_eq!(stored_notify_number(&state), "13");
        let errs = state.models["tm1"].blocks[0]
            .block_error
            .as_ref()
            .expect("missing slot should flag the block");
        assert!(
            errs.iter()
                .any(|(_, msg)| msg.contains("no longer present")),
            "expected 'no longer present' note, got: {:?}",
            errs
        );
    }

    #[test]
    fn clamps_inside_event_list() {
        // `wait on event` stores events under `event` as an array.
        let mut state = state_with_notify(Module::MSMU60_2, "1");
        let event_list = serde_json::json!([
            {
                "type": "event_notify_n",
                "params": { "slot_index": "1", "notify_event_number": "14" }
            }
        ]);
        state.models.get_mut("tm1").expect("seed model").blocks[0]
            .block_parameters
            .insert("event".to_string(), event_list);

        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        let list_value = state.models["tm1"].blocks[0]
            .block_parameters
            .get("event")
            .and_then(|v| v.as_array())
            .expect("event stays an array");
        let clamped = list_value[0]
            .get("params")
            .and_then(|p| p.get("notify_event_number"))
            .and_then(|v| v.as_str())
            .unwrap();
        assert_eq!(clamped, "1");
        assert!(state.models["tm1"].blocks[0].block_error.is_some());
    }

    #[test]
    fn clears_block_error_when_slot_heals() {
        // Slot 1 empty -> clamp flags the notify block. Then slot 1 gets
        // a module back; a second clamp pass on the same state must drop
        // the stale note instead of appending another entry alongside it.
        let mut state = state_with_notify(Module::Empty, "13");
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());
        assert!(
            state.models["tm1"].blocks[0].block_error.is_some(),
            "flag should be present while slot is empty"
        );

        // Heal: swap the slot module and drop the model's staleness so the
        // next clamp pass revisits its blocks instead of skipping as stale.
        state.slot_channel_list.slots[0].module = Module::MPSU50_2ST;
        state.models.get_mut("tm1").unwrap().slot_module = Some(Module::MPSU50_2ST);
        state.recompute_all_model_errors();
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        assert!(
            state.models["tm1"].blocks[0].block_error.is_none(),
            "healed slot should clear the previous clamp note; got {:?}",
            state.models["tm1"].blocks[0].block_error
        );
    }

    #[test]
    fn preserves_block_error_on_stale_model() {
        // Stale models keep their existing block_error entries so the
        // last-known diagnostic context survives until the user rebinds.
        let mut state = state_with_notify(Module::Empty, "13");
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());
        let before = state.models["tm1"].blocks[0].block_error.clone();
        assert!(before.is_some());

        // Mark the model stale by dropping the slot entirely so recompute
        // classifies it as system_config-blocking.
        state.slot_channel_list.slots.clear();
        state.recompute_all_model_errors();
        assert!(state.models["tm1"].has_system_config_error());

        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        assert_eq!(
            state.models["tm1"].blocks[0].block_error, before,
            "stale model's block_error must not be touched"
        );
    }

    #[test]
    fn preserves_unrelated_block_error_on_heal() {
        // Simulate a validator-origin entry alongside the clamp note. On
        // heal, only the `Hardware:`-prefixed entry should drop; the
        // validator entry must survive so its diagnostic context is not
        // silently wiped.
        let mut state = state_with_notify(Module::Empty, "13");
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());
        state.models["tm1"].blocks[0]
            .block_error
            .as_mut()
            .expect("clamp entry present")
            .insert(0, (true, "Validator: field foo missing".to_string()));

        // Heal the hardware.
        state.slot_channel_list.slots[0].module = Module::MPSU50_2ST;
        state.models.get_mut("tm1").unwrap().slot_module = Some(Module::MPSU50_2ST);
        state.recompute_all_model_errors();
        state.clamp_module_constrained_params(&catalog_with_notify_constraints());

        let errs = state.models["tm1"].blocks[0]
            .block_error
            .as_ref()
            .expect("validator entry should survive heal");
        assert!(
            errs.iter()
                .any(|(_, msg)| msg == "Validator: field foo missing"),
            "expected validator entry to survive, got: {:?}",
            errs
        );
        assert!(
            !errs.iter().any(|(_, msg)| msg.starts_with("Hardware: ")),
            "expected Hardware entry to be dropped on heal, got: {:?}",
            errs
        );
    }
}
