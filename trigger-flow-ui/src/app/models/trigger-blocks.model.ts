// Discriminated Union - Type-safe and clean
export type TriggerFlowData = 
  | InitialPayload
  | TriggerFlowStatePayload;

export interface InitialPayload {
  slot_channel_list: SlotChannelList;
  catalog: Catalog;
}

export interface TriggerFlowStatePayload {
  slot_channel_list: SlotChannelList;
  // add trigger flow state here
}

// Slot Channel List Section
export interface SlotChannelList {
  slots: SlotInfo[];
}

export interface SlotInfo {
  slot_index: number;
  channels: ChannelInfo[];
  module: string;
  node_id: string;
}

export interface ChannelInfo {
  channel_index: number;
  in_use: boolean;
}

export interface Catalog {
  blocks: Record<string, BlockDefinition>;
  trigger_events: Record<string, EventDefinition>;
}

export interface BlockDefinition {
  parameters: Parameter[];
  syntax: string;
  description: string;
  shape: string;
}

export interface Parameter {
  name: string;
  type: ParamTypeName;
  required: boolean;
  options?: ParameterOptions[] | null;
  default?: string | number | null;
  range?: ParameterRange | null;
}

export interface ParameterOptions {
  label: string;
  value: string;
}

export interface ParameterRange {
  min?: number;
  max?: number;
}

export interface EventDefinition {
  parameters: Parameter[];
  syntax: string;
}

export type ParamTypeName =
  | 'String'
  | 'SlotIndex'
  | 'EventID'
  | 'ChannelIndex'
  | 'DelayList'
  | 'DelayTime'
  | 'LogEventType'
  | 'ChannelList'
  | 'SourceState'
  | 'ClearType'
  | 'LogicType'
  | 'TriggerEventType'
  | 'Number'
  | 'notifyType';