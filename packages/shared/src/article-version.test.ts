import { describe, expect, it } from 'vitest';
import {
  appendArticleVersion,
  articleCurrentPath,
  articleHistoryLabel,
  articleHistorySummary,
  articleVersionListPath,
  articleVersionPath,
  isArticleVersionIndex,
  requireVersionNote,
  verifyArticleVersionIndex,
  type ArticleVersionIndex,
} from './article-version.js';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);

describe('appendArticleVersion', () => {
  it('空索引追加为 v1，再追加为 v2（单调递增）', () => {
    const empty: ArticleVersionIndex = { slug: 'demo', versions: [] };
    const r1 = appendArticleVersion(empty, { contentHash: H1, note: '首版', publishedAt: '2026-01-01T00:00:00Z', releaseId: 'r1' });
    expect(r1?.versions.map(v => v.version)).toEqual([1]);
    const r2 = appendArticleVersion(r1!, { contentHash: H2, note: '改版', publishedAt: '2026-02-01T00:00:00Z', releaseId: 'r2' });
    expect(r2?.versions.map(v => v.version)).toEqual([1, 2]);
    expect(r2?.versions[1]?.contentHash).toBe(H2);
  });

  it('内容与最新版相同不建版本（返回 null）', () => {
    const empty: ArticleVersionIndex = { slug: 'demo', versions: [] };
    const r1 = appendArticleVersion(empty, { contentHash: H1, note: '首版', publishedAt: '2026-01-01T00:00:00Z', releaseId: 'r1' });
    expect(appendArticleVersion(r1!, { contentHash: H1, note: '白折腾', publishedAt: '2026-02-01T00:00:00Z', releaseId: 'r2' })).toBeNull();
  });

  it('回退 = 新增一条内容同旧版的新版本（不篡改历史）', () => {
    let idx: ArticleVersionIndex = { slug: 'demo', versions: [] };
    idx = appendArticleVersion(idx, { contentHash: H1, note: '首版', publishedAt: '2026-01-01T00:00:00Z', releaseId: 'r1' })!;
    idx = appendArticleVersion(idx, { contentHash: H2, note: '改版', publishedAt: '2026-02-01T00:00:00Z', releaseId: 'r2' })!;
    idx = appendArticleVersion(idx, { contentHash: H1, note: '回到 v1 的内容', publishedAt: '2026-03-01T00:00:00Z', releaseId: 'r3' })!;
    expect(idx.versions.map(v => v.contentHash)).toEqual([H1, H2, H1]);
    expect(idx.versions[2]?.version).toBe(3);
  });

  it('变更说明为空即拒', () => {
    const empty: ArticleVersionIndex = { slug: 'demo', versions: [] };
    expect(() => appendArticleVersion(empty, { contentHash: H1, note: '  ', publishedAt: 'x', releaseId: 'r' })).toThrow('version-note-required');
    expect(() => requireVersionNote('')).toThrow('version-note-required');
  });

  it('内容哈希非法即拒', () => {
    const empty: ArticleVersionIndex = { slug: 'demo', versions: [] };
    expect(() => appendArticleVersion(empty, { contentHash: 'zzz', note: 'n', publishedAt: 'x', releaseId: 'r' })).toThrow('version-content-hash-invalid');
  });
});

describe('verifyArticleVersionIndex', () => {
  it('合法索引零违规', () => {
    const idx: ArticleVersionIndex = { slug: 'd', versions: [
      { version: 1, contentHash: H1, note: 'a', publishedAt: 'x', releaseId: 'r1' },
      { version: 2, contentHash: H2, note: 'b', publishedAt: 'y', releaseId: 'r2' },
    ] };
    expect(verifyArticleVersionIndex(idx)).toEqual([]);
    expect(isArticleVersionIndex(idx)).toBe(true);
  });

  it('检出：序号断档、空说明、相邻同内容', () => {
    const idx: ArticleVersionIndex = { slug: 'd', versions: [
      { version: 1, contentHash: H1, note: 'a', publishedAt: 'x', releaseId: 'r1' },
      { version: 3, contentHash: H2, note: ' ', publishedAt: 'y', releaseId: 'r2' },
      { version: 4, contentHash: H2, note: 'same', publishedAt: 'z', releaseId: 'r3' },
    ] };
    const problems = verifyArticleVersionIndex(idx);
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.join(' ')).toContain('序号');
    expect(problems.join(' ')).toContain('为空');
    expect(problems.join(' ')).toContain('内容相同');
  });
});

describe('URL 与文案', () => {
  it('版本页 / 列表页 / 当前版路径稳定', () => {
    expect(articleVersionPath('a-b', 3)).toBe('/posts/a-b/v/3');
    expect(articleVersionListPath('a-b')).toBe('/posts/a-b/history');
    expect(articleCurrentPath('a b')).toBe('/posts/a%20b');
  });

  it('文章页短标签：无版本不出链接；单版本给「版本」；多版本给「已更新 N 次」（都不带日期）', () => {
    expect(articleHistoryLabel(0)).toBeNull();
    expect(articleHistoryLabel(1)).toBe('版本');
    expect(articleHistoryLabel(2)).toBe('已更新 1 次');
    expect(articleHistoryLabel(4)).toBe('已更新 3 次');
    expect(articleHistoryLabel(4)).not.toContain('-');
    // 单版本绝不谎称「已更新」
    expect(articleHistoryLabel(1)).not.toContain('更新');
  });

  it('历史页摘要：首末同日不重复念日期', () => {
    const same = articleHistorySummary({ count: 1, firstPublishedAt: '2026-10-13T00:00:00Z', latestPublishedAt: '2026-10-13T00:00:00Z' });
    expect(same).toContain('1 个版本');
    expect(same.match(/2026-10-13/g)).toHaveLength(1);

    const span = articleHistorySummary({ count: 3, firstPublishedAt: '2026-01-01T00:00:00Z', latestPublishedAt: '2026-09-01T00:00:00Z' });
    expect(span).toContain('3 个版本');
    expect(span).toContain('2026-01-01');
    expect(span).toContain('2026-09-01');
  });
});
