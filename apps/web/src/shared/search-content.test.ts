import { describe, expect, it } from 'vitest';
import { searchContentItems } from './search-content';

const items = [
  {
    slug: 'a',
    title: 'AI 周报写法',
    summary: '半小时产出',
    body: '大纲再扩写',
  },
  {
    slug: 'b',
    title: '旅行手记',
    summary: '山水',
    body: '无关内容',
  },
  {
    slug: 'c',
    title: '其他',
    summary: '其他摘要',
    body: '里面提到 AI 工具',
  },
];

describe('searchContentItems', () => {
  it('空查询返回空列表', () => {
    expect(searchContentItems(items, '')).toEqual([]);
    expect(searchContentItems(items, '   ')).toEqual([]);
  });

  it('按标题匹配（大小写不敏感）', () => {
    const hits = searchContentItems(items, 'ai 周报');
    expect(hits).toEqual([{ url: '/posts/a', title: 'AI 周报写法' }]);
  });

  it('按摘要匹配', () => {
    const hits = searchContentItems(items, '半小时');
    expect(hits.some((h) => h.url === '/posts/a')).toBe(true);
    expect(hits[0]?.title).toBe('AI 周报写法');
  });

  it('按正文匹配', () => {
    const hits = searchContentItems(items, 'AI 工具');
    expect(hits.some((h) => h.url === '/posts/c')).toBe(true);
  });

  it('遵守 limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      slug: `s${i}`,
      title: `主题 ${i}`,
      summary: '主题',
      body: '',
    }));
    expect(searchContentItems(many, '主题', 5)).toHaveLength(5);
  });
});
