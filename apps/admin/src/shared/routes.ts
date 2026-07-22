/**
 * 管理端固定路径 SSOT（Accept 与导航共用）
 */
export const ADMIN_ROUTES = {
  login: '/login',
  clues: '/clues',
  seeds: '/seeds',
  executions: '/executions',
  metrics: '/metrics',
  content: '/content',
  contentEdit: '/content/:slug',
  aiGateway: '/ai-gateway',
} as const;
