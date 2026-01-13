use std::ops::Not;

use serde::{Deserialize, Serialize};



/// Enum representing parameter type names (for schema/catalog definitions)
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub enum ParamTypeName {
    String,
    SlotIndex,
    EventID,
    ChannelIndex,
    DelayList,
    LogEventType,
    ChannelList,
    SourceState,
    ClearType,
    LogicType,
    TriggerEventType,
}

/// Enum representing actual parameter values
#[derive(Debug, Clone)]
pub enum ParamType {
    String(String),
    SlotIndex(u8),
    ChannelIndex(u8),
    DelayList(DelayList),
    LogEventType(LogEventType), 
    ChannelList(ChannelList),
    SourceState(SourceState),
    ClearType(ClearType),
    LogicType(LogicType), 
    TriggerEventType(TriggerEventType),

}
#[derive(Debug, Clone)]
pub struct DelayList {
    pub delays: Vec<u32>,
}
impl DelayList { //i dont know if we need this here
    pub fn new(delays: Vec<u32>) -> Self {
        DelayList { delays }
    }
}
#[derive(Debug, Clone)]
pub enum LogEventType {
    Information(InformationType),
    Warning,
    Error, 
    Abort,
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
pub struct InformationType {
    pub slot_index: u8,
    pub event_number: u8,
}

#[derive(Debug, Clone)]
pub struct NotifyEvent {
    pub slot_index: u8,
    pub event_number: u8,
}

#[derive(Debug, Clone)]
pub enum TriggerEventType {
    DigioEvent,
    SmuAtLimit,
    NotifyEvent(NotifyEvent),
    GeneratorEvent,
    TimerEvent,
    TsplinkEvent,
}


