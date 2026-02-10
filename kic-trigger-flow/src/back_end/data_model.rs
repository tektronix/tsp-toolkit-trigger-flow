use anyhow::Result;
use std::sync::Arc;
use trigger_flow_manager::{IpcData, TriggerBlocks};
pub struct DataModel {
    catalog: Arc<TriggerBlocks>,
}

impl DataModel {
    pub fn new(catalog: TriggerBlocks) -> Result<Self> {
        // Load catalog once at startup
        let catalog = TriggerBlocks::from_file("triggerBlocks.json")?;
        Ok(Self {
            catalog: Arc::new(catalog),
        })
    }
}
