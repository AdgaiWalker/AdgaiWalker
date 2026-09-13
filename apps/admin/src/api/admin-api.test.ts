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

  it('calls modelProviders list and ping correctly', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'deepseek', name: 'DeepSeek' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await adminApi.modelProviders.list();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/model-providers',
      expect.objectContaining({ credentials: 'include' }),
    );

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, latencyMs: 112 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await adminApi.modelProviders.ping('deepseek');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/model-providers/deepseek/ping',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('calls agents list and runFile correctly', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'xiaoying', name: '小影' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await adminApi.agents.list();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agents',
      expect.objectContaining({ credentials: 'include' }),
    );

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ runId: 'run_123', status: 'SUCCESS' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await adminApi.agents.runFile('xiaoying', {
      targetFile: 'content/log/test.md',
      instruction: '分析文件',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agents/xiaoying/run-file',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetFile: 'content/log/test.md', instruction: '分析文件' }),
      }),
    );
  });
});

