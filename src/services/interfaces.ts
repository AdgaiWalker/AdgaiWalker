/**
 * Service 接口定义 — 四层架构的业务层抽象
 *
 * 每个 service 只定义公开方法签名，不实现。
 * 上层（API routes / Agent）只依赖这些接口。
 */

import type {
  AdminReviewStatus,
  AuthState,
  Incident,
  NeedCase,
  SafetyDecision,
  UserProfile,
} from '@/stores/ports';
import type { MatchFeedbackEvent, MatchFeedbackType } from '@/stores/ports';

// ---------------------------------------------------------------------------
// 匹配服务 — 需求分类 + 工具推荐（本地规则）
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

  /** 对 Need Case 做脱敏处理 */
  redactNeedCase(needCase: unknown, role: AuthState): unknown;

  /** 对统计信息做可见性过滤 */
  filterStats(stats: unknown, role: AuthState): unknown;
}

// ---------------------------------------------------------------------------
// 用户上下文 — 汇总身份、会话、画像
// ---------------------------------------------------------------------------

export interface UserContext {
  authState: AuthState;
  sessionId: string | null;
  profile: UserProfile | null;
}

export interface UserContextServicePort {
  resolve(params: { sessionId: string | null; isAdmin: boolean }): Promise<UserContext>;
}

// ---------------------------------------------------------------------------
// 邀请准入 — 验证邀请码 + 建立 invited 会话
// ---------------------------------------------------------------------------

export interface InviteAdmitResult {
  admitted: boolean;
  reason?: string;
  /** 新建的 invited session ID（仅准入成功时返回） */
  sessionId?: string;
  inviteCodeHash?: string;
}

export interface InviteAccessServicePort {
  verifyAndAdmit(code: string): Promise<InviteAdmitResult>;
}

// ---------------------------------------------------------------------------
// 用户画像 — 读取 / 保存 / 删除请求
// ---------------------------------------------------------------------------

export interface ProfileInput {
  /** 自报身份锚点（≤10 字），零 PII */
  personaAnchor?: string;
  nickname?: string;
}

export interface UserProfileServicePort {
  get(sessionId: string): Promise<UserProfile | null>;
  upsert(sessionId: string, input: ProfileInput): Promise<UserProfile>;
  requestDeletion(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Agent 编排 — /api/match 的业务核心（取代旧 QuestionService）
// ---------------------------------------------------------------------------

export interface AgentOrchestratorPort {
  handleNeed(input: {
    userContext: UserContext;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    audienceGroup?: string;
    aiStage?: string;
    consentForTopic?: boolean;
    sourcePage?: string;
    sessionId?: string;
  }): Promise<NeedCaseHandleResult>;
}

export interface NeedCaseHandleResult {
  needCaseId?: string;
  sessionId: string;
  responsePayload: unknown;
  fallbackUsed: boolean;
}

// ---------------------------------------------------------------------------
// 反馈 — 保存并回写 Need Case
// ---------------------------------------------------------------------------

export interface FeedbackServicePort {
  submit(input: {
    needCaseId?: string;
    sessionId: string;
    feedbackType: MatchFeedbackType;
    feedbackText?: string;
  }): Promise<{ feedbackId: string; needCaseId?: string }>;
}

// ---------------------------------------------------------------------------
// 后台复盘 — Need Case 列表 + review 状态
// ---------------------------------------------------------------------------

export interface NeedCaseReviewItem {
  needCase: NeedCase;
  feedbacks: MatchFeedbackEvent[];
}

export interface AdminReviewServicePort {
  listPending(options?: { limit?: number }): Promise<NeedCaseReviewItem[]>;
  listAll(options?: { limit?: number }): Promise<NeedCaseReviewItem[]>;
  updateReview(needCaseId: string, status: AdminReviewStatus, note?: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// 安全层 — 输入评估 + 事件记录
// ---------------------------------------------------------------------------

export interface SafetyServicePort {
  assessInput(text: string, audienceGroup?: string): SafetyDecision;
  recordIncident(input: {
    scope: string;
    severity: Incident['severity'];
    message: string;
    relatedNeedCaseId?: string;
    relatedSessionId?: string;
  }): Promise<void>;
}
