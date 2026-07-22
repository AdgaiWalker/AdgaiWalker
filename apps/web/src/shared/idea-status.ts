/**
 * 点子状态规则（纯函数）
 * 职责：筛选 tab 与「构思中」判定；词表与 STATUS_LABELS 对齐。
 */

export type IdeaStatusFilter = 'all' | 'thinking' | 'active' | 'verified';

export const IDEA_STATUS_FILTERS: {
  id: IdeaStatusFilter;
  label: string;
}[] = [
  { id: 'all', label: '全部' },
  { id: 'thinking', label: '构思中' },
  { id: 'active', label: '推进中' },
  { id: 'verified', label: '已验证' },
];

const THINKING = new Set(['thinking']);
const ACTIVE = new Set(['validating', 'building']);
const VERIFIED = new Set(['verified', 'archived']);

const DEFAULT_STATUS = 'thinking';

export function normalizeIdeaStatus(status: string | undefined): string {
  return status?.trim() || DEFAULT_STATUS;
}

export function isThinkingStatus(status: string | undefined): boolean {
  return THINKING.has(normalizeIdeaStatus(status));
}

export function matchesIdeaFilter(
  status: string | undefined,
  filter: IdeaStatusFilter,
): boolean {
  if (filter === 'all') return true;
  const s = normalizeIdeaStatus(status);
  if (filter === 'thinking') return THINKING.has(s);
  if (filter === 'verified') return VERIFIED.has(s);
  return ACTIVE.has(s);
}
