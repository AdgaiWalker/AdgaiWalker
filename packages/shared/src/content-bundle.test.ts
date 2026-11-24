import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildContentBundle, verifyContentBundle } from './content-bundle.js';
import { isBrowsePostType, isPostType, PUBLIC_SUMMARY_PLACEHOLDER, validatePublishablePost } from './content.js';

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const VALID_FM = {
  title: '生产关系',
  type: 'wise',
  visibility: 'public',
  form: 'note',
  domain: 'life',
  intent: 'record',
  valueMode: 'existence',
  updated: '2026-11-19',
  summary: '独立不重复的文章摘要',
  aiUsePolicy: { level: 'AI-2', readable: true, citable: true, actionable: false },
};

describe('单一发布契约与内容包协议', () => {
  it('isBrowsePostType 对除 tool 外全部类型（含 wise）统一开放', () => {
    expect(isBrowsePostType('knowledge')).toBe(true);
    expect(isBrowsePostType('wise')).toBe(true);
    expect(isBrowsePostType('idea')).toBe(true);
    expect(isBrowsePostType('tool')).toBe(false);
    expect(isBrowsePostType('TOOL')).toBe(false);
    expect(isPostType('wise')).toBe(true);
  });

  it('validatePublishablePost 拦截非 public、占位/重复摘要、缺 aiUsePolicy.level 与坏日期', () => {
    const existing = new Map([
      ['待写完后提炼', '2026-11-02'],
      ['其他唯一摘要', 'other-post'],
    ]);
    expect(validatePublishablePost({ slug: '2026-11-19', frontmatter: VALID_FM, existingPublicSummaries: existing }).ok).toBe(true);
    // 本篇自身同名不误报
    expect(validatePublishablePost({ slug: '2026-11-02', frontmatter: { ...VALID_FM, summary: '待写完后提炼' }, existingPublicSummaries: existing }).ok).toBe(true);

    // 他篇重复 summary 必拦
    const dup = validatePublishablePost({ slug: '2026-11-19', frontmatter: { ...VALID_FM, summary: '待写完后提炼' }, existingPublicSummaries: existing });
    expect(dup.ok).toBe(false);
    expect(dup.issues.join(',')).toContain('2026-11-02');

    // tool 类型不强制跨文章 summary 唯一，但仍要求字段齐全与 public
    expect(validatePublishablePost({ slug: 'my-tool', frontmatter: { ...VALID_FM, type: 'tool', summary: '待写完后提炼' }, existingPublicSummaries: existing }).ok).toBe(true);

    // 私密 / 占位摘要 / 缺 level / 坏日期
    const bad = validatePublishablePost({
      slug: 'bad-post',
      frontmatter: { ...VALID_FM, visibility: 'draft', updated: 'not-a-date', summary: PUBLIC_SUMMARY_PLACEHOLDER, aiUsePolicy: { readable: true } },
    });
    expect(bad.ok).toBe(false);
    expect(bad.issues.length).toBeGreaterThanOrEqual(4);
  });

  it('内容导出包构建、校验与篡改拒绝（无损往返）', () => {
    const bundle = buildContentBundle(
      [
        { slug: 'b-post', raw: '---\ntitle: B\n---\r\n\r\nbody b\n', updatedAt: '2026-11-24T00:00:00.000Z' },
        { slug: 'a-post', raw: '---\ntitle: A\n---\n\nbody a\n', updatedAt: '2026-11-24T00:00:00.000Z' },
      ],
      sha,
      '2026-11-24T00:00:00.000Z',
    );
    expect(bundle.items.map((i) => i.slug)).toEqual(['a-post', 'b-post']);
    expect(bundle.items[1]!.raw).not.toContain('\r');

    const ok = verifyContentBundle(bundle, sha);
    expect(ok.ok).toBe(true);

    const tampered = { ...bundle, items: [{ ...bundle.items[0]!, raw: '---\ntitle: Hack\n---\n' }, bundle.items[1]!] };
    expect(verifyContentBundle(tampered, sha).ok).toBe(false);
  });
});
