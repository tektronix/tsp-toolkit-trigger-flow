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
#[serde(rename_all = "camelCase")]
pub struct Slot {
    pub slot_id: SlotIndex,
    pub module: Module,
    pub channels: Vec<Channel>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotJson {
    pub slot_id: String,
    pub module: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeJson {
    pub node_id: String,
    pub mainframe: String,
    pub slots: Option<Vec<SlotJson>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Nodes {
    pub node_id: String,
    pub mainframe: String,
    pub slots: Option<Vec<Slot>>,
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
    pub nodes: Option<Vec<NodeJson>>,
}

#[derive(Debug, Clone)]
pub enum SlotChannelListUpdate {
    SystemConfig(String),
    TriggerFlowState(TriggerFlowState),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SlotChannelList {
    pub localnode: String,
    pub is_valid: bool,
    pub slots: Vec<Slot>,
    pub nodes: Vec<Nodes>,
}

impl Default for SlotChannelList {
    fn default() -> Self {
        SlotChannelList {
            localnode: "MP5103".to_string(),
            is_valid: true,
            slots: Vec::new(),
            nodes: Vec::new(),
        }
    }
}

impl SlotChannelList {
    pub fn new(system_config_json: &str) -> Result<Self, String> {
        let config_json: SystemConfigJson = serde_json::from_str(system_config_json)
            .map_err(|e| format!("Failed to parse system configuration JSON: {}", e))?;

        let _slots = config_json
            .slots
            .unwrap_or_default()
            .iter()
            .map(|slot_json| Slot::try_from(slot_json))
            .collect::<Result<Vec<_>, _>>()?;

        let _nodes = config_json
            .nodes
            .unwrap_or_default()
            .iter()
            .map(|node_json| Nodes::try_from(node_json))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(SlotChannelList {
            localnode: config_json.localnode,
            is_valid: true,
            slots: _slots,
            nodes: _nodes,})
    }

    pub fn update_slot_channel_list(
        &mut self,
        update: SlotChannelListUpdate,
    ) -> Result<Self, String> {
        match update {
            SlotChannelListUpdate::SystemConfig(system_config) => {
                let config_json: SystemConfigJson = serde_json::from_str(&system_config)
                    .map_err(|e| format!("Failed to parse system configuration JSON: {}", e))?;

                self.slots = config_json
                    .slots
                    .unwrap_or_default()
                    .iter()
                    .map(|slot_json| Slot::try_from(slot_json))
                    .collect::<Result<Vec<_>, _>>()?;
            }
            SlotChannelListUpdate::TriggerFlowState(triggerflow_state) => {
                for slot in &mut self.slots {
                    for channel in &mut slot.channels {
                        channel.in_use = triggerflow_state
                            .is_channel_in_use(slot.slot_id, channel.channel_index);
                    }
                }
            }
        }
        Ok(SlotChannelList {
            localnode: self.localnode.clone(),
            is_valid: self.is_valid,
            slots: self.slots.clone(),
            nodes: self.nodes.clone(),
        })
    }
}

impl TryFrom<&SlotJson> for Slot {
    type Error = String;

    fn try_from(slot_json: &SlotJson) -> Result<Self, Self::Error> {
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
            slot_id: SlotIndex(slot_index),
            module,
            channels: channel_indices
                .into_iter()
                .map(|ci| Channel {
                    channel_index: ci,
                    in_use: false,
                })
                .collect(),
        })
    }
}

impl TryFrom<&NodeJson> for Nodes {
    type Error = String;

    fn try_from(node_json: &NodeJson) -> Result<Self, Self::Error> {
        let node_id = node_json.node_id.clone();
        let mainframe = node_json.mainframe.clone();

        // Convert Option<Vec<SlotJson>> to Option<Vec<Slot>>
        let slots = node_json
            .slots
            .as_ref()
            .map(|slot_json| {
                slot_json
                    .iter()
                    .map(Slot::try_from)
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()?;

        Ok(Nodes {
            node_id,
            mainframe,
            slots,
        })
    }
}
