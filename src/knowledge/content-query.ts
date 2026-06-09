/**
 * content-query.ts — 独立于 Astro 的内容查询引擎
 *
 * 直接读取 src/content/log/ 下的 markdown 文件，
 * 解析 frontmatter + body，提供结构化查询。
 * 供 MCP server、CLI 工具、本地脚本使用。
 * 不依赖 Astro 构建上下文。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import matter from 'gray-matter';
import { isPublicVisibility, resolveContentVisibility, type ContentVisibility } from './visibility';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedContent {
  /** 文件 slug（文件名去掉扩展名，与 Astro content collection ID 一致） */
  slug: string;
  /** 文件绝对路径 */
  filePath: string;
  /** 解析后的 frontmatter（原始键值对，不做 schema 校验） */
  frontmatter: Record<string, unknown>;
  /** Markdown 正文（frontmatter 之后的部分） */
  body: string;
}

export interface QueryFilter {
  type?: string;
  status?: string;
  domain?: string;
  intent?: string;
  form?: string;
  published?: boolean;
  series?: string;
  /** 匹配任一 tag（OR 语义） */
  tags?: string[];
  /** level 字段（学习指南：入门/学徒/专家） */
  level?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT_DIR = join(process.cwd(), 'src', 'content', 'log');
const MD_EXTENSIONS = new Set(['.md', '.mdx']);

// ---------------------------------------------------------------------------
// Internal: file scanning & parsing
// ---------------------------------------------------------------------------

function scanFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...scanFiles(full));
    } else if (MD_EXTENSIONS.has(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

function parseFile(filePath: string): ParsedContent {
  const raw = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const slug = basename(filePath).replace(/\.(md|mdx)$/, '');
  return { slug, filePath, frontmatter: data as Record<string, unknown>, body: content };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cache: ParsedContent[] | null = null;
let cachedDir: string | null = null;

function loadAll(contentDir: string = DEFAULT_CONTENT_DIR): ParsedContent[] {
  if (cache && cachedDir === contentDir) return cache;
  const files = scanFiles(contentDir);
  cache = files.map(parseFile);
  cachedDir = contentDir;
  return cache;
}

/** 写入操作后调用，清空缓存 */
export function invalidateCache(): void {
  cache = null;
  cachedDir = null;
}

// ---------------------------------------------------------------------------
// Internal: filter helper
// ---------------------------------------------------------------------------

function matches(item: ParsedContent, filter: QueryFilter): boolean {
  const fm = item.frontmatter;
  if (!isPublicParsedContent(item)) return false;
  if (filter.type !== undefined && fm.type !== filter.type) return false;
  if (filter.status !== undefined && fm.status !== filter.status) return false;
  if (filter.domain !== undefined && fm.domain !== filter.domain) return false;
  if (filter.intent !== undefined && fm.intent !== filter.intent) return false;
  if (filter.form !== undefined && fm.form !== filter.form) return false;
  if (filter.published !== undefined && fm.published !== filter.published) return false;
  if (filter.series !== undefined && fm.series !== filter.series) return false;
  if (filter.level !== undefined && fm.level !== filter.level) return false;
  if (filter.tags && filter.tags.length > 0) {
    const itemTags: string[] = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
    if (!filter.tags.some(t => itemTags.includes(t))) return false;
  }
  return true;
}

export function getParsedVisibility(item: ParsedContent): ContentVisibility {
  return resolveContentVisibility(item.frontmatter);
}

export function isPublicParsedContent(item: ParsedContent): boolean {
  return isPublicVisibility(item.frontmatter);
}

/** 按 frontmatter.date 降序排列 */
function sortByDate(items: ParsedContent[]): ParsedContent[] {
  return items.sort((a, b) => {
    const da = a.frontmatter.date as Date | undefined;
    const db = b.frontmatter.date as Date | undefined;
    return (db?.getTime?.() ?? 0) - (da?.getTime?.() ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Public query API
// ---------------------------------------------------------------------------

/** 获取全部内容（按日期降序） */
export function getAll(contentDir?: string): ParsedContent[] {
  return sortByDate(loadAll(contentDir).filter(isPublicParsedContent));
}

/** 按 slug 查找单条内容 */
export function findBySlug(slug: string, contentDir?: string): ParsedContent | undefined {
  return loadAll(contentDir).find(item => item.slug === slug && isPublicParsedContent(item));
}

/** 多条件过滤查询 */
export function query(filter: QueryFilter, contentDir?: string): ParsedContent[] {
  return sortByDate(loadAll(contentDir).filter(item => matches(item, filter)));
}

/** 全文搜索（标题 + 摘要 + 正文，大小写不敏感） */
export function search(text: string, contentDir?: string): ParsedContent[] {
  const lower = text.toLowerCase();
  return sortByDate(
    loadAll(contentDir).filter(item => {
      if (!isPublicParsedContent(item)) return false;
      const title = String(item.frontmatter.title ?? '').toLowerCase();
      const summary = String(item.frontmatter.summary ?? '').toLowerCase();
      return (
        title.includes(lower) ||
        summary.includes(lower) ||
        item.body.toLowerCase().includes(lower)
      );
    }),
  );
}

/** 统计各 type 的数量 */
export function countByType(contentDir?: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of loadAll(contentDir).filter(isPublicParsedContent)) {
    const type = String(item.frontmatter.type ?? 'unknown');
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}
