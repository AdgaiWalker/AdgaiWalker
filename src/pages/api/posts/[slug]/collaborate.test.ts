import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET, POST } from './collaborate';
import {
  __resetMemoryCollaboratorStore,
  getCollaboratorCountByContent,
  findCollaboratorsByContent
} from '@/stores/collaborator.store';
import { getEntry } from 'astro:content';

vi.mock('astro:content', () => ({
  getEntry: vi.fn(),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockParams(slug: string) {
  return { slug };
}

describe('API: /api/posts/[slug]/collaborate', () => {
  beforeEach(() => {
    __resetMemoryCollaboratorStore();
    vi.mocked(getEntry).mockReset();
  });

  describe('GET request', () => {
    it('若 slug 不存在或点子没找到，返回 404', async () => {
      vi.mocked(getEntry).mockResolvedValue(null as any);
      
      const res = await GET({ params: mockParams('non-existent') } as any);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: '点子不存在' });
    });

    it('点子存在时，返回同频者列表和数量', async () => {
      vi.mocked(getEntry).mockResolvedValue({ id: 'my-idea' } as any);
      
      // 先手工模拟写入一个同频者
      const postReq = new Request('http://localhost/api/posts/my-idea/collaborate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: '前端开发', suggestion: '实现卡片动效' }),
      });
      await POST({ params: mockParams('my-idea'), request: postReq } as any);

      const res = await GET({ params: mockParams('my-idea') } as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.count).toBe(1);
      expect(data.collaborators).toHaveLength(1);
      expect(data.collaborators[0].role).toBe('前端开发');
      expect(data.collaborators[0].suggestion).toBe('实现卡片动效');
    });
  });

  describe('POST request', () => {
    it('校验 role 和 suggestion 字段为空时报错 400', async () => {
      vi.mocked(getEntry).mockResolvedValue({ id: 'my-idea' } as any);

      const req1 = new Request('http://localhost/api/posts/my-idea/collaborate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: '', suggestion: '实现卡片动效' }),
      });
      const res1 = await POST({ params: mockParams('my-idea'), request: req1 } as any);
      expect(res1.status).toBe(400);

      const req2 = new Request('http://localhost/api/posts/my-idea/collaborate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: '前端', suggestion: '' }),
      });
      const res2 = await POST({ params: mockParams('my-idea'), request: req2 } as any);
      expect(res2.status).toBe(400);
    });

    it('同频申请成功写入，并计数加 1', async () => {
      vi.mocked(getEntry).mockResolvedValue({ id: 'my-idea' } as any);

      const req = new Request('http://localhost/api/posts/my-idea/collaborate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: '全栈工程师', suggestion: '帮写 API 和 Store' }),
      });
      
      const res = await POST({ params: mockParams('my-idea'), request: req } as any);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });

      expect(await getCollaboratorCountByContent('my-idea')).toBe(1);
      const list = await findCollaboratorsByContent('my-idea');
      expect(list[0].role).toBe('全栈工程师');
    });
  });
});
