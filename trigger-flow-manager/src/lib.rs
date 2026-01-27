pub mod trigger_model_blocks;
pub mod model;
pub mod api;
pub mod validator;
pub mod request_processor;

// Re-export commonly used types
pub use trigger_model_blocks::catalog::{
    BlockDefinition, EventDefinition, Parameter, TriggerBlocks,
};

// Re-export the main IPC handler entry point
pub use api::ipc_adapter::handle_ipc_request;
pub use api::ipc_data::IpcData;

