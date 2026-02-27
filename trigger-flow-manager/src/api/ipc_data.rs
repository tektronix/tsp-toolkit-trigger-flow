use serde::{Deserialize, Serialize};

use crate::api::{
    request::{ErrorType, RequestType, ResponseType},
    state::TriggerFlowState,
    slot_channel_list::SystemConfigJson,
};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IpcData {
    pub request_type: String,
    pub additional_info: String,
    pub json_value: String,
}

//conversions here

impl TryFrom<&IpcData> for RequestType {
    type Error = ErrorType;

    fn try_from(ipc_data: &IpcData) -> Result<Self, Self::Error> {
        match ipc_data.request_type.as_str() {
            "initial_request" => {
                Ok(RequestType::InitialRequest)
            }
            "evaluate_request" => {
                let current_state: TriggerFlowState = serde_json::from_str(&ipc_data.json_value)
                    .map_err(|e| ErrorType::DeserializationError(e.to_string()))?;
                Ok(RequestType::EvaluateRequest {
                    trigger_flow_state: current_state.clone(),
                })
            }
            _ => Err(ErrorType::InvalidRequestType(format!(
                "Unknown request type: {}",
                ipc_data.request_type
            ))),
        }
    }
}

impl TryFrom<&ResponseType> for IpcData {
    type Error = ErrorType;

    fn try_from(response: &ResponseType) -> Result<Self, Self::Error> {
        match response {
            ResponseType::InitialResponse {
                slot_channel_list,
                catalog,
            } => {
                let json_value = serde_json::to_string(&(slot_channel_list, catalog))
                    .map_err(|e| ErrorType::DeserializationError(e.to_string()))?;
                Ok(IpcData {
                    request_type: "initial_response".to_string(),
                    additional_info: "".to_string(),
                    json_value,
                })
            }
            ResponseType::EvaluateResponse { trigger_flow_state } => {
                let json_value = serde_json::to_string(trigger_flow_state)
                    .map_err(|e| ErrorType::DeserializationError(e.to_string()))?;
                Ok(IpcData {
                    request_type: "evaluate_response".to_string(),
                    additional_info: "".to_string(),
                    json_value,
                })
            }
        }
    }
}
