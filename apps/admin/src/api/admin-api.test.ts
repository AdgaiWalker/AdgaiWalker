import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from './admin-api';

afterEach(() => vi.restoreAllMocks());

describe('admin workstation transport', () => {
  it('loads the aggregate snapshot from the workstation endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ topics: [], openActions: [], videoLog: [], activeWorks: [], generatedAt: 'now' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(adminApi.workbench()).resolves.toMatchObject({ topics: [], activeWorks: [] });
    expect(fetchMock).toHaveBeenCalledWith('/api/workbench', expect.objectContaining({ credentials: 'include' }));
  });

  it('sends an original draft as multipart without forcing a JSON content type', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'work-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const draft = new File(['# draft'], 'draft.md', { type: 'text/markdown' });
    await adminApi.createWork({ idempotencyKey: 'ui-1', title: 'draft', coreViewpoint: 'viewpoint', protectedClaims: [], draft });
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });
});
