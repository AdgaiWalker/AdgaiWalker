import { describe, expect, it } from 'vitest';
import {
  missingPublishedPostFields,
  PUBLISHED_POST_REQUIRED_FIELDS,
} from './content.js';

describe('公开文章 frontmatter 合同', () => {
  it('必需字段清单与 build:web 门禁一致', () => {
    expect([...PUBLISHED_POST_REQUIRED_FIELDS]).toEqual([
      'form',
      'domain',
      'intent',
      'valueMode',
      'aiUsePolicy',
      'updated',
      'summary',
    ]);
  });

  it('字段齐全时返回空（通过）', () => {
    expect(
      missingPublishedPostFields({
        form: 'article',
        domain: 'product',
        intent: 'share',
        valueMode: 'utility',
        aiUsePolicy: { level: 'AI-2' },
        updated: '2026-09-06',
        summary: '摘要',
      }),
    ).toEqual([]);
  });

  it('缺失、null、空白字符串都算未通过', () => {
    const missing = missingPublishedPostFields({
      form: 'article',
      domain: '  ',
      intent: undefined,
      valueMode: 'utility',
      aiUsePolicy: null,
      updated: '2026-09-06',
    });
    expect(missing).toEqual(['domain', 'intent', 'aiUsePolicy', 'summary']);
  });
});
