/**
 * 文章版本历史（公开演进史）契约 —— 唯一真相源。
 *
 * 规则（skill article-version-history 准出纪律）：
 * - 发布即版本：只有「发布确证 PUBLISHED」才产生一条版本；草稿可反复重写，不留痕。
 * - 只追加：版本永不改写、永不删除；回退 = 新增一条内容同旧版的新版本。
 * - 内容寻址：正文按 sha256 命名，相同内容全站只存一份。
 * - 「为什么」必填：变更说明为空即拒绝。
 * - 公开纪律：每版一个稳定 URL；版本页 canonical 指向当前版；公开的是构建期静态页。
 * - 双区物理独立：草稿区 = content/log（可改）；公开区 = content/versions（只追加、无删除路径）。
 */

/** 版本库存储根（相对仓库根）：公开区，只追加，进 Git，随构建投影为静态页 */
export const ARTICLE_VERSIONS_DIR = 'content/versions';

/** 版本号：单调递增正整数，从 1 开始 */
export type ArticleVersionNumber = number;

/** 一条已发布版本（不可变事实） */
export interface ArticleVersion {
  /** 版本号：该 slug 内单调递增，从 1 开始 */
  version: ArticleVersionNumber;
  /** 正文内容寻址哈希（sha256，对应 blob 文件名 <hash>.md） */
  contentHash: string;
  /** 变更说明（必填，「为什么」） */
  note: string;
  /** 发布确证时间 ISO 字符串 */
  publishedAt: string;
  /** 来源发布单 id（可追溯，软引用不设外键） */
  releaseId: string;
}

/** 单篇文章的版本索引（<slug>/index.json 的内容） */
export interface ArticleVersionIndex {
  slug: string;
  /** 升序排列：index[0] 是 v1 */
  versions: ArticleVersion[];
}

/** 版本页对读者的永久保留承诺文案（准出第 8 条：单点定义，禁止各处抄） */
export const ARTICLE_VERSION_PERMANENCE_NOTE =
  '本版本已永久保留（不可修改、不可删除）；如日后下架会在此说明。';

/** 历史版本页顶部提示文案（指向当前版） */
export const ARTICLE_VERSION_OUTDATED_NOTE =
  '这是历史版本，内容可能已过时；当前版本见文末链接。';

/**
 * 文章页版本短标签（准出第 9 条：读者先知情）。
 *
 * 站主要求入口常驻：**只要该文有过公开版本就给一个极短的可点标签**，
 * 读者永远能找到「版本历史」这个面。文案按版本数分档，绝不铺开：
 * - 无公开版本 → null（无历史可看，不出链接）
 * - 1 版        → 「版本」（首版即当前版，不谎称「已更新」）
 * - ≥2 版       → 「已更新 N 次」（N = 版本数 − 1）
 * 日期一律留给历史页，避免文章页同一行出现两种日期格式。
 */
export function articleHistoryLabel(versionCount: number): string | null {
  if (!Number.isInteger(versionCount) || versionCount < 1) return null;
  if (versionCount === 1) return '版本';
  return '已更新 ' + (versionCount - 1) + ' 次';
}

/** 历史版本页顶部摘要（同一天的首版与最新只说一次，不重复念） */
export function articleHistorySummary(input: {
  count: number;
  firstPublishedAt: string;
  latestPublishedAt: string;
}): string {
  const first = input.firstPublishedAt.slice(0, 10);
  const latest = input.latestPublishedAt.slice(0, 10);
  const span = first === latest ? '首末同为 ' + first : '首版 ' + first + ' · 最新 ' + latest;
  return '本文公开过 ' + input.count + ' 个版本 · ' + span;
}

/** 版本页稳定 URL 路径（站内相对路径，无域名） */
export function articleVersionPath(slug: string, version: ArticleVersionNumber): string {
  return '/posts/' + encodeURIComponent(slug) + '/v/' + version;
}

/** 版本列表页路径 */
export function articleVersionListPath(slug: string): string {
  return '/posts/' + encodeURIComponent(slug) + '/history';
}

/** 当前版（文章详情页）路径 —— 版本页 canonical 指向它 */
export function articleCurrentPath(slug: string): string {
  return '/posts/' + encodeURIComponent(slug);
}

/** 剥掉原始 md 的 YAML frontmatter 块（三处共用一个正则：发布预检 / 预渲染 / 版本页） */
export function stripFrontmatterBlock(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\r?\n?/, '');
}

// ---------- 纯函数守卫 ----------

const SHA256_RE = /^[0-9a-f]{64}$/;

export function isArticleVersionNumber(value: unknown): value is ArticleVersionNumber {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

export function isArticleVersion(value: unknown): value is ArticleVersion {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    isArticleVersionNumber(v.version) &&
    typeof v.contentHash === 'string' &&
    SHA256_RE.test(v.contentHash) &&
    typeof v.note === 'string' &&
    v.note.trim().length > 0 &&
    typeof v.publishedAt === 'string' &&
    v.publishedAt.length > 0 &&
    typeof v.releaseId === 'string' &&
    v.releaseId.length > 0
  );
}

export function isArticleVersionIndex(value: unknown): value is ArticleVersionIndex {
  if (!value || typeof value !== 'object') return false;
  const idx = value as Record<string, unknown>;
  if (typeof idx.slug !== 'string' || idx.slug.length === 0) return false;
  if (!Array.isArray(idx.versions)) return false;
  return (idx.versions as unknown[]).every(isArticleVersion);
}

/** 变更说明必填校验（准出第 3 条）：返回 trim 后的说明，空则抛错 */
export function requireVersionNote(note: unknown): string {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  if (!trimmed) {
    throw new Error('version-note-required');
  }
  return trimmed;
}

/**
 * 追加新版本的纯函数（只追加 + 版本号单调 + 内容相同不建版本）。
 * @returns 新索引；内容与最新版相同则返回 null（不建版本）
 */
export function appendArticleVersion(
  index: ArticleVersionIndex,
  input: { contentHash: string; note: string; publishedAt: string; releaseId: string },
): ArticleVersionIndex | null {
  const note = requireVersionNote(input.note);
  if (!SHA256_RE.test(input.contentHash)) throw new Error('version-content-hash-invalid');
  const latest = index.versions[index.versions.length - 1];
  if (latest && latest.contentHash === input.contentHash) return null;
  const next: ArticleVersion = {
    version: latest ? latest.version + 1 : 1,
    contentHash: input.contentHash,
    note,
    publishedAt: input.publishedAt,
    releaseId: input.releaseId,
  };
  return { slug: index.slug, versions: [...index.versions, next] };
}

/**
 * 校验版本索引不变量（verify 用）：版本号从 1 起严格递增、说明非空、哈希合法。
 * @returns 违规描述列表，空数组即通过
 */
export function verifyArticleVersionIndex(index: ArticleVersionIndex): string[] {
  const problems: string[] = [];
  index.versions.forEach((v, i) => {
    if (v.version !== i + 1) problems.push('v' + v.version + ' 序号应连续（位置 ' + (i + 1) + '）');
    if (!v.note.trim()) problems.push('v' + v.version + ' 变更说明为空');
    if (!SHA256_RE.test(v.contentHash)) problems.push('v' + v.version + ' 内容哈希非法');
    if (i > 0 && v.contentHash === index.versions[i - 1]!.contentHash) {
      problems.push('v' + v.version + ' 与上一版内容相同，不应建版本');
    }
  });
  return problems;
}
