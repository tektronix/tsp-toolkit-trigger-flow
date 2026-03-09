use crate::api::slot_channel_list::{ChannelIndex, SlotIndex};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ChannelUsage {
    pub model_name: String,
    pub block_id: String,
}
pub struct SlotChannelHashMap {
    channel_usage_map: HashMap<(SlotIndex, ChannelIndex), ChannelUsage>,
}

impl SlotChannelHashMap {
    pub fn new() -> Self {
        Self {
            channel_usage_map: HashMap::new(),
        }
    }

    pub fn check_channel_conflict(
        &self,
        slot: SlotIndex,
        channel: ChannelIndex,
        model: &str,
    ) -> Option<String> {
        if let Some(existing_usage) = self.channel_usage_map.get(&(slot, channel)) {
            if existing_usage.model_name != model {
                return Some(format!(
                    "Channel conflict: Slot {:?} Channel {:?} already used by model '{}' block '{}'",
                    slot, channel, existing_usage.model_name, existing_usage.block_id
                ));
            }
        }
        None
    }

    pub fn add_usage(
        &mut self,
        slot: SlotIndex,
        channel: ChannelIndex,
        model: &str,
        block_id: &str,
    ) {
        self.channel_usage_map.insert(
            (slot, channel),
            ChannelUsage {
                model_name: model.to_string(),
                block_id: block_id.to_string(),
            },
        );
    }

    pub fn clear(&mut self) {
        self.channel_usage_map.clear();
    }
}

/*
 modelA on slot 1 exits, modelB on slot 1 can exist if there is a channel available on slot 1 that is not in use by modelA.
    if modelA is using slot 1 and has block(s) that use channel 1, then modelB can use slot 1 and other channels that are not in use only. If modelA is using slot 1 and channel 1, and modelB wants to use slot 1 and channel 1, then modelB cannot use slot 1 because channel 1 is already in use by modelA.
    if modelA is using slot 1 and has block(S) that use all channels on slot1, then modelB cannot use slot 1 at all because all channels are in use by modelA.
*/
