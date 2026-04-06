use crate::{api::state::TriggerFlowState, validator::Validator, Catalog};
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
                // First check if block type exists in catalog
                if let Some(catalog_block) = self.catalog.get_block(&block.block_type) {
                    catalog_block.validate(block, self.catalog)?;

                    // SEPARATE: Check name uniqueness only if trigger_block_name exists
                    let name = block.get_parameter("trigger_block_name");
                    if let Some(name) = name {
                        if let Some(name_str) = name.as_str() {
                            // Only check uniqueness if name is not empty
                            if !name_str.is_empty() && !seen_names.insert(name_str.to_string()) {
                                let err = (
                                    true,
                                    format!(
                                        "Block name '{}' is not unique within the model",
                                        name_str
                                    ),
                                );
                                if let Some(errors) = block.block_error.as_mut() {
                                    errors.push(err);
                                } else {
                                    block.block_error = Some(vec![err]);
                                }
                            }
                        }
                    }
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
