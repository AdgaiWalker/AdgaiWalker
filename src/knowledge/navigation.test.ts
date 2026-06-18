import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentItem } from './content-model';

vi.mock('@/knowledge/content', () => ({
  getPublishedContentItems: vi.fn(),
}));

import { getPublishedContentItems } from '@/knowledge/content';
import { getSearchItemHref, getSearchModalData, searchPageLinks, toSearchItem } from './navigation';

function makeItem(partial: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'entry',
    title: '默认内容',
    href: '/entry',
    date: new Date('2026-06-01'),
    tags: [],
    type: 'knowledge',
    form: 'article',
    domain: 'ai',
    intent: 'think',
    valueMode: 'both',
    isExternal: false,
    aiUseLevel: 'AI-2',
    related: [],
    ...partial,
  };
}

describe('navigation helpers', () => {
  beforeEach(() => {
    vi.mocked(getPublishedContentItems).mockReset();
  });

  it('builds route-aware hrefs for ideas and learn items', () => {
    expect(getSearchItemHref({ id: 'idea one', type: 'idea' })).toBe('/ideas#idea%20one');
    expect(getSearchItemHref({ id: 'lesson', type: 'learn' })).toBe('/learn');
  });

  it('maps content items to a minimal DTO', () => {
    expect(toSearchItem(makeItem({ type: 'tool', tags: ['ai'] }))).toEqual({
      title: '默认内容',
      href: '/tools#entry',
      type: '资源',
      tags: ['ai'],
    });
  });

  it('returns sorted search items plus fixed page links', async () => {
    vi.mocked(getPublishedContentItems).mockResolvedValue([
      makeItem({ id: 'idea', title: 'Idea', type: 'idea' }),
      makeItem({ id: 'knowledge', title: 'Knowledge', type: 'knowledge' }),
      makeItem({ id: 'tool', title: 'Tool', type: 'tool' }),
    ]);

    const data = await getSearchModalData();

    expect(data.pages).toEqual(searchPageLinks);
    expect(data.items.map((item) => item.type)).toEqual(['思考', '资源', '点子']);
  });
});
