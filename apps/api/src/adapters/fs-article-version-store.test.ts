import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsArticleVersionStore } from './fs-article-version-store';

const H_BODY_V1 = '---\ntitle: 演示\n---\n第一版正文\n';
const H_BODY_V2 = '---\ntitle: 演示\n---\n第二版正文\n';

describe('FsArticleVersionStore', () => {
  let dir: string;
  const prevEnv = process.env.ARTICLE_VERSIONS_DIR;
  const store = new FsArticleVersionStore();

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'walker-versions-'));
    process.env.ARTICLE_VERSIONS_DIR = dir;
  });
  afterEach(() => {
    process.env.ARTICLE_VERSIONS_DIR = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('首次发布 → v1；内容变化再发布 → v2；相同内容不建版本', async () => {
    const r1 = await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V1, note: '首版', publishedAt: '2026-01-01T00:00:00Z', releaseId: 'r1',
    });
    expect(r1.created).toBe(true);
    expect(r1.index.versions.map((v) => v.version)).toEqual([1]);

    const dup = await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V1, note: '再来一次', publishedAt: '2026-01-02T00:00:00Z', releaseId: 'r2',
    });
    expect(dup.created).toBe(false);
    expect(dup.index.versions).toHaveLength(1);

    const r2 = await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V2, note: '改版', publishedAt: '2026-02-01T00:00:00Z', releaseId: 'r3',
    });
    expect(r2.created).toBe(true);
    expect(r2.index.versions).toHaveLength(2);
  });

  it('blob 内容寻址：读回正文一致；回退复用旧 blob（相同 hash 只存一份）', async () => {
    const r1 = await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V1, note: '首版', publishedAt: '2026-01-01T00:00:00Z', releaseId: 'r1',
    });
    await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V2, note: '改版', publishedAt: '2026-02-01T00:00:00Z', releaseId: 'r2',
    });
    // 回退：内容同 v1
    const r3 = await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V1, note: '回到 v1', publishedAt: '2026-03-01T00:00:00Z', releaseId: 'r3',
    });
    expect(r3.index.versions[2]!.contentHash).toBe(r1.index.versions[0]!.contentHash);
    const body = await store.readBody(r1.index.versions[0]!.contentHash);
    expect(body).toBe(H_BODY_V1);
  });

  it('清理安全线：本适配器没有删除路径——blob 与索引落盘后只能再读到', async () => {
    const r1 = await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V1, note: '首版', publishedAt: '2026-01-01T00:00:00Z', releaseId: 'r1',
    });
    // 再发布十版，v1 的正文和记录仍然原样可读
    for (let i = 0; i < 3; i++) {
      await store.appendVersion({
        slug: 'demo', rawBody: H_BODY_V2 + String(i), note: '迭代' + i,
        publishedAt: '2026-02-0' + (i + 1) + 'T00:00:00Z', releaseId: 'rx' + i,
      });
    }
    const idx = await store.readIndex('demo');
    expect(idx?.versions).toHaveLength(4);
    expect(await store.readBody(r1.index.versions[0]!.contentHash)).toBe(H_BODY_V1);
  });

  it('空说明即拒；未发布过的 slug 读索引为 null；listSlugs 只列有版本的', async () => {
    await expect(store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V1, note: '   ', publishedAt: 'x', releaseId: 'r',
    })).rejects.toThrow();
    expect(await store.readIndex('never')).toBeNull();
    expect(await store.listSlugs()).toEqual([]);
    await store.appendVersion({
      slug: 'demo', rawBody: H_BODY_V1, note: '首版', publishedAt: 'x', releaseId: 'r',
    });
    expect(await store.listSlugs()).toEqual(['demo']);
  });
});
