use trigger_flow_manager::{TriggerBlocks, IpcData, handle_ipc_request};
use std::sync::Arc;
use anyhow::Result;
pub struct DataModel {
    catalog: Arc<TriggerBlocks>,
}

impl DataModel {
    pub fn new() -> Result<Self> {
        // Load catalog once at startup
        let catalog = TriggerBlocks::from_file("triggerBlocks.json")?;
        Ok(Self {
            catalog: Arc::new(catalog),
        })
    }

    /// Process any IPC request from frontend
    pub fn process_ipc_request(&self, ipc_data: IpcData) -> Result<IpcData> {
        // Delegate everything to trigger-flow-manager
        handle_ipc_request(ipc_data, &self.catalog)
    }
}