//temporary file to define HashMap
use crate::api::slot_channel_list::{ChannelIndex, SlotIndex};
use std::collections::HashMap;

pub struct SlotChannelHashMap {
    map: HashMap<String, (SlotIndex, Option<ChannelIndex>)>,
}

impl SlotChannelHashMap {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }

    // pub fn insert(&mut self, block_id: String, slot_index: SlotIndex, channel_index: Option<ChannelIndex>) -> bool {
    //     //returns false if the slot, channel combination already exists in the hashmap
    //     let key = format!("slot{:?}_channel{:?}", slot_index, channel_index.unwrap_or(slot_channel_list::ChannelIndex(0)));
    //     if self.map.contains_key(&key) {
    //         return false;
    //     }
    //     self.map.insert(key, (slot_index, channel_index));
    //     true
    // }

    // pub fn contains(&self, slot_index: SlotIndex, channel_index: Option<ChannelIndex>) -> bool {
    //     let key = format!("slot{:?}_channel{:?}", slot_index, channel_index.unwrap_or(0));
    //     self.map.contains_key(&key)
    // }
}

/*
    One model-one slot
    modelA on slot1, then modelB on slot1 can be decided on UI?
    backend gets model,slot. for channels, iterate through blocks, if any block has channel index,
        check it against the slot's available channels
        and also put in HashMap if that slot, channel combination not already present in HashMap.

    modelA has (slot1,channel1), then modelB cannot have (slot1,channel1) -use HashMap for this check.

*/
