use crate::model::trigger_model_block::TriggerModelBlock;
use std::collections::HashMap;

#[derive(Debug, Clone)]

pub struct TriggerModel {
    pub model_name: String,
    pub model_blocks: HashMap<u32, TriggerModelBlock>,
}

impl TriggerModel {}
