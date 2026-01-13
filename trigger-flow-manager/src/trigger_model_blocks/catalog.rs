use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::param_types::ParamTypeName;

/// The root structure representing all available trigger blocks
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TriggerBlocks {
    #[serde(flatten)]
    pub blocks: HashMap<String, BlockDefinition>,
    pub trigger_events: HashMap<String, EventDefinition>,
}

/// Definition of a single block type with its parameters and syntax
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct BlockDefinition {
    pub parameters: Vec<Parameter>,
    pub syntax: String,
    pub description: Option<String>,
    pub shape: String,
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
    pub options: Option<Vec<ParameterOptions>>,
    pub default: Option<String>,
    pub range: Option<ParameterRange>
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ParameterOptions {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ParameterRange {
    pub min: Option<f64>,
    pub max: Option<f64>,
}


impl TriggerBlocks {
    /// Initialize trigger blocks from our JSON
    pub fn from_file(path: &str) -> anyhow::Result<Self> {
        let json_str = std::fs::read_to_string(path)?;
        let blocks: TriggerBlocks = serde_json::from_str(&json_str)?;
        Ok(blocks)
    }

    pub fn from_str(json: &str) -> anyhow::Result<Self> {
        let blocks: TriggerBlocks = serde_json::from_str(json)?;
        Ok(blocks)
    }

    /// Get a block definition by name
    pub fn get_block(&self, name: &str) -> Option<&BlockDefinition> {
        self.blocks.get(name)
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
        self.options.as_ref()?.iter()
            .find(|opt| opt.label == label)
            .map(|opt| opt.value.as_str())
    }

    /// Get all option labels (for UI dropdown)
    pub fn get_option_labels(&self) -> Vec<&str> {
        self.options.as_ref()
            .map(|opts| opts.iter().map(|o| o.label.as_str()).collect())
            .unwrap_or_default()
    }
}

