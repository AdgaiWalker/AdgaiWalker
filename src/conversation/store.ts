import { getRedis } from '@/stores/redis-client';

// match 域 store 已拆分到独立文件；此处导入供 getNeedCaseStats 等聚合函数内部使用。
import { getRecentNeedCases } from '@/stores/need-case.store';
import { getMatchFeedbackEvents } from '@/stores/feedback.store';

// 重新导出 ports 中的数据类型，保持上层引用稳定。
export type {
  AdminReviewStatus,
  AgentRecommendation,
  AuthState,
  FeedbackStatus,
  Incident,
  MatchFeedbackType,
  NeedCase,
  ProfileSnapshot,
  SafetyFlags,
  TopicCandidate,
  UserProfile,
} from '@/stores/ports';

// 重新导出 redis-client，保持上层引用稳定。
export { getRedis, __setCachedRedisForTesting } from '@/stores/redis-client';

// ===========================================================================
// match 域 store re-exports（Phase 2 已迁出）
// ===========================================================================

export type { MatchSession } from '@/stores/match-session.store';
export {
  createSessionId,
  upsertMatchSession,
  getMatchSession,
  endMatchSession,
  saveConversationMessages,
  getConversationMessages,
  getMultipleConversations,
  incrementMatchStats,
} from '@/stores/match-session.store';
export {
  saveNeedCase,
  getNeedCaseById,
  getNeedCasesBySession,
  getNeedCasesByUsername,
  redactNeedCasesByUsername,
  getPendingReviewNeedCases,
  getUnprocessedNeedCases,
  getRecentNeedCases,
  updateNeedCaseFeedback,
  updateNeedCaseAdminReview,
  attachTopicCandidateToNeedCase,
  markNeedCasesTopicProcessed,
} from '@/stores/need-case.store';
export {
  saveMatchFeedback,
  getMatchFeedbackEvents,
  getMatchFeedbackByNeedCase,
} from '@/stores/feedback.store';
export {
  saveUserProfile,
  getUserProfileByUsername,
  deleteUserProfileByUsername,
  getAllUserProfiles,
  markUserProfileDeleteRequested,
} from '@/stores/user-profile.store';

// ===========================================================================
// Phase 3 域 store re-exports（admin / content / northstar / match-derivative）
// ===========================================================================

// 安全事件（admin 域）
export {
  saveIncident,
  getUnresolvedIncidents,
} from '@/stores/incident.store';

// 搜索无结果记录（内容缺口信号）
export type { SearchMiss } from '@/stores/search.store';
export { getSearchMisses } from '@/stores/search.store';

// 经验事件（U10 经验验证系统）
export {
  saveExperienceEvent,
  findRecentExperienceEvents,
  findExperienceEventById,
  markExperiencePattern,
  updateExperienceEvent,
} from '@/stores/experience-event.store';

// 规则候选（U9 规则候选池）
export {
  saveRuleCandidate,
  findRecentRuleCandidates,
  updateRuleStatus,
} from '@/stores/rule-candidate.store';

// Skill 候选（U11 Skill 准入）
export {
  saveSkillCandidate,
  __resetMemorySkillCandidates,
  findRecentSkillCandidates,
  findSkillCandidatesByAdmission,
  updateSkillAdmission,
  getSkillCandidateById,
  updateSkillRegistration,
  setSkillPaused,
  rollbackSkillAdmission,
} from '@/stores/skill-candidate.store';

// Topic 候选
export {
  getTopicCandidates,
  getTopicCandidateById,
  getTopicCandidateByClusterKey,
  updateTopicCandidateStatus,
  saveTopicCandidates,
} from '@/stores/topic.store';

// WorkItem（admin 域，后台决策聚合根）
export {
  WORKITEM_REDIS_KEYS,
  __resetMemoryWorkItems,
  __deleteMemoryWorkItemsByPrefix,
  __deleteMemoryWorkItemsByTitlePrefix,
  saveWorkItem,
  getWorkItemById,
  listWorkItems,
  listActiveWorkItems,
  deleteWorkItem,
} from '@/stores/work-item.store';

// ContentFeedback（内容阅读反馈）
export {
  CONTENT_FEEDBACK_REDIS_KEYS,
  __resetMemoryContentFeedback,
  __deleteMemoryContentFeedbackByPrefix,
  saveContentFeedback,
  findContentFeedbackByContent,
  findContentFeedbackByTopic,
  findRecentContentFeedback,
} from '@/stores/content-feedback.store';

// ContentTelemetry（内容阅读深度遥测）
export {
  CONTENT_TELEMETRY_REDIS_KEYS,
  __resetMemoryContentTelemetry,
  saveContentTelemetry,
  findContentTelemetryByContent,
  findRecentContentTelemetry,
} from '@/stores/content-telemetry.store';

// ObjectGrant + ActionAudit（P4 对象级授权 + 操作审计）
export {
  __resetMemoryObjectGrants,
  saveObjectGrant,
  findAllObjectGrants,
  findObjectGrantsByGrantee,
  revokeObjectGrant,
} from '@/stores/object-grant.store';
export {
  __resetMemoryActionAudit,
  saveActionAudit,
  findRecentActionAudit,
} from '@/stores/action-audit.store';

// NorthStar 订单 / 支付 / 退款 / Offer（P5）
export {
  __resetMemoryNorthStar,
  saveNorthStarOffer,
  findNorthStarOffer,
  findAllNorthStarOffers,
  findRecentNorthStarOrders,
  saveNorthStarOrder,
  findNorthStarOrder,
  saveNorthStarPaymentIntent,
  findNorthStarPaymentIntent,
  saveNorthStarRefund,
} from '@/stores/northstar.store';

// SupportConfig（赞赏/支持配置）
export {
  getSupportConfig,
  saveSupportConfig,
  __resetMemorySupportConfig,
} from '@/stores/support-config.store';

// AssetEvidenceLink（资产晋升证据链）
export {
  __resetMemoryAssetLinks,
  saveAssetEvidenceLink,
  findAssetEvidenceLinks,
  findRecentAssetEvidenceLinks,
} from '@/stores/asset-evidence-link.store';

// LearningRequest（证据不足补证任务）
export {
  __resetMemoryLearningRequests,
  saveLearningRequest,
  getLearningRequestById,
  findLearningRequestsByStatus,
  findRecentLearningRequests,
} from '@/stores/learning-request.store';

// ===========================================================================
// 本地保留：跨域统计聚合（读取 match 域 need-case + feedback，不适合归属单一域）
// ===========================================================================

export interface PublicStats {
  matchCount: number;
  contentCount: number;
  topCategories: Array<{ id: string; label: string; count: number }>;
}

export interface NeedCaseStats {
  totalCases: number;
  totalSessions: number;
  byCategory: Record<string, number>;
  byFrictionLayer: Record<string, number>;
  byAbilityType: Record<string, number>;
  byFeedbackType: Record<string, number>;
  byReviewStatus: Record<string, number>;
  complianceRedirectRate: number;
  codeAgentMisuseRate: number;
  topNeeds: Array<{ summary: string; count: number }>;
  dailyTrend: Array<{ date: string; count: number }>;
}

/** Need Case 统计聚合（取代旧 getDemandStats） */
export async function getNeedCaseStats(options?: { days?: number }): Promise<NeedCaseStats> {
  const days = options?.days ?? 30;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const redis = getRedis();

  const cases = await getRecentNeedCases(2000);
  const recent = cases.filter(c => c.createdAt >= cutoff);

  const byCategory: Record<string, number> = {};
  const byFrictionLayer: Record<string, number> = {};
  const byAbilityType: Record<string, number> = {};
  const byFeedbackType: Record<string, number> = {};
  const byReviewStatus: Record<string, number> = {};
  let complianceRedirectCount = 0;
  let codeAgentMisuseCount = 0;
  const needCounts = new Map<string, number>();
  const dailyCounts = new Map<string, number>();

  for (const c of recent) {
    for (const cat of c.needCategories) {
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
    if (c.frictionLayer) {
      byFrictionLayer[c.frictionLayer] = (byFrictionLayer[c.frictionLayer] ?? 0) + 1;
    }
    if (c.recommendedAbilityType) {
      byAbilityType[c.recommendedAbilityType] = (byAbilityType[c.recommendedAbilityType] ?? 0) + 1;
    }
    if (c.feedbackStatus && c.feedbackStatus !== 'none') {
      byFeedbackType[c.feedbackStatus] = (byFeedbackType[c.feedbackStatus] ?? 0) + 1;
    }
    byReviewStatus[c.adminReviewStatus] = (byReviewStatus[c.adminReviewStatus] ?? 0) + 1;
    if (c.safetyFlags.complianceRedirected) complianceRedirectCount++;
    if (c.safetyFlags.codeAgentMisuseLikely) codeAgentMisuseCount++;
    const summary = c.needSummary || '未分类需求';
    needCounts.set(summary, (needCounts.get(summary) ?? 0) + 1);
    const day = c.createdAt.slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }

  const feedbackEvents = await getMatchFeedbackEvents({ days });
  for (const event of feedbackEvents) {
    byFeedbackType[event.feedbackType] = (byFeedbackType[event.feedbackType] ?? 0) + 1;
  }

  const topNeeds = [...needCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([summary, count]) => ({ summary, count }));

  const dailyTrend = [...dailyCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  let totalSessions: number;
  if (redis) {
    const sessionIds = await redis.smembers('match:sessions');
    totalSessions = sessionIds.length;
  } else {
    totalSessions = 0;
  }

  return {
    totalCases: recent.length,
    totalSessions,
    byCategory,
    byFrictionLayer,
    byAbilityType,
    byFeedbackType,
    byReviewStatus,
    complianceRedirectRate: recent.length > 0 ? complianceRedirectCount / recent.length : 0,
    codeAgentMisuseRate: recent.length > 0 ? codeAgentMisuseCount / recent.length : 0,
    topNeeds,
    dailyTrend,
  };
}
