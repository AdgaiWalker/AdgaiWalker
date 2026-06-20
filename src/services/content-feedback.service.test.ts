import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetMemoryContentFeedback } from '@/conversation/store';
import { createContentFeedbackService } from './content-feedback.service';

// Mock getPublishedContentItems —— astro:content 在测试环境无法真实读取
vi.mock('@/knowledge/content', () => ({
  getPublishedContentItems: vi.fn(),
}));

import { getPublishedContentItems } from '@/knowledge/content';
import type { ContentItem } from '@/knowledge/content-model';

function makeContent(over: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'real-slug',
    title: '真实文章',
    href: '/posts/real-slug',
    date: new Date('2026-06-01'),
    tags: [],
    type: 'knowledge' as ContentItem['type'],
    form: 'article',
    domain: 'learning' as ContentItem['domain'],
    intent: 'share' as ContentItem['intent'],
    valueMode: 'free' as ContentItem['valueMode'],
    isExternal: false,
    aiUseLevel: 'AI-1',
    related: [],
    ...over,
  };
}

describe('ContentFeedbackService（P1-A03）', () => {
  beforeEach(() => {
    __resetMemoryContentFeedback();
    vi.mocked(getPublishedContentItems).mockReset();
  });
  afterEach(() => __resetMemoryContentFeedback());

  it('三种 signal 都能成功提交', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentFeedbackService();
    for (const signal of ['useful', 'needs-more', 'outdated'] as const) {
      const result = await svc.submit({ contentId: 'real-slug', signal, consentForAnalysis: true });
      expect(result.ok).toBe(true);
      expect(result.feedbackId).toBeTruthy();
    }
  });

  it('内容不存在返回 content-not-found', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([]);
    const svc = createContentFeedbackService();
    const result = await svc.submit({ contentId: 'missing', signal: 'useful', consentForAnalysis: true });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('content-not-found');
  });

  it('sourceTopicId 由服务端从内容元数据派生，客户端伪造被忽略', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent({ sourceTopicId: 'topic-123' })]);
    const svc = createContentFeedbackService();
    // 客户端无法传 sourceTopicId（接口不接受）；这里只验证派生值
    const result = await svc.submit({ contentId: 'real-slug', signal: 'useful', consentForAnalysis: true });
    expect(result.ok).toBe(true);
    expect(result.sourceTopicId).toBe('topic-123');
  });

  it('note 超长被截断（compactText）', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentFeedbackService();
    const longNote = '这是一段很长的反馈'.repeat(50);
    const result = await svc.submit({ contentId: 'real-slug', signal: 'needs-more', note: longNote, consentForAnalysis: true });
    expect(result.ok).toBe(true);
    const saved = await svc.findByContent('real-slug');
    expect(saved).toHaveLength(1);
    expect(saved[0].note?.endsWith('...')).toBe(true);
    expect((saved[0].note?.length ?? 0)).toBeLessThanOrEqual(243); // 240 + "..."
  });

  it('note 含 PII 被脱敏后保存', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentFeedbackService();
    const result = await svc.submit({
      contentId: 'real-slug',
      signal: 'needs-more',
      note: '我的邮箱是 test@example.com 请联系我',
      consentForAnalysis: true,
    });
    expect(result.ok).toBe(true);
    const saved = await svc.findByContent('real-slug');
    expect(saved[0].note).toContain('[邮箱已隐藏]');
    expect(saved[0].note).not.toContain('test@example.com');
  });

  it('空 note 允许提交', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentFeedbackService();
    const result = await svc.submit({ contentId: 'real-slug', signal: 'useful', consentForAnalysis: false });
    expect(result.ok).toBe(true);
    const saved = await svc.findByContent('real-slug');
    expect(saved[0].note).toBeUndefined();
  });

  it('按内容和按选题查询都能工作', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent({ sourceTopicId: 'topic-A' })]);
    const svc = createContentFeedbackService();
    await svc.submit({ contentId: 'real-slug', signal: 'useful', consentForAnalysis: true });
    const byContent = await svc.findByContent('real-slug');
    expect(byContent).toHaveLength(1);
    const byTopic = await svc.findByTopic('topic-A');
    expect(byTopic).toHaveLength(1);
    const byWrongTopic = await svc.findByTopic('topic-B');
    expect(byWrongTopic).toHaveLength(0);
  });

  it('invalid-input：非法 signal', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentFeedbackService();
    const result = await svc.submit({ contentId: 'real-slug', signal: 'love' as never, consentForAnalysis: true });
    expect(result.code).toBe('invalid-input');
  });
});
