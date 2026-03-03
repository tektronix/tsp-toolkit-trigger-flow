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
    pub block_id: u32,
    pub block_parameters: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incoming: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outgoing: Option<String>,
    pub block_position: BlockPosition,
    pub block_error: Option<Vec<(bool, String)>>,
    //add the error tuple containing error_bool and error_message
}

impl TriggerModelBlock {}
