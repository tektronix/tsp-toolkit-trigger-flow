use serde::{Deserialize, Serialize};

use crate::api::state::TriggerFlowState;

#[derive(Debug,Clone, Serialize, Deserialize)]
pub enum Response {
    Success {state: TriggerFlowState},
    Error {message: String, code: String},
}