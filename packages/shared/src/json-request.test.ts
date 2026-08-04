import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './json-request.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson multipart transport', () => {
  it('does not override the FormData boundary', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('Content-Type')).toBe(false);
      return new Response(JSON.stringify({ id: 'work-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.set('title', '第一篇稿子');
    await expect(
      fetchJson('/works', { method: 'POST', body: form }),
    ).resolves.toEqual({ ok: true, data: { id: 'work-1' } });
  });
});
