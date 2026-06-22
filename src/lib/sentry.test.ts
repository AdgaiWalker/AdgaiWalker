import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureException } from './sentry';

const originalDsn = import.meta.env.SENTRY_DSN;
const originalFetch: typeof globalThis.fetch = globalThis.fetch;

/** flush 微任务队列，让 fire-and-forget 的 sendEnvelope 落定。 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve());
  });
}

afterEach(() => {
  // 恢复 import.meta.env.SENTRY_DSN 原值
  if (originalDsn === undefined) {
    import.meta.env.SENTRY_DSN = undefined;
  } else {
    import.meta.env.SENTRY_DSN = originalDsn;
  }
  // 恢复 global.fetch 原值
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('sentry 轻量手封上报', () => {
  it('未配置 SENTRY_DSN → captureException 不抛错、不调用 fetch', async () => {
    import.meta.env.SENTRY_DSN = undefined;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    expect(() => captureException(new Error('x'))).not.toThrow();

    await flushMicrotasks();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('配置了 SENTRY_DSN → captureException 调用 fetch 上报到 envelope 端点', async () => {
    import.meta.env.SENTRY_DSN = 'https://abc@sentry.io/123';
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    globalThis.fetch = fetchSpy;

    captureException(new Error('boom'), { route: '/api/test' });

    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/api/123/envelope/');
    expect(String(url)).toContain('sentry.io');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'text/plain' });

    // envelope body 为三行 NDJSON
    const body = String((init as RequestInit).body);
    const lines = body.split('\n');
    expect(lines).toHaveLength(3);
    const header = JSON.parse(lines[0]);
    const itemHeader = JSON.parse(lines[1]);
    const payload = JSON.parse(lines[2]);
    expect(header.event_id).toBe(payload.event_id);
    expect(header.sent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(itemHeader).toEqual({ type: 'event' });
    expect(payload.level).toBe('error');
    expect(payload.exception.values[0]).toMatchObject({ type: 'Error', value: 'boom' });
    expect(payload.extra).toEqual({ route: '/api/test' });
  });

  it('fetch 失败时静默，不抛错、不阻塞（fire-and-forget）', async () => {
    import.meta.env.SENTRY_DSN = 'https://abc@sentry.io/456';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    expect(() => captureException(new Error('will-not-send'))).not.toThrow();

    await flushMicrotasks();
    // 到这里没抛即视为静默成功
    expect(true).toBe(true);
  });
});
