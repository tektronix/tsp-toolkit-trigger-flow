use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::Catalog;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerModelBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub block_name: String,
    pub block_id: String,
    pub block_parameters: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incoming: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outgoing: Option<String>,
    pub block_position: BlockPosition,
    pub block_error: Option<Vec<(bool, String)>>,
    //add the error tuple containing error_bool and error_message
}

impl TriggerModelBlock {
    /// Extract all channel numbers used by this block as u8 values
    pub fn get_used_channels(&self) -> Vec<u8> {
        let mut channels = Vec::new();
        
        // Extract single channel_index
        if let Some(channel_idx_param) = self.block_parameters.get("channel_index") {
            if let Some(channel_idx) = channel_idx_param.as_u64() {
                channels.push(channel_idx as u8);
            }
        }
        
        // Extract channel_list (comma-separated)
        if let Some(channel_list_param) = self.block_parameters.get("channel_list") {
            if let Some(channel_list_str) = channel_list_param.as_str() {
                let channel_numbers: Vec<u8> = channel_list_str
                    .split(',')
                    .filter_map(|s| s.trim().parse().ok())
                    .collect();
                channels.extend(channel_numbers);
            }
        }
        
        channels
    }
}

