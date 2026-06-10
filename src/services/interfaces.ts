/**
 * Service 接口定义 — 四层架构的业务层抽象
 *
 * 每个 service 只定义公开方法签名，不实现。
 * 上层（API routes / Agent）只依赖这些接口。
 */

// ---------------------------------------------------------------------------
// 匹配服务 — 需求分类 + 工具推荐
// ---------------------------------------------------------------------------

export interface MatchingServicePort {
  /** 根据用户输入和上下文完成本地匹配 */
  matchNeed(input: {
    need: string;
    audienceGroup?: string;
    aiStage?: string;
  }): Promise<MatchResult>;
}

export interface MatchResult {
  responseMode: string;
  categories: string[];
  resources: unknown[];
  recommendedTools: unknown[];
  needFrame: unknown;
  diagnosisOptions: unknown[];
  actionPlan?: unknown;
  bridge: string;
  frictionLayer: string;
  recommendedAbilityType: string;
  toolDirection: string;
  reason: string;
  complianceRedirected: boolean;
  codeAgentMisuseLikely: boolean;
}

// ---------------------------------------------------------------------------
// 可见性服务 — 数据边界控制
// ---------------------------------------------------------------------------

export interface VisibilityServicePort {
  /** 判断内容是否对当前角色可见 */
  canSee(params: {
    role: 'public' | 'invited' | 'admin';
    contentVisibility: 'public' | 'draft' | 'private' | 'admin-only';
  }): boolean;

  /** 对需求事件做脱敏处理 */
  redactDemandEvent(event: unknown, role: 'public' | 'invited' | 'admin'): unknown;

  /** 对统计信息做可见性过滤 */
  filterStats(stats: unknown, role: 'public' | 'invited' | 'admin'): unknown;
}

// ---------------------------------------------------------------------------
// 邀请服务 — 邀请码验证 + 准入
// ---------------------------------------------------------------------------

export interface InviteServicePort {
  /** 验证邀请码，返回是否准入 */
  verifyAndAdmit(code: string): Promise<InviteVerifyResult>;
}

export interface InviteVerifyResult {
  admitted: boolean;
  reason?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// 提问处理服务 — 用户提问 + 会话关联
// ---------------------------------------------------------------------------

export interface QuestionServicePort {
  /** 处理一次用户提问，返回匹配结果 + 事件 */
  handleQuestion(input: {
    sessionId?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    audienceGroup?: string;
    aiStage?: string;
    consentForTopic?: boolean;
    sourcePage?: string;
  }): Promise<QuestionResult>;
}

export interface QuestionResult {
  eventId?: string;
  sessionId: string;
  remaining: number;
  responsePayload: unknown;
}
