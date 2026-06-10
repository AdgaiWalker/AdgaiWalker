/**
 * Port 接口定义 — 四层架构的数据层抽象
 *
 * 所有上层模块（services / API routes / Agent）只依赖这些接口，
 * 不依赖具体的 Redis / 文件 / KV 实现。
 */

import type { AbilityType, AiStage, AudienceGroup, FrictionLayer, NeedCategory } from '@/profiles/resource-index';

// ---------------------------------------------------------------------------
// 需求事件
// ---------------------------------------------------------------------------

export interface DemandEvent {
  eventId: string;
  sessionId: string;
  createdAt: string;
  rawNeedRedacted: string;
  needSummary: string;
  needCategories: NeedCategory[];
  frictionLayer?: FrictionLayer;
  recommendedAbilityType?: AbilityType;
  toolDirection?: string;
  complianceRedirected?: boolean;
  codeAgentMisuseLikely?: boolean;
  audienceGroup?: AudienceGroup;
  aiStage?: AiStage;
  isMinorContext: boolean;
  recommendedContentIds: string[];
  piiDetected: boolean;
  piiRemoved: boolean;
  status: 'pending' | 'processed' | 'ignored';
}

export interface DemandEventRepositoryPort {
  save(event: DemandEvent): Promise<void>;
  findPending(limit?: number): Promise<DemandEvent[]>;
  markProcessed(eventIds: string[]): Promise<void>;
  findRecent(days: number): Promise<DemandEvent[]>;
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

export interface MatchSessionRepositoryPort {
  upsert(session: MatchSession): Promise<void>;
  get(sessionId: string): Promise<MatchSession | null>;
  end(sessionId: string, endedAt?: string): Promise<MatchSession | null>;
  count(): Promise<number>;
}

// ---------------------------------------------------------------------------
// 反馈
// ---------------------------------------------------------------------------

export type MatchFeedbackType =
  | 'resolved' | 'stuck' | 'not-fit' | 'want-tutorial'
  | 'first-draft' | 'next-step-clear' | 'wrong-direction' | 'need-tutorial';

export interface MatchFeedbackEvent {
  feedbackId: string;
  sessionId: string;
  eventId?: string;
  createdAt: string;
  feedbackType: MatchFeedbackType;
  feedbackText?: string;
}

export interface FeedbackRepositoryPort {
  save(event: MatchFeedbackEvent): Promise<void>;
  findRecent(days: number, limit?: number): Promise<MatchFeedbackEvent[]>;
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
  incrementUsage(code: string): Promise<void>;
  listAll(): Promise<InviteCode[]>;
}

// ---------------------------------------------------------------------------
// 用户画像（轻量版）
// ---------------------------------------------------------------------------

export interface UserProfile {
  profileId: string;
  sessionId: string;
  role?: string;
  goal?: string;
  stuckPoint?: string;
  helpPreference?: string;
  currentQuestion?: string;
  nickname?: string;
  contact?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileRepositoryPort {
  save(profile: UserProfile): Promise<void>;
  findBySessionId(sessionId: string): Promise<UserProfile | null>;
  findAll(): Promise<UserProfile[]>;
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

export interface TopicCandidate {
  topicId: string;
  createdAt: string;
  title: string;
  audience: string;
  coreQuestion: string;
  contentAngle: string;
  sourceNeedCount: number;
  relatedContentIds: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'deferred' | 'ignored';
}

export interface TopicRepositoryPort {
  saveAll(candidates: TopicCandidate[]): Promise<void>;
  find(options?: { status?: TopicCandidate['status']; limit?: number }): Promise<TopicCandidate[]>;
  updateStatus(topicId: string, status: TopicCandidate['status']): Promise<boolean>;
}
