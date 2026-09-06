/**
 * 管理端固定路径 SSOT
 */
export const ADMIN_ROUTES = {
  pipeline: '/',
  today: '/today',
  workstation: '/workstation',
  clues: '/clues',
  seeds: '/seeds',
  assistant: '/assistant',
  insights: '/insights',
  executions: '/executions',
  metrics: '/metrics',
  content: '/content',
  contentEdit: '/content/:slug',
  credentials: '/credentials',
  aiGateway: '/ai-gateway',
} as const;
