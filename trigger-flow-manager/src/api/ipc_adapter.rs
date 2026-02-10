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


pub fn handle_ipc_request(ipc_data: IpcData, catalog: &TriggerBlocks) -> Result<IpcData> {
    let (request, current_state) = ipc_to_request(&ipc_data)?;  //converting ipc_data to requestType

    let processor = RequestProcessor::new(catalog.clone());
    let response = processor.process_request(request, current_state)?; //matching requestType and processing it

    let ipc_response = response_to_ipc(&response)?; //converting responseType to ipcData

    Ok(ipc_response)
}
