use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateBlockGroup {
    pub blocks: Vec<TriggerModelTemplateBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerModelTemplateBlock {
    pub block_id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub block_parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerModelBlock {
    pub block_id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub block_parameters: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incoming: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outgoing: Option<String>,
    pub block_position: BlockPosition,
    pub block_error: Option<Vec<(bool, String)>>,
}

impl TriggerModelBlock {
    /// Extract all channel numbers used by this block as u8 values
    pub fn get_used_channels(&self) -> Vec<u8> {
        let mut channels = Vec::new();

        // Extract single channel_index
        if let Some(channel_idx_param) = self.block_parameters.get("channel_index") {
            // Handle JSON number
            if let Some(channel_idx) = channel_idx_param.as_u64() {
                channels.push(channel_idx as u8);
            }
        }

        // Extract channel_list (both JSON array and comma-separated string formats)
        if let Some(channel_list_param) = self.block_parameters.get("channel_list") {
            match channel_list_param {
                // Handle JSON array format [1, 2, 3]
                serde_json::Value::Array(arr) => {
                    for channel_val in arr {
                        if let Some(ch) = channel_val.as_u64() {
                            channels.push(ch as u8);
                        }
                    }
                }
                // Handle comma-separated string format "1, 2, 3"
                serde_json::Value::String(channel_list_str) => {
                    let channel_numbers: Vec<u8> = channel_list_str
                        .split(',')
                        .filter_map(|s| s.trim().parse().ok())
                        .collect();
                    channels.extend(channel_numbers);
                }
                _ => {}
            }
        }

        channels
    }

    pub fn get_parameter(&self, param_name: &str) -> Option<&serde_json::Value> {
        self.block_parameters.get(param_name)
    }

    pub fn add_error(&mut self, message: String) {
        let err = (true, message);

        if let Some(errors) = self.block_error.as_mut() {
            errors.push(err);
        } else {
            self.block_error = Some(vec![err]);
        }
    }
}
