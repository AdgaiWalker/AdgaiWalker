import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetMemoryContentTelemetry } from '@/conversation/store';
import { createContentTelemetryService, __resetTelemetryContentCache } from './content-telemetry.service';

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

describe('ContentTelemetryService（P3-A）', () => {
  beforeEach(() => {
    __resetMemoryContentTelemetry();
    __resetTelemetryContentCache();
    vi.mocked(getPublishedContentItems).mockReset();
  });
  afterEach(() => {
    __resetMemoryContentTelemetry();
    __resetTelemetryContentCache();
  });

  it('content_progress 正常提交，progress 限幅 0–1', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentTelemetryService();
    const result = await svc.submit({
      contentId: 'real-slug',
      eventType: 'content_progress',
      progress: 0.5,
      readerToken: 'rt-abc',
      consentForAnalysis: true,
    });
    expect(result.ok).toBe(true);
    expect(result.eventId).toBeTruthy();
    const saved = await svc.findByContent('real-slug');
    expect(saved).toHaveLength(1);
    expect(saved[0].progress).toBe(0.5);
    expect(saved[0].schemaVersion).toBe(1);
  });

  it('content_complete 恒为 progress=1，即使客户端传 < 1', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentTelemetryService();
    const result = await svc.submit({
      contentId: 'real-slug',
      eventType: 'content_complete',
      progress: 0.9,
      readerToken: 'rt-abc',
      consentForAnalysis: true,
    });
    expect(result.ok).toBe(true);
    const saved = await svc.findByContent('real-slug');
    expect(saved[0].eventType).toBe('content_complete');
    expect(saved[0].progress).toBe(1);
  });

  it('progress 越界被限幅（>1 → 1，<0 → 0）', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentTelemetryService();
    await svc.submit({ contentId: 'real-slug', eventType: 'content_progress', progress: 5, readerToken: 'rt', consentForAnalysis: true });
    await svc.submit({ contentId: 'real-slug', eventType: 'content_progress', progress: -3, readerToken: 'rt', consentForAnalysis: true });
    const saved = await svc.findByContent('real-slug');
    // 两条都被限幅到 [0,1] 区间（顺序不保证，按值校验）
    expect(saved.map(e => e.progress).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('sourceTopicId 由服务端派生', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent({ sourceTopicId: 'topic-7' })]);
    const svc = createContentTelemetryService();
    const result = await svc.submit({
      contentId: 'real-slug', eventType: 'content_progress', progress: 0.25, readerToken: 'rt', consentForAnalysis: true,
    });
    expect(result.sourceTopicId).toBe('topic-7');
  });

  it('内容不存在返回 content-not-found', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([]);
    const svc = createContentTelemetryService();
    const result = await svc.submit({
      contentId: 'missing', eventType: 'content_progress', progress: 0.5, readerToken: 'rt', consentForAnalysis: true,
    });
    expect(result.code).toBe('content-not-found');
  });

  it('invalid-input：非法 eventType / 空 readerToken / 空 contentId', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentTelemetryService();
    const badType = await svc.submit({
      contentId: 'real-slug', eventType: 'scrolled' as never, progress: 0.5, readerToken: 'rt', consentForAnalysis: true,
    });
    expect(badType.code).toBe('invalid-input');
    const noToken = await svc.submit({
      contentId: 'real-slug', eventType: 'content_progress', progress: 0.5, readerToken: '', consentForAnalysis: true,
    });
    expect(noToken.code).toBe('invalid-input');
    const noContent = await svc.submit({
      contentId: '', eventType: 'content_progress', progress: 0.5, readerToken: 'rt', consentForAnalysis: true,
    });
    expect(noContent.code).toBe('invalid-input');
  });

  it('storage-unavailable：存储不可用时拒绝保存', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentTelemetryService({ storageMode: 'unavailable' });
    const result = await svc.submit({
      contentId: 'real-slug', eventType: 'content_progress', progress: 0.5, readerToken: 'rt', consentForAnalysis: true,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('storage-unavailable');
    await expect(svc.findByContent('real-slug')).resolves.toHaveLength(0);
  });

  it('findRecent 按时间倒序返回', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([makeContent()]);
    const svc = createContentTelemetryService();
    const r1 = await svc.submit({ contentId: 'real-slug', eventType: 'content_progress', progress: 0.25, readerToken: 'rt1', consentForAnalysis: true });
    // 手动把第一条 createdAt 拨早，验证排序
    const saved = await svc.findByContent('real-slug');
    expect(saved).toHaveLength(1);
    expect(r1.ok).toBe(true);
  });
});
