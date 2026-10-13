import { resolveVisibility } from './content.js';

export type PublicSnapshotSource = {
  slug: string;
  title: string;
  updated: string;
  summary: string;
  body: string;
  tags?: readonly string[];
  type: string;
  visibility: string;
  published: boolean;
  aiUsePolicy?: { readable?: boolean; citable?: boolean };
};

export type PublicSnapshotItem = {
  slug: string;
  title: string;
  updated: string;
  summary: string;
  body: string;
  tags: string[];
  type: string;
  readable: boolean;
  citable: boolean;
};

/** 旧 Astro/MDX 展示组件降级为标准 Markdown；构建与 API 版本证明共用这一份规则。 */
export function normalizeLegacyBody(body: string): string {
  return body
    .split('\n')
    .flatMap((line) => {
      const t = line.trim();
      if (t.startsWith('import ') && (/\.astro['"]\s*;?\s*$/.test(t) || (/from\s+['"]@\/components\//.test(t) && t.includes('astro')))) {
        return [];
      }
      if (t.startsWith('<BlockCallout ')) return [`> **${inlineAttr(t, 'title') || '提示'}**`];
      if (t === '</BlockCallout>') return [];
      if (t.startsWith('<BlockVideo ')) {
        const bvid = inlineAttr(t, 'bvid');
        return bvid ? [`[哔哩哔哩视频：${bvid}](https://www.bilibili.com/video/${bvid})`] : [];
      }
      if (t.startsWith('<BlockResource ')) {
        const href = inlineAttr(t, 'href');
        const title = inlineAttr(t, 'title') || '延伸资源';
        const description = inlineAttr(t, 'description');
        return href ? [`[${title}](${href})${description ? ` — ${description}` : ''}`] : [];
      }
      if (t.startsWith('<BlockStep ')) {
        const n = inlineAttr(t, 'n');
        const title = inlineAttr(t, 'title') || '步骤';
        return [`### ${n ? `${n}. ` : ''}${title}`];
      }
      if (t === '</BlockStep>') return [];
      if (t.startsWith('<BlockPrompt ')) return [`### ${inlineAttr(t, 'title') || '提示词'}`, '', '```text'];
      if (t === '</BlockPrompt>') return ['```'];
      return [line];
    })
    .join('\n')
    .replace(/^\s*\n+/, '')
    .trim();
}

function inlineAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}=(['"])(.*?)\\1`));
  return match?.[2]?.trim() ?? '';
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 正本 frontmatter + body → 公开快照来源（构建与 API 版本证明的唯一映射规则）。
 * 线上 content-hash 与 public-manifest.json 条目 hash 都由本函数产出的对象再哈希而来；
 * 任何一处另写一份映射，都会让线上核验永远对不上已经批准的正本版本。
 */
export function toPublicSnapshotSource(input: {
  slug: string;
  data: Record<string, unknown>;
  body: string;
}): PublicSnapshotSource {
  const { slug, data } = input;
  const visibility = resolveVisibility(data);
  const policy = data.aiUsePolicy && typeof data.aiUsePolicy === 'object' ? (data.aiUsePolicy as Record<string, unknown>) : {};
  return {
    slug,
    title: typeof data.title === 'string' ? data.title : slug,
    updated: asDateString(data.updated) || asDateString(data.date),
    summary: String(data.summary || data.description || ''),
    body: normalizeLegacyBody(input.body),
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : [],
    type: String(data.type || 'knowledge'),
    visibility,
    published: visibility === 'public',
    aiUsePolicy: { readable: policy.readable === true, citable: policy.citable === true },
  };
}

/** 单篇公开条目 hash：线上 content-hash / manifest item hash 的同一口径。 */
export function publicItemHash(source: PublicSnapshotSource, hash: (text: string) => string): string {
  const projected = projectPublicItems([source])[0];
  if (!projected) throw new Error('public-item-not-public');
  return hash(stableJson(projected));
}

export function projectPublicItems(items: readonly PublicSnapshotSource[]): PublicSnapshotItem[] {
  return items
    .filter((item) => item.visibility === 'public' && item.published)
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      updated: item.updated,
      summary: item.summary,
      body: item.body,
      tags: [...(item.tags ?? [])].sort(),
      type: item.type,
      readable: item.aiUsePolicy?.readable === true,
      citable: item.aiUsePolicy?.citable === true,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function publicManifest(items: readonly PublicSnapshotSource[], hash: (text: string) => string) {
  const projected = projectPublicItems(items).map((item) => ({ ...item, hash: hash(stableJson(item)) }));
  const collectionHash = hash(stableJson(projected.map((item) => ({ hash: item.hash, slug: item.slug }))));
  return { buildId: collectionHash, collectionHash, items: projected };
}

/** 已核验快照的形状（hash 字段齐全的 manifest）。 */
export type PublicSnapshotManifest = ReturnType<typeof publicManifest>;

function isValidSnapshotItem(item: unknown): item is PublicSnapshotItem & { hash: string } {
  if (!item || typeof item !== 'object') return false;
  const c = item as Record<string, unknown>;
  return (
    typeof c.hash === 'string' &&
    c.hash.length > 0 &&
    typeof c.slug === 'string' &&
    c.slug.length > 0 &&
    typeof c.title === 'string' &&
    typeof c.updated === 'string' &&
    typeof c.summary === 'string' &&
    typeof c.body === 'string' &&
    Array.isArray(c.tags) &&
    c.tags.every((t) => typeof t === 'string') &&
    typeof c.type === 'string' &&
    typeof c.readable === 'boolean' &&
    typeof c.citable === 'boolean'
  );
}

/** 纯校验：逐条 hash、集合 hash 与 buildId 三处一致才算可信快照。API 仓储与 agent 共用这一份。 */
export function verifyPublicSnapshot(snapshot: unknown, hash: (text: string) => string): snapshot is PublicSnapshotManifest {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const candidate = snapshot as { items?: unknown; collectionHash?: unknown; buildId?: unknown };
  if (!Array.isArray(candidate.items) || typeof candidate.collectionHash !== 'string') return false;
  const items = candidate.items;
  for (const item of items) {
    if (!isValidSnapshotItem(item)) return false;
    const { hash: itemHash, ...body } = item;
    if (itemHash !== hash(stableJson(body))) return false;
  }
  const typedItems = items as Array<PublicSnapshotItem & { hash: string }>;
  const collectionHash = hash(stableJson(typedItems.map((item) => ({ hash: item.hash, slug: item.slug }))));
  return candidate.collectionHash === collectionHash && candidate.buildId === collectionHash;
}

/** 公开内容撤销集合：撤销信息存放在快照目录根的 deny.json，不改动不可变快照本体。 */
export type PublicDenyList = { slugs: string[] };

/** 严格解析 deny.json 内容；任何形状不符返回 null，由调用方按 fail-closed 决定（一律视为全部撤销）。 */
export function parsePublicDenyList(value: unknown): PublicDenyList | null {
  if (!value || typeof value !== 'object') return null;
  const slugs = (value as { slugs?: unknown }).slugs;
  if (!Array.isArray(slugs)) return null;
  if (!slugs.every((slug) => typeof slug === 'string' && slug.length > 0)) return null;
  return { slugs: [...new Set(slugs as string[])] };
}
