use crate::{
    api::{
        ipc_data::IpcData,
        request::{BlockData, Request},
        response::Response,
        state::{SystemConfiguration, TriggerFlowState},
    },
    request_processor::RequestProcessor,
    TriggerBlocks,
};
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct EvaluateDataPayload {
    current_state: TriggerFlowState,
    model_name: Option<String>,
    block_data: Option<BlockData>,
    block_id: Option<u32>,
}

pub fn ipc_to_request(ipc_data: &IpcData) -> Result<(Request, Option<TriggerFlowState>)> {
    match ipc_data.request_type.as_str() {
        "initial_request" => {
            let system_config: SystemConfiguration = serde_json::from_str(&ipc_data.json_value)?;
            Ok((Request::InitialRequest { system_config }, None))
        }
        "evaluate_data" => match ipc_data.additional_info.as_str() {
            "add_model" => {
                let payload: EvaluateDataPayload = serde_json::from_str(&ipc_data.json_value)?;
                let model_name = payload
                    .model_name
                    .ok_or_else(|| anyhow::anyhow!("Model name missing"))?;
                Ok((
                    Request::AddModel { model_name },
                    Some(payload.current_state),
                ))
            }
            "add_block" => {
                let payload: EvaluateDataPayload = serde_json::from_str(&ipc_data.json_value)?;
                let model_name = payload
                    .model_name
                    .ok_or_else(|| anyhow::anyhow!("model_name required"))?;
                let block_data = payload
                    .block_data
                    .ok_or_else(|| anyhow::anyhow!("block_data required"))?;

                Ok((
                    Request::AddBlock {
                        model_name,
                        block_data,
                    },
                    Some(payload.current_state),
                ))
            }
            "update_block" => {
                let payload: EvaluateDataPayload = serde_json::from_str(&ipc_data.json_value)?;
                let model_name = payload
                    .model_name
                    .ok_or_else(|| anyhow::anyhow!("model_name required"))?;
                let block_id = payload
                    .block_id
                    .ok_or_else(|| anyhow::anyhow!("block_id required"))?;

                Ok((
                    Request::UpdateBlock {
                        model_name,
                        block_id,
                    },
                    Some(payload.current_state),
                ))
            }
            "delete_block" => {
                let payload: EvaluateDataPayload = serde_json::from_str(&ipc_data.json_value)?;
                let model_name = payload
                    .model_name
                    .ok_or_else(|| anyhow::anyhow!("model_name required"))?;
                let block_id = payload
                    .block_id
                    .ok_or_else(|| anyhow::anyhow!("block_id required"))?;

                Ok((
                    Request::DeleteBlock {
                        model_name,
                        block_id,
                    },
                    Some(payload.current_state),
                ))
            }
            _ => Err(anyhow::anyhow!(
                "Unknown action: {}",
                ipc_data.additional_info
            )),
        },
        _ => Err(anyhow::anyhow!(
            "Unknown request type: {}",
            ipc_data.request_type
        )),
    }
}

pub fn response_to_ipc(response: &Response) -> Result<IpcData> {
    match response {
        Response::Success { state } => Ok(IpcData {
            request_type: "success".to_string(),
            additional_info: "".to_string(),
            json_value: serde_json::to_string(state)?,
        }),
        Response::Error { message, code } => Ok(IpcData {
            request_type: "error".to_string(),
            additional_info: code.to_string(),
            json_value: message.clone(),
        }),
    }
}

pub fn handle_ipc_request(ipc_data: IpcData, catalog: &TriggerBlocks) -> Result<IpcData> {
    let (request, current_state) = ipc_to_request(&ipc_data)?;

    let processor = RequestProcessor::new(catalog.clone());
    let response = processor.process_request(request, current_state)?;

    let ipc_response = response_to_ipc(&response)?;

    Ok(ipc_response)
}
