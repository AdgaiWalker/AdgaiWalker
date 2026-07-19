import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './canvas';
import {
  __resetMemoryCanvasDrafts,
  getCanvasDraft
} from '@/stores/canvas-draft.store';
import { getEntry } from 'astro:content';

vi.mock('astro:content', () => ({
  getEntry: vi.fn(),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockParams(slug: string) {
  return { slug };
}

describe('API: /api/posts/[slug]/canvas', () => {
  beforeEach(() => {
    __resetMemoryCanvasDrafts();
    vi.mocked(getEntry).mockReset();
  });

  it('若 slug 不存在或点子没找到，返回 404', async () => {
    vi.mocked(getEntry).mockResolvedValue(null as any);

    const req = new Request('http://localhost/api/posts/non-existent/canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '内容' }),
    });
    
    const res = await POST({ params: mockParams('non-existent'), request: req } as any);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: '点子不存在' });
  });

  it('校验 content 字段为空时报错 400', async () => {
    vi.mocked(getEntry).mockResolvedValue({ id: 'my-idea' } as any);

    const req = new Request('http://localhost/api/posts/my-idea/canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST({ params: mockParams('my-idea'), request: req } as any);
    expect(res.status).toBe(400);
  });

  it('草稿保存成功，写入 store', async () => {
    vi.mocked(getEntry).mockResolvedValue({ id: 'my-idea' } as any);

    const req = new Request('http://localhost/api/posts/my-idea/canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '更新后的 Markdown 文档' }),
    });

    const res = await POST({ params: mockParams('my-idea'), request: req } as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await getCanvasDraft('my-idea')).toBe('更新后的 Markdown 文档');
  });
});
