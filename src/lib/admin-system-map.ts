export type AdminModuleId = 'workbench' | 'needs' | 'creation' | 'assets' | 'system';

export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;
  disabled?: boolean;
  badge?: number;
}

export interface AdminModule extends AdminNavItem {
  id: AdminModuleId;
  responsibility: string;
  ownsFacts: boolean;
}

export const ADMIN_MODULES: readonly AdminModule[] = [
  { id: 'workbench', label: '工作台', href: '/admin', icon: 'house', responsibility: '聚合需要判断、执行和验证的事项，不保存第二份业务事实。', ownsFacts: false },
  { id: 'needs', label: '需求', href: '/admin/review', icon: 'circle-dot', responsibility: '保存用户、需求、Walker 主张、反馈与选题的来源和生命周期。', ownsFacts: true },
  { id: 'creation', label: '创作', href: '/admin/content', icon: 'pen-line', responsibility: '管理内容、创作简报、发布状态、功能决策与命中结果。', ownsFacts: true },
  { id: 'assets', label: '资产', href: '/admin/assets', icon: 'package', responsibility: '管理经验、规则、Skill、学习任务及其证据和准入边界。', ownsFacts: true },
  { id: 'system', label: '系统', href: '/admin/ai-gateway', icon: 'settings-2', responsibility: '管理 AI Gateway、访问控制、邀请码、事件、审计、外观和媒体。', ownsFacts: true },
] as const;

export const ADMIN_SECONDARY_NAV: Readonly<Record<AdminModuleId, readonly AdminNavItem[]>> = {
  workbench: [
    { label: '今日', href: '/admin', icon: 'sun' },
    { label: '决定', href: '/admin?view=decisions', icon: 'list-checks' },
    { label: '动作', href: '/admin?view=actions', icon: 'play-circle' },
    { label: '结果', href: '/admin/outcomes', icon: 'circle-check' },
  ],
  needs: [
    { label: '用户', href: '/admin/accounts', icon: 'users' },
    { label: '需求收件箱', href: '/admin/review', icon: 'inbox' },
    { label: '需求分析', href: '/admin/insights', icon: 'scan-search' },
    { label: '选题', href: '/admin/topics', icon: 'notebook-pen' },
  ],
  creation: [
    { label: '内容', href: '/admin/content', icon: 'files' },
    { label: '创作简报', href: '/admin/brief', icon: 'file-pen-line' },
    { label: '内容命中', href: '/admin/hit-rate', icon: 'target' },
  ],
  assets: [
    { label: '资产总览', href: '/admin/assets', icon: 'layout-dashboard' },
    { label: '经验', href: '/admin/experiences', icon: 'notebook-tabs' },
    { label: '规则', href: '/admin/rules', icon: 'git-branch' },
    { label: 'Skill', href: '/admin/skills', icon: 'sparkles' },
    { label: '学习任务', href: '/admin/assets?view=learning', icon: 'graduation-cap' },
  ],
  system: [
    { label: 'AI Gateway', href: '/admin/ai-gateway', icon: 'activity' },
    { label: '访问控制', href: '/admin/grants', icon: 'shield-check' },
    { label: '邀请码', href: '/admin/invite-codes', icon: 'ticket-check' },
    { label: '系统事件', href: '/admin/incidents', icon: 'triangle-alert' },
    { label: '外观与媒体', href: '/admin/appearance', icon: 'image' },
    { label: 'NorthStar', href: '/admin/northstar', icon: 'compass' },
  ],
} as const;

export const ADMIN_RELATIONSHIPS = [
  { from: 'needs', to: 'workbench', reason: '需求证据形成待决定事项' },
  { from: 'workbench', to: 'creation', reason: '决定生成内容或功能动作' },
  { from: 'creation', to: 'needs', reason: '命中结果回写原需求与选题' },
  { from: 'creation', to: 'assets', reason: '重复有效结果形成经验、规则或 Skill 候选' },
  { from: 'assets', to: 'creation', reason: '已准入能力支持创作与功能执行' },
  { from: 'system', to: 'workbench', reason: '降级、安全和权限事件进入系统队列' },
] as const;

export const ADMIN_API_OWNERSHIP = {
  workbench: ['/api/admin/workbench', '/api/admin/decisions', '/api/admin/actions', '/api/admin/outcomes'],
  needs: ['/api/admin/accounts', '/api/admin/review', '/api/admin/inspiration', '/api/insights', '/api/content-feedback'],
  creation: ['/api/admin/content', '/api/admin/brief', '/api/admin/hit-rate', '/api/content-telemetry'],
  assets: ['/api/admin/experience-events', '/api/admin/rules', '/api/admin/skills', '/api/admin/assets', '/api/admin/learning-requests'],
  system: ['/api/admin/gateway', '/api/admin/grants', '/api/admin/invite-codes', '/api/admin/incidents', '/api/admin/appearance', '/api/admin/auth'],
} as const satisfies Readonly<Record<AdminModuleId, readonly string[]>>;

export function resolveAdminModule(pathname: string): AdminModuleId {
  if (pathname === '/admin' || pathname.startsWith('/admin/outcomes')) return 'workbench';
  if (['/admin/accounts', '/admin/review', '/admin/insights', '/admin/topics'].some(path => pathname.startsWith(path))) return 'needs';
  if (['/admin/content', '/admin/brief', '/admin/hit-rate'].some(path => pathname.startsWith(path))) return 'creation';
  if (['/admin/experiences', '/admin/rules', '/admin/skills', '/admin/assets'].some(path => pathname.startsWith(path))) return 'assets';
  return 'system';
}
