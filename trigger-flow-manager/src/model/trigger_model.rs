use crate::{
    api::state::TriggerModelState, model::trigger_model_block::TriggerModelBlock, Catalog,
};
use anyhow::Result;
use std::collections::HashMap;

#[derive(Debug, Clone)]

pub struct TriggerModel {
    pub model_name: String,
    pub model_blocks: HashMap<u32, TriggerModelBlock>,
}

impl TriggerModel {}
