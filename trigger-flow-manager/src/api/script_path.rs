use serde::{Deserialize, Serialize};
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScriptPath {
    pub session: String,
    pub folder: String,
}

impl Default for ScriptPath {
    fn default() -> Self {
        Self::new()
    }
}
impl ScriptPath {
    pub fn new() -> Self {
        ScriptPath {
            folder: "./workfolder/".to_string(),
            session: "sample.tsp".to_string(),
        }
    }
}
