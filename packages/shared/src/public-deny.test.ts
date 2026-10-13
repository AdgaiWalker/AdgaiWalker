import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  parsePublicDenyList,
  projectPublicItems,
  publicManifest,
  stableJson,
  verifyPublicSnapshot,
  type PublicSnapshotSource,
} from './public-snapshot.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const source: PublicSnapshotSource[] = [
  {
    slug: 'a-article',
    title: 'A',
    updated: '2026-09-01',
    summary: '甲',
    body: '正文甲',
    tags: ['t'],
    type: 'log',
    visibility: 'public',
    published: true,
    aiUsePolicy: { readable: true, citable: true },
  },
  {
    slug: 'b-article',
    title: 'B',
    updated: '2026-09-02',
    summary: '乙',
    body: '正文乙',
    tags: [],
    type: 'log',
    visibility: 'public',
    published: true,
    aiUsePolicy: { readable: true, citable: true },
  },
];

describe('parsePublicDenyList（公开内容撤销集合）', () => {
  it('合法集合去重后通过；未知字段不撤销额外内容', () => {
    expect(parsePublicDenyList({ slugs: ['a', 'b', 'a'], extra: true })).toEqual({ slugs: ['a', 'b'] });
    expect(parsePublicDenyList({ slugs: [] })).toEqual({ slugs: [] });
  });

  it('形状不符一律 null：非对象、非数组、空串、非字符串、缺字段', () => {
    expect(parsePublicDenyList(null)).toBeNull();
    expect(parsePublicDenyList('a')).toBeNull();
    expect(parsePublicDenyList({ slugs: 'a' })).toBeNull();
    expect(parsePublicDenyList({ slugs: [''] })).toBeNull();
    expect(parsePublicDenyList({ slugs: [1] })).toBeNull();
    expect(parsePublicDenyList({})).toBeNull();
  });
});

describe('verifyPublicSnapshot（API 仓储与 agent 共用的一份纯校验）', () => {
  it('publicManifest 产物通过；改正文、换 hash、坏集合 hash 都拒绝', () => {
    const manifest = publicManifest(source, sha);
    expect(verifyPublicSnapshot(manifest, sha)).toBe(true);

    const tamperedBody = { ...manifest, items: manifest.items.map((item, i) => (i === 0 ? { ...item, body: '被改' } : item)) };
    expect(verifyPublicSnapshot(tamperedBody, sha)).toBe(false);

    const tamperedHash = { ...manifest, items: manifest.items.map((item, i) => (i === 0 ? { ...item, hash: 'f'.repeat(64) } : item)) };
    expect(verifyPublicSnapshot(tamperedHash, sha)).toBe(false);

    expect(verifyPublicSnapshot({ ...manifest, collectionHash: 'bad' }, sha)).toBe(false);
    expect(verifyPublicSnapshot({ ...manifest, buildId: 'other' }, sha)).toBe(false);
    expect(verifyPublicSnapshot(null, sha)).toBe(false);
    expect(verifyPublicSnapshot({ items: 'x' }, sha)).toBe(false);
  });

  it('校验口径与 projectPublicItems 一致（不含 hash 的正文主体参与单条 hash）', () => {
    const manifest = publicManifest(source, sha);
    const first = manifest.items[0]!;
    const { hash: itemHash, ...body } = first;
    expect(itemHash).toBe(sha(stableJson(body)));
    expect(projectPublicItems(source)[0]!.slug).toBe(first.slug);
  });
});
