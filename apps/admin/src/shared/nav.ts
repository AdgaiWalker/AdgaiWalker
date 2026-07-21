export const adminPrimaryNav = [
  { path: '/clues', label: '线索' },
  { path: '/seeds', label: '题苗' },
  { path: '/executions', label: '执行' },
  { path: '/metrics', label: '指标' },
] as const;

export const adminSecondaryNav = [
  { path: '/login', label: '令牌' },
  { path: '/content', label: '内容' },
  { path: '/ai-gateway', label: 'AI Gateway' },
] as const;

export const adminDeferredNote = '未迁：WorkItem / Skill / NorthStar / Grants';
