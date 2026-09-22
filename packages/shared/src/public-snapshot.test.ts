import { describe, expect, it } from 'vitest';
import { publicManifest, type PublicSnapshotSource } from './public-snapshot';

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
});
