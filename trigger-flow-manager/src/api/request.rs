use crate::{api::state::SystemConfiguration, model::trigger_model_block::BlockPosition};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Data needed to create a new block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockData {
    pub block_type: String,
    pub position: BlockPosition,
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
pub enum Request {
    InitialRequest {
        system_config: SystemConfiguration,
    },
    AddModel {
        model_name: String,
    },
    AddBlock {
        model_name: String,
        block_data: BlockData,
    },
    UpdateBlock {
        model_name: String,
        block_id: u32,
        block_data: BlockData,
    },
    DeleteBlock {
        model_name: String,
        block_id: u32,
    },
}
//more request types will eventually be added
