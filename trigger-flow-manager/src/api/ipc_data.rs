use serde::{Deserialize, Serialize};

use crate::api::{request::{ErrorType, RequestType, ResponseType}, state::{SystemConfiguration, TriggerFlowState}};

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
            let system_config: SystemConfiguration = serde_json::from_str(&ipc_data.json_value)?;
            Ok(RequestType::InitialRequest { system_config })
        },
        "evaluate_request" => {
            let curret_state: TriggerFlowState = serde_json::from_str(&ipc_data.json_value)?;
            Ok(RequestType::EvaluateRequest { current_state: curret_state.clone() })
    },
    }
    }
}

impl TryFrom<&ResponseType> for IpcData {
    type Error = ErrorType;

    fn try_from(response: &ResponseType) -> Result<Self, Self::Error> {
        match response {
            ResponseType::InitialResponse { system_config, catalog } => {
                let json_value = serde_json::to_string(&(system_config, catalog))?;
                Ok(IpcData {
                    request_type: "initial_response".to_string(),
                    additional_info: "".to_string(),
                    json_value,
                })
            },
            ResponseType::EvaluateResponse { current_state } => {
                let json_value = serde_json::to_string(current_state)?;
                Ok(IpcData {
                    request_type: "evaluate_response".to_string(),
                    additional_info: "".to_string(),
                    json_value,
                })
            }
        }
    }
}