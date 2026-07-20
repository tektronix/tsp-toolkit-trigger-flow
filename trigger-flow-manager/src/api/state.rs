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
    //only when the system_config is updated
    pub fn process_system_config(
        &mut self,
        systems: &Systems,
        catalog: &'static Catalog,
    ) -> String {
        //if slot_channel_list does not exist for self, initialize
        //initialize the slot_channel_list with the new system_config
        //sent as initial_response
        if DEBUG {
            println!(
                "###process_system_config called with system_config: {:?}",
                self.slot_channel_list
            );
        }
        if self.slot_channel_list.slots.is_empty() && self.slot_channel_list.nodes.is_empty() {
            match SlotChannelList::new(systems) {
                Ok(list) => {
                    self.slot_channel_list = list;
                    if self.slot_channel_list.is_valid_config() {
                        self.catalog = Some(catalog.clone());
                        // Recompute before the response clone below.
                        self.recompute_all_model_errors();
                        let response = ResponseType::EvaluateResponse {
                            trigger_flow_state: self.clone(),
                        };

                        match serde_json::to_string(&response) {
                            Ok(response_json) => {
                                let ipc_response = IpcData {
                                    request_type: "evaluate_response".to_string(),
                                    additional_info: "".to_string(),
                                    json_value: response_json,
                                };
                                serde_json::to_string(&ipc_response).unwrap_or_else(|_| {
                                    "{\"error\":\"Serialization failed\"}".to_string()
                                })
                            }
                            Err(_) => "{\"error\":\"Response serialization failed\"}".to_string(),
                        }
                    } else {
                        let response = ResponseType::EmptyConfigResponse;
                        self.slot_channel_list = SlotChannelList::default();
                        match serde_json::to_string(&response) {
                            Ok(_) => {
                                let ipc_response = IpcData {
                                    request_type: "empty_system_config_error".to_string(),
                                    additional_info: "".to_string(),
                                    json_value: "".to_string(),
                                };
                                serde_json::to_string(&ipc_response).unwrap_or_else(|_| {
                                    "{\"error\":\"Serialization failed\"}".to_string()
                                })
                            }
                            Err(_) => "{\"error\":\"Response serialization failed\"}".to_string(),
                        }
                    }
                }
                Err(_e) => {
                    //ToDo- add error handling
                    "".to_string()
                }
            }
            //return the response as json string
        } else {
            // Recall-completion is detected when slot_channel_list is currently empty
            // but models are already populated (from a prior RecallRequest). Only in
            // that case do we want to attach the catalog to the outgoing payload.
            // Normal in-session config updates should NOT include the catalog.
            let is_recall_completion = !self.models.is_empty();
            match SlotChannelList::update_slot_channel_list(
                &mut self.slot_channel_list,
                SlotChannelListUpdate::SystemConfig(systems.clone()),
            ) {
                Ok(list) => {
                    self.slot_channel_list = list;

                    if is_recall_completion {
                        // Attach catalog so the recall payload sent to the UI is complete.
                        self.catalog = Some(catalog.clone());
                        println!(
                            "###process_system_config returning evaluate_response with catalog (recall completion)"
                        );
                    } else {
                        // In-session update: ensure no stale catalog is sent.
                        self.catalog = None;
                        println!(
                            "###process_system_config returning evaluate_response without catalog (in-session update)"
                        );
                    }
                    // Recompute before the response clone below.
                    self.recompute_all_model_errors();
                    let response = ResponseType::EvaluateResponse {
                        trigger_flow_state: self.clone(),
                    };

                    match serde_json::to_string(&response) {
                        Ok(response_json) => {
                            let ipc_response = IpcData {
                                request_type: "evaluate_response".to_string(),
                                additional_info: "".to_string(),
                                json_value: response_json,
                            };
                            serde_json::to_string(&ipc_response).unwrap_or_else(|_| {
                                "{\"error\":\"Serialization failed\"}".to_string()
                            })
                        }
                        Err(_) => "{\"error\":\"Response serialization failed\"}".to_string(),
                    }
                }
                Err(_e) => {
                    //ToDo- add error handling
                    "".to_string()
                }
            }
        }
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
            is_valid: true,
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
            is_valid: true,
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
            is_valid: true,
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
            is_valid: true,
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
            is_valid: true,
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
