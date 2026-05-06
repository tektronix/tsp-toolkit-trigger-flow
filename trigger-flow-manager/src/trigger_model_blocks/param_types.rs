use serde::{Deserialize, Serialize};

/// Enum representing parameter type names (for schema/catalog definitions)
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub enum ParamTypeName {
    #[serde(alias = "string")]
    String,
    #[serde(alias = "number")]
    Number,
    SlotIndex,
    ChannelIndex,
    DelayList,
    DelayTime,
    #[serde(alias = "LogEvent")]
    LogEventType,
    ChannelList,
    ChannelItem,
    SourceState,
    ClearType,
    LogicType,
    #[serde(alias = "triggerEventType")]
    TriggerEventType,
    #[serde(rename = "notifyEventNumber")]
    NotifyEventNumber,
    #[serde(rename = "notifyType")]
    NotifyType,
    #[serde(rename = "digioTriggerLine")]
    DigioTriggerLine,
    #[serde(rename = "generatorNumber")]
    GeneratorNumber,
    #[serde(rename = "triggerTimerNumber")]
    TriggerTimerNumber,
    #[serde(rename = "tsplinkTriggerLine")]
    TsplinkTriggerLine,
    #[serde(rename = "triggerLine")]
    TriggerLine,
    #[serde(rename = "blockReference")]
    BlockReference,
    EventItem,
    EventList,
    MultiString,
}

/// Enum representing actual parameter values
#[derive(Debug, Clone)]
pub enum ParamType {
    String(String),
    SlotIndex(SlotIndex),
    ChannelIndex(u8),
    DelayList(DelayList),
    DelayTime(DelayTime),
    LogEvent(LogEvent),
    ChannelList(ChannelList),
    SourceState(SourceState),
    ClearType(ClearType),
    LogicType(LogicType),
    TriggerEventType(TriggerEventType),
    EventList(EventList),
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct SlotIndex {
    slot_index: u8,
}
impl SlotIndex {
    pub fn new(slot_index: u8) -> Self {
        SlotIndex { slot_index }
    }
}
#[derive(Debug, Clone)]
pub struct DelayList {
    pub delays: Vec<u32>,
}
impl DelayList {
    pub fn new(delays: Vec<u32>) -> Self {
        DelayList { delays }
    }
}
#[derive(Debug, Clone)]
pub struct DelayTime {
    pub delay_time: f64,
}
#[derive(Debug, Clone)]
pub enum LogEvent {
    Information(LogEventType),
    Warning(LogEventType),
    Error(LogEventType),
    Abort(LogEventType),
}

#[derive(Debug, Clone)]
pub struct ChannelList {
    pub channels: Vec<u8>,
}

#[derive(Debug, Clone)]
pub enum ClearType {
    Never,
    Enter,
}

#[derive(Debug, Clone)]
pub enum LogicType {
    And,
    Or,
}

#[derive(Debug, Clone)]
pub enum SourceState {
    On,
    Off,
}

#[derive(Debug, Clone)]
pub struct LogEventType {
    pub slot_index: SlotIndex,
    pub event_number: Option<u8>,
}

impl LogEventType {
    pub fn new(slot_index: SlotIndex, event_number: Option<u8>) -> Self {
        LogEventType {
            slot_index,
            event_number,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct NotifyEvent {
    pub slot_index: SlotIndex,
    pub event_number: Option<u8>,
}

impl NotifyEvent {
    pub fn new(slot_index: SlotIndex, event_number: Option<u8>) -> Self {
        NotifyEvent {
            slot_index,
            event_number,
        }
    }
}
#[derive(Debug, Clone, Deserialize)]
pub struct DigioEventType {
    pub trigger_line: u8,
}
impl DigioEventType {
    pub fn new(trigger_line: u8) -> Self {
        DigioEventType { trigger_line }
    }
}
#[derive(Debug, Clone, Deserialize)]
pub struct SmuAtLimitType {
    pub slot_index: SlotIndex,
    pub channel_index: u8,
}

impl SmuAtLimitType {
    pub fn new(slot_index: SlotIndex, channel_index: u8) -> Self {
        SmuAtLimitType {
            slot_index,
            channel_index,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeneratorEventType {
    pub generator_number: u8,
}

impl GeneratorEventType {
    pub fn new(generator_number: u8) -> Self {
        GeneratorEventType { generator_number }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct TimerEventType {
    pub trigger_timer_number: u8,
}

impl TimerEventType {
    pub fn new(trigger_timer_number: u8) -> Self {
        TimerEventType {
            trigger_timer_number,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct TsplinkEventType {
    pub trigger_line: u8,
}

impl TsplinkEventType {
    pub fn new(trigger_line: u8) -> Self {
        TsplinkEventType { trigger_line }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub enum TriggerEventType {
    DigioEvent(DigioEventType),
    SmuAtLimit(SmuAtLimitType),
    NotifyEvent(NotifyEvent),
    GeneratorEvent(GeneratorEventType),
    TimerEvent(TimerEventType),
    TsplinkEvent(TsplinkEventType),
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventList {
    pub items: Vec<EventItem>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EventItem {
    pub r#type: String,
    pub parameters: serde_json::Value, // dynamic
}

impl EventItem {
    pub fn to_trigger_event(&self) -> Result<TriggerEventType, String> {
        match self.r#type.as_str() {
            "DigioEvent" => {
                let parsed: DigioEventType =
                    serde_json::from_value(self.parameters.clone()).map_err(|e| e.to_string())?;
                Ok(TriggerEventType::DigioEvent(parsed))
            }
            "SmuAtLimit" => {
                let parsed: SmuAtLimitType =
                    serde_json::from_value(self.parameters.clone()).map_err(|e| e.to_string())?;
                Ok(TriggerEventType::SmuAtLimit(parsed))
            }
            "NotifyEvent" => {
                let parsed: NotifyEvent =
                    serde_json::from_value(self.parameters.clone()).map_err(|e| e.to_string())?;
                Ok(TriggerEventType::NotifyEvent(parsed))
            }
            "GeneratorEvent" => {
                let parsed: GeneratorEventType =
                    serde_json::from_value(self.parameters.clone()).map_err(|e| e.to_string())?;
                Ok(TriggerEventType::GeneratorEvent(parsed))
            }
            "TimerEvent" => {
                let parsed: TimerEventType =
                    serde_json::from_value(self.parameters.clone()).map_err(|e| e.to_string())?;
                Ok(TriggerEventType::TimerEvent(parsed))
            }
            "TsplinkEvent" => {
                let parsed: TsplinkEventType =
                    serde_json::from_value(self.parameters.clone()).map_err(|e| e.to_string())?;
                Ok(TriggerEventType::TsplinkEvent(parsed))
            }
            _ => Err(format!("Unknown event type: {}", self.r#type)),
        }
    }
}
