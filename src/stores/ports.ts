/**
 * Port 接口定义 — 四层架构的数据层抽象
 *
 * 所有上层模块（services / API routes / Agent）只依赖这些接口，
 * 不依赖具体的 Redis / 文件 / KV 实现。
 */

import type { AbilityType, AiStage, AudienceGroup, FrictionLayer, NeedCategory } from '@/profiles/resource-index';

// ---------------------------------------------------------------------------
// 认证状态与邀请会话
// ---------------------------------------------------------------------------

export type AuthState = 'public' | 'invited' | 'admin';

export interface InvitedSession {
  sessionId: string;
  inviteCodeHash: string;
  authState: AuthState;
  createdAt: string;
  expiresAt: string;
}

export interface InvitedSessionRepositoryPort {
  create(session: InvitedSession): Promise<void>;
  get(sessionId: string): Promise<InvitedSession | null>;
  isValid(sessionId: string): Promise<boolean>;
  revoke(sessionId: string): Promise<void>;
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
// 邀请码
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
// 用户画像
// ---------------------------------------------------------------------------

export interface UserProfile {
  profileId: string;
  sessionId: string;
  inviteCodeHash?: string;
  /** 自报身份锚点（≤10 字），邀请时填、用户可改。零 PII，写入前过 redactSensitiveText。 */
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
  findBySessionId(sessionId: string): Promise<UserProfile | null>;
  findAll(): Promise<UserProfile[]>;
  markDeleteRequested(sessionId: string, requestedAt: string): Promise<void>;
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
// 发布候选（U16 Publish Interface：个人系统 → 社区选择性发布）
// ---------------------------------------------------------------------------

export type PublishTargetSpace = 'idea' | 'question' | 'answer' | 'skill' | 'project' | 'tool' | 'case';

export interface PublishCandidate {
  publishId: string;
  createdAt: string;
  updatedAt: string;
  sourceId: string;
  sourceType: PublishTargetSpace;
  title: string;
  summary: string;
  visibility: 'public' | 'community' | 'private';
  intent: string;
  status: 'pending' | 'published' | 'rejected';
  targetSpace: PublishTargetSpace;
  aiUsePolicy: string;
  backlink?: string;
  feedbackRefId?: string;
}

export interface PublishCandidateRepositoryPort {
  save(candidate: PublishCandidate): Promise<void>;
  findPending(limit?: number): Promise<PublishCandidate[]>;
  findByStatus(status: 'pending' | 'published' | 'rejected'): Promise<PublishCandidate[]>;
  updateStatus(publishId: string, status: 'published' | 'rejected', backlink?: string): Promise<void>;
}
