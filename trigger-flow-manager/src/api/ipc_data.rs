use serde::{Deserialize, Serialize};

use crate::{
    api::{
        request::{ErrorType, RequestType, ResponseType},
        state::TriggerFlowState,
    },
    debug::DEBUG,
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
        println!("###Parsing IpcData request_type: {}", ipc_data.request_type);
        match ipc_data.request_type.as_str() {
            "initial_request" => Ok(RequestType::InitialRequest),
            "evaluate_request" => {
                if DEBUG {
                    println!(
                        "Deserializing TriggerFlowState from IPC data: {}",
                        ipc_data.json_value
                    );
                }
                let current_state: TriggerFlowState = serde_json::from_str(&ipc_data.json_value)
                    .map_err(|e| ErrorType::DeserializationError(e.to_string()))?;
                if DEBUG {
                    println!("Deserialized TriggerFlowState: {:?}", current_state);
                }
                Ok(RequestType::EvaluateRequest {
                    trigger_flow_state: current_state.clone(),
                })
            }
            //for recall
            "evaluate_response" => {
                if DEBUG {
                    println!(
                        "Deserializing TriggerFlowState from IPC data: {}",
                        ipc_data.json_value
                    );
                }
                let current_state: TriggerFlowState = serde_json::from_str(&ipc_data.json_value)
                    .map_err(|e| ErrorType::DeserializationError(e.to_string()))?;
                if DEBUG {
                    println!("Deserialized TriggerFlowState: {:?}", current_state);
                }
                Ok(RequestType::RecallRequest {
                    trigger_flow_state: current_state.clone(),
                })
            }
            //for recall of session with no valid saved system config
            "empty_system_config_error" => {
                if DEBUG {
                    println!(
                        "Deserializing TriggerFlowState from IPC data: {}",
                        ipc_data.json_value
                    );
                }
                let current_state: TriggerFlowState = serde_json::from_str(&ipc_data.json_value)
                    .map_err(|e| ErrorType::DeserializationError(e.to_string()))?;
                if DEBUG {
                    println!("Deserialized TriggerFlowState: {:?}", current_state);
                }
                Ok(RequestType::RecallRequest {
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
        if DEBUG {
            println!("###Converting ResponseType to IpcData: {:?}", response);
        }
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
                // Serialize the entire ResponseType to use #[serde(flatten)] properly
                if trigger_flow_state.catalog.is_some() {
                    println!("###Recall response being sent with catalog");
                } else {
                    println!("###Evaluate response being sent");
                }
                let json_value = serde_json::to_string(response)
                    .map_err(|e| ErrorType::DeserializationError(e.to_string()))?;
                if DEBUG {
                    println!("###Serialized ResponseType JSON: {}", json_value);
                }
                Ok(IpcData {
                    request_type: "evaluate_response".to_string(),
                    additional_info: "".to_string(),
                    json_value,
                })
            }
        }
    }
}
