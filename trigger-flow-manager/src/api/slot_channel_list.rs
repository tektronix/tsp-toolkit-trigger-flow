use serde::{Deserialize, Serialize};

use crate::api::state::TriggerFlowState;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Module {
    #[serde(rename = "MPSU50_2ST")]
    MPSU50_2ST,
    #[serde(rename = "MSMU60_2")]
    MSMU60_2,
    Empty,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SlotIndex(pub u8);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ChannelIndex(pub u8);

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
pub struct Systems {
    pub systems: Vec<SystemConfigJson>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfigJson {
    pub name: String,
    #[serde(rename = "localNode")]
    pub localnode: String,
    #[serde(rename = "isActive")]
    pub is_active: Option<bool>, // Optionally handle isActive
    pub slots: Option<Vec<SlotJson>>,
}

#[derive(Debug, Clone)]
pub enum SlotChannelListUpdate {
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
            .unwrap_or_default()
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
            SlotChannelListUpdate::SystemConfig(system_config) => {
                let config_json: SystemConfigJson = serde_json::from_str(&system_config)
                    .map_err(|e| format!("Failed to parse system configuration JSON: {}", e))?;
                let slots = config_json
                    .slots
                    .unwrap_or_default()
                    .iter()
                    .map(|slot_json| Slot::try_from((&config_json.localnode, slot_json)))
                    .collect::<Result<Vec<_>, _>>()?;

                self.slots = slots;
            }
            SlotChannelListUpdate::TriggerFlowState(triggerflow_state) => {
                for slot in &mut self.slots {
                    for channel in &mut slot.channels {
                        channel.in_use = triggerflow_state
                            .is_channel_in_use(slot.slot_index, channel.channel_index);
                    }
                }
            }
        }
        Ok(SlotChannelList {
            slots: self.slots.clone(),
        })
    }
}

impl TryFrom<(&String, &SlotJson)> for Slot {
    type Error = String;

    fn try_from((localnode, slot_json): (&String, &SlotJson)) -> Result<Self, Self::Error> {
        println!("Parsing slot with ID '{}' and module '{}' for local node '{}'", slot_json.slot_id, slot_json.module, localnode);
        let module = match slot_json.module.as_str() {
            "MPSU50-2ST" => Module::MPSU50_2ST,
            "MSMU60-2" => Module::MSMU60_2,
            "Empty" => Module::Empty,
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
