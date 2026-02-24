use serde::{Deserialize, Serialize};

use crate::api::state::TriggerFlowState;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Module {
    MPSU50_2ST,
    MSMU60_2,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct SlotIndex(u8);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelIndex(u8);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Channel {
    pub channel_index: ChannelIndex,
    pub in_use: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Slot {
    pub slot_index: SlotIndex,
    pub channels: Vec<Channel>,
    pub module: Module,
    pub node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlotJson {
    #[serde(rename = "slotId")]
    pub slot_id: String,
    pub module: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfigJson {
    #[serde(rename = "localNode")]
    pub localnode: String,
    #[serde(rename = "isActive")]
    pub is_active: Option<bool>, // Optionally handle isActive
    pub slots: Vec<SlotJson>,
}

#[derive(Debug, Clone)]
pub enum SlotChannelListUpdate{
    SystemConfig(String),
    TriggerFlowState(TriggerFlowState),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SlotChannelList {
    pub slots: Vec<Slot>,
}

impl Default for SlotChannelList {
    fn default() -> Self {
        SlotChannelList { slots: Vec::new() }
    }
}

impl SlotChannelList {
    pub fn new(system_config_json: &str) -> Result<Self, String> {
        let config_json: SystemConfigJson = serde_json::from_str(system_config_json)
            .map_err(|e| format!("Failed to parse system configuration JSON: {}", e))?;
        let slots = config_json
            .slots
            .iter()
            .map(|slot_json| Slot::try_from((&config_json.localnode, slot_json)))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(SlotChannelList { slots })
    }

    pub fn update_slot_channel_list(
        &mut self,
        update: SlotChannelListUpdate,
    ) -> Result<Self, String> {
        match update {
            SlotChannelListUpdate::SystemConfig(system_config)=> {
                //use system_config to update slot_channel_list
                //what can change?
                    //node
                    //slots, slotID, module, number of channels
                let config_json: SystemConfigJson = serde_json::from_str(&system_config)
                .map_err(|e| format!("Failed to parse system configuration JSON: {}", e))?;
                // let slots
                
            }
            SlotChannelListUpdate::TriggerFlowState(triggerflow_state)=> {
                //use triggerflow_state to update slot_channel_list
                //what can change?
                    //in_use status of channels
            }
        }
        Ok(SlotChannelList { slots:self.slots.clone() })
    }
}

impl TryFrom<(&String, &SlotJson)> for Slot {
    type Error = String;

    fn try_from((localnode, slot_json): (&String, &SlotJson)) -> Result<Self, Self::Error> {
        let module = match slot_json.module.as_str() {
            "MPSU50-2ST" => Module::MPSU50_2ST,
            "MSMU60-2" => Module::MSMU60_2,
            _ => return Err(format!("Unknown module type: {}", slot_json.module)),
        };

        let slot_index = slot_json
            .slot_id
            .trim_start_matches("slot[")
            .trim_end_matches(']')
            .parse::<u8>()
            .map_err(|e| format!("Invalid slot index: {}", e))?;

        let channel_indices = vec![ChannelIndex(1), ChannelIndex(2)];
        Ok(Slot {
            slot_index: SlotIndex(slot_index),
            channels: channel_indices
                .into_iter()
                .map(|ci| Channel {
                    channel_index: ci,
                    in_use: false,
                })
                .collect(),
            module,
            node_id: localnode.clone(),
        })
    }
}
