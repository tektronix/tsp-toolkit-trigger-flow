use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{
    api::{
        request::ResponseType,
        slot_channel_list::{ChannelIndex, SlotChannelList, SlotChannelListUpdate, SlotIndex},
    },
    model::trigger_model_block::TriggerModelBlock,
    Catalog,
};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerFlowState {
    pub slot_channel_list: SlotChannelList,
    pub models: HashMap<String, TriggerModelState>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerModelState {
    pub model_name: String,
    pub slot_index: SlotIndex,
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
        if self.slot_channel_list.slots.is_empty() {
            match SlotChannelList::new(&system_config) {
                Ok(new_list) => {
                    self.slot_channel_list = new_list;
                    let response = ResponseType::InitialResponse {
                        slot_channel_list: self.slot_channel_list.clone(),
                        catalog: catalog.clone(),
                    };
                    serde_json::to_string(&response)
                        .unwrap_or_else(|_| "{\"error\":\"Serialization failed\"}".to_string())
                }
                Err(_e) => {
                    //ToDo- add error handling
                    "".to_string()
                }
            }
            //return the response as json string
        } else {
            match SlotChannelList::update_slot_channel_list(
                &mut self.slot_channel_list,
                SlotChannelListUpdate::SystemConfig(system_config.to_string()),
            ) {
                Ok(new_list) => {
                    self.slot_channel_list = new_list;
                    let response = ResponseType::EvaluateResponse {
                        trigger_flow_state: self.clone(),
                    };
                    serde_json::to_string(&response)
                        .unwrap_or_else(|_| "{\"error\":\"Serialization failed\"}".to_string());
                }
                Err(_e) => {
                    //ToDo- add error handling
                    "".to_string();
                }
            }
            "".to_string()
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
}
