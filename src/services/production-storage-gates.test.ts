import { describe, expect, it, vi } from 'vitest';

import { ContentFeedbackService } from './content-feedback.service';
import { WorkbenchService } from './workbench.service';
import type { ContentFeedbackEvent, ContentFeedbackRepositoryPort, EvidenceRef, WorkItem, WorkItemRepositoryPort, WorkItemStatus } from '@/stores/ports';

vi.mock('@/knowledge/content', () => ({
  getPublishedContentItems: vi.fn(async () => [{
    id: 'real-slug',
    title: '真实文章',
    href: '/posts/real-slug',
    date: new Date('2026-06-01'),
    tags: [],
    type: 'knowledge',
    form: 'article',
    domain: 'learning',
    intent: 'share',
    valueMode: 'free',
    isExternal: false,
    aiUseLevel: 'AI-1',
    related: [],
    sourceTopicId: 'topic-real',
  }]),
}));

function makeEvidence(over: Partial<EvidenceRef> = {}): EvidenceRef {
  return {
    evidenceId: `ev_${Math.random().toString(36).slice(2, 8)}`,
    sourceType: 'need-case',
    sourceId: 'nc_prod_test',
    occurredAt: '2026-06-20T00:00:00.000Z',
    collectedAt: '2026-06-20T00:00:00.000Z',
    environment: 'production',
    visibility: 'owner',
    freshness: 'fresh',
    qualityStatus: 'verified-source',
    summary: '生产等价验证用可信证据',
    ...over,
  };
}

class DurableWorkItemStore implements WorkItemRepositoryPort {
  constructor(private readonly values: Map<string, WorkItem>) {}

  async save(workItem: WorkItem): Promise<void> {
    this.values.set(workItem.workItemId, JSON.parse(JSON.stringify(workItem)) as WorkItem);
  }

  async findById(workItemId: string): Promise<WorkItem | null> {
    const item = this.values.get(workItemId);
    return item ? JSON.parse(JSON.stringify(item)) as WorkItem : null;
  }

  async list(options?: { status?: WorkItemStatus | WorkItemStatus[]; limit?: number }): Promise<WorkItem[]> {
    const statuses = Array.isArray(options?.status) ? options.status : options?.status ? [options.status] : null;
    return [...this.values.values()]
      .filter(item => !statuses || statuses.includes(item.status))
      .slice(0, options?.limit ?? 500)
      .map(item => JSON.parse(JSON.stringify(item)) as WorkItem);
  }

  async listActive(options?: { limit?: number }): Promise<WorkItem[]> {
    return [...this.values.values()]
      .filter(item => item.status !== 'resolved' && item.status !== 'rejected')
      .slice(0, options?.limit ?? 500)
      .map(item => JSON.parse(JSON.stringify(item)) as WorkItem);
  }

  async delete(workItemId: string): Promise<void> {
    this.values.delete(workItemId);
  }
}

class DurableContentFeedbackStore implements ContentFeedbackRepositoryPort {
  constructor(private readonly values: Map<string, ContentFeedbackEvent>) {}

  async save(event: ContentFeedbackEvent): Promise<void> {
    this.values.set(event.feedbackId, { ...event });
  }

  async findByContent(contentId: string): Promise<ContentFeedbackEvent[]> {
    return [...this.values.values()].filter(event => event.contentId === contentId);
  }

  async findByTopic(topicId: string): Promise<ContentFeedbackEvent[]> {
    return [...this.values.values()].filter(event => event.sourceTopicId === topicId);
  }

  async findRecent(_range?: { from?: string; to?: string }, limit = 500): Promise<ContentFeedbackEvent[]> {
    return [...this.values.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

describe('S0 生产存储门闩与持久语义', () => {
  it('S0-03：生产缺持久化存储时 WorkItem 与 ContentFeedback 写入均拒绝', async () => {
    const workbench = new WorkbenchService({ storageMode: 'unavailable' });
    const proposal = await workbench.createProposal({
      queue: 'user-demand',
      title: '生产缺 Redis',
      summary: '不能写入工作项',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      actor: 'ai',
    });
    expect(proposal.ok).toBe(false);
    expect(proposal.code).toBe('storage-unavailable');

    const feedback = new ContentFeedbackService({ storageMode: 'unavailable' });
    const submitted = await feedback.submit({ contentId: 'real-slug', signal: 'useful', consentForAnalysis: true });
    expect(submitted.ok).toBe(false);
    expect(submitted.code).toBe('storage-unavailable');
  });

  it('S0-04：持久仓储语义下 Decision / Action / Outcome / ContentFeedback 可跨服务实例读回', async () => {
    const workItems = new Map<string, WorkItem>();
    const feedbackEvents = new Map<string, ContentFeedbackEvent>();
    const firstWorkbench = new WorkbenchService({ repository: new DurableWorkItemStore(workItems), storageMode: 'redis' });
    const created = await firstWorkbench.createProposal({
      queue: 'user-demand',
      title: '真实闭环',
      summary: '验证完整链路持久语义',
      priorityBand: 'now',
      evidenceRefs: [makeEvidence()],
      requestDecision: true,
      actor: 'ai',
    });
    expect(created.ok).toBe(true);
    const id = created.data!.workItemId;

    const decided = await firstWorkbench.decide(id, { outcome: 'accepted', reason: '证据充分', actor: 'walker' });
    expect(decided.ok).toBe(true);
    const acted = await firstWorkbench.createAction(id, {
      actionType: 'create-content',
      targetType: 'content',
      expectedOutcome: '发布内容并验证是否解决问题',
      actor: 'walker',
    });
    expect(acted.ok).toBe(true);
    const actionId = acted.data!.actions[0].actionId;
    const completed = await firstWorkbench.updateAction(id, actionId, { status: 'completed', actor: 'walker' });
    expect(completed.ok).toBe(true);
    const outcome = await firstWorkbench.recordOutcome(id, {
      actionId,
      result: 'successful',
      summary: '内容发布后解决了来源问题',
      evidenceRefs: [makeEvidence({ sourceId: 'cf_real' })],
      actor: 'walker',
    });
    expect(outcome.ok).toBe(true);

    const firstFeedback = new ContentFeedbackService({ store: new DurableContentFeedbackStore(feedbackEvents), storageMode: 'redis' });
    const submitted = await firstFeedback.submit({ contentId: 'real-slug', signal: 'needs-more', note: '还需要一个步骤', consentForAnalysis: true });
    expect(submitted.ok).toBe(true);

    const nextWorkbench = new WorkbenchService({ repository: new DurableWorkItemStore(workItems), storageMode: 'redis' });
    const nextFeedback = new ContentFeedbackService({ store: new DurableContentFeedbackStore(feedbackEvents), storageMode: 'redis' });
    const restored = await nextWorkbench.findById(id);
    expect(restored?.decision.outcome).toBe('accepted');
    expect(restored?.actions[0].status).toBe('completed');
    expect(restored?.outcomes[0].result).toBe('successful');
    expect(restored?.history.some(entry => entry.kind === 'decision-updated')).toBe(true);
    expect(restored?.history.some(entry => entry.kind === 'outcome-recorded')).toBe(true);

    const restoredFeedback = await nextFeedback.findByContent('real-slug');
    expect(restoredFeedback).toHaveLength(1);
    expect(restoredFeedback[0].signal).toBe('needs-more');
    expect(restoredFeedback[0].sourceTopicId).toBe('topic-real');
  });
});

