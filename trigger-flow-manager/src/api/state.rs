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
}

/// Kinds of model-level errors surfaced to the UI.
/// Reason is encoded in the accompanying message string.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelErrorKind {
    /// Binding no longer resolves against current hardware.
    SystemConfig,
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
    /// True when the binding no longer matches current hardware.
    /// Prefer `has_system_config_error()` for consumers reading the
    /// derived field; this exists mainly for direct tests of the predicate.
    pub fn is_stale(&self, list: &SlotChannelList) -> bool {
        self.diagnose_system_config(list).is_some()
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

    /// `Some(msg)` when the binding is broken; `None` when healthy.
    /// Checks in order (first match wins): snapshot missing, node missing,
    /// slot missing, module mismatch.
    fn diagnose_system_config(&self, list: &SlotChannelList) -> Option<String> {
        let Some(expected) = self.slot_module else {
            return Some(format!(
                "Model '{}' has no slot binding. Rebind to recover.",
                self.model_name,
            ));
        };

        let node_exists = self.node_id == "localnode"
            || list.nodes.iter().any(|n| n.node_id == self.node_id);
        if !node_exists {
            return Some(format!(
                "TSP-Link node '{}' is no longer connected. Rebind to recover.",
                self.node_id,
            ));
        }

        match self.current_module(list) {
            None => Some(format!(
                "Slot {} on '{}' is no longer available. Rebind to recover.",
                self.slot_index.0, self.node_id,
            )),
            Some(m) if m != expected => Some(format!(
                "Hardware changed since binding. Was: {:?}. Now: {:?}. Rebind to recover.",
                expected, m,
            )),
            Some(_) => None,
        }
    }

    /// Rewrites `model_error` from scratch.
    pub fn recompute_error(&mut self, list: &SlotChannelList) {
        self.model_error.clear();
        if let Some(msg) = self.diagnose_system_config(list) {
            self.model_error.push((ModelErrorKind::SystemConfig, msg));
        }
    }

    /// Gate for validators and script generation. Only `SystemConfig`
    /// blocks; other kinds are informational.
    pub fn has_system_config_error(&self) -> bool {
        self.model_error
            .iter()
            .any(|(k, _)| matches!(k, ModelErrorKind::SystemConfig))
    }
}

impl TriggerFlowState {
    /// Recompute the response payload after a Systems message arrives.
    ///
    /// Semantics:
    /// - Valid config: replaces `slot_channel_list`, recomputes model errors,
    ///   emits `evaluate_response`. Catalog is attached on fresh init or when
    ///   models are already present (recall completion); otherwise cleared.
    /// - Invalid config (parse-fail or `!is_valid_config()`): resets
    ///   `slot_channel_list` to default, mass-stales every model, emits
    ///   `empty_system_config_error` with the reason in `additional_info` and
    ///   the updated state in `json_value` (empty when no models exist).
    pub fn process_system_config(
        &mut self,
        systems: &Systems,
        catalog: &Catalog,
    ) -> String {
        if DEBUG {
            println!(
                "###process_system_config called with system_config: {:?}",
                self.slot_channel_list
            );
        }

        let is_fresh_init =
            self.slot_channel_list.slots.is_empty() && self.slot_channel_list.nodes.is_empty();

        let build_result = if is_fresh_init {
            SlotChannelList::new(systems)
        } else {
            SlotChannelList::update_slot_channel_list(
                &mut self.slot_channel_list,
                SlotChannelListUpdate::SystemConfig(systems.clone()),
            )
        };

        match build_result {
            Err(e) => {
                eprintln!(
                    "process_system_config: failed to parse Systems payload: {e}"
                );
                self.emit_empty_config(&e)
            }
            Ok(list) if !list.is_valid_config() => {
                self.emit_empty_config("No valid hardware in system config")
            }
            Ok(list) => {
                self.slot_channel_list = list;
                // Recall completion: models were populated by a prior
                // RecallRequest but slot_channel_list was empty until this
                // Systems arrived. In that case the payload must carry
                // catalog. Fresh init also always carries catalog.
                let attach_catalog = is_fresh_init || !self.models.is_empty();
                if attach_catalog {
                    self.catalog = Some(catalog.clone());
                    println!(
                        "###process_system_config returning evaluate_response with catalog"
                    );
                } else {
                    self.catalog = None;
                    println!(
                        "###process_system_config returning evaluate_response without catalog"
                    );
                }
                self.recompute_all_model_errors();

                let response = ResponseType::EvaluateResponse {
                    trigger_flow_state: self.clone(),
                };
                let json_value = match serde_json::to_string(&response) {
                    Ok(s) => s,
                    Err(_) => {
                        return "{\"error\":\"Response serialization failed\"}".to_string()
                    }
                };
                let ipc = IpcData {
                    request_type: "evaluate_response".to_string(),
                    additional_info: "".to_string(),
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
    /// `empty_system_config_error` carrying the state in `json_value` when
    /// models exist. Catalog is left as-is so the UI can still render the
    /// stale models.
    fn emit_empty_config(&mut self, reason: &str) -> String {
        self.slot_channel_list = SlotChannelList::default();
        self.recompute_all_model_errors();

        let json_value = if self.models.is_empty() {
            String::new()
        } else {
            let response = ResponseType::EvaluateResponse {
                trigger_flow_state: self.clone(),
            };
            serde_json::to_string(&response).unwrap_or_default()
        };

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
    fn recompute_error_module_mismatch_message() {
        let list = list_with_local_slot(1, Module::MPSU50_2ST);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));
        m.recompute_error(&list);
        assert_eq!(m.model_error.len(), 1);
        assert!(
            m.model_error[0].1.contains("Hardware changed"),
            "got: {}",
            m.model_error[0].1
        );
    }

    #[test]
    fn recompute_error_clears_on_second_call_when_healed() {
        let stale_list = list_with_local_slot(1, Module::MPSU50_2ST);
        let healthy_list = list_with_local_slot(1, Module::MSMU60_2);
        let mut m = model("localnode", 1, Some(Module::MSMU60_2));

        m.recompute_error(&stale_list);
        assert!(m.has_system_config_error());

        m.recompute_error(&healthy_list);
        assert!(m.model_error.is_empty());
        assert!(!m.has_system_config_error());
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

        let round_tripped: TriggerModelState =
            serde_json::from_str(&json).expect("deserialize");
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
        };

        let response = state.process_system_config(
            &systems_active_mp5_with_module("MSMU60-2"),
            &catalog,
        );
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
        // No models to ship, so json_value stays empty.
        assert_eq!(ipc["json_value"], "");
    }

    #[test]
    fn fresh_init_invalid_config_emits_empty_error_without_state() {
        let catalog = empty_catalog();
        let mut state = TriggerFlowState {
            catalog: None,
            slot_channel_list: SlotChannelList::default(),
            models: IndexMap::new(),
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
        assert_eq!(ipc["json_value"], "");
        // slot_channel_list must be reset so a later Systems retriggers fresh init.
        assert!(state.slot_channel_list.slots.is_empty());
        assert!(state.slot_channel_list.nodes.is_empty());
    }

    #[test]
    fn in_session_valid_update_keeps_models_healthy() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        // Seed prior valid state so we take the in-session branch.
        state
            .process_system_config(
                &systems_active_mp5_with_module("MSMU60-2"),
                &catalog,
            );
        assert!(
            !state.models["tm1"].has_system_config_error(),
            "model should be healthy after matching init"
        );

        // Same module still installed: model stays healthy.
        let response = state.process_system_config(
            &systems_active_mp5_with_module("MSMU60-2"),
            &catalog,
        );
        let ipc = parse_ipc(&response);
        assert_eq!(ipc["request_type"], "evaluate_response");
        assert!(!state.models["tm1"].has_system_config_error());
    }

    #[test]
    fn in_session_parse_fail_mass_stales_and_carries_state() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        state
            .process_system_config(
                &systems_active_mp5_with_module("MSMU60-2"),
                &catalog,
            );

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
        state
            .process_system_config(
                &systems_active_mp5_with_module("MSMU60-2"),
                &catalog,
            );

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
        state
            .process_system_config(
                &systems_active_mp5_with_module("MSMU60-2"),
                &catalog,
            );

        // Break it: mid-session invalid config.
        state.process_system_config(&systems_non_mp5(), &catalog);
        assert!(state.models["tm1"].has_system_config_error());

        // Reconfigure: valid MP5 with matching module. Note: state is now
        // fresh-init-shaped (empty list), so this goes through the fresh-init
        // path and the recall-completion catalog-attach branch fires.
        let response = state.process_system_config(
            &systems_active_mp5_with_module("MSMU60-2"),
            &catalog,
        );
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

        let response = state.process_system_config(
            &systems_active_mp5_with_module("MSMU60-2"),
            &catalog,
        );
        let ipc = parse_ipc(&response);
        assert_eq!(ipc["request_type"], "evaluate_response");
        assert!(state.catalog.is_some(), "recall completion must attach catalog");
    }

    #[test]
    fn in_session_normal_update_clears_catalog() {
        let catalog = empty_catalog();
        let mut state = state_with_one_model(Some(Module::MSMU60_2));
        state.process_system_config(
            &systems_active_mp5_with_module("MSMU60-2"),
            &catalog,
        );
        assert!(state.catalog.is_some());

        // Now delete the seeded model so the next update doesn't look like
        // recall-completion (which would keep catalog attached).
        state.models.clear();

        state.process_system_config(
            &systems_active_mp5_with_module("MSMU60-2"),
            &catalog,
        );
        assert!(
            state.catalog.is_none(),
            "in-session update with no models must clear catalog"
        );
    }
}
