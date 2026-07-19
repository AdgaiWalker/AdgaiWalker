import { describe, expect, it } from 'vitest';

import type { ArticleEntry } from './posts';
import { getRelatedPosts, summarizeArticleBody } from './posts';

function makeEntry(partial: Partial<ArticleEntry['data']> & { id?: string } = {}): ArticleEntry {
  return {
    id: partial.id ?? 'post',
    body: '',
    collection: 'log',
    data: {
      title: '默认文章',
      date: new Date('2026-06-01'),
      tags: [],
      type: 'knowledge',
      ...partial,
    },
  } as unknown as ArticleEntry;
}

describe('summarizeArticleBody', () => {
  it('strips frontmatter, imports, and markup before building description and reading time', () => {
    const body = `---
title: Demo
---
import Widget from './Widget.astro'

# 标题

<Widget />

这是正文内容。`;

    const summary = summarizeArticleBody(body, 10, 20);

    expect(summary.description).toBe('标题 这是正文内容。');
    expect(summary.readingTime).toBeGreaterThanOrEqual(1);
  });
});

describe('getRelatedPosts', () => {
  it('ranks posts by tag overlap and excludes the current entry', () => {
    const current = makeEntry({ id: 'current', tags: ['ai', 'workflow'] });
    const related = getRelatedPosts(current, [
      current,
      makeEntry({ id: 'best', title: 'Best', tags: ['ai', 'workflow', 'prompt'] }),
      makeEntry({ id: 'next', title: 'Next', tags: ['ai'] }),
      makeEntry({ id: 'skip', title: 'Skip', tags: ['life'] }),
    ]);

    expect(related.map((item) => item.id)).toEqual(['best', 'next']);
    expect(related[0]?.score).toBeGreaterThan(related[1]?.score ?? 0);
  });
});
