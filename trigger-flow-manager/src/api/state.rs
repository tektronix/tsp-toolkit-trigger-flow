use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::model::trigger_model_block::TriggerModelBlock;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerFlowState {
    pub system_config: Option<SystemConfiguration>,
    pub models: HashMap<String, TriggerModelState>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerModelState {
    pub model_name: String,
    pub blocks: Vec<TriggerModelBlock>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum InstrumentType {
    SMU,
    PSU,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct SlotIndex(u8);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChannelIndex(u8);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfiguration {
    pub instrument_type: InstrumentType,
    pub slot_index: SlotIndex,
    pub channels: Vec<ChannelIndex>,
    pub(crate) available_channels: Vec<ChannelIndex>,
}
