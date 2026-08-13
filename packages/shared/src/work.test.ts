import { describe, expect, it } from 'vitest';
import { parseProtectedClaims, validateOriginalUpload } from './work.js';

describe('work contracts', () => {
  it('requires one non-empty core viewpoint and one draft', () => {
    expect(() =>
      validateOriginalUpload({
        title: '第一篇稿子',
        coreViewpoint: 'AI 应该帮助普通人完成真实工作。',
        draftCount: 1,
        attachmentCount: 2,
      }),
    ).not.toThrow();
    expect(() =>
      validateOriginalUpload({
        title: '第一篇稿子',
        coreViewpoint: ' ',
        draftCount: 1,
        attachmentCount: 0,
      }),
    ).toThrow('core-viewpoint-required');
  });

  it('parses protected claims without accepting non-strings', () => {
    expect(parseProtectedClaims('["不制造焦虑","不承诺一键成功"]')).toEqual([
      '不制造焦虑',
      '不承诺一键成功',
    ]);
    expect(() => parseProtectedClaims('["有效",3]')).toThrow(
      'invalid-protected-claims',
    );
  });
});
