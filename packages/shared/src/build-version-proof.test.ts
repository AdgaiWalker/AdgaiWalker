import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicItemHash, publicManifest, toPublicSnapshotSource, type PublicSnapshotSource } from './public-snapshot.js';
import { buildKnowledgeGraph } from './graph.js';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('构建期与 API 期的版本身份一致性（防止两套投影规则漂移）', () => {
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

  it('真实正本经由共享投影规则复现构建产物中的 content-hash 与 manifest 条目 hash', () => {
    const manifestPath = path.resolve(process.cwd(), 'apps/web/src/generated/public-manifest.json');
    const contentDir = path.resolve(process.cwd(), 'content/log');
    if (!fs.existsSync(manifestPath) || !fs.existsSync(contentDir)) return;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      items: Array<{ slug: string; hash: string }>;
    };
    // 逐篇核对：正本 → 共享投影 → 必须等于构建 manifest 中该篇的 hash
    let checked = 0;
    for (const file of fs.readdirSync(contentDir)) {
      if (!/\.(md|mdx)$/i.test(file)) continue;
      const slug = file.replace(/\.(md|mdx)$/i, '');
      const item = manifest.items.find((candidate) => candidate.slug === slug);
      if (!item) continue;
      const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
      const fmEnd = raw.indexOf('\n---', 4);
      if (!raw.startsWith('---') || fmEnd < 0) continue;
      const body = raw.slice(raw.indexOf('\n', fmEnd + 4) + 1);
      const data = parseFrontmatterLite(raw.slice(4, fmEnd));
      const source = toPublicSnapshotSource({ slug, data, body });
      expect(publicItemHash(source, sha256)).toBe(item.hash);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

/** 只解析本测试用到的 frontmatter 标量/内联数组，避免共享包引入 YAML 依赖。 */
function parseFrontmatterLite(block: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let nestedKey: string | null = null;
  for (const line of block.split('\n')) {
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top && !line.startsWith(' ')) {
      const [, key, rawValue] = top;
      const value = rawValue.trim().replace(/^["']|["']$/g, '');
      if (value === '') {
        nestedKey = key;
        data[key] = {};
      } else if (value.startsWith('[')) {
        data[key] = value.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        nestedKey = null;
      } else {
        data[key] = value;
        nestedKey = null;
      }
      continue;
    }
    const nested = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.*)$/);
    if (nested && nestedKey) {
      (data[nestedKey] as Record<string, unknown>)[nested[1]] = nested[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return data;
}

describe('C15 将版本证明写入网页构建', () => {
  it('同标题改正文能确切区分版本（内容 hash 基于纯内容，而非基于标题）', () => {
    const docV1: PublicSnapshotSource = {
      slug: 'same-title-article',
      title: '同一文章标题',
      updated: '2026-09-25T00:00:00.000Z',
      summary: '摘要内容',
      body: '# 第一版正文内容\n这是初始版本。',
      type: 'knowledge',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: true, citable: true },
    };

    const docV2: PublicSnapshotSource = {
      ...docV1,
      body: '# 第二版正文内容\n修改了正文论述。',
    };

    const manifestV1 = publicManifest([docV1], sha256);
    const manifestV2 = publicManifest([docV2], sha256);

    const hashV1 = manifestV1.items[0]?.hash;
    const hashV2 = manifestV2.items[0]?.hash;

    expect(hashV1).toBeDefined();
    expect(hashV2).toBeDefined();
    // 核心断言：同标题但在不同正文下，产生不同的内容版本 hash
    expect(hashV1).not.toBe(hashV2);
    expect(manifestV1.collectionHash).not.toBe(manifestV2.collectionHash);
  });

  it('公开图谱规则不分叉：与 content manifest 共用同一份条目数据生成节点与边', () => {
    const docA: PublicSnapshotSource = {
      slug: 'post-alpha',
      title: 'Alpha 文档',
      updated: '2026-09-25T00:00:00.000Z',
      summary: 'Alpha 摘要',
      body: '引用自 [[post-beta|Beta 文档]]。',
      type: 'knowledge',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: true, citable: true },
    };

    const docB: PublicSnapshotSource = {
      slug: 'post-beta',
      title: 'Beta 文档',
      updated: '2026-09-25T00:00:00.000Z',
      summary: 'Beta 摘要',
      body: '被引用正文。',
      type: 'knowledge',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: true, citable: true },
    };

    const manifest = publicManifest([docA, docB], sha256);
    expect(manifest.items.length).toBe(2);

    const graph = buildKnowledgeGraph({
      items: [
        { ...docA, date: '2026-09-25', author: 'Dora', created: '2026-09-25', tags: [], series: '', seriesOrder: null, related: [], version: null, previousVersion: '', resources: [] },
        { ...docB, date: '2026-09-25', author: 'Dora', created: '2026-09-25', tags: [], series: '', seriesOrder: null, related: [], version: null, previousVersion: '', resources: [] },
      ],
      attachments: [],
      browsePath: '/posts',
      now: new Date().toISOString(),
    });

    const nodeSlugs = graph.nodes.filter((n) => n.kind === 'note').map((n) => n.slug);
    expect(nodeSlugs).toContain('post-alpha');
    expect(nodeSlugs).toContain('post-beta');
    expect(graph.edges.some((e) => e.source === 'note:post-alpha' && e.target === 'note:post-beta')).toBe(true);
  });

  it('验证构建产物中的文章 HTML 带有 content-hash meta 标签与 data 属性版本证明', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const distManifest = path.join(repoRoot, 'apps/web/dist/public-manifest.json');
    if (!fs.existsSync(distManifest)) {
      return; // dist not built yet in pure unit test mode
    }

    const raw = fs.readFileSync(distManifest, 'utf8');
    const manifest = JSON.parse(raw);
    expect(manifest.buildId).toBeDefined();
    expect(manifest.collectionHash).toBeDefined();
    expect(Array.isArray(manifest.items)).toBe(true);

    if (manifest.items.length > 0) {
      const first = manifest.items[0];
      const htmlPath = path.join(repoRoot, `apps/web/dist/posts/${first.slug}.html`);
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf8');
        expect(html).toContain(`<meta name="content-hash" content="${first.hash}" />`);
        expect(html).toContain(`data-content-hash="${first.hash}"`);
        expect(html).toContain('<meta name="build-id"');
      }
    }
  });
});
