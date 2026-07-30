use serde::{Deserialize, Serialize};

use crate::{api::slot_channel_list::SlotChannelList, Catalog};
//request types from angular to backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RequestType {
    InitialRequest,
    EvaluateRequest {
        trigger_flow_state: crate::api::state::TriggerFlowState,
    },
    RecallRequest {
        trigger_flow_state: crate::api::state::TriggerFlowState,
    },
}

//response types from backend to angular
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResponseType {
    InitialResponse {
        slot_channel_list: SlotChannelList,
        catalog: Catalog,
    },
    EvaluateResponse {
        #[serde(flatten)]
        trigger_flow_state: crate::api::state::TriggerFlowState,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorType {
    InvalidRequestType(String),
    DeserializationError(String),
    RequestConversionError(String),
}
