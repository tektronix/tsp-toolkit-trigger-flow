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
}

impl TriggerModelState {
    /// True when the model's binding no longer matches current hardware.
    /// Stale in either of two cases:
    ///   - the slot at `(node_id, slot_index)` now holds a different module
    ///     (or has been removed) than the recorded `slot_module` snapshot;
    ///   - `slot_module` is `None` — a broken state that should not occur
    ///     after creation or recall backfill; surfacing it as stale prompts
    ///     the user to rebind rather than hiding the corruption.
    pub fn is_stale(&self, list: &SlotChannelList) -> bool {
        let Some(expected) = self.slot_module else {
            return true;
        };
        self.current_module(list) != Some(expected)
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
