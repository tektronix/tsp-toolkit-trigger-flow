pub mod api;
pub mod model;
pub mod request_processor;
pub mod trigger_model_blocks;
pub mod validator;

// Re-export commonly used types
pub use trigger_model_blocks::catalog::{
    BlockDefinition, EventDefinition, Parameter, TriggerBlocks,
};

// Re-export the main IPC handler entry point
pub use api::ipc_adapter::handle_ipc_request;
pub use api::ipc_data::IpcData;
