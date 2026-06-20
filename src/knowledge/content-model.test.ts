import { describe, it, expect } from 'vitest';
import {
  SPACE_COLOR,
  itemBelongsToSpace,
  getMainSpace,
  type ContentItem,
} from './content-model';

/** 默认值是一篇「中性」文章，不命中任何具体空间（用于隔离各空间条件的触发） */
function makeItem(partial: Partial<ContentItem> = {}): ContentItem {
  return {
    id: 'x', title: 't', href: '/x', date: new Date('2026-06-01'),
    tags: [], type: 'knowledge', form: 'article', domain: 'ai',
    intent: 'think', valueMode: 'both', isExternal: false,
    aiUseLevel: 'AI-2', related: [],
    ...partial,
  } as ContentItem;
}

describe('SPACE_COLOR — 空间配色', () => {
  it('覆盖 6 个具体空间', () => {
    expect(Object.keys(SPACE_COLOR).sort()).toEqual(
      ['ideas', 'learning', 'life', 'progress', 'tools', 'works'],
    );
  });
});

describe('itemBelongsToSpace — 空间归属判定', () => {
  it("'all' 恒为真（任意内容都属全部）", () => {
    expect(itemBelongsToSpace(makeItem(), 'all')).toBe(true);
    expect(itemBelongsToSpace(makeItem({ type: 'tool' }), 'all')).toBe(true);
  });

  describe('progress — 前进系统（三条件之一即归属）', () => {
    it('status=building', () => {
      expect(itemBelongsToSpace(makeItem({ status: 'building' }), 'progress')).toBe(true);
    });
    it('status=validating', () => {
      expect(itemBelongsToSpace(makeItem({ status: 'validating' }), 'progress')).toBe(true);
    });
    it('tags 含「前进系统」', () => {
      expect(itemBelongsToSpace(makeItem({ tags: ['前进系统'] }), 'progress')).toBe(true);
    });
    it('id 含 progress', () => {
      expect(itemBelongsToSpace(makeItem({ id: 'my-progress-note' }), 'progress')).toBe(true);
    });
    it('status=verified 且无 tag/id 命中 → 不属 progress', () => {
      expect(itemBelongsToSpace(makeItem({ status: 'verified' }), 'progress')).toBe(false);
    });
  });

  describe('life — 生活现场（按 domain）', () => {
    for (const domain of ['life', 'cooking', 'calligraphy', 'reading', 'travel', 'emotion'] as const) {
      it(`domain=${domain} 属 life`, () => {
        expect(itemBelongsToSpace(makeItem({ domain }), 'life')).toBe(true);
      });
    }
    it('domain=ai 不属 life', () => {
      expect(itemBelongsToSpace(makeItem({ domain: 'ai' }), 'life')).toBe(false);
    });
  });

  describe('learning — 学习笔记（三条件之一即归属）', () => {
    it('type=learn', () => {
      expect(itemBelongsToSpace(makeItem({ type: 'learn' }), 'learning')).toBe(true);
    });
    it('form=lesson', () => {
      expect(itemBelongsToSpace(makeItem({ form: 'lesson' }), 'learning')).toBe(true);
    });
    it('intent=teach', () => {
      expect(itemBelongsToSpace(makeItem({ intent: 'teach' }), 'learning')).toBe(true);
    });
    it('普通文章（knowledge/article/think）不属 learning', () => {
      expect(itemBelongsToSpace(makeItem(), 'learning')).toBe(false);
    });
  });

  it('tools — type=tool', () => {
    expect(itemBelongsToSpace(makeItem({ type: 'tool' }), 'tools')).toBe(true);
    expect(itemBelongsToSpace(makeItem(), 'tools')).toBe(false);
  });

  it('works — type=project', () => {
    expect(itemBelongsToSpace(makeItem({ type: 'project' }), 'works')).toBe(true);
    expect(itemBelongsToSpace(makeItem(), 'works')).toBe(false);
  });

  it('ideas — type=idea', () => {
    expect(itemBelongsToSpace(makeItem({ type: 'idea' }), 'ideas')).toBe(true);
    expect(itemBelongsToSpace(makeItem(), 'ideas')).toBe(false);
  });
});

describe('getMainSpace — 主空间（按 contentSpaces 顺序取首个命中）', () => {
  it('项目 → works', () => {
    expect(getMainSpace(makeItem({ type: 'project' }))).toBe('works');
  });
  it('点子 → ideas', () => {
    expect(getMainSpace(makeItem({ type: 'idea' }))).toBe('ideas');
  });
  it('工具 → tools', () => {
    expect(getMainSpace(makeItem({ type: 'tool' }))).toBe('tools');
  });
  it('生活领域 → life', () => {
    expect(getMainSpace(makeItem({ domain: 'cooking' }))).toBe('life');
  });
  it('普通文章无具体空间 → null', () => {
    expect(getMainSpace(makeItem({ type: 'knowledge', domain: 'ai' }))).toBeNull();
  });
  it('多空间命中时按顺序取首个（progress 优先于 ideas）', () => {
    // status=building 命中 progress，type=idea 命中 ideas → progress 在 contentSpaces 中靠前
    expect(getMainSpace(makeItem({ type: 'idea', status: 'building' }))).toBe('progress');
  });
});
