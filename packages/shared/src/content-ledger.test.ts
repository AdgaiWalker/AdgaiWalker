import { describe, expect, it } from 'vitest';
import {
  deriveContentStage,
  deriveContentStageFromFrontmatter,
  resolveContentGroup,
  validateProjectMetadata,
} from './content-ledger.js';
import { missingPublishedPostFields, PUBLISHED_POST_REQUIRED_FIELDS } from './content.js';

/** 7 项必需字段齐全的公开 frontmatter */
const FULL_PUBLIC_FRONTMATTER: Record<string, unknown> = {
  visibility: 'public',
  form: 'article',
  domain: 'product',
  intent: 'share',
  valueMode: 'utility',
  aiUsePolicy: { level: 'AI-2' },
  updated: '2026-09-15',
  summary: '摘要',
};

describe('deriveContentStage（PRD §3.4 四阶段判据）', () => {
  it('draft：visibility 非 public（draft / private 一律归草稿）', () => {
    expect(
      deriveContentStage({ visibility: 'draft', missingFields: [], dirty: true }),
    ).toBe('draft');
    expect(
      deriveContentStage({ visibility: 'draft', missingFields: [], dirty: false }),
    ).toBe('draft');
    // private 归入草稿（PRD §3.8：标注私密口径，不计入公开统计——标注属展示层职责）
    expect(
      deriveContentStage({ visibility: 'private', missingFields: [], dirty: false }),
    ).toBe('draft');
    // 非 public 时即使缺字段也仍是草稿（§3.7：草稿不显示门禁缺口）
    expect(
      deriveContentStage({
        visibility: 'draft',
        missingFields: ['summary'],
        dirty: false,
      }),
    ).toBe('draft');
  });

  it('private 一律归草稿：脏 / 缺字段 / 两者叠加都不改变判据（PRD §3.8）', () => {
    expect(
      deriveContentStage({ visibility: 'private', missingFields: [], dirty: true }),
    ).toBe('draft');
    expect(
      deriveContentStage({ visibility: 'private', missingFields: ['summary'], dirty: false }),
    ).toBe('draft');
    expect(
      deriveContentStage({ visibility: 'private', missingFields: ['summary'], dirty: true }),
    ).toBe('draft');
    expect(
      deriveContentStageFromFrontmatter({ ...FULL_PUBLIC_FRONTMATTER, visibility: 'private' }, true),
    ).toBe('draft');
  });

  it('review：public 且门禁缺失字段非空（与脏否无关）', () => {
    const missing = missingPublishedPostFields({
      visibility: 'public',
      form: 'article',
    });
    expect(missing.length).toBeGreaterThan(0);
    expect(
      deriveContentStage({ visibility: 'public', missingFields: missing, dirty: false }),
    ).toBe('review');
    expect(
      deriveContentStage({ visibility: 'public', missingFields: missing, dirty: true }),
    ).toBe('review');
  });

  it('ready：public + 门禁通过 + 工作区脏', () => {
    expect(
      deriveContentStage({ visibility: 'public', missingFields: [], dirty: true }),
    ).toBe('ready');
  });

  it('live：public + 门禁通过 + 工作区干净', () => {
    expect(
      deriveContentStage({ visibility: 'public', missingFields: [], dirty: false }),
    ).toBe('live');
  });

  it('从 frontmatter 推导：字段齐全且干净 → live', () => {
    expect(deriveContentStageFromFrontmatter(FULL_PUBLIC_FRONTMATTER, false)).toBe('live');
    expect(deriveContentStageFromFrontmatter(FULL_PUBLIC_FRONTMATTER, true)).toBe('ready');
  });

  it('从 frontmatter 推导：published=false 无显式 visibility → draft（复用 resolveVisibility）', () => {
    expect(
      deriveContentStageFromFrontmatter(
        { ...FULL_PUBLIC_FRONTMATTER, visibility: undefined, published: false },
        true,
      ),
    ).toBe('draft');
  });

  it('从 frontmatter 推导：缺 summary 的 public → review（复用 missingPublishedPostFields 判空口径）', () => {
    const data = { ...FULL_PUBLIC_FRONTMATTER, summary: '   ' };
    expect(missingPublishedPostFields(data)).toEqual(['summary']);
    expect(deriveContentStageFromFrontmatter(data, false)).toBe('review');
  });

  it('门禁缺口只来自 PUBLISHED_POST_REQUIRED_FIELDS，不另开清单', () => {
    const emptyPublic = missingPublishedPostFields({ visibility: 'public' });
    expect(emptyPublic).toEqual([...PUBLISHED_POST_REQUIRED_FIELDS]);
    const onlySummary = missingPublishedPostFields({
      ...FULL_PUBLIC_FRONTMATTER,
      summary: '',
    });
    expect(onlySummary).toEqual(['summary']);
    for (const field of onlySummary) {
      expect(PUBLISHED_POST_REQUIRED_FIELDS).toContain(field);
    }
    expect(deriveContentStageFromFrontmatter({ visibility: 'public', summary: '' }, false)).toBe(
      'review',
    );
  });
});

describe('resolveContentGroup（展示层分组，不回写 frontmatter）', () => {
  it('type 现值集合逐一归类', () => {
    expect(resolveContentGroup('project')).toBe('product');
    expect(resolveContentGroup('tool')).toBe('product');
    expect(resolveContentGroup('knowledge')).toBe('article');
    expect(resolveContentGroup('learn')).toBe('article');
    expect(resolveContentGroup('idea')).toBe('idea');
  });

  it('未识别 type 归「文章」，不另造分组', () => {
    expect(resolveContentGroup('something-new')).toBe('article');
    expect(resolveContentGroup('')).toBe('article');
  });

  it('小店 type 归「小店」展示分组', () => {
    expect(resolveContentGroup('shop')).toBe('shop');
  });

  it('validateProjectMetadata 正确校验项目属性', () => {
    const valid = validateProjectMetadata({
      status: 'validating',
      url: 'https://github.com/AdgaiWalker/test',
      resources: [{ name: '源码', url: 'https://github.com/...' }],
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalid = validateProjectMetadata({
      status: 123,
      resources: 'not-an-array',
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });
});
