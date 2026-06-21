import { describe, expect, it } from 'vitest';

import { isPublicVisibility, resolveContentVisibility } from '@/knowledge/visibility';

/**
 * P5 NorthStar 隐私隔离护栏（spec §14 硬约束：关闭 NorthStar 后个人闭环仍完整运行；
 * 私密原始数据不自动发布）。
 *
 * 这个测试锁死不变量：任何未来的 Publish Interface / 公开聚合（index.json / graph.json /
 * llms.txt / NorthStar 选择性发布）只能从公开集合取数，draft/private 永不进入公开输出。
 * 它保护现有个人系统不被 NorthStar 提前扩张泄漏私密内容。
 *
 * 注：content.ts 的 isPublicContentData 是 isPublicVisibility 的透传封装（content.ts 顶部
 * `isPublicContentData = isPublicVisibility`）；公开过滤的真相源在此处 visibility.ts。
 */
describe('P5 NorthStar 隐私隔离不变量', () => {
  it('resolveContentVisibility：显式 visibility 优先，否则按 published 降级', () => {
    expect(resolveContentVisibility({ visibility: 'public' })).toBe('public');
    expect(resolveContentVisibility({ visibility: 'draft' })).toBe('draft');
    expect(resolveContentVisibility({ visibility: 'private' })).toBe('private');
    expect(resolveContentVisibility({ published: false })).toBe('draft');
    expect(resolveContentVisibility({ published: true })).toBe('public');
    expect(resolveContentVisibility({})).toBe('public');
  });

  it('isPublicVisibility：仅 public 为真，draft/private/unpublished 为假', () => {
    expect(isPublicVisibility({ visibility: 'public' })).toBe(true);
    expect(isPublicVisibility({ visibility: 'draft' })).toBe(false);
    expect(isPublicVisibility({ visibility: 'private' })).toBe(false);
    expect(isPublicVisibility({ published: false })).toBe(false);
  });

  it('私密可见性优先于 published=true（private 永不因 published=true 泄漏）', () => {
    expect(resolveContentVisibility({ visibility: 'private', published: true })).toBe('private');
    expect(isPublicVisibility({ visibility: 'private', published: true })).toBe(false);
    expect(isPublicVisibility({ visibility: 'draft', published: true })).toBe(false);
  });

  it('未来 Publish Interface 必须基于公开集合：模拟选择函数只能挑出 public 项', () => {
    const samples = [
      { id: 'a', data: { visibility: 'public' } },
      { id: 'b', data: { visibility: 'draft' } },
      { id: 'c', data: { visibility: 'private' } },
      { id: 'd', data: { published: false } },
      { id: 'e', data: { published: true } },
    ];
    const isPublic = (d: { visibility?: unknown; published?: unknown }) => isPublicVisibility(d);
    const publishable = samples.filter(s => isPublic(s.data));
    expect(publishable.map(s => s.id).sort()).toEqual(['a', 'e']);
    expect(publishable.find(s => s.id === 'b' || s.id === 'c' || s.id === 'd')).toBeUndefined();
  });
});
