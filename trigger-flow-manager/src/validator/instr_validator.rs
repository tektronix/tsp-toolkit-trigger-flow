use crate::{
    api::{slot_channel_list::ChannelIndex, state::TriggerFlowState},
    model::trigger_model_block::TriggerModelBlock,
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

    fn extract_channels(&self, block: &mut TriggerModelBlock) -> Vec<ChannelIndex> {
        block
            .get_used_channels()
            .into_iter()
            .map(|channel| ChannelIndex(channel))
            .collect()
    }
}

impl Validator for InstrumentValidator {
    fn validate(&self, trigger_state: &mut TriggerFlowState) -> Result<()> {
        let mut validator = SlotChannelHashMap::new();
        for model in trigger_state.models.values_mut() {
            for block in &mut model.blocks {
                let channels = self.extract_channels(block);

                for channel in channels {
                    if let Some(conflict) = self.slot_channel_hashmap.check_channel_conflict(
                        model.slot_index,
                        channel,
                        &model.model_name,
                    ) {
                        if block.block_error.is_none() {
                            block.block_error = Some(Vec::new());
                        }
                        block
                            .block_error
                            .as_mut()
                            .unwrap()
                            .push((true, conflict));
                    } else {
                        // No conflict, register usage
                        validator.add_usage(
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
