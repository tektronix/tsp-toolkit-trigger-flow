export const BLOCK_CATEGORY_VALUES: Record<string, readonly string[]> = {
  actions: ['config list next', 'configlist prev', 'configlist recall', 'measure', 'measure overlapped', 'no operation', 'reset branch counter', 'source action bias', 'source action skip', 'source action step', 'source output'],
  branches: ['always', 'once excluded', 'on event'],
  notify: ['log event', 'notify'],
  timing: ['delay constant', 'wait on event'],
};

// Centralize control decisions so adding support for new ParamTypeName values stays in one place
export type ParamControlType = 'number' | 'select' | 'radio' | 'text' | 'custom';

type ControlRuleContext = {
  name: string;
  type?: string;
  hasOptions: boolean;
};

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
  ChannelList: 'select',
  LogEventType: 'radio',
  SourceState: 'radio',
  ClearType: 'radio',
  LogicType: 'radio',
  TriggerEventType: 'radio',
  notifyType: 'radio',
  EventItem: 'custom',
  EventList: 'custom',
};

export function resolveParamControlType(context: ControlRuleContext): ParamControlType {
  // Primary decision path: prefer explicit type mapping when available.
  const mapped = context.type ? PARAM_TYPE_TO_CONTROL[context.type] : undefined;
  const isIndexLike =
    /(index|number)/i.test(context.name) || /(Index|Number)/i.test(context.type ?? '');

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

  if (mapped === 'select') {
    // Some select-like fields (for example SlotIndex/ChannelIndex) can resolve
    // options dynamically at runtime, so keep those as dropdowns even when
    // catalog metadata does not include inline options.
    if (context.hasOptions || isIndexLike) {
      return 'select';
    }

    return 'text';
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

  return 'text';
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
