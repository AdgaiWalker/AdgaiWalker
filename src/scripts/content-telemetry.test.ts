// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetReaderTokenForTesting,
  resetContentTelemetryState,
  trackReadingProgress,
} from './content-telemetry';

/** 捕获 fetch 调用的 payload。 */
function lastFetchBody(): Record<string, unknown> | undefined {
  const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  if (calls.length === 0) return undefined;
  const last = calls[calls.length - 1];
  const init = last[1] as { body?: string } | undefined;
  if (!init?.body) return undefined;
  return JSON.parse(init.body) as Record<string, unknown>;
}

function fetchCallCount(): number {
  return (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
}

function fetchBodies(): Record<string, unknown>[] {
  return (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map(c => JSON.parse((c[1] as { body: string }).body));
}

describe('content-telemetry 客户端 beacon（P3-A）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 201 })));
    sessionStorage.clear();
    resetContentTelemetryState();
    __resetReaderTokenForTesting();
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetContentTelemetryState();
    __resetReaderTokenForTesting();
  });

  it('未达 50% 不发任何 beacon', () => {
    trackReadingProgress('slug-a', 0.1);
    trackReadingProgress('slug-a', 0.3);
    trackReadingProgress('slug-a', 0.49);
    expect(fetchCallCount()).toBe(0);
  });

  it('≥50% 发一次 content_progress，≥90% 再发一次 content_complete（共 2 次）', () => {
    trackReadingProgress('slug-b', 0.55);
    expect(fetchCallCount()).toBe(1);
    expect(lastFetchBody()).toMatchObject({ contentId: 'slug-b', eventType: 'content_progress', progress: 0.55 });

    trackReadingProgress('slug-b', 0.7); // 已发 progress，不重复
    expect(fetchCallCount()).toBe(1);

    trackReadingProgress('slug-b', 0.92); // 触发 complete
    expect(fetchCallCount()).toBe(2);
    expect(lastFetchBody()).toMatchObject({ eventType: 'content_complete', progress: 1 });

    trackReadingProgress('slug-b', 1); // 已 complete，不重复
    expect(fetchCallCount()).toBe(2);
  });

  it('一次跨到 ≥90% 会同时补发 progress + complete（2 次）', () => {
    trackReadingProgress('slug-c', 0.95);
    expect(fetchCallCount()).toBe(2);
    const types = fetchBodies().map(b => b.eventType);
    expect(types).toContain('content_progress');
    expect(types).toContain('content_complete');
  });

  it('readerToken 在 sessionStorage 持久化且跨调用一致（同会话去重基础）', () => {
    trackReadingProgress('slug-d', 0.95);
    const token1 = lastFetchBody()?.readerToken as string | undefined;
    expect(typeof token1).toBe('string');
    expect((token1 ?? '').length).toBeGreaterThan(0);
    expect(sessionStorage.getItem('walker:reader-token')).toBe(token1);
  });

  it('DoNotTrack=1 时完全不采集', () => {
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    trackReadingProgress('slug-e', 0.95);
    expect(fetchCallCount()).toBe(0);
  });

  it('切换 contentId 时重置触发状态（新内容可再次触发）', () => {
    trackReadingProgress('slug-f', 0.95); // progress + complete = 2
    expect(fetchCallCount()).toBe(2);
    trackReadingProgress('slug-g', 0.95); // 新内容，重新 2 次
    expect(fetchCallCount()).toBe(4);
    expect(lastFetchBody()).toMatchObject({ contentId: 'slug-g', eventType: 'content_complete' });
  });

  it('fetch 失败静默不抛（阅读体验不被拖累）', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(() => trackReadingProgress('slug-h', 0.95)).not.toThrow();
  });
});
