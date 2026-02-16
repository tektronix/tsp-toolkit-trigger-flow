pub mod api;
pub mod model;
pub mod request_processor;
pub mod trigger_model_blocks;
pub mod validator;

// Re-export commonly used types
pub use trigger_model_blocks::catalog::{
    BlockDefinition, EventDefinition, Parameter, TriggerBlocks,
};

pub use api::ipc_data::IpcData;
