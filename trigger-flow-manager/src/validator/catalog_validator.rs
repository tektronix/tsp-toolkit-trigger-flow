use crate::{Catalog, api::state::TriggerFlowState, validator::Validator};
use anyhow::Result;

pub struct CatalogValidator {
    catalog: &'static Catalog,
}

impl CatalogValidator {
    pub fn new(catalog: &'static Catalog) -> Self {
        Self { catalog }
    }
}

impl Validator for CatalogValidator {
    fn validate(&self, state: &mut TriggerFlowState) -> Result<()> {
        use std::collections::HashSet;
        //iterate over the models in triggerflow state
        for model_state in state.models.iter_mut() {
            // Uniqueness check for block names (non-empty only)
            let mut seen_names = HashSet::new();

            for block in &mut model_state.1.blocks {
                let name = &block.block_name;
                if !name.is_empty() {
                    if !seen_names.insert(name.clone()) {
                        let err = (
                            true,
                            format!("Block name '{}' is not unique within the model", name),
                        );
                        if let Some(errors) = block.block_error.as_mut() {
                            errors.push(err);
                        } else {
                            block.block_error = Some(vec![err]);
                        }
                    }
                }

                if let Some(catalog_block) = self.catalog.blocks.get(&block.block_type) {
                    catalog_block.validate(block)?;
                } else {
                    //if block type not found in catalog, add error to block's error tuple
                    let err = (
                        true,
                        format!("Block type '{}' not found in catalog", block.block_type),
                    );
                    if let Some(errors) = block.block_error.as_mut() {
                        errors.push(err);
                    } else {
                        block.block_error = Some(vec![err]);
                    }
                }
            }
        }
        Ok(())
    }
}

