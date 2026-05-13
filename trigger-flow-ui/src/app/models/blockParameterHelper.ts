import { Module, SlotChannelList } from './slotChannelModel';

export const BLOCK_CATEGORY_VALUES: Record<string, readonly string[]> = {
  actions: [
    'config list next',
    'config list prev',
    'config list recall',
    'measure',
    'measure overlapped',
    'no operation',
    'reset branch counter',
    'source action bias',
    'source action skip',
    'source action step',
    'source output',
  ],
  branches: ['always', 'once excluded', 'on event'],
  notify: ['log event', 'notify'],
  timing: ['constant delay', 'wait on event'],
};

const HIDDEN_PARAMETER_NAMES = new Set(['trigger_model_name', 'slot_index']);

const PARAMETER_DISPLAY_NAMES: Record<string, string> = {
  trigger_block_name: 'Block Name',
  event_id: 'Event ID',
};

// Friendly labels for catalog `trigger_events` keys. Any caller (event-block,
// specific-event, palette items, …) should use this so naming stays consistent.
const EVENT_TYPE_LABELS: Record<string, string> = {
  event_notify_n: 'Notify',
  event_digio: 'Digital I/O',
  event_at_limit: 'At Limit',
  event_generator: 'Trigger Generator',
  event_timer: 'Trigger Timer',
  event_tsplink: 'TSP Link Line',
};

// Centralize control decisions so adding support for new ParamTypeName values stays in one place
export type ParamControlType =
  | 'number'
  | 'select'
  | 'radio'
  | 'text'
  | 'toggle'
  | 'multiline'
  | 'custom'
  | 'specific-event'
  | 'channel-list'
  | 'channel-item'
  | 'channel-index'
  | 'unknown';

interface ControlRuleContext {
  name: string;
  type?: string;
  hasOptions: boolean;
}

export interface ParamConstraintLike {
  options?: { label: string; value: string }[] | null;
}

export interface ParamOptionSource {
  name: string;
  type?: string;
  options?: { label: string; value: string }[] | null;
  // Optional conditional branches keyed by runtime selectors (for example SMU/PSU).
  constraints?: Record<string, ParamConstraintLike> | null;
}

interface ParamOptionContext {
  values: Record<string, string | number>;
  slotChannelList: SlotChannelList | null;
}

// Mapping table for parameter-type driven rendering. This is the primary
// extension point when new ParamTypeName values are introduced.
const PARAM_TYPE_TO_CONTROL: Record<string, ParamControlType> = {
  String: 'text',
  Number: 'number',
  DelayTime: 'number',
  SlotIndex: 'select',
  ChannelIndex: 'select',
  DelayList: 'select',
  EventID: 'select',
  ChannelList: 'channel-list',
  ChannelItem: 'channel-item',
  LogEventType: 'select',
  ClearType: 'radio',
  LogicType: 'radio',
  TriggerEventType: 'radio',
  SourceState: 'toggle',
  EventItem: 'custom',
  EventList: 'custom',
  MultiString: 'multiline',
};

export function resolveParamControlType(context: ControlRuleContext): ParamControlType {
  // Any catalog `trigger_events` key (by convention prefixed with `event_`) used
  // as a parameter type means the parameter renders as a fixed-event widget.
  if (context.type?.startsWith('event_')) {
    return 'specific-event';
  }

  // Primary decision path: prefer explicit type mapping when available.
  const mapped = context.type ? PARAM_TYPE_TO_CONTROL[context.type] : undefined;
  const isIndexLike =
    /(index|number)/i.test(context.name) || /(Index|Number)/i.test(context.type ?? '');

  if (mapped === 'text') {
    return 'text';
  }

  if (mapped === 'custom') {
    return 'custom';
  }

  if (mapped === 'number') {
    return 'number';
  }

  if (mapped === 'radio') {
    // Radio controls require a bounded option set.
    return context.hasOptions ? 'radio' : 'text';
  }

  if (mapped === 'multiline') {
    return 'multiline';
  }

  if (mapped === 'channel-list') {
    return 'channel-list';
  }

  if (mapped === 'channel-item') {
    return 'channel-item';
  }

  if (mapped === 'select') {
    // Some select-like fields (for example SlotIndex/ChannelIndex) can resolve
    // options dynamically at runtime, so keep those as dropdowns even when
    // catalog metadata does not include inline options.
    if (context.hasOptions || isIndexLike) {
      return 'select';
    }
  }

  // Generic fallback for enum-like values even when the type is unknown.
  if (context.hasOptions) {
    return 'select';
  }

  // For nested event params where explicit options are missing, prefer dropdown
  // for index/number-like fields.
  if (isIndexLike) {
    return 'select';
  }

  return 'unknown';
}

export function resolveParameterOptions(
  param: ParamOptionSource,
  context: ParamOptionContext,
): string[] {
  // Resolution order: explicit options -> constrained options -> runtime-derived options -> fallback.
  if (param.options?.length) {
    return param.options.map((option) => option.value);
  }

  // Constraint-driven options take precedence over generic fallbacks because they depend
  // on sibling parameter values such as the selected slot instrument.
  const constrainedOptions = getConstrainedOptions(param, context);
  if (constrainedOptions.length > 0) {
    return constrainedOptions;
  }

  if (param.name === 'slot_index') {
    return getSlotIndexOptions(context.slotChannelList);
  }

  if (param.name === 'channel_index') {
    return getChannelIndexOptions(context.slotChannelList);
  }

  // Final fallback for index/number-like params with no catalog-defined options.
  return Array.from({ length: 16 }, (_, index) => `${index + 1}`);
}

export function normalizeParameterValues(
  params: ParamOptionSource[],
  values: Record<string, string | number>,
  slotChannelList: SlotChannelList | null,
): Record<string, string | number> {
  // Normalize against currently valid options so dependent params remain serializable
  // after sibling updates (for example slot_index changing instrument family).
  const normalizedValues = { ...values };

  for (const param of params) {
    const options = resolveParameterOptions(param, {
      values: normalizedValues,
      slotChannelList,
    });

    if (options.length === 0) {
      continue;
    }

    const currentValue = normalizedValues[param.name];
    // Keep the serialized payload valid by snapping missing/stale constrained values to the
    // first allowed option for the current runtime context.
    if (
      currentValue === undefined ||
      currentValue === null ||
      !options.includes(`${currentValue}`)
    ) {
      normalizedValues[param.name] = options[0];
    }
  }

  return normalizedValues;
}

function getConstrainedOptions(param: ParamOptionSource, context: ParamOptionContext): string[] {
  const constraints = param.constraints;
  if (!constraints) {
    return [];
  }

  // Constraints are keyed by instrument family such as SMU/PSU and currently
  // use slot_index as the selector in event parameter payloads.
  const slotIndex = context.values['slot_index'];
  const instrumentKey = getConstraintKeyForSlot(slotIndex, context.slotChannelList);
  const matchedOptions = instrumentKey ? (constraints[instrumentKey]?.options ?? null) : null;

  if (matchedOptions?.length) {
    return matchedOptions.map((option) => option.value);
  }

  // If runtime slot metadata is unavailable, expose the union so the control remains usable
  // until the correct branch can be resolved.
  const allOptions = Object.values(constraints)
    .flatMap((constraint) => constraint.options ?? [])
    .map((option) => option.value);

  return Array.from(new Set(allOptions));
}

function getSlotIndexOptions(slotChannelList: SlotChannelList | null): string[] {
  const slots = slotChannelList?.slots ?? [];

  // Runtime slot metadata is authoritative: only expose installed modules.
  // Empty slots should not be selectable for event parameter configuration.
  if (slots.length > 0) {
    return slots.filter((slot) => slot.module !== 'Empty').map((slot) => `${slot.slotId}`);
  }

  // Keep a fallback only when slot metadata is not available yet.
  return ['1', '2', '3'];
}

function getChannelIndexOptions(slotChannelList: SlotChannelList | null): string[] {
  const slots = slotChannelList?.slots ?? [];
  const unique = new Set<string>();

  for (const slot of slots) {
    for (const channel of slot.channels) {
      unique.add(`${channel.channelIndex}`);
    }
  }

  const values = Array.from(unique).sort((a, b) => Number(a) - Number(b));
  return values.length > 0 ? values : ['1', '2'];
}

function getConstraintKeyForSlot(
  slotIndex: string | number | undefined,
  slotChannelList: SlotChannelList | null,
): string | null {
  const slotId = Number(slotIndex);
  if (!Number.isFinite(slotId)) {
    return null;
  }

  const slot = slotChannelList?.slots.find((candidate) => candidate.slotId === slotId);
  return slot ? getConstraintKeyForModule(slot.module) : null;
}

export function getConstraintKeyForModule(module: Module | null | undefined): string | null {
  if (!module) {
    return null;
  }

  // Catalog constraints are authored against broad instrument families, while runtime slot
  // metadata uses concrete module names. Collapse those names back to the schema keys here.
  if (/SMU/i.test(module)) {
    return 'SMU';
  }

  if (/PSU/i.test(module)) {
    return 'PSU';
  }

  return null;
}

export function findblockCategory(value: string): string | null {
  const normalizedValue = value.toLowerCase().trim();

  for (const [category, values] of Object.entries(BLOCK_CATEGORY_VALUES)) {
    if (values.includes(normalizedValue)) {
      return category;
    }
  }

  return null;
}

export function shouldShowBlockParameter(paramName: string): boolean {
  return !HIDDEN_PARAMETER_NAMES.has(paramName);
}

export function getBlockParameterDisplayName(paramName: string): string {
  const override = PARAMETER_DISPLAY_NAMES[paramName];
  if (override) {
    return override;
  }

  return paramName
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Resolve a friendly label for a catalog event type (e.g. `event_notify_n`).
// Falls back to the generic name-prettifier if no explicit override exists.
export function getEventTypeLabel(eventType: string | undefined | null): string {
  if (!eventType) {
    return '';
  }

  return EVENT_TYPE_LABELS[eventType] ?? getBlockParameterDisplayName(eventType);
}

// Resolve dropdown options for a catalog parameter, given the parent block's
// installed module. Explicit options win; otherwise the constraint branch
// matching the module (SMU/PSU) is used. Returns an empty array if neither
// applies, so callers can decide whether to render the control at all.
export function getModuleConstrainedOptions(
  param: ParamOptionSource,
  module: Module | null | undefined,
): string[] {
  if (param.options?.length) {
    return param.options.map((o) => o.value);
  }

  const key = getConstraintKeyForModule(module);
  return key ? (param.constraints?.[key]?.options?.map((o) => o.value) ?? []) : [];
}
