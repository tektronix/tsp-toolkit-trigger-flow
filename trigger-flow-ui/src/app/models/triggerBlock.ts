import { ISlotChannelList, SlotChannelList } from "./slotChannelModel";
import { BLOCK_REFERENCE_UNKNOWN_VALUE } from "./blockParameterHelper";

export interface IInitialPayload {
  slot_channel_list: ISlotChannelList;
  catalog: ICatalog;
}

export interface ICatalog {
  blocks: Record<string, IBlockDefinition>;
  trigger_events: Record<string, IEventDefinition>;
  templates?: Record<string, ITemplate>;
}

export interface ITemplateBlock {
  block_id: string;
  type: string;
  block_parameters: Record<string, ParameterValue>;
}

/**
 * A group of template blocks that should be instantiated as a single trigger
 * model (one canvas section). Templates may define multiple groups, in which
 * case each group becomes its own section/model.
 */
export interface ITemplateBlockGroup {
  blocks: ITemplateBlock[];
}

export interface ITemplate {
  name: string;
  description: string;
  icon: string;
  blocks: ITemplateBlockGroup[];
}

export interface IBlockDefinition {
  parameters: IParameter[];
  syntax: string;
  description: string;
  shape: string;
}

export interface IParameter {
  name: string;
  label?: string;
  type: ParamTypeName;
  required: boolean;
  options?: IParameterOptions[] | null;
  // Optional conditional option sets keyed by catalog-specific selectors such as
  // instrument family. These are forwarded unchanged from the backend catalog.
  constraints?: Record<string, IParameterConstraint> | null;
  default?: string | number | null;
  range?: IParameterRange | null;
}

export interface IParameterConstraint {
  options?: IParameterOptions[] | null;
}

export interface IParameterOptions {
  label: string;
  value: string;
}

export interface IParameterRange {
  min?: number;
  max?: number;
}

export interface IEventDefinition {
  label?: string;
  parameters: IParameter[];
  syntax: string;
}

export type ParamTypeName =
  | 'String'
  | 'SlotIndex'
  | 'EventID'
  | 'ChannelIndex'
  | 'DelayList'
  | 'DelayListConfig'
  | 'DelayTime'
  | 'LogEventType'
  | 'ChannelList'
  | 'ChannelItem'
  | 'SourceState'
  | 'ClearType'
  | 'LogicType'
  | 'TriggerEventType'
  | 'Number'
  | 'MultiString'
  | 'EventItem'
  | 'EventList'
  | 'SourceOutputState'
  // Specific trigger event types that render as a single fixed event in the UI.
  // The ParamTypeName matches the key under catalog.trigger_events so the renderer
  // can look up the event definition without extra mapping.
  | 'event_notify_n'
  | 'BlockReference';

export class InitialPayload {
  slot_channel_list: SlotChannelList;
  catalog: Catalog;

  constructor(data: IInitialPayload) {
    this.slot_channel_list = new SlotChannelList(data.slot_channel_list);
    this.catalog = new Catalog(data.catalog);
  }
}

export class Catalog {
  blocks: Record<string, BlockDefinition> = {};
  trigger_events: Record<string, EventDefinition> = {};
  templates: Record<string, ITemplate> = {};

  constructor(data: ICatalog) {
    for (const blockName of Object.keys(data.blocks)) {
      this.blocks[blockName] = new BlockDefinition(data.blocks[blockName]);
    }

    for (const eventName of Object.keys(data.trigger_events)) {
      this.trigger_events[eventName] = new EventDefinition(
        data.trigger_events[eventName]
      );
    }

    if (data.templates) {
      this.templates = { ...data.templates };
    }
  }
}

export class BlockDefinition {
  parameters: Parameter[];
  syntax: string;
  description: string;
  shape: string;

  constructor(data: IBlockDefinition) {
    this.parameters = data.parameters.map((parameter) => new Parameter(parameter));
    this.syntax = data.syntax;
    this.description = data.description;
    this.shape = data.shape;
  }
}

export class Parameter {
  name: string;
  label?: string;
  type: ParamTypeName;
  required: boolean;
  options: ParameterOptions[] | null;
  // Stored as typed objects so UI helpers can treat catalog options and constrained
  // options the same way once the right constraint branch is selected.
  constraints: Record<string, ParameterConstraint> | null;
  default: string | number | null;
  range: ParameterRange | null;

  constructor(data: IParameter) {
    this.name = data.name;
    this.label = data.label;
    this.type = data.type;
    this.required = data.required;
    this.options = data.options
      ? data.options.map((option) => new ParameterOptions(option))
      : null;
    this.constraints = data.constraints
      ? Object.fromEntries(
        Object.entries(data.constraints).map(([key, constraint]) => [
          key,
          new ParameterConstraint(constraint),
        ]),
      )
      : null;
    this.default = data.default ?? null;
    this.range = data.range ? new ParameterRange(data.range) : null;
  }
}

export class ParameterOptions {
  label: string;
  value: string;

  constructor(data: IParameterOptions) {
    this.label = data.label;
    this.value = data.value;
  }
}

export class ParameterConstraint {
  options: ParameterOptions[] | null;

  constructor(data: IParameterConstraint) {
    this.options = data.options
      ? data.options.map((option) => new ParameterOptions(option))
      : null;
  }
}

export class ParameterRange {
  min?: number;
  max?: number;

  constructor(data: IParameterRange) {
    this.min = data.min;
    this.max = data.max;
  }
}

export class EventDefinition {
  label?: string;
  parameters: Parameter[];
  syntax: string;

  constructor(data: IEventDefinition) {
    this.label = data.label;
    this.parameters = data.parameters.map((parameter) => new Parameter(parameter));
    this.syntax = data.syntax;
  }
}

export class ActualParameter {
  name: string;
  type: ParamTypeName;
  options: ParameterOptions[] | null;
  default: string | number | null;
  range: ParameterRange | null;
  constraints: Record<string, ParameterConstraint> | null;
  value: ParameterValue;  // User-edited or default-initialized value
  required: boolean | null;

  constructor(parameter: Parameter) {
    this.name = parameter.name;
    this.type = parameter.type;
    this.options = parameter.options;
    this.default = parameter.default;
    this.range = parameter.range;
    this.constraints = parameter.constraints;
    this.required = parameter.required;
    // Initialize value from default when block is added
    // this.value = parameter.default;
    if (this.type === 'EventList') {
      this.value = []; // correct initialization
    } else if (this.type === 'EventItem') {
      this.value = null;
    } else if (this.type === 'ChannelList') {
      // Channel list is a multi-select; start empty so no channel is preselected.
      this.value = [];
    } else if (this.type === 'BlockReference') {
      // Block-reference parameters start as 'unknown' so the dropdown has a
      // valid initial selection and no spurious connection is auto-created
      // when the block is dropped onto the canvas.
      this.value = parameter.default ?? BLOCK_REFERENCE_UNKNOWN_VALUE;
    } else {
      this.value = parameter.default ?? null;
    }
  }

  // // Update value from user input (from control)
  // setValue(newValue: string | number | null): void {
  //   this.value = newValue;
  // }

  // // Get the value, fallback to default if not set
  // getValue(): string | number | null {
  //   return this.value !== null ? this.value : this.default;
  // }
}

export interface EventListItem {
  type: string;
  params: Record<string, string | number>;
}

export interface DelayListConfig {
  delay_count: number;
  delay_durations: number[];
}

export interface SourceOutputStateValue {
  channel_index: string;
  state_value: string;
}

export type ParameterValue =
  | string
  | number
  | boolean
  | null
  | number[]
  | EventListItem
  | EventListItem[]
  | DelayListConfig
  | SourceOutputStateValue;
