/**
 * Port 接口定义 — 四层架构的数据层抽象
 *
 * 所有上层模块（services / API routes / Agent）只依赖这些接口，
 * 不依赖具体的 Redis / 文件 / KV 实现。
 */

import type { AbilityType, AiStage, AudienceGroup, FrictionLayer, NeedCategory } from '@/profiles/resource-index';

// ---------------------------------------------------------------------------
// 认证状态、账号、会话
// ---------------------------------------------------------------------------

export type AuthState = 'public' | 'user' | 'admin';

export type AccountRole = 'user' | 'admin' | 'owner';
export type AccountStatus = 'active' | 'banned' | 'deleteRequested';

/** 注册账号：用户名 + scrypt 密码哈希，零 PII（不收邮箱/手机）。 */
export interface UserAccount {
  username: string;
  passwordHash: string;
  role: AccountRole;
  status: AccountStatus;
  /** 注册时消费的邀请码 hash（溯源，可选） */
  inviteCodeHash?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AccountRepositoryPort {
  findByUsername(username: string): Promise<UserAccount | null>;
  /** 创建账号（用户名唯一，已存在抛错；调用方负责占位校验） */
  create(account: UserAccount): Promise<void>;
  updateStatus(username: string, status: AccountStatus): Promise<void>;
  updateRole(username: string, role: AccountRole): Promise<void>;
  updatePasswordHash(username: string, passwordHash: string): Promise<void>;
  updateLastLogin(username: string, at: string): Promise<void>;
  listAll(): Promise<UserAccount[]>;
  /** 是否存在任意账号（owner bootstrap 判定用） */
  exists(): Promise<boolean>;
  /** 删除账号（DEL 账号 key + 从 auth:accounts 集合移除） */
  delete(username: string): Promise<void>;
}

/** 登录会话：cookie 装签名 sessionId，真会话有效性查 SessionRepositoryPort。 */
export interface UserSession {
  sessionId: string;
  username: string;
  role: AccountRole;
  createdAt: string;
  expiresAt: string;
}

export interface SessionRepositoryPort {
  create(session: UserSession): Promise<void>;
  get(sessionId: string): Promise<UserSession | null>;
  isValid(sessionId: string): Promise<boolean>;
  revoke(sessionId: string): Promise<void>;
  /** 踢掉某账号全部会话（改密/重置/封禁即时生效）；exceptSessionId 保留当前会话 */
  killAllByUsername(username: string, exceptSessionId?: string): Promise<void>;
  /** 列出某账号的会话（详情页/会话管理用） */
  listByUsername(username: string): Promise<UserSession[]>;
}

// ---------------------------------------------------------------------------
// Need Case — 第一轮核心业务对象（取代 DemandEvent 主业务地位）
// ---------------------------------------------------------------------------

export interface ProfileSnapshot {
  /** 本次遭遇推断的角色（参考 personaAnchor 作默认底色） */
  roleInContext?: string;
  goal?: string;
  stuckPoint?: string;
  /** 社会关系线索（学生 / 职场 / 家长 / 创作者 等） */
  socialContext?: string;
  /** 引用的自报锚点（来自 UserProfile.personaAnchor） */
  personaAnchor?: string;
  /** 切片推断置信度：true=推断成功；false=降级到锚点（低置信度） */
  sliceInferred: boolean;
  capturedAt: string;
}

export interface AgentRecommendation {
  responseMode: string;
  bridge: string;
  toolDirection?: string;
  reason?: string;
  fallbackUsed: boolean;
  resourceIds: string[];
  recommendedTools: Array<{ id: string; name: string }>;
  actionPlan?: unknown;
  needFrame?: unknown;
  diagnosisOptions?: unknown[];
  modelLabel?: string;
}

export type FeedbackStatus =
  | 'none'
  | 'resolved'
  | 'stuck'
  | 'not-fit'
  | 'want-tutorial'
  | 'first-draft'
  | 'next-step-clear'
  | 'wrong-direction'
  | 'need-tutorial';

export type AdminReviewStatus = 'pending' | 'accepted' | 'deferred' | 'ignored';

export interface SafetyFlags {
  piiDetected: boolean;
  piiRemoved: boolean;
  isMinorContext: boolean;
  complianceRedirected: boolean;
  codeAgentMisuseLikely?: boolean;
  consentForTopic: boolean;
}

export interface NeedCase {
  needCaseId: string;
  sessionId: string;
  /** 归属账号用户名（便于按用户复盘 + 删除按账号级联脱敏） */
  username?: string;
  createdAt: string;
  updatedAt: string;
  sourcePage: string;
  rawNeedRedacted: string;
  needSummary: string;
  needCategories: NeedCategory[];
  frictionLayer?: FrictionLayer;
  recommendedAbilityType?: AbilityType;
  toolDirection?: string;
  recommendedContentIds: string[];
  recommendedToolIds: string[];
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  profileSnapshot?: ProfileSnapshot;
  /** 本次遭遇切片是否为高置信推断；冗余顶层字段便于后台筛选和聚类。 */
  sliceInferred?: boolean;
  agentRecommendation: AgentRecommendation;
  feedbackStatus: FeedbackStatus;
  adminReviewStatus: AdminReviewStatus;
  adminReviewNote?: string;
  topicCandidateId?: string;
  /** 聚类处理时间戳：已参与 TopicCandidate 聚类的 Need Case 不再重复处理。 */
  topicProcessedAt?: string;
  safetyFlags: SafetyFlags;
}

export interface NeedCaseRepositoryPort {
  save(needCase: NeedCase): Promise<void>;
  findById(needCaseId: string): Promise<NeedCase | null>;
  findBySessionId(sessionId: string): Promise<NeedCase[]>;
  findPendingReview(options?: { limit?: number }): Promise<NeedCase[]>;
  findUnprocessedForTopics(limit?: number): Promise<NeedCase[]>;
  findRecent(days: number): Promise<NeedCase[]>;
  updateFeedback(needCaseId: string, feedbackStatus: FeedbackStatus): Promise<void>;
  updateAdminReview(
    needCaseId: string,
    status: AdminReviewStatus,
    note?: string,
  ): Promise<void>;
  markTopicProcessed(needCaseIds: string[], topicCandidateId?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// 匹配会话
// ---------------------------------------------------------------------------

export interface MatchSession {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  lastActiveAt: string;
  sourcePage: string;
  messageCount: number;
  consentForTopic: boolean;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  isMinorContext: boolean;
  promptVersion: string;
  modelVersion: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface MatchSessionRepositoryPort {
  upsert(session: MatchSession): Promise<void>;
  get(sessionId: string): Promise<MatchSession | null>;
  end(sessionId: string, endedAt?: string): Promise<MatchSession | null>;
  count(): Promise<number>;
  /** 生成新会话 ID（UUID v4） */
  createSessionId(): string;
  /** 保存/覆盖某会话的对话消息（fire-and-forget 语义，失败不阻断用户响应） */
  saveMessages(sessionId: string, messages: ConversationMessage[]): Promise<void>;
  /** 累加匹配统计（总数 + 各分类计数） */
  incrementStats(categories: NeedCategory[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// 反馈
// ---------------------------------------------------------------------------

export type MatchFeedbackType =
  | 'resolved' | 'stuck' | 'not-fit' | 'want-tutorial'
  | 'first-draft' | 'next-step-clear' | 'wrong-direction' | 'need-tutorial';

export interface MatchFeedbackEvent {
  feedbackId: string;
  needCaseId?: string;
  sessionId: string;
  createdAt: string;
  feedbackType: MatchFeedbackType;
  feedbackText?: string;
}

export interface FeedbackRepositoryPort {
  save(event: MatchFeedbackEvent): Promise<void>;
  findRecent(days: number, limit?: number): Promise<MatchFeedbackEvent[]>;
  findByNeedCase(needCaseId: string): Promise<MatchFeedbackEvent[]>;
}

// ---------------------------------------------------------------------------
// 邀请码（注册门票：消费一次，不再建会话）
// ---------------------------------------------------------------------------

export interface InviteCode {
  code: string;
  createdAt: string;
  maxUses: number;
  usedCount: number;
  label?: string;
}

export interface InviteCodeRepositoryPort {
  findByCode(code: string): Promise<InviteCode | null>;
  incrementUsage(code: string): Promise<number>;
  listAll(): Promise<InviteCode[]>;
}

// ---------------------------------------------------------------------------
// 用户画像（按账号 username 存）
// ---------------------------------------------------------------------------

export interface UserProfile {
  profileId: string;
  username: string;
  inviteCodeHash?: string;
  /** 自报身份锚点（≤10 字），注册时填、用户可改。零 PII，写入前过 redactSensitiveText。 */
  personaAnchor?: string;
  nickname?: string;
  consentForProfile: boolean;
  deleteRequestedAt?: string;
  /** 锚点置信度：填了 personaAnchor=1，没填=0 */
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileRepositoryPort {
  save(profile: UserProfile): Promise<void>;
  findByUsername(username: string): Promise<UserProfile | null>;
  findAll(): Promise<UserProfile[]>;
  markDeleteRequested(username: string, requestedAt: string): Promise<void>;
  /** 物理删画像（删账号级联用） */
  deleteByUsername(username: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// 安全层
// ---------------------------------------------------------------------------

export interface SafetyDecision {
  action: 'allow' | 'fallback' | 'reject' | 'defer-to-human';
  reason: string;
  redactedText?: string;
  piiDetected: boolean;
  isMinorContext: boolean;
}

export interface SafetyPolicyPort {
  assessInput(text: string, audienceGroup?: string): SafetyDecision;
}

export interface Incident {
  incidentId: string;
  createdAt: string;
  scope: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  relatedNeedCaseId?: string;
  relatedSessionId?: string;
  resolved: boolean;
}

export interface IncidentRepositoryPort {
  save(incident: Incident): Promise<void>;
  findUnresolved(limit?: number): Promise<Incident[]>;
}

// ---------------------------------------------------------------------------
// 公开统计
// ---------------------------------------------------------------------------

export interface PublicStats {
  matchCount: number;
  contentCount: number;
  topCategories: Array<{ id: string; label: string; count: number }>;
}

export interface StatsRepositoryPort {
  incrementTotal(): Promise<void>;
  incrementCategory(category: string): Promise<void>;
  getTotal(): Promise<number>;
  getCategoryCounts(): Promise<Array<{ id: string; count: number }>>;
}

// ---------------------------------------------------------------------------
// 话题候选
// ---------------------------------------------------------------------------

export type TopicCandidateStatus = 'observed' | 'accepted' | 'deferred' | 'ignored' | 'produced';

export interface TopicRoleDistribution {
  role: string;
  count: number;
}

export interface TopicCandidate {
  topicId: string;
  /** 聚类键（layer:ability:category:role），同簇需求合并 */
  clusterKey: string;
  createdAt: string;
  updatedAt?: string;
  title: string;
  /** 需求密度 = 源 Need Case 数 */
  density: number;
  /** 角色分布（来自遭遇切片 roleInContext + 自报锚点） */
  roleDistribution: TopicRoleDistribution[];
  /** 代表性需求摘要 */
  representativeNeed: string;
  relatedContentIds: string[];
  priority: 'high' | 'medium' | 'low';
  status: TopicCandidateStatus;
  source: 'need-cluster' | 'inspiration';
  /** 已创作内容 slug 回填（status=produced 时） */
  producedContentSlug?: string;
}

// ---------------------------------------------------------------------------
// 经验事件（U10 经验验证系统：原始事件采集 → 复盘 → 模式 → 方法成熟度）
// ---------------------------------------------------------------------------

export type ExperienceFeedbackResult = 'success' | 'failure' | 'no-feedback' | 'pending';

export interface ExperienceEvent {
  experienceId: string;
  createdAt: string;
  updatedAt: string;
  /** 来源：直播 / 对话 / 教程反馈 / 网站 / 其他 */
  source: string;
  /** 用户原话（保真，不总结） */
  rawQuote: string;
  /** 表层需求 */
  surfaceNeed?: string;
  /** 场景标注（身份 / 场景 / 条件） */
  scenarioNote?: string;
  /** 当时初步判断（可推翻假设） */
  initialHypothesis?: string;
  /** 给出的帮助动作（文章 / 方法 / 工具 / Skill / 教程） */
  helpAction?: string;
  /** 反馈结果 */
  feedbackResult: ExperienceFeedbackResult;
  /** 复盘修正（对比初始判断与最终结果） */
  reflection?: string;
  /** 是否已识别为需求模式 */
  patternMarked: boolean;
  /** 方法成熟度阶段：素材 / 方法雏形 / 稳定方法 / Skill 候选 / 正式 Skill */
  maturity?: 'material' | 'embryo' | 'stable-method' | 'skill-candidate' | 'skill';
}

export interface ExperienceEventRepositoryPort {
  save(event: ExperienceEvent): Promise<void>;
  findRecent(limit?: number): Promise<ExperienceEvent[]>;
  findById(experienceId: string): Promise<ExperienceEvent | null>;
  markPattern(experienceId: string, patternMarked: boolean): Promise<void>;
}

// ---------------------------------------------------------------------------
// 规则候选（U9 规则候选池：observed → candidate → validated → stable → retired）
// ---------------------------------------------------------------------------

export type RuleStatus = 'observed' | 'candidate' | 'validated' | 'stable' | 'retired';

export interface RuleCandidate {
  ruleId: string;
  createdAt: string;
  updatedAt: string;
  /** 规则描述（如"提到 PPT 且无受众信号 → diagnosis"） */
  description: string;
  status: RuleStatus;
  /** 正例（命中的样本 needCase/experience ID） */
  positiveExamples: string[];
  /** 反例（推翻的样本） */
  negativeExamples: string[];
  /** 来源 needCase / experience */
  sourceIds: string[];
  /** 准确率（回放评测，0-1） */
  accuracy?: number;
  note?: string;
}

export interface RuleCandidateRepositoryPort {
  save(rule: RuleCandidate): Promise<void>;
  findRecent(limit?: number): Promise<RuleCandidate[]>;
  findByStatus(status: RuleStatus): Promise<RuleCandidate[]>;
  updateStatus(ruleId: string, status: RuleStatus, note?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Skill 候选（U11 Skill 准入：候选 → 准入判断 → 注册 / 降级方法卡）
// ---------------------------------------------------------------------------

export type SkillAdmissionStatus = 'candidate' | 'admitted' | 'demoted-to-method';

/**
 * P4 Skill 自动注册护栏：可回放验证集（spec §28.3）。
 * 注册到 registered-limited 前必须覆盖正常/边界/拒绝/失败四类输入。
 */
export interface SkillEvalCase {
  input: string;
  expectedOutput: string;
  category: 'normal' | 'boundary' | 'reject' | 'failure';
}

/** P4 Skill 暂停/回滚：每次准入变化存一份快照，支持受控回滚（spec §28）。 */
export interface SkillAdmissionSnapshot {
  version: number;
  admissionStatus: SkillAdmissionStatus;
  registrationTier?: SkillRegistrationTier;
  paused?: boolean;
  capturedAt: string;
  reason: string;
}

export type SkillRegistrationTier = 'limited' | 'stable';

export interface SkillCandidate {
  skillId: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  description: string;
  /** 准入状态 */
  admissionStatus: SkillAdmissionStatus;
  /** 定义域（输入范围） */
  domain: string;
  /** 输入条件 */
  inputConditions: string;
  /** 输出形态 */
  outputForm: string;
  /** 验证标准 */
  validationCriteria: string;
  /** 关联经验（ExperienceEvent ID） */
  sourceExperienceIds: string[];
  /** 版本 */
  version: number;
  // ---- P4 自动注册安全护栏（可选；注册到 admitted 前由 AssetService.promote 强制非空）----
  /** 适用边界 / 问题域（注册前必填） */
  applicableBoundary?: string;
  /** 非问题域 / 失败边界（注册前必填） */
  failureBoundary?: string;
  /** 正例 */
  positiveExamples?: string[];
  /** 反例（注册前至少 1 条） */
  negativeExamples?: string[];
  /** 可回放验证集（注册前必填，覆盖 normal/boundary/reject/failure） */
  evalSet?: SkillEvalCase[];
  /** 注册层级：limited（受控灰度）/ stable（全量）。validated→limited，stable→stable */
  registrationTier?: SkillRegistrationTier;
  /** 运行时暂停开关（与 admissionStatus 正交：admitted 但 paused 不被 Agent 调用） */
  paused?: boolean;
  pausedReason?: string;
  pausedAt?: string;
  /** 准入变化历史快照（append-only，支持 rollbackSkill） */
  admissionSnapshots?: SkillAdmissionSnapshot[];
}

export interface SkillCandidateRepositoryPort {
  save(skill: SkillCandidate): Promise<void>;
  findRecent(limit?: number): Promise<SkillCandidate[]>;
  findByAdmissionStatus(status: SkillAdmissionStatus): Promise<SkillCandidate[]>;
  updateAdmission(skillId: string, status: SkillAdmissionStatus): Promise<void>;
}

// ---------------------------------------------------------------------------
// 统一资产生命周期（P2-B）
//
// 方案要求：统一 KnowledgeSource / Experience / Rule / Skill / LearningRequest，
// 统一 observed→candidate→validated→stable→retired。
//
// hai-razor 决策：不重命名 Experience.maturity / Skill.admissionStatus / Rule.status
// （会破坏已有数据与历史命名），而是用一个**统一的 AssetLifecycle 视图**把三者
// 映射到同一生命周期，再用 AssetEvidenceLink 记录"资产 ← Outcome/Experience 证据"
// 与"每次晋升的 Walker 批准"。这样三类资产互相关联、连到 Outcome，且不动现有枚举。
//
// 核心补缺：方案明确"每次晋升保存 Outcome Evidence 和 Walker 批准"
//          "能查看某个 Skill 是由哪些 Experience/Outcome 支持的"
//          "证据不足只生成 LearningRequest，不注册 Skill"。
// ---------------------------------------------------------------------------

/** 统一资产类型 —— 对应 ExperienceEvent / RuleCandidate / SkillCandidate */
export type AssetKind = 'experience' | 'rule' | 'skill';

/** 统一生命周期阶段 —— 映射各自历史枚举到同一语言 */
export type AssetLifecycleStage =
  | 'observed'    // Experience.maturity=material/embryo | Rule.status=observed | Skill=candidate
  | 'candidate'   // Experience.maturity=stable-method | Rule.status=candidate | Skill=candidate
  | 'validated'   // Experience.maturity=skill-candidate | Rule.status=validated | Skill=admitted
  | 'stable'      // Experience.maturity=skill | Rule.status=stable | Skill=admitted
  | 'retired';    // Rule.status=retired | Skill=demoted-to-method

/** 把三类资产各自的本地状态映射到统一生命周期阶段 */
export function normalizeAssetStage(kind: AssetKind, raw: string): AssetLifecycleStage {
  if (kind === 'rule') {
    return (['observed', 'candidate', 'validated', 'stable', 'retired'] as const).includes(raw as AssetLifecycleStage)
      ? (raw as AssetLifecycleStage)
      : 'observed';
  }
  if (kind === 'experience') {
    const map: Record<string, AssetLifecycleStage> = {
      material: 'observed', embryo: 'observed',
      'stable-method': 'candidate', 'skill-candidate': 'validated', skill: 'stable',
    };
    return map[raw] ?? 'observed';
  }
  // skill
  const skillMap: Record<string, AssetLifecycleStage> = {
    candidate: 'candidate', admitted: 'validated', 'demoted-to-method': 'retired',
  };
  return skillMap[raw] ?? 'observed';
}

/**
 * 资产晋升证据链：记录某次晋升（stage 变化）由哪些 Outcome / Experience 支持，
 * 以及 Walker 的批准。append-only，保留审计 —— 满足方案"每次晋升保存 Outcome
 * Evidence 和 Walker 批准"。
 */
export interface AssetEvidenceLink {
  linkId: string;
  assetKind: AssetKind;
  assetId: string;
  /** 晋升到的目标阶段 */
  stage: AssetLifecycleStage;
  /** 支撑本次晋升的来源（Outcome ID / Experience ID / Rule ID，引用不复制原文） */
  sourceOutcomeIds: string[];
  sourceExperienceIds: string[];
  /** Walker 批准人 */
  approvedBy: string;
  approvedAt: string;
  reason: string;
  /** 关联的 WorkItem（可选，回溯到产生这条晋升的决定） */
  workItemId?: string;
  /** 进程内单调序号：同毫秒多次晋升时保证倒序稳定（append-only 审计要求） */
  seq?: number;
}

export interface AssetEvidenceLinkRepositoryPort {
  save(link: AssetEvidenceLink): Promise<void>;
  /** 查看某个资产由哪些 Outcome/Experience 支持（方案明确要求） */
  findByAsset(kind: AssetKind, assetId: string): Promise<AssetEvidenceLink[]>;
  findRecent(limit?: number): Promise<AssetEvidenceLink[]>;
}

// ---------------------------------------------------------------------------
// LearningRequest —— 证据不足时生成（P2-B）
//
// 方案：证据不足只生成 LearningRequest，不注册 Skill；不把未验证材料直接注册为能力。
// 这是"知识不等于产能"护栏的落地：缺实践/反例/访谈/结果证据时，记一条待补任务。
// ---------------------------------------------------------------------------

export type LearningRequestStatus = 'open' | 'in-progress' | 'fulfilled' | 'dropped';

export interface LearningRequest {
  requestId: string;
  createdAt: string;
  updatedAt: string;
  /** 需要补什么类型的证据：实践 / 反例 / 访谈 / 结果 */
  evidenceGap: 'practice' | 'counter-example' | 'interview' | 'outcome' | 'boundary';
  /** 为什么需要补（关联的选题/资产/Outcome 摘要，不复制私密原文） */
  context: string;
  /** 期望产出（补到什么程度算完成） */
  expectedEvidence: string;
  status: LearningRequestStatus;
  /** 关联选题 / 资产 / WorkItem（可选） */
  topicId?: string;
  assetKind?: AssetKind;
  assetId?: string;
  workItemId?: string;
  /** Walker 完成补证后填入的结果摘要 */
  fulfillmentNote?: string;
  fulfilledAt?: string;
}

export interface LearningRequestRepositoryPort {
  save(request: LearningRequest): Promise<void>;
  findById(requestId: string): Promise<LearningRequest | null>;
  findByStatus(status: LearningRequestStatus): Promise<LearningRequest[]>;
  findRecent(limit?: number): Promise<LearningRequest[]>;
}

// ---------------------------------------------------------------------------
// P4 Contributor 对象级授权（spec §29 RBAC）
//
// 与既有 role(admin/user/owner) 正交：不修改 AccountRole 枚举（不触动认证边界）。
// Contributor = role='user' + 至少一条 ObjectGrant。默认拒绝：无 grant 则仅 owner/admin 通过。
// Grant 按 resourceType + resourceId（'*' 表该类型全部）+ actions 三维授权，可选 expiresAt TTL。
// ---------------------------------------------------------------------------

export interface ObjectGrant {
  grantId: string;
  /** 被授权用户名（contributor = role=user + grant） */
  grantee: string;
  /** 资源类型，如 'workitem' | 'content' | 'skill' */
  resourceType: string;
  /** 资源 ID；'*' 表该类型全部资源 */
  resourceId: string;
  /** 允许的动作，如 ['read', 'comment', 'review'] */
  actions: string[];
  /** 授权人（仅 owner 可授权） */
  grantedBy: string;
  grantedAt: string;
  /** 可选过期时间；过期 grant 视同不存在 */
  expiresAt?: string;
  reason: string;
}

export interface ObjectGrantRepositoryPort {
  save(grant: ObjectGrant): Promise<void>;
  findByGrantee(grantee: string, resourceType?: string): Promise<ObjectGrant[]>;
  revoke(grantId: string): Promise<void>;
}

/** P4 操作审计（spec §29.4：谁在何时对什么对象执行了什么动作；Contributor 不可修改） */
export interface ActionAuditEntry {
  auditId: string;
  /** 操作者用户名；未登录为 'anonymous' */
  actor: string;
  role: string;
  action: string;
  resourceType: string;
  resourceId: string;
  result: 'allowed' | 'denied';
  reason: string;
  occurredAt: string;
}

export interface ActionAuditRepositoryPort {
  save(entry: ActionAuditEntry): Promise<void>;
  findRecent(limit?: number): Promise<ActionAuditEntry[]>;
}

// ---------------------------------------------------------------------------
// WorkItem —— 后台决策聚合根（P0-B，hai-razor 包 B）
//
// 语义四分（Evidence / Decision / Action / Outcome）作为内嵌子结构保留，
// 但首版共用一个聚合根与一个存储边界。WorkItem 不拥有原始事实，只引用并投影。
//
// 信任边界（hai-razor Complexity To Preserve）：
// - 无 evidenceRefs 的 AI 输出只能是 `proposal`，不能进入 decided/acting
// - 每次正式状态变化写一条 append-only history（actor / 时间 / from→to / reason）
// - 不复制私密原文；EvidenceRef 只保存安全摘要
// ---------------------------------------------------------------------------
// Admin Appearance —— 后台外观与媒体个人化（UX1）
// ---------------------------------------------------------------------------

export interface ThemeProfile {
  profileId: string;
  owner: string;
  name: string;
  accent: 'walker-jade' | 'aurora' | 'sunset' | 'mint';
  glass: 'apple-modern';
  density: 'low' | 'comfortable';
  backgroundAssetId?: string;
  readabilityOverlay: number;
  reducedMotion: boolean;
  visibility: 'owner';
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  assetId: string;
  owner: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  kind: 'image' | 'video';
  source: 'upload' | 'remote';
  visibility: 'owner';
  storageKey: string;
  publicUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppearanceRepositoryPort {
  getStorageMode(): Promise<'redis' | 'memory-development' | 'unavailable'>;
  getTheme(owner: string): Promise<ThemeProfile | null>;
  saveTheme(theme: ThemeProfile): Promise<void>;
  resetTheme(owner: string): Promise<ThemeProfile>;
  saveMedia(asset: MediaAsset): Promise<void>;
  listMedia(owner: string): Promise<MediaAsset[]>;
  removeMedia(owner: string, assetId: string): Promise<void>;
}

// ---------------------------------------------------------------------------

/** WorkItem 来源队列 —— 不同来源用不同证据与验证方式，不可抹掉来源身份 */
export type WorkItemQueue = 'user-demand' | 'walker-thesis' | 'system-event' | 'ai-asset';

/**
 * WorkItem 生命周期：
 * - proposal   AI 或系统整理的草案（必须有证据才可进入下一阶段）
 * - pending    证据完整、已请求 Walker 决定
 * - accepted   Walker 已接受（可派生 Action）
 * - rejected   Walker 已拒绝（保留原因，不删除）
 * - paused     Walker 暂缓（保留复查条件）
 * - acting     至少一个 Action 已授权执行
 * - awaiting-verification  Action 已执行完，等待现实验证
 * - resolved   已记录 Outcome 并闭环
 */
export type WorkItemStatus =
  | 'proposal'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'paused'
  | 'acting'
  | 'awaiting-verification'
  | 'resolved';

/** 优先级带（不跨队列做伪精确横向比较，见 northstar 优先级规则） */
export type WorkItemPriorityBand =
  | 'now'
  | 'week'
  | 'observe'
  | 'insufficient'
  | 'blocked';

export interface EvidenceRef {
  evidenceId: string;
  /** 引用的事实来源类型：need-case / walker-thesis / content-feedback / match-feedback / incident / experience / agent-call */
  sourceType:
    | 'need-case'
    | 'walker-thesis'
    | 'content-feedback'
    | 'match-feedback'
    | 'incident'
    | 'experience'
    | 'agent-call';
  sourceId: string;
  /** 事实发生时间（不是采集时间） */
  occurredAt: string;
  /** 进入本 WorkItem 的时间 */
  collectedAt: string;
  environment: 'development' | 'preview' | 'production';
  visibility: 'owner' | 'admin' | 'private' | 'public';
  freshness: 'fresh' | 'stale' | 'unknown';
  qualityStatus: 'verified-source' | 'partial' | 'unverified';
  /** 安全摘要（已脱敏）；不复制私密原文 */
  summary: string;
}

export interface DecisionItem {
  /** Walker 请求决定的问题 */
  requestedDecision: string;
  /** 当前决定结果，与 WorkItemStatus 同步 */
  outcome: 'pending' | 'accepted' | 'rejected' | 'paused';
  /** 决定理由（接受/拒绝/暂缓都必须有） */
  reason?: string;
  /** 作出决定的人（admin / owner username） */
  decidedBy?: string;
  decidedAt?: string;
}

export type WorkItemActionType =
  | 'create-content'
  | 'update-content'
  | 'change-feature'
  | 'create-learning-request'
  | 'review-incident'
  | 'evaluate-asset';

export type WorkItemActionStatus =
  | 'authorized'
  | 'in-progress'
  | 'awaiting-verification'
  | 'completed'
  | 'blocked'
  | 'cancelled';

export interface WorkItemAction {
  actionId: string;
  actionType: WorkItemActionType;
  /** 目标对象类型，如 content / feature / incident */
  targetType: string;
  /** 目标 ID（如内容 slug）；未产出前可空 */
  targetId?: string;
  assignee: 'walker' | 'ai' | 'shared';
  status: WorkItemActionStatus;
  /** 预期结果 —— 没有 expectedOutcome 的 Action 不能进入 authorized */
  expectedOutcome: string;
  verifyAt?: string;
  reversible: boolean;
  rollbackPlan?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkItemOutcomeResult = 'successful' | 'partial' | 'failed' | 'inconclusive';

export interface WorkItemOutcome {
  outcomeId: string;
  actionId: string;
  result: WorkItemOutcomeResult;
  summary: string;
  /** 指向支撑结果判断的证据（如 content-feedback） */
  evidenceRefs: EvidenceRef[];
  observedAt: string;
  nextDecisionSuggested?: boolean;
}

/** append-only 事件历史：审计、恢复与责任解释的唯一来源 */
export interface WorkItemHistoryEntry {
  historyId: string;
  /** 状态迁移的起点；新建时为 null */
  fromStatus: WorkItemStatus | null;
  toStatus: WorkItemStatus;
  /** 触发者；AI 草案由 'ai' 发起，正式决定由 admin/owner username 发起 */
  actor: string;
  occurredAt: string;
  /** 状态变化的理由 / 附带说明 */
  reason?: string;
  /** 变更类型，便于按事件类别查询 */
  kind:
    | 'created'
    | 'status-change'
    | 'evidence-added'
    | 'action-added'
    | 'action-updated'
    | 'outcome-recorded'
    | 'decision-updated';
  /** 结构化补充（如新增 evidence 的 id、action 的 id） */
  detail?: Record<string, unknown>;
}

export interface WorkItem {
  workItemId: string;
  /** 来源队列 */
  queue: WorkItemQueue;
  title: string;
  summary: string;
  status: WorkItemStatus;
  priorityBand: WorkItemPriorityBand;
  /** 优先级理由（同队列内排序依据，不显示伪精确分数） */
  priorityReasons: string[];
  /** 已知的不确定性 */
  uncertainty: string[];
  /** 指向原始事实的证据引用，不复制私密原文 */
  evidenceRefs: EvidenceRef[];
  /** Walker 的决定（首版一个 WorkItem 一个决定） */
  decision: DecisionItem;
  /** 由决定派生的可执行动作 */
  actions: WorkItemAction[];
  /** 现实结果记录 */
  outcomes: WorkItemOutcome[];
  /** append-only 状态历史 */
  history: WorkItemHistoryEntry[];
  /** 关联选题（可选，回链 TopicCandidate） */
  topicId?: string;
  /**
   * P4 安全护栏：AI 来源（queue=ai-asset）或无充分证据的 proposal 的过期时间。
   * 过期 proposal 不进入"立即处理/今日投影"（无证据假设不进入正式待决定队列），
   * 但保留在存储中供审计。pending 及之后的状态无 expiresAt。
   */
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemRepositoryPort {
  save(workItem: WorkItem): Promise<void>;
  findById(workItemId: string): Promise<WorkItem | null>;
  /** 按队列/状态过滤的最近列表；按 updatedAt 倒序 */
  list(options?: {
    queue?: WorkItemQueue;
    status?: WorkItemStatus | WorkItemStatus[];
    limit?: number;
  }): Promise<WorkItem[]>;
  /** 获取全部非终态（不含 resolved/rejected）的事项 */
  listActive(options?: { limit?: number }): Promise<WorkItem[]>;
  /** 删除：仅用于开发期清空，不作为正式能力（hai-razor：优先 cancelled/rejected 保留审计） */
  delete(workItemId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// ContentFeedback —— 内容阅读反馈（P1-A）
//
// 与 MatchFeedbackEvent 严格区分：
// - MatchFeedback 服务"需求匹配会话"，要求 sessionId，回答"匹配对不对"。
// - ContentFeedback 服务"内容阅读结果"，匿名访客可提交，回答"内容有没有解决问题"。
// 两类反馈分开存储、分开计算、并列解释，不合并原始分母（hai-razor 保留复杂度）。
// ---------------------------------------------------------------------------

export type ContentFeedbackSignal = 'useful' | 'needs-more' | 'outdated';

export interface ContentFeedbackEvent {
  feedbackId: string;
  /** 内容 slug（必须对应真实公开内容，服务端校验） */
  contentId: string;
  /** 内容公开路径，便于回溯展示 */
  contentPath: string;
  /** 由服务端从内容元数据派生，不信任客户端传入 */
  sourceTopicId?: string;
  /** 只有服务端可验证关联时才写入；不把一般访客冒充为原需求用户 */
  sourceNeedCaseId?: string;
  signal: ContentFeedbackSignal;
  /** 可选说明，限长 + 脱敏，允许空 */
  note?: string;
  createdAt: string;
  environment: 'development' | 'preview' | 'production';
  /** 是否同意用于分析；未同意不入分析聚合 */
  consentForAnalysis: boolean;
}

export interface ContentFeedbackRepositoryPort {
  save(event: ContentFeedbackEvent): Promise<void>;
  findByContent(contentId: string, range?: { from?: string; to?: string }): Promise<ContentFeedbackEvent[]>;
  findByTopic(topicId: string, range?: { from?: string; to?: string }): Promise<ContentFeedbackEvent[]>;
  findRecent(range?: { from?: string; to?: string }, limit?: number): Promise<ContentFeedbackEvent[]>;
}

// ---------------------------------------------------------------------------
// P3-A：内容阅读深度遥测（ContentTelemetry）
//
// 与 ContentFeedback（显式反馈）分开存储、分开计算、并列解释，不合并分母。
// 支持的真实决策："哪篇内容读者读到哪 / 是否读完 → 优先改进哪篇"
// （补 hit-rate 只有显式反馈、无阅读行为的缺口）。
//
// 隐私最小化（to-do 第 12 节 / 第 2 节）：
// - 不存储 IP（限流用 IP 哈希仅滚动窗口内瞬态，不入事件）。
// - readerToken 是 per-page-load 随机 UUID（sessionStorage，非跨会话、非身份派生），
//   仅用于近期窗口内 uniqueReaders 去重（同一读者上下滚动不重复计数）。
// - 不采集 referrer / userAgent / 任何可指纹字段（不支持"改进哪篇"决策的数据不采）。
// - consentForAnalysis 默认 true（匿名聚合阅读深度，无 PII，与既有 search-events 被动采集一致）。
// ---------------------------------------------------------------------------

export type ContentTelemetryEventType = 'content_progress' | 'content_complete';

export interface ContentTelemetryEvent {
  eventId: string;
  /** 内容 slug（服务端校验为真实公开内容） */
  contentId: string;
  contentPath: string;
  /** 服务端从内容元数据派生，不信任客户端传入 */
  sourceTopicId?: string;
  eventType: ContentTelemetryEventType;
  /** 阅读进度 0–1；content_complete 恒为 1 */
  progress: number;
  /** per-page-load 随机 UUID（非身份、非跨会话），仅用于近期窗口去重 */
  readerToken: string;
  createdAt: string;
  environment: 'development' | 'preview' | 'production';
  consentForAnalysis: boolean;
  /** 事件 schema 版本，服务端写死，便于未来迁移按版本过滤 */
  schemaVersion: 1;
}

export interface ContentTelemetryRepositoryPort {
  save(event: ContentTelemetryEvent): Promise<void>;
  findByContent(contentId: string, range?: { from?: string; to?: string }): Promise<ContentTelemetryEvent[]>;
  findRecent(range?: { from?: string; to?: string }, limit?: number): Promise<ContentTelemetryEvent[]>;
}

// ---------------------------------------------------------------------------
// P5 NorthStar 经营基础 —— 订单 / 支付 / 退款（spec §14）
//
// 硬约束：NorthStar 默认 OFF（isNorthStarEnabled()）。关闭时个人闭环须完整运行，
// 私密原始数据不自动发布（已有 northstar-containment 测试守护）。
// 真实支付商（Stripe/支付宝等）属 Human Gate：需账户 + 合规 + 凭据。
// 这里只建 Port + 开发合成适配器（不真实收费，记录意图）+ 订单状态机，
// 与 MediaObjectStoragePort（文件dev/Blob生产）、AI Gateway（多服务商）同模式。
// 真实 PaymentProvider 适配器由 Walker 提供凭据后接入；订单 API 在 NorthStar 开启前不挂公开路由。
// ---------------------------------------------------------------------------

export type OrderStatus = 'created' | 'paying' | 'paid' | 'fulfilled' | 'refunded' | 'cancelled';

export type OfferKind = 'product' | 'service' | 'capability';

/** 可发布的_offer（商品/服务/能力），由 Walker 选择性发布到 NorthStar 公共网络 */
export interface NorthStarOffer {
  offerId: string;
  kind: OfferKind;
  title: string;
  description: string;
  /** 标价（分，整数；货币由 currency 指定，避免浮点） */
  priceCents: number;
  currency: string;
  /** 发布者（owner），私密对象不自动发布 */
  publishedBy: string;
  publishedAt: string;
  status: 'active' | 'unlisted';
}

export interface Order {
  orderId: string;
  offerId: string;
  /** 买家标识（NorthStar 公共网络的联系句柄，非站内私有用户画像） */
  buyerHandle: string;
  quantity: number;
  totalCents: number;
  currency: string;
  status: OrderStatus;
  /** 关联支付意图 ID（paying/paid 后） */
  paymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
  /** append-only 状态历史 */
  history: { fromStatus: OrderStatus | null; toStatus: OrderStatus; reason: string; occurredAt: string }[];
}

export type PaymentIntentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface PaymentIntent {
  paymentIntentId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  status: PaymentIntentStatus;
  /** 提供商返回的交易号（真实 provider 为 Stripe PI id 等；合成 provider 为 ct_ 前缀） */
  providerTransactionId?: string;
  /** 使用的支付提供商标识（如 'dev-synthetic' / 'stripe'） */
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRecord {
  refundId: string;
  paymentIntentId: string;
  orderId: string;
  amountCents: number;
  reason: string;
  refundedAt: string;
}

/**
 * 支付提供商 Port —— 真实商（Stripe/支付宝）由 Walker 提供凭据后实现并接入；
 * 开发期用 DevSyntheticPaymentProvider（记录意图、合成成功，不真实收费）。
 */
export interface PaymentProviderPort {
  readonly providerId: string;
  /** 发起支付意图（不真实扣款；返回 providerTransactionId 供对账） */
  createIntent(input: { orderId: string; amountCents: number; currency: string }): Promise<{
    ok: boolean;
    paymentIntentId?: string;
    providerTransactionId?: string;
    code?: 'northstar-disabled' | 'provider-error' | 'invalid-input';
    message?: string;
  }>;
  /** 退款（真实商调用提供商退款 API） */
  refund(input: { paymentIntentId: string; amountCents: number; reason: string }): Promise<{
    ok: boolean;
    refundId?: string;
    code?: 'not-found' | 'provider-error';
    message?: string;
  }>;
}

export interface NorthStarOrderRepositoryPort {
  saveOrder(order: Order): Promise<void>;
  findOrder(orderId: string): Promise<Order | null>;
  savePaymentIntent(intent: PaymentIntent): Promise<void>;
  findPaymentIntent(paymentIntentId: string): Promise<PaymentIntent | null>;
  saveRefund(refund: RefundRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// P5 赞赏/支持配置（个人收款码模型）
//
// 个人微信/支付宝赞赏码 QR + 可选外链（爱发电/Ko-fi）+ 文案。
// 与 NorthStar 订单/支付（需商户资质）不同：赞赏是个人收款码，无需商户号、无需营业执照、
// 免费，访客扫码付。这是"个人空间"在"无商户、不国内营业、免费"约束下的正确经营形态。
// 真实经营性收款（offer→order→pay via SDK）保留为未来路径，需商户资质。
// ---------------------------------------------------------------------------

export interface SupportConfig {
  /** 微信赞赏码 QR 图片公开 URL（Walker 在 /admin/appearance 上传后填入） */
  wechatQrUrl?: string;
  /** 支付宝收款码 QR 图片公开 URL */
  alipayQrUrl?: string;
  /** 可选外链（爱发电/Ko-fi/Buy Me a Coffee） */
  externalUrl?: string;
  externalLabel?: string;
  /** 展示文案（为什么支持 / 支持后做什么） */
  blurb?: string;
  updatedAt: string;
}

export interface SupportConfigRepositoryPort {
  get(): Promise<SupportConfig | null>;
  save(config: SupportConfig): Promise<void>;
}
