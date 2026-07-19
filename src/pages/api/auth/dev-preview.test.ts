/**
 * POST /api/auth/dev-preview — 双重守门测试（P0-4）
 *
 * !import.meta.env.DEV || !isLoopback(request) → 404。
 * afterEach 恢复 import.meta.env.DEV 原值，避免用例间互相污染。
 */
import { afterEach, describe, expect, it } from 'vitest';

import { POST } from './dev-preview';

const env = import.meta.env as Record<string, unknown>;
const originalDev = import.meta.env.DEV;
// signSessionToken 需要 COOKIE_SECRET；DEV 模式有兜底密钥，但仍显式注入以稳定行为。
env.COOKIE_SECRET = 'test-secret';

afterEach(() => {
  env.DEV = originalDev;
});

/* eslint-disable @typescript-eslint/no-explicit-any */
function callDevPreview(host: string) {
  const request = new Request(`http://${host}/api/auth/dev-preview`, { method: 'POST' });
  return POST({ request, url: new URL(`http://${host}/api/auth/dev-preview`) } as any);
}

describe('POST /api/auth/dev-preview（P0-4）', () => {
  it('PROD 模式（DEV=false）→ 返回 404', async () => {
    env.DEV = false;
    const res = await callDevPreview('127.0.0.1');
    expect(res.status).toBe(404);
  });

  it('DEV + loopback（127.0.0.1）→ 返回 200 + Set-Cookie', async () => {
    env.DEV = true;
    const res = await callDevPreview('127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toBeTruthy();
  });
});
