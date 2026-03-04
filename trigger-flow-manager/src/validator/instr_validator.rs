use crate::{
    api::state::TriggerFlowState,
    validator::{slot_channel_hashmap::SlotChannelHashMap, Validator},
};
use anyhow::Result;

pub struct InstrumentValidator {
    slot_channel_hashmap: SlotChannelHashMap,
}

impl InstrumentValidator {
    pub fn new() -> Self {
        Self {
            slot_channel_hashmap: SlotChannelHashMap::new(),
        }
    }
}

impl Validator for InstrumentValidator {
    fn validate(&self, model: &mut TriggerFlowState) -> Result<()> {
        //iterate through blocks of triggermodels and
        Ok(())
    }
}
