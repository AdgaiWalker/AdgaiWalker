import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publicManifest, type PublicSnapshotSource } from '@walker/shared';
import { FsPublicSnapshotRepository } from './fs-public-snapshot.repository';
import { FsSiteContentIndex } from './fs-site-content-index';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function source(): PublicSnapshotSource[] {
  return [
    {
      slug: 'keep-me',
      title: '保留',
      updated: '2026-09-01',
      summary: '保留摘要',
      body: '保留正文',
      tags: ['t'],
      type: 'log',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: true, citable: true },
    },
    {
      slug: 'revoke-me',
      title: '撤销',
      updated: '2026-09-02',
      summary: '撤销摘要',
      body: '撤销正文',
      tags: [],
      type: 'log',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: true, citable: true },
    },
    {
      slug: 'not-readable',
      title: '不可读',
      updated: '2026-09-03',
      summary: '不可读摘要',
      body: '不可读正文',
      tags: [],
      type: 'log',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: false, citable: false },
    },
  ];
}

describe('FsSiteContentIndex 公开内容撤销（deny.json）', () => {
  let root = '';
  const saved = process.env.WALKER_PUBLIC_SNAPSHOT_DIR;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-snap-'));
    process.env.WALKER_PUBLIC_SNAPSHOT_DIR = root;
    await new FsPublicSnapshotRepository(root).publish(publicManifest(source(), sha));
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.WALKER_PUBLIC_SNAPSHOT_DIR;
    else process.env.WALKER_PUBLIC_SNAPSHOT_DIR = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('无 deny.json 时索引照常；被撤销的 slug 立即从索引消失且不影响其他条目', async () => {
    const index = new FsSiteContentIndex();
    const before = await index.loadCitable();
    expect(before.map((item) => item.slug).sort()).toEqual(['keep-me', 'revoke-me']);

    fs.writeFileSync(path.join(root, 'deny.json'), JSON.stringify({ slugs: ['revoke-me'] }));
    const after = await index.loadCitable();
    expect(after.map((item) => item.slug)).toEqual(['keep-me']);

    const full = await index.loadCitableFull();
    expect(full.map((item) => item.slug)).toEqual(['keep-me']);
  });

  it('deny.json 损坏 fail-closed：全部视为撤销，索引为空', async () => {
    const index = new FsSiteContentIndex();
    expect((await index.loadCitable()).length).toBe(2);

    fs.writeFileSync(path.join(root, 'deny.json'), '{ not valid json');
    expect(await index.loadCitable()).toEqual([]);
    expect(await index.loadCitableFull()).toEqual([]);

    fs.writeFileSync(path.join(root, 'deny.json'), JSON.stringify({ slugs: [1] }));
    expect(await index.loadCitable()).toEqual([]);
  });

  it('撤销后恢复：删除 deny.json 下一问即回到完整索引', async () => {
    const index = new FsSiteContentIndex();
    fs.writeFileSync(path.join(root, 'deny.json'), JSON.stringify({ slugs: ['revoke-me'] }));
    expect((await index.loadCitable()).length).toBe(1);

    fs.rmSync(path.join(root, 'deny.json'));
    expect((await index.loadCitable()).length).toBe(2);
  });

  it('readable=false 的条目本来就不进索引，与撤销无关', async () => {
    const index = new FsSiteContentIndex();
    const items = await index.loadCitable();
    expect(items.some((item) => item.slug === 'not-readable')).toBe(false);
  });
});
