import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  publicItemHash,
  publicManifest,
  toPublicSnapshotSource,
  verifyPublicSnapshot,
  parsePublicDenyList,
  type PublicSnapshotSource,
} from './public-snapshot';

const hash = (text: string) => `h:${text.length}:${text.slice(0, 12)}`;
const article = (patch: Partial<PublicSnapshotSource> = {}): PublicSnapshotSource => ({
  slug: 'post', title: '标题', updated: '2026-09-22', summary: '摘要', body: '正文', tags: ['b', 'a'],
  type: 'knowledge', visibility: 'public', published: true, aiUsePolicy: { readable: true, citable: true }, ...patch,
});

describe('公开快照', () => {
  it('相同输入产物相同，改正文后 hash 变化，草稿和密钥不进入清单', () => {
    const secret = 'sk-should-not-appear';
    const input = [
      article(),
      article({ slug: 'draft', visibility: 'draft', published: false, body: secret }),
      { ...article({ slug: 'leaky' }), apiKey: secret, health: { secret } } as PublicSnapshotSource,
    ];
    const first = publicManifest(input, hash);
    const second = publicManifest([...input].reverse(), hash);
    expect(second).toEqual(first);
    expect(first.items.map((item) => item.slug)).toEqual(['leaky', 'post']);
    expect(JSON.stringify(first)).not.toContain(secret);
    expect(JSON.stringify(first)).not.toContain('health');
    const changed = publicManifest([article({ body: '另一版正文' }), input[2]], hash);
    expect(changed.items.find((item) => item.slug === 'post')?.hash).not.toBe(first.items.find((item) => item.slug === 'post')?.hash);
    expect(changed.collectionHash).not.toBe(first.collectionHash);
  });

  describe('verifyPublicSnapshot', () => {
    it('合法快照返回 true', () => {
      const manifest = publicManifest([article()], hash);
      expect(verifyPublicSnapshot(manifest, hash)).toBe(true);
    });

    it('正文被篡改导致 item.hash 不匹配时返回 false', () => {
      const manifest = publicManifest([article()], hash);
      const tampered = {
        ...manifest,
        items: [{ ...manifest.items[0], body: '篡改后的正文' }],
      };
      expect(verifyPublicSnapshot(tampered, hash)).toBe(false);
    });

    it('collectionHash 或 buildId 被篡改时返回 false', () => {
      const manifest = publicManifest([article()], hash);
      expect(verifyPublicSnapshot({ ...manifest, collectionHash: 'fake-hash' }, hash)).toBe(false);
      expect(verifyPublicSnapshot({ ...manifest, buildId: 'different-id' }, hash)).toBe(false);
    });

    it('item 缺少必须字段（如 slug）时返回 false', () => {
      const invalid = {
        buildId: 'h:2:{}',
        collectionHash: 'h:2:{}',
        items: [{ hash: hash('{}') }],
      };
      expect(verifyPublicSnapshot(invalid, hash)).toBe(false);
    });

    it('输入非对象或非数组 items 时返回 false', () => {
      expect(verifyPublicSnapshot(null, hash)).toBe(false);
      expect(verifyPublicSnapshot({ items: 'not-an-array' }, hash)).toBe(false);
    });
  });

  describe('parsePublicDenyList', () => {
    it('正确解析合法 slugs 并自动去重', () => {
      expect(parsePublicDenyList({ slugs: ['post-a', 'post-b', 'post-a'] })).toEqual({
        slugs: ['post-a', 'post-b'],
      });
    });

    it('遇到 null、非对象或缺少 slugs 数组时返回 null', () => {
      expect(parsePublicDenyList(null)).toBeNull();
      expect(parsePublicDenyList({})).toBeNull();
      expect(parsePublicDenyList({ slugs: 'invalid' })).toBeNull();
    });

    it('遇到含非字符串或空字符串时 fail-closed 返回 null', () => {
      expect(parsePublicDenyList({ slugs: ['valid', 123] })).toBeNull();
      expect(parsePublicDenyList({ slugs: ['valid', ''] })).toBeNull();
    });
  });
});

describe('版本证明身份唯一性（C16/C17 与 C12/C14 的接缝）', () => {
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');

  it('公开投影 hash 与文件内容 hash 是两个命名空间，且投影 hash 可复现', () => {
    const source = toPublicSnapshotSource({
      slug: 'identity-post',
      data: { title: '身份测试', type: 'knowledge', updated: '2026-09-26', summary: '摘要', aiUsePolicy: { readable: true, citable: true } },
      body: '# 正文\n\n内容',
    });
    const projectionHash = publicItemHash(source, hash);
    const fileHash = hash('---\ntitle: 身份测试\n---\n# 正文\n\n内容');

    // 线上 content-hash / manifest 条目 hash 走投影命名空间；文件 hash 用于 CAS，
    // 二者不同，任何一处误用都会让线上核验永远对不上。
    expect(projectionHash).not.toBe(fileHash);
    expect(projectionHash).toBe(publicManifest([source], hash).items[0]!.hash);
    // 同输入必须稳定复现（构建期与 API 期产出同一身份）
    expect(publicItemHash(toPublicSnapshotSource({ slug: 'identity-post', data: { title: '身份测试', type: 'knowledge', updated: '2026-09-26', summary: '摘要', aiUsePolicy: { readable: true, citable: true } }, body: '# 正文\n\n内容' }), hash)).toBe(projectionHash);
  });

  it('改正文但标题相同时投影 hash 必须变化', () => {
    const base = { slug: 'same-title', data: { title: '同标题', type: 'knowledge', updated: '2026-09-26', summary: '摘要' } };
    const before = publicItemHash(toPublicSnapshotSource({ ...base, body: '第一版正文' }), hash);
    const after = publicItemHash(toPublicSnapshotSource({ ...base, body: '第二版正文' }), hash);
    expect(after).not.toBe(before);
  });
});
