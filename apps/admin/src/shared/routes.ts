/**
 * 管理端固定路径 SSOT
 */
export const ADMIN_ROUTES = {
  today: '/',
  clues: '/clues',
  seeds: '/seeds',
  executions: '/executions',
  metrics: '/metrics',
  content: '/content',
  contentEdit: '/content/:slug',
  aiGateway: '/ai-gateway',
} as const;
