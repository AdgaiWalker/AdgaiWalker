export const ACTION_KINDS = ['TASK', 'VIDEO'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const ACTION_STATUSES = ['OPEN', 'DONE'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_SOURCES = ['HUMAN', 'SYSTEM'] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];
export const ACTION_ENTITY_TYPES = [
  'SEED',
  'EXECUTION',
  'SUBMISSION',
  'PUBLICATION',
  'FEEDBACK',
] as const;
export type ActionEntityType = (typeof ACTION_ENTITY_TYPES)[number];

export function normalizePlannedDate(
  value: string | null | undefined,
): string | null {
  if (value == null || value.trim() === '') return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('invalid-planned-date');
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error('invalid-planned-date');
  }
  return normalized;
}

export function transitionAction(
  _current: ActionStatus,
  event: 'complete' | 'reopen',
  now: Date,
): { status: ActionStatus; completedAt: Date | null } {
  if (event === 'complete') {
    return { status: 'DONE', completedAt: now };
  }
  return { status: 'OPEN', completedAt: null };
}
