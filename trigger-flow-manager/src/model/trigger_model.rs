use crate::model::trigger_model_block::TriggerModelBlock;

#[derive(Debug, Clone)]

pub struct TriggerModel {
    pub model_name: String,
    pub model_blocks: Vec<TriggerModelBlock>,
}

impl TriggerModel {
    pub fn new() -> Self {
        TriggerModel {
            model_name: String::new(),
            model_blocks: Vec::new(),
        }
    }
}
