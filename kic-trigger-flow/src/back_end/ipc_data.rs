use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IpcData {
    pub request_type: String,
    pub additional_info: String,
    pub json_value: String,
}
