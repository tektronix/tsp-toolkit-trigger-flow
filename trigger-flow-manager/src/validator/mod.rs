use crate::api::state::TriggerModelState;
use anyhow::Result;
pub trait Validator {
    fn validate(&self, model: &TriggerModelState) -> Result<()>;
}

pub struct ValidationChain {
    validators: Vec<Box<dyn Validator>>,
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
    pub fn validate(&self, model: &TriggerModelState) -> Result<()> {
        for validator in &self.validators {
            validator.validate(model)?;
        }
        Ok(())
    }
}
pub mod catalog_validator;
pub mod instr_validator;
pub mod slot_channel_hashmap;
