use crate::api::state::SystemConfiguration;
//request types from angular to backend
#[derive(Debug, Clone)]
pub enum RequestType {
    InitialRequest {
        system_config: SystemConfiguration,
    },
    EvaluateRequest {
        current_state: crate::api::state::TriggerFlowState,
    },
}

//response types from backend to angular
pub enum ResponseType {
    InitialResponse {
        system_config: SystemConfiguration,
        catalog: crate::TriggerBlocks,
    },
    EvaluateResponse {
        current_state: crate::api::state::TriggerFlowState,
    },
}

pub enum ErrorType {}
