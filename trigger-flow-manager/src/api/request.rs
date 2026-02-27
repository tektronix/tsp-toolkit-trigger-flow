use serde::{Deserialize, Serialize};

use crate::api::slot_channel_list::{SlotChannelList};
//request types from angular to backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RequestType {
    InitialRequest,
    EvaluateRequest {
        trigger_flow_state: crate::api::state::TriggerFlowState,
    },
}

//response types from backend to angular
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResponseType {
    InitialResponse {
        slot_channel_list: SlotChannelList,
        catalog: crate::Catalog,
    },
    EvaluateResponse {
        trigger_flow_state: crate::api::state::TriggerFlowState,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorType {
    InvalidRequestType(String),
    DeserializationError(String),
    RequestConversionError(String),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResponseWrapper<T> {
    Ok(T),
    Err(String),
}