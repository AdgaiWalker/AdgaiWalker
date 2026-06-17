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

export type AccountRole = 'user' | 'admin';
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
  updatePasswordHash(username: string, passwordHash: string): Promise<void>;
  updateLastLogin(username: string, at: string): Promise<void>;
  listAll(): Promise<UserAccount[]>;
  /** 是否存在任意账号（owner bootstrap 判定用） */
  exists(): Promise<boolean>;
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
