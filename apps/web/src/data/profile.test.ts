import { describe, expect, it } from 'vitest';
import { getBrowseItems } from '../content';
import { displayHandle, PROFILE } from './profile';

describe('profile SSOT', () => {
  it('displayHandle 去掉协议、www.、mailto: 与末尾斜杠', () => {
    expect(displayHandle('https://www.xyzidea.com')).toBe('xyzidea.com');
    expect(displayHandle('https://dorazoom.iwalk.pro/')).toBe('dorazoom.iwalk.pro');
    expect(displayHandle('https://github.com/AdgaiWalker/vibe0s')).toBe('github.com/AdgaiWalker/vibe0s');
    expect(displayHandle('mailto:a@b.c')).toBe('a@b.c');
  });

  it('aboutLink、work 与 projects 引用的每个 slug 都在公开文章库里（无死链）', () => {
    const slugs = new Set(getBrowseItems().map((item) => item.slug));
    expect(slugs.has(PROFILE.aboutLink.slug)).toBe(true);
    for (const entry of [...PROFILE.work, ...PROFILE.projects]) {
      if (entry.slug) {
        expect(slugs.has(entry.slug)).toBe(true);
      }
    }
  });
});
