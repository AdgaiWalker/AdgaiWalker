import { describe, expect, it } from 'vitest';

import { buildContentOutcomeSummaries, calculateContentHitRates } from '@/services/hit-rate.service';
import type { ContentFeedbackEvent, ContentTelemetryEvent, NeedCase, TopicCandidate } from '@/stores/ports';

function createTopic(overrides: Partial<TopicCandidate> = {}): TopicCandidate {
  return {
    topicId: 'topic-hit-rate',
    clusterKey: 'scenario-match:learning-path:learn-ai:学生',
    createdAt: new Date().toISOString(),
    title: 'AI 入门学习：新手第一步到底该做什么',
    density: 2,
    roleDistribution: [{ role: '学生', count: 2 }],
    representativeNeed: '用户不知道学习 AI 的第一步该做什么',
    relatedContentIds: ['ai-first-step'],
    priority: 'medium',
    status: 'produced',
    source: 'need-cluster',
    producedContentSlug: 'ai-first-step',
    ...overrides,
  };
}

function createNeedCase(overrides: Partial<NeedCase>): NeedCase {
  const now = new Date().toISOString();
  return {
    needCaseId: overrides.needCaseId ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    sourcePage: '/tools',
    rawNeedRedacted: '我想学 AI',
    needSummary: '我想学 AI',
    needCategories: ['learn-ai'],
    recommendedContentIds: ['ai-first-step'],
    recommendedToolIds: [],
    agentRecommendation: {
      responseMode: 'recommendation',
      bridge: '先从一个小任务开始。',
      fallbackUsed: false,
      resourceIds: [],
      recommendedTools: [],
    },
    feedbackStatus: 'none',
    adminReviewStatus: 'pending',
    safetyFlags: {
      piiDetected: false,
      piiRemoved: false,
      isMinorContext: false,
      complianceRedirected: false,
      consentForTopic: true,
    },
    ...overrides,
  };
}

describe('calculateContentHitRates', () => {
  it('aggregates resolved and stuck feedback by published content', () => {
    const [row] = calculateContentHitRates({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step' }],
      topics: [createTopic()],
      needCases: [
        createNeedCase({ needCaseId: 'need-1', topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' }),
        createNeedCase({ needCaseId: 'need-2', topicCandidateId: 'topic-hit-rate', feedbackStatus: 'stuck' }),
        createNeedCase({ needCaseId: 'need-3', topicCandidateId: 'topic-hit-rate', feedbackStatus: 'none' }),
      ],
    });

    expect(row.contentId).toBe('ai-first-step');
    expect(row.resolved).toBe(1);
    expect(row.stuck).toBe(1);
    expect(row.feedbackGiven).toBe(2);
    expect(row.totalCases).toBe(3);
    expect(row.rate).toBe(50);
  });

  it('ignores topic content ids that are not published content', () => {
    const rows = calculateContentHitRates({
      contents: [{ id: 'published-only', title: '已发布', href: '/posts/published-only' }],
      topics: [createTopic({ relatedContentIds: ['draft-only'], producedContentSlug: undefined })],
      needCases: [createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' })],
    });

    expect(rows).toEqual([]);
  });

  it('links published content back to a topic through sourceTopicId', () => {
    const [row] = calculateContentHitRates({
      contents: [{
        id: 'published-by-frontmatter',
        title: '已发布',
        href: '/posts/published-by-frontmatter',
        sourceTopicId: 'topic-hit-rate',
      }],
      topics: [createTopic({ relatedContentIds: [], producedContentSlug: undefined })],
      needCases: [createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' })],
    });

    expect(row.contentId).toBe('published-by-frontmatter');
    expect(row.topicIds).toEqual(['topic-hit-rate']);
    expect(row.resolved).toBe(1);
    expect(row.rate).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// P1-C01：双信号结果分组（matchOutcome / contentOutcome）
// ---------------------------------------------------------------------------

function makeFeedback(over: Partial<ContentFeedbackEvent>): ContentFeedbackEvent {
  return {
    feedbackId: over.feedbackId ?? crypto.randomUUID(),
    contentId: over.contentId ?? 'ai-first-step',
    contentPath: over.contentPath ?? '/posts/ai-first-step',
    sourceTopicId: over.sourceTopicId,
    signal: over.signal ?? 'useful',
    note: over.note,
    createdAt: over.createdAt ?? '2026-06-20T00:00:00.000Z',
    environment: 'development',
    consentForAnalysis: true,
  };
}

function makeTelemetry(over: Partial<ContentTelemetryEvent>): ContentTelemetryEvent {
  return {
    eventId: over.eventId ?? crypto.randomUUID(),
    contentId: over.contentId ?? 'ai-first-step',
    contentPath: over.contentPath ?? '/posts/ai-first-step',
    sourceTopicId: over.sourceTopicId,
    eventType: over.eventType ?? 'content_progress',
    progress: over.progress ?? 0.5,
    readerToken: over.readerToken ?? crypto.randomUUID(),
    createdAt: over.createdAt ?? '2026-06-20T00:00:00.000Z',
    environment: 'development',
    consentForAnalysis: true,
    schemaVersion: 1,
  };
}

describe('buildContentOutcomeSummaries（P1-C01 双信号分组）', () => {
  it('只有匹配反馈时，matchOutcome 有值、contentOutcome 为空且 usefulRate 为 null', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step' }],
      topics: [createTopic()],
      needCases: [createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' })],
      contentFeedbackByContent: new Map(),
    });
    expect(summary.matchOutcome.responded).toBe(1);
    expect(summary.matchOutcome.rate).toBe(100);
    expect(summary.contentOutcome.totalFeedback).toBe(0);
    expect(summary.contentOutcome.usefulRate).toBeNull();
  });

  it('只有内容反馈时，contentOutcome 有值、matchOutcome 无反馈且 rate 为 null', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step', sourceTopicId: 'topic-hit-rate' }],
      topics: [createTopic()],
      needCases: [],
      contentFeedbackByContent: new Map([
        ['ai-first-step', [
          makeFeedback({ signal: 'useful' }),
          makeFeedback({ signal: 'needs-more' }),
          makeFeedback({ signal: 'outdated' }),
        ]],
      ]),
    });
    expect(summary.contentOutcome.totalFeedback).toBe(3);
    expect(summary.contentOutcome.useful).toBe(1);
    expect(summary.contentOutcome.usefulRate).toBe(33);
    expect(summary.matchOutcome.responded).toBe(0);
    expect(summary.matchOutcome.rate).toBeNull();
  });

  it('两者都有时并列显示，不合并成一个总分', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step', sourceTopicId: 'topic-hit-rate' }],
      topics: [createTopic()],
      needCases: [
        createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' }),
        createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'stuck' }),
      ],
      contentFeedbackByContent: new Map([
        ['ai-first-step', [makeFeedback({ signal: 'useful' }), makeFeedback({ signal: 'needs-more' })]],
      ]),
    });
    expect(summary.matchOutcome.rate).toBe(50);
    expect(summary.contentOutcome.usefulRate).toBe(50);
    // 两组独立，不合成
    expect(summary.matchOutcome.responded).toBe(2);
    expect(summary.contentOutcome.totalFeedback).toBe(2);
  });

  it('两者都没有时 rate/usefulRate 均为 null，不返回 0% 失败', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step', sourceTopicId: 'topic-hit-rate' }],
      topics: [createTopic()],
      needCases: [createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'none' })],
      contentFeedbackByContent: new Map(),
    });
    expect(summary.matchOutcome.rate).toBeNull();
    expect(summary.contentOutcome.usefulRate).toBeNull();
  });

  it('内容无 sourceTopicId 时标记"内容未关联来源选题"', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'orphan', title: '无关联', href: '/posts/orphan' }],
      topics: [createTopic()],
      needCases: [],
      contentFeedbackByContent: new Map(),
    });
    expect(summary.hasSourceTopic).toBe(false);
    expect(summary.sourceTopicIds).toEqual([]);
  });

  it('一个 Topic 对应多篇内容时，每篇内容各自聚合', () => {
    const summaries = buildContentOutcomeSummaries({
      contents: [
        { id: 'post-a', title: 'A', href: '/posts/post-a', sourceTopicId: 'topic-hit-rate' },
        { id: 'post-b', title: 'B', href: '/posts/post-b', sourceTopicId: 'topic-hit-rate' },
      ],
      topics: [createTopic()],
      needCases: [
        createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' }),
        createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'stuck' }),
      ],
      contentFeedbackByContent: new Map([
        ['post-a', [makeFeedback({ contentId: 'post-a', signal: 'useful' })]],
        ['post-b', [makeFeedback({ contentId: 'post-b', signal: 'outdated' })]],
      ]),
    });
    const a = summaries.find(s => s.contentId === 'post-a')!;
    const b = summaries.find(s => s.contentId === 'post-b')!;
    // 两篇内容共享同一 topic 的 NeedCase，所以 matchOutcome 相同
    expect(a.matchOutcome.totalCases).toBe(b.matchOutcome.totalCases);
    // 但 contentOutcome 各自独立
    expect(a.contentOutcome.useful).toBe(1);
    expect(b.contentOutcome.outdated).toBe(1);
  });
});

describe('buildContentOutcomeSummaries readingOutcome（P3-A 第三并列信号）', () => {
  it('无遥测时 readingOutcome 各计数为 0、completionRate 为 null', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step' }],
      topics: [],
      needCases: [],
      contentFeedbackByContent: new Map(),
    });
    expect(summary.readingOutcome.uniqueReaders).toBe(0);
    expect(summary.readingOutcome.completionRate).toBeNull();
  });

  it('按 readerToken 去重 uniqueReaders，completed/withProgressSignal 分别统计', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step' }],
      topics: [],
      needCases: [],
      contentFeedbackByContent: new Map(),
      contentTelemetryByContent: new Map([
        ['ai-first-step', [
          // reader-1：有 progress + complete（完成）
          makeTelemetry({ readerToken: 'r1', eventType: 'content_progress', progress: 0.5 }),
          makeTelemetry({ readerToken: 'r1', eventType: 'content_complete', progress: 1 }),
          // reader-2：只有 progress（未完成）
          makeTelemetry({ readerToken: 'r2', eventType: 'content_progress', progress: 0.25 }),
          makeTelemetry({ readerToken: 'r2', eventType: 'content_progress', progress: 0.75 }),
          // reader-3：只有 complete（直接完成）
          makeTelemetry({ readerToken: 'r3', eventType: 'content_complete', progress: 1 }),
        ]],
      ]),
    });
    expect(summary.readingOutcome.uniqueReaders).toBe(3);
    expect(summary.readingOutcome.withProgressSignal).toBe(2); // r1, r2
    expect(summary.readingOutcome.completed).toBe(2); // r1, r3
    expect(summary.readingOutcome.completionRate).toBe(67); // 2/3
  });

  it('readingOutcome 与 matchOutcome/contentOutcome 不合并分母', () => {
    const [summary] = buildContentOutcomeSummaries({
      contents: [{ id: 'ai-first-step', title: 'AI 第一步', href: '/posts/ai-first-step', sourceTopicId: 'topic-hit-rate' }],
      topics: [createTopic()],
      needCases: [createNeedCase({ topicCandidateId: 'topic-hit-rate', feedbackStatus: 'resolved' })],
      contentFeedbackByContent: new Map([
        ['ai-first-step', [makeFeedback({ signal: 'useful' })]],
      ]),
      contentTelemetryByContent: new Map([
        ['ai-first-step', [
          makeTelemetry({ readerToken: 'r1', eventType: 'content_complete', progress: 1 }),
          makeTelemetry({ readerToken: 'r2', eventType: 'content_progress', progress: 0.5 }),
        ]],
      ]),
    });
    // 三组分母各自独立
    expect(summary.matchOutcome.responded).toBe(1);
    expect(summary.contentOutcome.totalFeedback).toBe(1);
    expect(summary.readingOutcome.uniqueReaders).toBe(2);
    expect(summary.readingOutcome.completionRate).toBe(50);
  });
});
