use crate::{TriggerBlocks, api::state::TriggerModelState, model::trigger_model::TriggerModel, validator::Validator};
use anyhow::Result;
use std::sync::Arc;

pub struct CatalogValidator {
    catalog: Arc<TriggerBlocks>,
}

impl CatalogValidator {
    pub fn new(catalog: Arc<TriggerBlocks>) -> Self {
        Self { catalog }
    }
}

impl Validator for CatalogValidator {
    fn validate(&self, state: &TriggerModelState) -> Result<()> {
        Ok(())
    }

}

impl CatalogValidator {
    /// Validate that a parameter value is within the defined range
    fn validate_range(
        &self,
        block_id: &u32,
        param_name: &str,
        value: &serde_json::Value,
        range: &crate::trigger_model_blocks::catalog::ParameterRange,
    ) -> Result<()> {
        // Extract numeric value from JSON
        let num_value = match value {
            serde_json::Value::Number(n) => n.as_f64(),
            serde_json::Value::String(s) => s.parse::<f64>().ok(),
            _ => None,
        };

        let Some(num) = num_value else {
            return Ok(()); // Skip validation if not a number
        };

        // Check minimum
        if let Some(min_val) = &range.min {
            let min = Self::extract_number(min_val);
            if let Some(min) = min {
                if num < min {
                    return Err(anyhow::anyhow!(
                        "Block ID {} parameter '{}' value {} is below minimum {}",
                        block_id,
                        param_name,
                        num,
                        min
                    ));
                }
            }
        }

        // Check maximum
        if let Some(max_val) = &range.max {
            let max = Self::extract_number(max_val);
            if let Some(max) = max {
                if num > max {
                    return Err(anyhow::anyhow!(
                        "Block ID {} parameter '{}' value {} exceeds maximum {}",
                        block_id,
                        param_name,
                        num,
                        max
                    ));
                }
            }
        }

        Ok(())
    }

    /// Helper to extract f64 from JSON value (handles both number and string)
    fn extract_number(val: &serde_json::Value) -> Option<f64> {
        match val {
            serde_json::Value::Number(n) => n.as_f64(),
            serde_json::Value::String(s) => s.parse::<f64>().ok(),
            _ => None,
        }
    }
}
