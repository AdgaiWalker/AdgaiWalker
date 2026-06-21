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
