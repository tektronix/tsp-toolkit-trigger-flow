export const BLOCK_CATEGORY_VALUES: Record<string, readonly string[]> = {
  actions: ['configlist next', 'configlist prev', 'configlist recall', 'measure', 'measure overlapped', 'no operation', 'reset branch counter', 'source action bias', 'source action skip', 'source action step', 'source output'],
  branches: ['always', 'once excluded', 'on event'],
  notify: ['log event', 'notify'],
  timing: ['delay constant', 'wait on event'],
};

export function findblockCategory(value: string): string | null {
  const normalizedValue = value.toLowerCase().trim();

  for (const [category, values] of Object.entries(BLOCK_CATEGORY_VALUES)) {
    if (values.includes(normalizedValue)) {
      return category;
    }
  }

  return null;
}
