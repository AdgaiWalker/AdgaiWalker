import { ADMIN_ROUTES } from './routes';

export const adminPrimaryNav = [
  { path: ADMIN_ROUTES.today, label: '今日' },
  { path: ADMIN_ROUTES.clues, label: '线索' },
  { path: ADMIN_ROUTES.seeds, label: '题苗' },
  { path: ADMIN_ROUTES.executions, label: '执行' },
  { path: ADMIN_ROUTES.metrics, label: '指标' },
] as const;

export const adminSecondaryNav = [
  { path: ADMIN_ROUTES.content, label: '内容' },
  { path: ADMIN_ROUTES.aiGateway, label: '系统' },
] as const;

/** 旧六域巨石不迁；过程真相仅此四面 + 今日 */
export const adminDeferredNote =
  '过程：线索→题苗→执行。不迁 WorkItem/Skill/NorthStar/Grants';
