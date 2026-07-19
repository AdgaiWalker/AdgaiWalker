/**
 * Agent 六模块 · Tools 工具清单（U8 收尾）
 *
 * 单一真相源：声明每个对外/对内工具的完整契约 ——
 * 输入 / 输出 / 权限 / 失败返回 / 是否可重试 / 是否写数据。
 *
 * 对齐 `references/planning/agent-six-modules-architecture.md` §4 的权限表与禁止事项。
 * 权限边界由各 API 路由的 `isAdmin` / 受邀会话检查实际执行；本清单是契约文档与回归基线。
 */

export type ToolPermission = 'public' | 'user' | 'admin' | 'system' | 'server-only';

export interface ToolDeclaration {
  /** 工具名 / 入口标识 */
  name: string;
  /** 一句话职责 */
  description: string;
  /** 入口路径（API 路由或 MCP 工具名） */
  endpoint: string;
  /** 输入描述 */
  input: string;
  /** 输出描述 */
  output: string;
  /** 权限边界 */
  permission: ToolPermission;
  /** 失败时的返回 / 降级 */
  failureReturn: string;
  /** 是否可安全重试 */
  retryable: boolean;
  /** 是否写入业务持久化数据（内容 / 会话 / 计数 / 配置 / 候选）；纯日志不计 */
  writesData: boolean;
}

export const TOOL_MANIFEST: readonly ToolDeclaration[] = [
  // ── MCP 工具（对外 AI 可调用，默认 public-only 读，AI-0 过滤） ──────────
  {
    name: 'walker_query',
    endpoint: 'mcp:walker_query',
    description: '多条件过滤站内内容',
    input: 'type / form / domain / tag 等过滤条件',
    output: '匹配的内容条目摘要列表（仅 public、AI 可读）',
    permission: 'public',
    failureReturn: '空列表',
    retryable: true,
    writesData: false,
  },
  {
    name: 'walker_search',
    endpoint: 'mcp:walker_search',
    description: '站内内容全文搜索',
    input: '关键词',
    output: '命中的内容条目摘要列表（仅 public、AI 可读）',
    permission: 'public',
    failureReturn: '空列表',
    retryable: true,
    writesData: false,
  },
  {
    name: 'walker_get',
    endpoint: 'mcp:walker_get',
    description: '按 slug 取完整内容',
    input: 'slug',
    output: '单篇内容 frontmatter + 正文（AI 可读才返回）',
    permission: 'public',
    failureReturn: '未找到 / AI-0 拒绝 → 空',
    retryable: true,
    writesData: false,
  },
  {
    name: 'walker_stats',
    endpoint: 'mcp:walker_stats',
    description: '内容统计概览',
    input: '无',
    output: '按 type / form 的聚合计数（仅 public）',
    permission: 'public',
    failureReturn: '空统计',
    retryable: true,
    writesData: false,
  },
  {
    name: 'walker_insights',
    endpoint: 'mcp:walker_insights',
    description: '需求洞察统计（私有）',
    input: '无',
    output: '需求簇 / 反馈分布等洞察聚合',
    permission: 'system',
    failureReturn: '默认私有 → 返回错误提示，需 MCP_ENABLE_PRIVATE_INSIGHTS=true',
    retryable: false,
    writesData: false,
  },

  // ── AI Gateway（server-only，不暴露 key） ──────────────────────────────
  {
    name: 'callGateway',
    endpoint: 'agent:gateway.callGateway',
    description: '统一 AI 调用入口（Pretext → 敏感词 → 调用 → 输出检测 → 日志）',
    input: '路由 + 用户消息 + 场景提示',
    output: '模型结构化响应（JSON）',
    permission: 'server-only',
    failureReturn: '超时 / 无 key / 敏感命中 → 降级本地规则或 fallback',
    retryable: false,
    writesData: false,
  },

  // ── Admin 内容与配置（admin，多数写） ──────────────────────────────────
  {
    name: 'content-crud',
    endpoint: '/api/admin/content/[slug]',
    description: '内容增删改（GitHub API 回写 markdown）',
    input: 'slug + frontmatter + 正文',
    output: '操作结果',
    permission: 'admin',
    failureReturn: '未配置 GITHUB_TOKEN → 503',
    retryable: false,
    writesData: true,
  },
  {
    name: 'gateway-config',
    endpoint: '/api/admin/gateway',
    description: 'AI Gateway 配置 CRUD + 测试连接',
    input: '服务商 / key / model / baseUrl',
    output: '配置状态 + 调用统计',
    permission: 'admin',
    failureReturn: '配置校验失败 → 400',
    retryable: false,
    writesData: true,
  },
  {
    name: 'rules-crud',
    endpoint: '/api/admin/rules',
    description: '规则候选池 CRUD + 状态推进（U9）',
    input: '规则描述 / 状态 / 准确率',
    output: '规则 ID + 列表',
    permission: 'admin',
    failureReturn: '校验失败 → 400',
    retryable: false,
    writesData: true,
  },
  {
    name: 'experience-crud',
    endpoint: '/api/admin/experience-events',
    description: '经验事件采集 + 复盘更新（U10）',
    input: '原话 / 场景 / 判断 / 反馈 / 成熟度',
    output: '事件 ID + 列表',
    permission: 'admin',
    failureReturn: '校验失败 → 400',
    retryable: false,
    writesData: true,
  },
  {
    name: 'skills-crud',
    endpoint: '/api/admin/skills',
    description: 'Skill 候选 CRUD + 准入判断（U11）',
    input: '名称 / 定义域 / 输入条件 / 输出形态 / 验证标准',
    output: 'Skill ID + 列表',
    permission: 'admin',
    failureReturn: '校验失败 → 400',
    retryable: false,
    writesData: true,
  },
  {
    name: 'review-update',
    endpoint: '/api/admin/review',
    description: 'NeedCase 复盘状态更新',
    input: 'needCaseId + 状态 + 备注',
    output: '操作结果',
    permission: 'admin',
    failureReturn: '未找到 → 404',
    retryable: false,
    writesData: true,
  },
  {
    name: 'brief-generate',
    endpoint: '/api/admin/brief',
    description: '选题创作简报生成（规则给角度，不代写）',
    input: 'topicId',
    output: '简报结构（角色 / 卡点 / 角度 / 结构）',
    permission: 'admin',
    failureReturn: '选题未找到 → 404',
    retryable: true,
    writesData: false,
  },
  {
    name: 'hit-rate',
    endpoint: '/api/admin/hit-rate',
    description: '内容命中率 + 反馈矩阵 + 点赞排行聚合',
    input: '无',
    output: '每篇 resolved/stuck/反馈细分/点赞',
    permission: 'admin',
    failureReturn: '无数据 → 空列表',
    retryable: true,
    writesData: false,
  },

  // ── 匹配 / 反馈（受邀会话或公开写计数） ────────────────────────────────
  {
    name: 'match',
    endpoint: '/api/match',
    description: '用户需求匹配（本地 + Gateway 增强）',
    input: '用户消息 + sessionId',
    output: '推荐资源 + 串联语 + 判断结论',
    permission: 'user',
    failureReturn: '模型失败 → 本地规则；超限 → 429',
    retryable: false,
    writesData: true,
  },
  {
    name: 'match-feedback',
    endpoint: '/api/match-feedback',
    description: '推荐结果反馈（回写 NeedCase）',
    input: 'sessionId + feedbackType',
    output: '操作结果',
    permission: 'public',
    failureReturn: '会话未找到 → 忽略',
    retryable: false,
    writesData: true,
  },
  {
    name: 'like',
    endpoint: '/api/like',
    description: '文章点赞（Redis 计数，IP 冷却）',
    input: 'path',
    output: '当前计数',
    permission: 'public',
    failureReturn: 'Redis 不可用 → fallback 计数',
    retryable: true,
    writesData: true,
  },
  {
    name: 'invite-verify',
    endpoint: '/api/invite/verify',
    description: '邀请码验证准入（建立受邀会话）',
    input: '邀请锚点',
    output: '受邀会话 cookie',
    permission: 'public',
    failureReturn: '验证失败 → 401',
    retryable: false,
    writesData: true,
  },

  // ── 公开只读统计 ────────────────────────────────────────────────────────
  {
    name: 'stats',
    endpoint: '/api/stats',
    description: '公开聚合计数（白名单边界）',
    input: '无',
    output: 'matchCount / contentCount / topCategories（仅此三项）',
    permission: 'public',
    failureReturn: 'Redis 不可用 → 计数回退',
    retryable: true,
    writesData: false,
  },
] as const;

/** Observability 公开统计字段白名单（/api/stats 仅允许返回这些字段） */
export const PUBLIC_STATS_FIELDS = ['matchCount', 'contentCount', 'topCategories'] as const;

/** 按 permission 分组（供复盘与回归用） */
export function toolsByPermission(permission: ToolPermission): ToolDeclaration[] {
  return TOOL_MANIFEST.filter(tool => tool.permission === permission);
}
