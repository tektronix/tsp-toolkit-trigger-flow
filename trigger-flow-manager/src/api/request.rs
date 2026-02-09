use crate::{api::state::SystemConfiguration, model::trigger_model_block::BlockPosition};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Todo: move somewhere else
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockData {
    pub block_type: String,
    pub position: BlockPosition,
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
pub enum RequestType {
    InitialRequest {
        system_config: SystemConfiguration,
    },
    EvaluateRequest {
        current_state: crate::api::state::TriggerFlowState,
    }
}

pub enum ResponseType {
    InitialResponse {
        catalog: crate::TriggerBlocks,
    },
    EvaluateResponse {
        current_state: crate::api::state::TriggerFlowState,
    }

}
