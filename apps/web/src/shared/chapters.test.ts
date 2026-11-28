import { describe, expect, it } from 'vitest';
import { chapterOf, groupByChapter, parseChapterId } from './chapters';

describe('chapterOf', () => {
  it('作品类（项目 / 点子 / 工具，或展示与交换厅）归入造物', () => {
    expect(chapterOf({ type: 'project' })).toBe('make');
    expect(chapterOf({ type: 'idea', hall: 'lab' })).toBe('make');
    expect(chapterOf({ type: 'knowledge', hall: 'exchange' })).toBe('make');
  });

  it('跟学与条件 / 器具厅归入用好', () => {
    expect(chapterOf({ type: 'learn' })).toBe('use');
    expect(chapterOf({ type: 'knowledge', hall: 'condition' })).toBe('use');
    expect(chapterOf({ type: 'knowledge', hall: ' kit ' })).toBe('use');
  });

  it('其余（札记、日记、无厅）归入看见', () => {
    expect(chapterOf({ type: 'knowledge', hall: 'lab' })).toBe('see');
    expect(chapterOf({ type: 'wise' })).toBe('see');
  });
});

describe('groupByChapter', () => {
  it('固定输出三章，组内保持原顺序', () => {
    const groups = groupByChapter([
      { slug: 'a', type: 'project' },
      { slug: 'b', type: 'knowledge' },
      { slug: 'c', type: 'learn' },
      { slug: 'd', type: 'idea' },
    ]);
    expect(groups.map((g) => g.chapter.id)).toEqual(['see', 'use', 'make']);
    expect(groups[2]!.items.map((i) => i.slug)).toEqual(['a', 'd']);
  });
});

describe('parseChapterId', () => {
  it('只接受三个合法键', () => {
    expect(parseChapterId('USE')).toBe('use');
    expect(parseChapterId('lab')).toBeNull();
    expect(parseChapterId(null)).toBeNull();
  });
});
