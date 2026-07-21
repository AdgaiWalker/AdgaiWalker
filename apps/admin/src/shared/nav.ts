import { ADMIN_ROUTES } from './routes';

export const adminPrimaryNav = [
  { path: ADMIN_ROUTES.clues, label: '线索' },
  { path: ADMIN_ROUTES.seeds, label: '题苗' },
  { path: ADMIN_ROUTES.executions, label: '执行' },
  { path: ADMIN_ROUTES.metrics, label: '指标' },
] as const;

export const adminSecondaryNav = [
  { path: ADMIN_ROUTES.login, label: '令牌' },
  { path: ADMIN_ROUTES.content, label: '内容' },
  { path: ADMIN_ROUTES.aiGateway, label: 'AI Gateway' },
] as const;

export const adminDeferredNote = '未迁：WorkItem / Skill / NorthStar / Grants';
