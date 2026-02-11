use crate::{
    api::state::TriggerModelState, model::trigger_model_block::TriggerModelBlock, TriggerBlocks,
};
use anyhow::Result;
use std::collections::HashMap;

#[derive(Debug, Clone)]

pub struct TriggerModel {
    pub model_name: String,
    pub model_blocks: HashMap<u32, TriggerModelBlock>,
    pub next_block_id: u32,
    pub start_block: Option<u32>,
}

impl TriggerModel {
    pub fn new(name: String) -> Self {
        Self {
            model_name: name,
            model_blocks: HashMap::new(),
            next_block_id: 1,
            start_block: None,
        }
    }
}
