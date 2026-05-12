// use std::collections::{HashMap};

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::{
    api::{
        request::ResponseType,
        slot_channel_list::{ChannelIndex, SlotChannelList, SlotChannelListUpdate, SlotIndex},
    },
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
}

impl TriggerFlowState {
    //only when the system_config is updated
    pub fn process_system_config(
        &mut self,
        system_config: &str,
        catalog: &'static Catalog,
    ) -> String {
        //if slot_channel_list does not exist for self, initialize
        //initialize the slot_channel_list with the new system_config
        //sent as initial_response
        println!(
            "###process_system_config called with system_config: {:?}",
            self.slot_channel_list
        );
        if self.slot_channel_list.slots.is_empty() && self.slot_channel_list.nodes.is_empty() {
            match SlotChannelList::new(system_config) {
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
                                    request_type: "empty_config_response".to_string(),
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
                SlotChannelListUpdate::SystemConfig(system_config.to_string()),
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
