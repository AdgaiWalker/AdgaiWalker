import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentItem } from './content-model';

vi.mock('@/knowledge/content', () => ({
  getPublishedContentItems: vi.fn(),
}));

import { getPublishedContentItems } from '@/knowledge/content';
import { getSearchModalData, searchPageLinks, toSearchItem } from './navigation';

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

  it('uses authoritative href from content model (incl. external)', () => {
    const external = makeItem({
      id: 'walkcraft',
      title: 'Walkcraft',
      href: 'https://github.com/AdgaiWalker/Walkcraft-Skill-Craft',
      type: 'project',
      isExternal: true,
    });
    expect(toSearchItem(external).href).toBe(external.href);
  });

  it('falls back to internal href from content model when not external', () => {
    const internal = makeItem({ type: 'knowledge', href: '/posts/some-post' });
    expect(toSearchItem(internal).href).toBe('/posts/some-post');
  });

  it('maps content items to a minimal DTO', () => {
    expect(toSearchItem(makeItem({ type: 'tool', tags: ['ai'] }))).toEqual({
      title: '默认内容',
      href: '/entry',
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
