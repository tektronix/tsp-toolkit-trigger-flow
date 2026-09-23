use crate::{
    api::{slot_channel_list::ChannelIndex, state::TriggerFlowState},
    model::trigger_model_block::TriggerModelBlock,
    validator::{slot_channel_hashmap::SlotChannelHashMap, Validator},
};
use anyhow::Result;

pub struct InstrumentValidator {}

impl Default for InstrumentValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl InstrumentValidator {
    pub fn new() -> Self {
        Self {}
    }

    fn extract_channels(&self, block: &mut TriggerModelBlock) -> Vec<ChannelIndex> {
        block
            .get_used_channels()
            .into_iter()
            .map(ChannelIndex)
            .collect()
    }
}

impl Validator for InstrumentValidator {
    fn validate(&self, trigger_state: &mut TriggerFlowState) -> Result<()> {
        let mut channel_usage = SlotChannelHashMap::new();
        for model in trigger_state.models.values_mut() {
            // Skip models whose binding is broken (SystemConfig error kind).
            // Their saved channel assignments must not be re-validated
            // against hardware they were not bound against.
            if model.has_system_config_error() {
                continue;
            }
            for block in &mut model.blocks {
                let channels = self.extract_channels(block);

                for channel in channels {
                    if let Some(conflict) = channel_usage.check_channel_conflict(
                        &model.node_id,
                        model.slot_index,
                        channel,
                        &model.model_name,
                    ) {
                        if block.block_error.is_none() {
                            block.block_error = Some(Vec::new());
                        }
                        block.block_error.as_mut().unwrap().push((true, conflict));
                    } else {
                        // No conflict, register usage
                        channel_usage.add_usage(
                            &model.node_id,
                            model.slot_index,
                            channel,
                            model.model_name.as_str(),
                            block.block_id.as_str(),
                        );
                    }
                }
            }
        }
        Ok(())
    }
}
