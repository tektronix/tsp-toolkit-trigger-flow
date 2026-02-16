use crate::{
    api::state::SystemConfiguration, model::trigger_model::TriggerModel, validator::Validator,
};
use anyhow::Result;

pub struct InstrumentValidator {
    system_config: SystemConfiguration,
}

impl InstrumentValidator {
    pub fn new(system_config: SystemConfiguration) -> Self {
        Self { system_config }
    }
}

impl Validator for InstrumentValidator {
    fn validate(&self, model: &TriggerModel) -> Result<()> {
        /*For each block
        if block uses slot_index, check it exists in the system_config
        if block uses channel_index, check it exists
        check instrument constraints*/

        for (block_id, block) in &model.model_blocks {
            if let Some(slot_value) = block.block_parameters.get("slot_index") {}

            if let Some(channel_value) = block.block_parameters.get("channel_index") {}
        }
        Ok(())
    }
}
