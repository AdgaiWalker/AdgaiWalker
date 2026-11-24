/**
 * 内容导入 / 导出（`导`）与受控删除协议（唯一共享类型 + 纯校验函数）。
 * 浏览器与 Node 通用，不绑定具体加密实现（由调用方注入 sha256）。
 */
export const CONTENT_BUNDLE_FORMAT = 'walker-content-bundle/v1' as const;
export const MAX_CONTENT_IMPORT_ITEMS = 200;

export type ContentBundleSha256 = (text: string) => string;

export interface ContentBundleItem {
  slug: string;
  ext: '.md' | '.mdx';
  sha256: string;
  updatedAt: string;
  raw: string;
}

export interface ContentBundle {
  format: typeof CONTENT_BUNDLE_FORMAT;
  exportedAt: string;
  count: number;
  bundleHash: string;
  items: ContentBundleItem[];
}

export type ContentDeleteMode = 'auto' | 'local-draft' | 'discard-draft' | 'remote';

export interface ContentDeleteResult {
  ok: boolean;
  slug: string;
  scope: 'local-draft' | 'discard-draft' | 'remote';
  commit?: string | null;
  message: string;
}

export type ContentImportConflictPolicy = 'skip' | 'overwrite';

export interface ContentImportItemInput {
  slug: string;
  raw: string;
}

export interface ContentImportRequest {
  items: ContentImportItemInput[];
  conflictPolicy?: ContentImportConflictPolicy;
  dryRun?: boolean;
  /** 若提供完整 bundleHash，服务端先校验包内逐条 sha256 与整包哈希一致。 */
  bundleHash?: string;
}

export type ContentImportItemStatus = 'create' | 'update' | 'unchanged' | 'skip' | 'error';

export interface ContentImportItemResult {
  slug: string;
  status: ContentImportItemStatus;
  hash?: string;
  message?: string;
}

export interface ContentImportResult {
  ok: boolean;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  items: ContentImportItemResult[];
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const normalizeLf = (s: string) => s.replace(/\r\n?/g, '\n');

export function computeBundleDigest(
  items: ReadonlyArray<Pick<ContentBundleItem, 'slug' | 'sha256'>>,
  exportedAt: string,
  sha: ContentBundleSha256,
): string {
  const canonical = JSON.stringify({
    format: CONTENT_BUNDLE_FORMAT,
    exportedAt,
    items: items.map((i) => [i.slug, i.sha256]),
  });
  return sha(canonical);
}

export function buildContentBundle(
  entries: ReadonlyArray<{ slug: string; ext?: '.md' | '.mdx'; raw: string; updatedAt?: string }>,
  sha: ContentBundleSha256,
  exportedAt = new Date().toISOString(),
): ContentBundle {
  const items: ContentBundleItem[] = [...entries]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((e) => {
      const raw = normalizeLf(e.raw);
      return {
        slug: e.slug,
        ext: e.ext === '.mdx' ? '.mdx' : '.md',
        sha256: sha(raw),
        updatedAt: e.updatedAt ?? exportedAt,
        raw,
      };
    });
  return {
    format: CONTENT_BUNDLE_FORMAT,
    exportedAt,
    count: items.length,
    bundleHash: computeBundleDigest(items, exportedAt, sha),
    items,
  };
}

export function verifyContentBundle(
  input: unknown,
  sha: ContentBundleSha256,
): { ok: true; bundle: ContentBundle } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '内容包格式无效：必须是 JSON 对象' };
  }
  const b = input as Partial<ContentBundle>;
  if (b.format !== CONTENT_BUNDLE_FORMAT) {
    return { ok: false, error: `不支持的内容包格式：${String(b.format ?? 'unknown')}` };
  }
  if (typeof b.exportedAt !== 'string' || !b.exportedAt || !Array.isArray(b.items) || b.count !== b.items.length) {
    return { ok: false, error: '内容包元数据或条目数量不一致' };
  }
  if (b.items.length > MAX_CONTENT_IMPORT_ITEMS) {
    return { ok: false, error: `单次最多导入 ${MAX_CONTENT_IMPORT_ITEMS} 篇文章` };
  }
  for (const item of b.items) {
    if (!item || typeof item !== 'object' || !SLUG_RE.test(String(item.slug)) || typeof item.raw !== 'string') {
      return { ok: false, error: `内容包条目非法：${String(item?.slug ?? 'unknown')}` };
    }
    const raw = normalizeLf(item.raw);
    if (!raw.trimStart().startsWith('---')) {
      return { ok: false, error: `文章 ${item.slug} 缺少 YAML frontmatter` };
    }
    if (sha(raw) !== item.sha256) {
      return { ok: false, error: `文章 ${item.slug} 内容哈希校验失败（可能已被篡改）` };
    }
  }
  const sorted = [...b.items].sort((a, z) => a.slug.localeCompare(z.slug));
  const expected = computeBundleDigest(sorted, b.exportedAt, sha);
  if (b.bundleHash !== expected) {
    return { ok: false, error: '内容包整包摘要校验失败（bundleHash 不匹配）' };
  }
  return { ok: true, bundle: b as ContentBundle };
}
