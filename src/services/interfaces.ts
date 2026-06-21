/**
 * Service 接口定义 — 四层架构的业务层抽象
 *
 * 每个 service 只定义公开方法签名，不实现。
 * 上层（API routes / Agent）只依赖这些接口。
 */

import type {
  AccountRole,
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
import type {
  AssetEvidenceLink,
  AssetKind,
  AssetLifecycleStage,
  EvidenceRef,
  LearningRequest,
  SkillAdmissionSnapshot,
  SkillEvalCase,
  SkillRegistrationTier,
  WorkItem,
  WorkItemAction,
  WorkItemActionType,
  WorkItemOutcomeResult,
  WorkItemQueue,
  WorkItemStatus,
} from '@/stores/ports';
import type { ContentFeedbackEvent, ContentFeedbackSignal, ContentTelemetryEvent } from '@/stores/ports';

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
  role?: AccountRole;
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
  /** 指派角色（仅 owner 可用；改后撤销该用户旧会话，下次登录新角色生效） */
  setRole(username: string, role: AccountRole): Promise<{ ok: boolean; reason?: string }>;
  /** 删除账号（仅 owner；级联：会话 + 画像 + 需求脱敏 + 账号） */
  deleteAccount(username: string): Promise<{ ok: boolean; reason?: string }>;
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

// ---------------------------------------------------------------------------
// 工作台 —— WorkItem 决策聚合（P0-B/C / hai-razor 包 B）
//
// 所有状态迁移在 service 内完成；页面只投影当前状态，不在前端拼装业务事实。
// ---------------------------------------------------------------------------

/** 服务返回的机器可读结果码（API 层据此映射 HTTP 状态，不靠中文文案） */
export type WorkbenchResultCode =
  | 'ok'
  | 'not-found'
  | 'invalid-transition'
  | 'missing-evidence'
  | 'missing-expected-outcome'
  | 'storage-unavailable'
  | 'invalid-input';

export interface WorkbenchResult<T = void> {
  ok: boolean;
  code: WorkbenchResultCode;
  /** 失败时的中文说明（仅供人看，不作为判断依据） */
  message?: string;
  data?: T;
}

export interface CreateProposalInput {
  queue: WorkItemQueue;
  title: string;
  summary: string;
  priorityBand: WorkItem['priorityBand'];
  priorityReasons?: string[];
  uncertainty?: string[];
  evidenceRefs: EvidenceRef[];
  /** 关联选题（可选） */
  topicId?: string;
  /** 是否直接进入 pending（证据完整时为 true） */
  requestDecision?: boolean;
  /** 发起者；AI 草案传 'ai'，真实系统事件传对应标识 */
  actor: string;
}

export interface DecideInput {
  outcome: 'accepted' | 'rejected' | 'paused';
  reason: string;
  actor: string;
}

export interface CreateActionInput {
  actionType: WorkItemActionType;
  targetType: string;
  targetId?: string;
  /** 责任方；默认 walker（个人系统中由站主执行，AI 行动显式传 'ai'） */
  assignee?: WorkItemAction['assignee'];
  expectedOutcome: string;
  verifyAt?: string;
  reversible?: boolean;
  rollbackPlan?: string;
  actor: string;
}

export interface UpdateActionInput {
  status: WorkItemAction['status'];
  actor: string;
  reason?: string;
  targetId?: string;
}

export interface RecordOutcomeInput {
  actionId: string;
  result: WorkItemOutcomeResult;
  summary: string;
  evidenceRefs: EvidenceRef[];
  actor: string;
  nextDecisionSuggested?: boolean;
}

export interface WorkbenchServicePort {
  /** 创建 proposal；证据完整且 requestDecision 时进入 pending */
  createProposal(input: CreateProposalInput): Promise<WorkbenchResult<WorkItem>>;
  /** 证据完整时进入 pending；不完整返回 missing-evidence */
  requestDecision(workItemId: string, actor: string): Promise<WorkbenchResult<WorkItem>>;
  /** Walker 接受/拒绝/暂缓；仅 pending/proposal 可决定 */
  decide(workItemId: string, input: DecideInput): Promise<WorkbenchResult<WorkItem>>;
  /** 仅 accepted 决定可创建行动；expectedOutcome 为空时拒绝 */
  createAction(workItemId: string, input: CreateActionInput): Promise<WorkbenchResult<WorkItem>>;
  /** 更新行动状态（授权/进行中/阻塞/完成/取消） */
  updateAction(workItemId: string, actionId: string, input: UpdateActionInput): Promise<WorkbenchResult<WorkItem>>;
  /** 仅关联已执行（completed）Action 可记录结果 */
  recordOutcome(workItemId: string, input: RecordOutcomeInput): Promise<WorkbenchResult<WorkItem>>;
  /** P1-D02：Walker 人工覆盖优先级带，保存理由与 from→to 历史（不抹掉原排序依据） */
  overridePriority(
    workItemId: string,
    input: { priorityBand: WorkItem['priorityBand']; reason: string; actor: string },
  ): Promise<WorkbenchResult<WorkItem>>;
  /** 获取单条 WorkItem */
  findById(workItemId: string): Promise<WorkItem | null>;
  /** 今日投影：待决定 / 执行中 / 待验证 / 已验证 等队列 */
  getTodayProjection(options?: { limit?: number }): Promise<WorkItem[]>;
  /** 按队列/状态过滤列表 */
  list(options?: {
    queue?: WorkItemQueue;
    status?: WorkItemStatus | WorkItemStatus[];
    limit?: number;
  }): Promise<WorkItem[]>;
}

// ---------------------------------------------------------------------------
// 内容反馈 —— 内容阅读结果采集（P1-A）
//
// 公开写入（访客可提交），与后台 WorkItem 写接口权限/频率/滥用边界不同。
// sourceTopicId 由服务端从内容元数据派生，不信任客户端传入。
// ---------------------------------------------------------------------------

export type ContentFeedbackResultCode =
  | 'ok'
  | 'content-not-found'
  | 'content-not-public'
  | 'invalid-input'
  | 'storage-unavailable';

export interface ContentFeedbackSubmitInput {
  contentId: string;
  signal: ContentFeedbackSignal;
  note?: string;
  consentForAnalysis: boolean;
}

export interface ContentFeedbackResult {
  ok: boolean;
  code: ContentFeedbackResultCode;
  message?: string;
  feedbackId?: string;
  /** 服务端确认的来源关联（派生自内容元数据，非客户端传入） */
  sourceTopicId?: string;
}

export interface ContentFeedbackServicePort {
  /** 验证 contentId 对应真实公开内容，脱敏 note，写入事件，返回派生关联 */
  submit(input: ContentFeedbackSubmitInput): Promise<ContentFeedbackResult>;
  findByContent(contentId: string, range?: { from?: string; to?: string }): Promise<ContentFeedbackEvent[]>;
  findByTopic(topicId: string, range?: { from?: string; to?: string }): Promise<ContentFeedbackEvent[]>;
  findRecent(range?: { from?: string; to?: string }, limit?: number): Promise<ContentFeedbackEvent[]>;
}

// ---------------------------------------------------------------------------
// P3-A：内容阅读深度遥测 —— 与 ContentFeedback 分开存储/计算（不合并分母）
// ---------------------------------------------------------------------------

export type ContentTelemetryResultCode =
  | 'ok'
  | 'content-not-found'
  | 'invalid-input'
  | 'storage-unavailable';

export interface ContentTelemetrySubmitInput {
  contentId: string;
  eventType: 'content_progress' | 'content_complete';
  /** 0–1，content_complete 恒为 1 */
  progress: number;
  /** per-page-load 随机 UUID（客户端 sessionStorage 生成，非身份派生） */
  readerToken: string;
  consentForAnalysis: boolean;
}

export interface ContentTelemetryResult {
  ok: boolean;
  code: ContentTelemetryResultCode;
  message?: string;
  eventId?: string;
  sourceTopicId?: string;
}

export interface ContentTelemetryServicePort {
  /** 验证 contentId 对应真实公开内容，规整 progress，写入事件，返回派生关联 */
  submit(input: ContentTelemetrySubmitInput): Promise<ContentTelemetryResult>;
  findByContent(contentId: string, range?: { from?: string; to?: string }): Promise<ContentTelemetryEvent[]>;
  findRecent(range?: { from?: string; to?: string }, limit?: number): Promise<ContentTelemetryEvent[]>;
}

// ---------------------------------------------------------------------------
// 资产晋升 —— Experience/Rule/Skill 统一生命周期 + Outcome 证据链（P2-B）
//
// 方案要求：每次晋升保存 Outcome Evidence 和 Walker 批准；能查看某个 Skill 由
// 哪些 Outcome/Experience 支持；证据不足只生成 LearningRequest，不注册 Skill。
// ---------------------------------------------------------------------------

export type AssetResultCode =
  | 'ok'
  | 'not-found'
  | 'invalid-input'
  | 'invalid-stage'
  | 'missing-evidence'
  | 'missing-boundary'
  | 'missing-counterexample'
  | 'missing-eval-set'
  | 'storage-unavailable';

export interface AssetResult<T = void> {
  ok: boolean;
  code: AssetResultCode;
  message?: string;
  data?: T;
}

/** P4 Skill 注册护栏字段（注册到 admitted 时由 promote 强制非空） */
export interface SkillRegistrationInput {
  applicableBoundary: string;
  failureBoundary: string;
  positiveExamples?: string[];
  /** 反例（注册前至少 1 条） */
  negativeExamples: string[];
  /** 可回放验证集（覆盖 normal/boundary/reject/failure） */
  evalSet: SkillEvalCase[];
}

export interface PromoteAssetInput {
  assetKind: AssetKind;
  assetId: string;
  /** 晋升到的统一阶段 */
  toStage: AssetLifecycleStage;
  /** 支撑本次晋升的来源（至少一条 Outcome 或 Experience，否则拒绝） */
  sourceOutcomeIds?: string[];
  sourceExperienceIds?: string[];
  /** Walker 批准人 */
  approvedBy: string;
  reason: string;
  /** 关联的 WorkItem（可选） */
  workItemId?: string;
  /** P4：注册 Skill（toStage=validated/stable）时必填的护栏字段 */
  skillRegistration?: SkillRegistrationInput;
}

export interface AssetServicePort {
  /** 晋升资产：记录证据链 + Walker 批准，并回写资产本体的本地状态枚举 */
  promote(input: PromoteAssetInput): Promise<AssetResult<AssetEvidenceLink>>;
  /** 查看某个资产由哪些 Outcome/Experience 支持（按时间倒序） */
  getSupportingEvidence(kind: AssetKind, assetId: string): Promise<AssetEvidenceLink[]>;
  /** 最近的晋升记录（资产活动流） */
  recentPromotions(limit?: number): Promise<AssetEvidenceLink[]>;
  /** 创建学习请求（证据不足时不注册 Skill，生成补证任务） */
  createLearningRequest(input: {
    evidenceGap: LearningRequest['evidenceGap'];
    context: string;
    expectedEvidence: string;
    topicId?: string;
    assetKind?: AssetKind;
    assetId?: string;
    workItemId?: string;
  }): Promise<LearningRequest>;
  /** 列出学习请求 */
  listLearningRequests(status?: LearningRequest['status']): Promise<LearningRequest[]>;
  /** 完成学习请求（Walker 补证后填结果） */
  fulfillLearningRequest(requestId: string, fulfillmentNote: string): Promise<AssetResult<LearningRequest>>;
  // ---- P4：Skill 受控注册（暂停 / 恢复 / 回滚）----
  /** 暂停一个已注册 Skill（运行时退出 Agent 调用，不动 admissionStatus） */
  pauseSkill(skillId: string, reason: string): Promise<AssetResult<void>>;
  /** 恢复一个已暂停 Skill */
  resumeSkill(skillId: string, reason: string): Promise<AssetResult<void>>;
  /** 从某版本快照回滚 Skill 的准入状态（spec §28 可回滚） */
  rollbackSkill(skillId: string, toVersion: number, reason: string): Promise<AssetResult<void>>;
}
