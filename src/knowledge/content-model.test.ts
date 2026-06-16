import { describe, it, expect } from 'vitest';
import { SPACE_COLOR, getMainSpace, type ContentItem } from './content-model';

function makeItem(partial: Partial<ContentItem>): ContentItem {
  return {
    id: 'x', title: 't', href: '/x', date: new Date('2026-06-01'),
    tags: [], type: 'knowledge', form: 'article', domain: 'ai',
    intent: 'think', valueMode: 'both', isExternal: false,
    aiUseLevel: 'AI-2', related: [],
    ...partial,
  } as ContentItem;
}

describe('content-model 空间色 + 主空间', () => {
  it('SPACE_COLOR 覆盖 6 个具体空间', () => {
    expect(Object.keys(SPACE_COLOR).sort()).toEqual(
      ['ideas', 'learning', 'life', 'progress', 'tools', 'works'],
    );
  });

  it('getMainSpace：项目 → works', () => {
    expect(getMainSpace(makeItem({ type: 'project' }))).toBe('works');
  });
  it('getMainSpace：点子 → ideas', () => {
    expect(getMainSpace(makeItem({ type: 'idea' }))).toBe('ideas');
  });
  it('getMainSpace：生活领域 → life', () => {
    expect(getMainSpace(makeItem({ domain: 'cooking' }))).toBe('life');
  });
  it('getMainSpace：普通文章无具体空间 → null', () => {
    expect(getMainSpace(makeItem({ type: 'knowledge', domain: 'ai' }))).toBeNull();
  });
});
