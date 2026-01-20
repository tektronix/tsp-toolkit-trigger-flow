use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]

pub struct TriggerModelBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub block_parameters: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incoming: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outgoing: Option<String>,
    pub block_position: BlockPosition,
    pub block_id: u32,
}

impl TriggerModelBlock {
    pub fn new() -> Self {
        TriggerModelBlock {
            block_type: String::new(),
            block_parameters: HashMap::new(),
            incoming: None,
            outgoing: None,
            block_position: BlockPosition { x: 0.0, y: 0.0 },
            block_id: 0,
        }
    }

    pub fn add_block() {

    }

    pub fn delete_block() {
        
    }

    pub fn update_block() {
        
    }

    pub fn move_block() {
        
    }

    pub fn evaluate() {
        
    }
}
