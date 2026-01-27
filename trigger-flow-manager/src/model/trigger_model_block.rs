use std::collections::HashMap;
use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::TriggerBlocks;

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

    pub fn default_block(
        catalog: &TriggerBlocks,
        _block_type: &str,
        _position: BlockPosition,
        _block_id: u32
    ) -> Result<Self>{
        let definition = catalog.get_block(_block_type).ok_or_else(|| anyhow::anyhow!("Block type '{}' not found in catalog", _block_type))?;

        let mut block_parameters = HashMap::new();

        for param in &definition.parameters {
            if let Some(default_value) = &param.default {
                block_parameters.insert(
                    param.name.clone(),
                    default_value.clone(),
                );
            }
        };

        Ok(TriggerModelBlock {
            block_type: _block_type.to_string(),
            block_parameters,
            incoming: None,
            outgoing: None,
            block_position: _position,
            block_id: _block_id,
        })
        
    }
}
