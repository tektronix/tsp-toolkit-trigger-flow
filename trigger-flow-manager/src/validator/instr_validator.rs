use crate::{
    api::state::TriggerModelState, api::slot_channel_list::SlotChannelList,
    model::trigger_model::TriggerModel, validator::Validator,
};
use anyhow::Result;

pub struct InstrumentValidator {
    system_config: SlotChannelList,
}

impl InstrumentValidator {
    pub fn new(system_config: SlotChannelList) -> Self {
        Self { system_config }
    }
}

impl Validator for InstrumentValidator {
    fn validate(&self, model: &TriggerModelState) -> Result<()> {
        /*For each block
        if block uses slot_index, check it exists in the system_config
        if block uses channel_index, check it exists
        check instrument constraints*/
        Ok(())
    }
}
