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
  | 'TriggerEventType';

export interface ParameterRange {
  min?: number;
  max?: number;
}

export interface ParameterOptions {
  label: string;
  value: string;
}

export interface Parameter {
  name: string;
  type: ParamTypeName;
  options?: ParameterOptions[];
  default?: string;
  range?: ParameterRange;
}

export interface BlockDefinition {
  parameters: Parameter[];
  syntax: string;
  description?: string;
  shape: string;
}

export interface EventDefinition {
  parameters: Parameter[];
  syntax: string;
}

export interface TriggerBlocks {
  blocks?: { [key: string]: BlockDefinition };
  trigger_events: { [key: string]: EventDefinition };
}
