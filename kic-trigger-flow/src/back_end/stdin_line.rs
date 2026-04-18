use serde::{Deserialize, Serialize};
use trigger_flow_manager::{
    api::{script_path::ScriptPath, slot_channel_list::Systems},
    IpcData,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum StdinLine {
    Shutdown(Shutdown),
    Systems(Systems),
    SessionPath(ScriptPath),
    SessionData(IpcData),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Shutdown {
    pub shutdown: bool
}

impl TryFrom<&str> for StdinLine {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        println!("Attempting to parse StdinLine from input: {}", s);
        if let Some(start) = s.find('{') {
            if let Some(end) = s.rfind('}') {
                let json_str = &s[start..=end];
                println!("Extracted JSON string for StdinLine parsing: {}", json_str);

                // Try to deserialize directly as StdinLine enum
                serde_json::from_str::<StdinLine>(json_str)
                    .map_err(|e| format!("Failed to parse as StdinLine: {}", e))
            } else {
                Err("No closing brace found in input".to_string())
            }
        } else {
            Err("No opening brace found in input".to_string())
        }
    }
}
