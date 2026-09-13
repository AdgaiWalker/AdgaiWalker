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
  /** 观测数据页：使用排行 / AI 观测 / 旅程回放 */
  data: '/data',
  content: '/content',
  contentEdit: '/content/:slug',
  aiGateway: '/ai-gateway',
  agents: '/agents',
  /** 结构体检：图谱孤岛/坏链/单向链接清单（PRD-KNOWLEDGE-GRAPH §6.2） */
  graphHealth: '/graph',
} as const;
