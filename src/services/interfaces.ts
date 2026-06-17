/**
 * Service 接口定义 — 四层架构的业务层抽象
 *
 * 每个 service 只定义公开方法签名，不实现。
 * 上层（API routes / Agent）只依赖这些接口。
 */

import type {
  AccountStatus,
  AdminReviewStatus,
  AuthState,
  Incident,
  NeedCase,
  SafetyDecision,
  UserAccount,
  UserProfile,
} from '@/stores/ports';
import type { MatchFeedbackEvent, MatchFeedbackType } from '@/stores/ports';

// ---------------------------------------------------------------------------
// 感知层 — 输入清洗、PII 脱敏、未成年人标记（Agent 六模块 - Perception）
// ---------------------------------------------------------------------------

export interface PerceivedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PerceivedInput {
  /** 截断 + 逐条脱敏压缩后的对话消息 */
  messages: PerceivedMessage[];
  /** 最新一条用户问题，脱敏压缩后的文本及 PII 命中标记 */
  latestNeedRedacted: { text: string; piiDetected: boolean };
  /** 未成年人场景标记（audienceGroup === 'minor'） */
  isMinorContext: boolean;
}

export interface PerceptionServicePort {
  /** 接收原始对话与人群标签，完成截断、脱敏、压缩和未成年判断 */
  perceive(input: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    audienceGroup?: string;
  }): PerceivedInput;
}

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
    role: 'public' | 'user' | 'admin';
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
  username: string | null;
  profile: UserProfile | null;
}

export interface UserContextServicePort {
  resolve(params: { sessionId: string | null; isAdmin: boolean }): Promise<UserContext>;
}

// ---------------------------------------------------------------------------
// 账号 — 注册 / 登录 / 登出 / 改密 / 重置 / 封禁 / owner bootstrap
// ---------------------------------------------------------------------------

export interface RegisterInput {
  inviteCode: string;
  username: string;
  password: string;
  personaAnchor?: string;
}

export interface AuthResult {
  ok: boolean;
  reason?: string;
  /** 机器可读状态码（如 'bootstrap-locked'），供 API 层判 HTTP 状态，避免靠文案 */
  code?: string;
  /** 新建会话 ID（成功时） */
  sessionId?: string;
  username?: string;
  /** 账号角色（成功时，用于签发带 role 的会话 cookie） */
  role?: 'user' | 'admin';
}

export interface AccountServicePort {
  /** 邀请码门控注册：校验邀请码 → 占用户名 → scrypt 哈希 → 建账号 → 消费邀请 → 建会话 */
  register(input: RegisterInput): Promise<AuthResult>;
  /** 用户名密码登录；失败统一 reason（不区分用户名是否存在，防枚举） */
  login(username: string, password: string): Promise<AuthResult>;
  /** 登出当前会话 */
  logout(sessionId: string): Promise<void>;
  /** 用户自助改密（需当前密码）；currentSessionId 用于改密后保留当前会话、踢掉其它设备 */
  changePassword(
    username: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId?: string,
  ): Promise<{ ok: boolean; reason?: string }>;
  /** 站主重置某用户密码（忘密唯一通道），返回新临时密码明文（仅显示一次） */
  resetPassword(username: string): Promise<{ ok: boolean; newPassword?: string; reason?: string }>;
  /** 封禁 / 解封 */
  setStatus(username: string, status: AccountStatus): Promise<{ ok: boolean; reason?: string }>;
  listAccounts(): Promise<UserAccount[]>;
  /** owner 一次性 bootstrap：仅当系统无账号时凭 ADMIN_PASSWORD 建 owner 账号 */
  bootstrapOwner(adminPassword: string, ownerUsername: string, ownerPassword: string): Promise<AuthResult>;
}

// ---------------------------------------------------------------------------
// 用户画像 — 读取 / 保存 / 删除请求（按账号 username）
// ---------------------------------------------------------------------------

export interface ProfileInput {
  /** 自报身份锚点（≤10 字），零 PII */
  personaAnchor?: string;
  nickname?: string;
}

export interface UserProfileServicePort {
  get(username: string): Promise<UserProfile | null>;
  upsert(username: string, input: ProfileInput): Promise<UserProfile>;
  requestDeletion(username: string): Promise<void>;
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
