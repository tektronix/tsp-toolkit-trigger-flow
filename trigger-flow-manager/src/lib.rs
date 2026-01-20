pub mod trigger_model_blocks;
pub mod model;
// Re-export commonly used types
pub use trigger_model_blocks::catalog::{
    BlockDefinition, EventDefinition, Parameter, TriggerBlocks,
};

