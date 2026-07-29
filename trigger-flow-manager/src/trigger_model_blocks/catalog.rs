use super::param_types::ParamTypeName;
use crate::model::trigger_model_block::{TemplateBlockGroup, TriggerModelBlock};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, path::Path};

// Prefer an integer JSON number when the f64 is whole and fits in i64, so a
// clamped value like 1_000_000.0 renders as "1000000" instead of "1000000.0"
// in the script template and in error messages.
fn json_number_from_f64(value: f64) -> Option<serde_json::Number> {
    if value.is_finite()
        && value.fract() == 0.0
        && value >= i64::MIN as f64
        && value <= i64::MAX as f64
    {
        return Some(serde_json::Number::from(value as i64));
    }
    serde_json::Number::from_f64(value)
}

/// The root structure representing all available trigger blocks
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Catalog {
    #[serde(skip_serializing, default)]
    pub script_template: ScriptTemplate,
    pub blocks: HashMap<String, BlockDefinition>,
    pub trigger_events: HashMap<String, EventDefinition>,
    pub templates: HashMap<String, Template>,
    // Resolved reference types used by composite parameters (for example
    // DelayListConfig). Only fields actually consumed by validation are
    // modelled; the rest is intentionally ignored.
    pub custom_types: HashMap<String, CustomType>,
}

/// Subset of a `custom_types:` entry that the validator consults. Other
/// keys in YAML (description, modal, max_items, fields, ...) are accepted
/// and discarded.
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CustomType {
    pub item: Option<CustomTypeItem>,
    pub fields: Option<Vec<CustomTypeField>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CustomTypeItem {
    pub range: Option<ParameterRange>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CustomTypeField {
    pub name: String,
    pub range: Option<ParameterRange>,
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
            // Substitute the catalog default when the incoming value is
            // missing or null. Writing the default back into the block lets
            // the rest of the pipeline (script generation and the UI
            // round-trip) see a concrete value.
            let is_nullish = matches!(
                block.block_parameters.get(&param.name),
                None | Some(Value::Null)
            );
            if is_nullish {
                if let Some(default) = &param.default {
                    block
                        .block_parameters
                        .insert(param.name.clone(), default.clone());
                }
            }

            let value = block.block_parameters.get(&param.name).cloned();
            param.validate(value.as_ref(), block, catalog)?;
        }
        Ok(())
    }
}
/// Definition of a single event type with its parameters and syntaxs
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct EventDefinition {
    #[serde(default)]
    pub label: Option<String>,
    pub parameters: Vec<Parameter>,
    pub syntax: String,
}

/// A parameter definition for a block
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Parameter {
    pub name: String,
    #[serde(default)]
    pub label: Option<String>,
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
        // 1. Required-value check for all mandatory parameters.
        // Catalog defaults are substituted upstream in `BlockDefinition::validate`,
        // so reaching this point with a null value means no default was available
        // and the rendered script will contain a blank slot for this parameter.
        // Treats missing, null, empty/placeholder strings, and empty arrays as invalid.
        
        // Special handling for Constant Delay block: delay_time is only required
        // if list_config is not provided. If list_config has a value, delay_time
        // is optional (the mandatory indicator moves to list_config in the UI).
        let is_required = if block.block_type == "constant delay" {
            if self.name == "delay_time" {
                !self.is_list_config_enabled(&block.block_parameters)
            } else {
                self.required
            }
        } else {
            self.required
        };
        
        if is_required {
            let is_missing_required = match value {
                None => true,
                Some(Value::Null) => true,
                Some(Value::String(s)) => {
                    let normalized = s.trim();
                    normalized.is_empty()
                        || normalized == "null"
                        || normalized == "undefined"
                        || normalized == "unknown"
                }
                Some(Value::Array(arr)) => arr.is_empty(),
                _ => false,
            };

            if is_missing_required {
                let err_msg = match self.param_type {
                    ParamTypeName::ChannelList => {
                        format!(
                            "Parameter '{}' at least one channel must be selected",
                            self.name
                        )
                    }
                    ParamTypeName::ChannelItem => {
                        format!("Parameter '{}' channel selection is required", self.name)
                    }
                    _ => format!("Parameter '{}' is required", self.name),
                };

                block.add_error(err_msg);

                return Ok(());
            }
        }

        // 2. Name check
        //Names of each block within a model should be unique
        //Name can be an empty string but if not empty, should be unique across the model

        // 3. Range check (for numbers). Out-of-range values are clamped to the
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
                    block.add_error(message);
                }
            }
        }

        // 3b. Range check for `delay_durations` inside a DelayListConfig.
        // The per-element range lives on the `DelayList` custom type, so it
        // is resolved through the catalog rather than duplicated on the
        // parameter itself.
        if matches!(self.param_type, ParamTypeName::DelayListConfig) {
            if let Some(Value::Object(map)) = value {
                self.clamp_delay_count(map, block, catalog);
                self.clamp_delay_durations(map, block, catalog);
            }
        }

        // 4. Options/Enum check
        if let Some(options) = &self.options {
            if let Some(Value::String(val_str)) = value {
                let valid = options.iter().any(|opt| opt.value == *val_str);
                if !valid {
                    block.add_error(format!(
                        "Parameter '{}' value '{}' is not a valid option",
                        self.name, val_str
                    ));
                }
            }
        }

        // 5. Channel validation for ChannelList
        if self.param_type == ParamTypeName::ChannelList {
            if self.required {
                match value {
                    Some(Value::Array(channels)) => {
                        if channels.is_empty() {
                            block.add_error(format!(
                                "Parameter '{}' at least one channel must be selected",
                                self.name
                            ));
                        }
                    }
                    Some(Value::String(channels_str)) => {
                        // Handle comma-separated string format
                        let channels: Vec<&str> = channels_str
                            .split(',')
                            .map(|s| s.trim())
                            .filter(|s| !s.is_empty())
                            .collect();
                        if channels.is_empty() {
                            block.add_error(format!(
                                "Parameter '{}' at least one channel must be selected",
                                self.name
                            ));
                        }
                    }
                    _ => {}
                }
            }
        }

        // 6. Channel validation for ChannelItem (single channel)
        if self.param_type == ParamTypeName::ChannelItem {
            if self.required {
                let is_invalid = match value {
                    Some(Value::String(s))
                        if s.is_empty() || s == "null" || s == "undefined" || s == "unknown" =>
                    {
                        true
                    }
                    _ => false,
                };

                if is_invalid {
                    block.add_error(format!(
                        "Parameter '{}' channel selection is required",
                        self.name
                    ));
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

    // Check if list_config parameter is provided (not null/empty) for conditional
    // required validation in Constant Delay blocks.
    fn is_list_config_enabled(&self, block_parameters: &std::collections::HashMap<String, Value>) -> bool {
        matches!(
            block_parameters.get("list_config"),
            Some(Value::Object(_))
        )
    }

    fn get_delay_count_range(catalog: &Catalog) -> Option<&ParameterRange> {
        catalog
            .custom_types
            .get("DelayListConfig")
            .and_then(|t| t.fields.as_ref())
            .and_then(|fields| fields.iter().find(|f| f.name == "delay_count"))
            .and_then(|f| f.range.as_ref())
    }

    fn clamp_delay_count(
        &self,
        map: &serde_json::Map<String, Value>,
        block: &mut TriggerModelBlock,
        catalog: &Catalog,
    ) {
        let requested_delay_count = map.get("requested_delay_count").and_then(|v| v.as_f64());

        let Some(delay_count_value) = map.get("delay_count") else {
            return;
        };

        let Some(delay_count) = delay_count_value.as_f64() else {
            block.add_error(format!(
                "Parameter '{}' delay_count must be a number",
                self.name
            ));
            return;
        };

        let effective_delay_count = requested_delay_count.unwrap_or(delay_count);

        let Some(range) = Self::get_delay_count_range(catalog) else {
            return;
        };

        let min = range.min.as_ref().and_then(|v| v.as_f64());
        let max = range.max.as_ref().and_then(|v| v.as_f64());

        let (clamped_value, message) = if let Some(m) = min.filter(|m| effective_delay_count < *m) {
            (
                Some(m),
                format!(
                    "Parameter '{}' delay_count {} below min {}; clamped to {}",
                    self.name, effective_delay_count, m, m
                ),
            )
        } else if let Some(m) = max.filter(|m| effective_delay_count > *m) {
            (
                Some(m),
                format!(
                    "Parameter '{}' delay_count {} above max {}; clamped to {}",
                    self.name, effective_delay_count, m, m
                ),
            )
        } else {
            (None, String::new())
        };

        let Some(clamped_value) = clamped_value else {
            return;
        };

        let mut new_map = map.clone();

        if let Some(number) = json_number_from_f64(clamped_value) {
            new_map.insert("delay_count".to_string(), Value::Number(number));

            if let Some(Value::Array(durations)) = new_map.get_mut("delay_durations") {
                durations.truncate(clamped_value as usize);
            }

            new_map.remove("requested_delay_count");

            block
                .block_parameters
                .insert(self.name.clone(), Value::Object(new_map));

            block.add_error(message);
        }
    }

    fn clamp_delay_durations(
        &self,
        map: &serde_json::Map<String, Value>,
        block: &mut TriggerModelBlock,
        catalog: &Catalog,
    ) {
        let Some(Value::Array(elements)) = map.get("delay_durations") else {
            return;
        };
        let Some(range) = catalog
            .custom_types
            .get("DelayList")
            .and_then(|t| t.item.as_ref())
            .and_then(|i| i.range.as_ref())
        else {
            return;
        };
        let min = range.min.as_ref().and_then(|v| v.as_f64());
        let max = range.max.as_ref().and_then(|v| v.as_f64());

        let mut updated = elements.clone();
        let mut clamped_any = false;
        for (idx, el) in updated.iter_mut().enumerate() {
            // Row numbers in error messages are 1-based to match the modal UI.
            let row = idx + 1;
            // Per-row required check. Null or non-numeric entries originate
            // from cleared cells in the delay-list modal; surface a row-level
            // error so the user sees what needs filling, matching the way
            // scalar delay_time reports an empty field.
            let Some(num) = el.as_f64() else {
                block.add_error(format!(
                    "Parameter '{}' delay_durations row {} is required",
                    self.name, row
                ));
                continue;
            };
            let (limit, message) = if let Some(m) = min.filter(|m| num < *m) {
                (
                    Some(m),
                    format!(
                        "Parameter '{}' delay_durations row {} value {} below min {}; clamped to {}",
                        self.name, row, num, m, m
                    ),
                )
            } else if let Some(m) = max.filter(|m| num > *m) {
                (
                    Some(m),
                    format!(
                        "Parameter '{}' delay_durations row {} value {} above max {}; clamped to {}",
                        self.name, row, num, m, m
                    ),
                )
            } else {
                (None, String::new())
            };
            if let Some(m) = limit {
                if let Some(num_value) = json_number_from_f64(m) {
                    *el = Value::Number(num_value);
                    clamped_any = true;
                    let err = (true, message);
                    if let Some(errors) = block.block_error.as_mut() {
                        errors.push(err);
                    } else {
                        block.block_error = Some(vec![err]);
                    }
                }
            }
        }

        if clamped_any {
            let mut new_map = map.clone();
            new_map.insert("delay_durations".to_string(), Value::Array(updated));
            block
                .block_parameters
                .insert(self.name.clone(), Value::Object(new_map));
        }
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
                    block.add_error(format!("Unknown event type '{}'", event_type));
                }
            } else {
                block.add_error(format!("Event object missing 'type' field"));
            }
        } else {
            block.add_error(format!("Event parameter must be a JSON object"));
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
                block.add_error(format!("Missing required event parameter '{}'", param.name));
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
