use super::param_types::ParamTypeName;
use crate::model::trigger_model_block::{TemplateBlockGroup, TriggerModelBlock};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, path::Path};

/// The root structure representing all available trigger blocks
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Catalog {
    #[serde(skip_serializing, default)]
    pub script_template: ScriptTemplate,
    pub blocks: HashMap<String, BlockDefinition>,
    pub trigger_events: HashMap<String, EventDefinition>,
    pub templates: HashMap<String, Template>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Template {
    name: String,
    description: String,
    icon: String,
    blocks: Vec<TemplateBlockGroup>,
}

#[derive(Debug, Default, Deserialize, Serialize, Clone)]
pub struct ScriptTemplate {
    pub preamble: String,
    pub postamble: String,
    pub contents: String,
    pub begin_sentinel: String,
    pub end_sentinel: String,
}

/// Definition of a single block type with its parameters and syntax
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BlockDefinition {
    pub parameters: Vec<Parameter>,
    pub syntax: String,
    pub description: Option<String>,
    pub shape: String,
}

impl BlockDefinition {
    pub fn validate(&self, block: &mut TriggerModelBlock, catalog: &Catalog) -> Result<()> {
        // For each parameter in the catalog definition
        for param in &self.parameters {
            let value = block.block_parameters.get(&param.name).cloned();
            if value.is_none() && param.required {
                let err = (true, format!("Missing required parameter '{}'", param.name));
                if let Some(errors) = block.block_error.as_mut() {
                    errors.push(err);
                } else {
                    block.block_error = Some(vec![err]);
                }
                continue;
            }

            param.validate(value.as_ref(), block, catalog)?;
        }
        Ok(())
    }
}
/// Definition of a single event type with its parameters and syntaxs
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EventDefinition {
    pub parameters: Vec<Parameter>,
    pub syntax: String,
}

/// A parameter definition for a block
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Parameter {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: ParamTypeName,
    pub required: bool,
    pub options: Option<Vec<ParameterOptions>>,
    // Conditional option branches from YAML (for example SMU vs PSU specific options).
    // These are serialized to the UI so the frontend can resolve them using runtime context.
    pub constraints: Option<HashMap<String, ParameterConstraint>>,
    pub default: Option<serde_json::Value>,
    pub range: Option<ParameterRange>,
}

impl Parameter {
    pub fn validate(
        &self,
        value: Option<&Value>,
        block: &mut TriggerModelBlock,
        catalog: &Catalog,
    ) -> Result<()> {
        // 1. Name check
        //Names of each block within a model should be unique
        //Name can be an empty string but if not empty, should be unique across the model

        // 2. Range check (for numbers). Out-of-range values are clamped to the
        // limit and the stored parameter is rewritten so the rendered script
        // never contains a value outside the catalog-declared range.
        if let Some(range) = &self.range {
            if let Some(num) = value.and_then(|v| v.as_f64()) {
                let min = range.min.as_ref().and_then(|v| v.as_f64());
                let max = range.max.as_ref().and_then(|v| v.as_f64());

                let (clamped_to, limit_value, message) = if let Some(min) = min.filter(|m| num < *m)
                {
                    (
                        Some("min"),
                        range.min.clone(),
                        format!(
                            "Parameter '{}' value {} below min {}; clamped to {}",
                            self.name, num, min, min
                        ),
                    )
                } else if let Some(max) = max.filter(|m| num > *m) {
                    (
                        Some("max"),
                        range.max.clone(),
                        format!(
                            "Parameter '{}' value {} above max {}; clamped to {}",
                            self.name, num, max, max
                        ),
                    )
                } else {
                    (None, None, String::new())
                };

                if clamped_to.is_some() {
                    if let Some(limit) = limit_value {
                        block.block_parameters.insert(self.name.clone(), limit);
                    }
                    let err = (true, message);
                    if let Some(errors) = block.block_error.as_mut() {
                        errors.push(err);
                    } else {
                        block.block_error = Some(vec![err]);
                    }
                }
            }
        }

        // 3. Options/Enum check
        if let Some(options) = &self.options {
            if let Some(Value::String(val_str)) = value {
                let valid = options.iter().any(|opt| opt.value == *val_str);
                if !valid {
                    let err = (
                        true,
                        format!(
                            "Parameter '{}' value '{}' is not a valid option",
                            self.name, val_str
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
        match self.param_type {
            ParamTypeName::TriggerEventType | ParamTypeName::EventNotifyN => {
                if let Some(event_value) = value {
                    catalog.validate_event(event_value, block)?;
                }
            }
            ParamTypeName::EventItem => {
                if let Some(event_value) = value {
                    catalog.validate_event(event_value, block)?;
                }
            }
            ParamTypeName::EventList => {
                if let Some(Value::Array(events)) = value {
                    for event_value in events {
                        catalog.validate_event(event_value, block)?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ParameterOptions {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ParameterConstraint {
    pub options: Option<Vec<ParameterOptions>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ParameterRange {
    pub min: Option<serde_json::Value>,
    pub max: Option<serde_json::Value>,
}

impl Catalog {
    /// Initialize trigger blocks from our JSON
    pub fn from_file(path: &Path) -> anyhow::Result<Self> {
        let config_str = std::fs::read_to_string(path)?;
        let blocks: Catalog = match path
            .extension()
            .map(|x| x.to_ascii_lowercase().into_string().unwrap_or_default())
            .unwrap_or_default()
            .as_str()
        {
            "yaml" | "yml" => Self::from_yaml(&config_str)?,
            "json" => Self::from_json(&config_str)?,
            _ => panic!("TODO: Return error"),
        };
        Ok(blocks)
    }

    pub fn from_json(json: &str) -> anyhow::Result<Self> {
        let blocks: Catalog = serde_json::from_str(json)?;
        Ok(blocks)
    }

    pub fn from_yaml(yaml: &str) -> anyhow::Result<Self> {
        let blocks: Catalog = serde_saphyr::from_str(yaml)?;
        Ok(blocks)
    }

    /// Get a block definition by name
    pub fn get_block(&self, block_type: &str) -> Option<&BlockDefinition> {
        self.blocks.get(block_type)
    }

    /// Get all block names
    pub fn get_block_names(&self) -> Vec<&String> {
        self.blocks.keys().collect()
    }

    /// Get an event definition by name
    pub fn get_event(&self, name: &str) -> Option<&EventDefinition> {
        self.trigger_events.get(name)
    }

    /// Get all event names
    pub fn get_event_names(&self) -> Vec<&String> {
        self.trigger_events.keys().collect()
    }

    /// Check if a name exists as either a block or event
    pub fn contains(&self, name: &str) -> bool {
        self.blocks.contains_key(name) || self.trigger_events.contains_key(name)
    }

    /// Validate an event parameter against catalog event definitions
    pub fn validate_event(&self, event_value: &Value, block: &mut TriggerModelBlock) -> Result<()> {
        if let Value::Object(event_obj) = event_value {
            if let Some(Value::String(event_type)) = event_obj.get("type") {
                if let Some(event_def) = self.trigger_events.get(event_type) {
                    event_def.validate(event_obj, block, self)?;
                } else {
                    let err = (true, format!("Unknown event type '{}'", event_type));
                    if let Some(errors) = block.block_error.as_mut() {
                        errors.push(err);
                    } else {
                        block.block_error = Some(vec![err]);
                    }
                }
            } else {
                let err = (true, "Event object missing 'type' field".to_string());
                if let Some(errors) = block.block_error.as_mut() {
                    errors.push(err);
                } else {
                    block.block_error = Some(vec![err]);
                }
            }
        } else {
            let err = (true, "Event parameter must be a JSON object".to_string());
            if let Some(errors) = block.block_error.as_mut() {
                errors.push(err);
            } else {
                block.block_error = Some(vec![err]);
            }
        }
        Ok(())
    }
}

impl BlockDefinition {
    /// Get parameter names as a vector
    pub fn get_parameter_names(&self) -> Vec<&str> {
        self.parameters.iter().map(|p| p.name.as_str()).collect()
    }

    /// Find a parameter by name
    pub fn get_parameter(&self, name: &str) -> Option<&Parameter> {
        self.parameters.iter().find(|p| p.name == name)
    }
}

impl EventDefinition {
    /// Validate event parameters against this event definition
    pub fn validate(
        &self,
        event_obj: &serde_json::Map<String, Value>,
        block: &mut TriggerModelBlock,
        catalog: &Catalog,
    ) -> Result<()> {
        // Check each parameter defined in the event definition
        for param in &self.parameters {
            let params_map = match event_obj.get("params") {
                Some(Value::Object(map)) => map,
                _ => event_obj,
            };

            let param_value = params_map.get(&param.name);

            if param_value.is_none() && param.required {
                let err = (
                    true,
                    format!("Missing required event parameter '{}'", param.name),
                );
                if let Some(errors) = block.block_error.as_mut() {
                    errors.push(err);
                } else {
                    block.block_error = Some(vec![err]);
                }
                continue;
            }

            // Recursively validate the parameter using the standard parameter validation
            param.validate(param_value, block, catalog)?;
        }
        Ok(())
    }

    /// Get parameter names as a vector
    pub fn get_parameter_names(&self) -> Vec<&str> {
        self.parameters.iter().map(|p| p.name.as_str()).collect()
    }

    /// Find a parameter by name
    pub fn get_parameter(&self, name: &str) -> Option<&Parameter> {
        self.parameters.iter().find(|p| p.name == name)
    }
}

impl Parameter {
    /// Get the option value template for a given label
    pub fn get_option_value(&self, label: &str) -> Option<&str> {
        self.options
            .as_ref()?
            .iter()
            .find(|opt| opt.label == label)
            .map(|opt| opt.value.as_str())
    }

    /// Get all option labels (for UI dropdown)
    pub fn get_option_labels(&self) -> Vec<&str> {
        self.options
            .as_ref()
            .map(|opts| opts.iter().map(|o| o.label.as_str()).collect())
            .unwrap_or_default()
    }
}
