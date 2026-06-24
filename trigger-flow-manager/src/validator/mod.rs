use crate::api::state::TriggerFlowState;
use anyhow::Result;

pub trait Validator {
    fn validate(&self, model: &mut TriggerFlowState) -> Result<()>;
}

pub struct ValidationChain {
    validators: Vec<Box<dyn Validator>>,
}
impl Default for ValidationChain {
    fn default() -> Self {
        Self::new()
    }
}

impl ValidationChain {
    pub fn new() -> Self {
        Self {
            validators: Vec::new(),
        }
    }

    pub fn add_validator(mut self, validator: Box<dyn Validator>) -> Self {
        self.validators.push(validator);
        self
    }
    pub fn validate(&self, state: &mut TriggerFlowState) -> Result<TriggerFlowState> {
        // Clear old errors before validating. Clients may send back state
        // that still has errors from a previous response (for example, a
        // recall payload). Without this reset, the validators would add to
        // the old list, causing duplicates.

        for model in state.models.values_mut() {
            for block in &mut model.blocks {
                block.block_error = None;
            }
        }

        for validator in &self.validators {
            validator.validate(state)?;
        }
        Ok(state.clone())
    }
}
pub mod catalog_validator;
pub mod instr_validator;
pub mod slot_channel_hashmap;
