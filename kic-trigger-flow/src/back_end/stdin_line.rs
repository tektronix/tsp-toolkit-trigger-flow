use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum StdinLine {
    Systems,
}

impl TryFrom<&str> for StdinLine {
    type Error = String;
    fn try_from(s: &str) -> Result<Self, Self::Error> {
        match s.trim() {
            s if s.contains("systems") => Ok(StdinLine::Systems),
            _ => Err(format!("Unknown stdin line: {}", s)),
        }
    }
}
