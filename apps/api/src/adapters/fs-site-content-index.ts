/**
 * 文件系统内容索引 — 读 apps/web 构建产物 content.json（已含解析好的 aiUsePolicy）。
 * 与 FsContentFileRepository 同款目录探测；mtime 缓存避免每次提交都读盘。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  SiteContentFullEntry,
  SiteContentIndexPort,
} from '../ports/site-content-index.port';

const MAX_ENTRIES = 40;
const MAX_SUMMARY_CHARS = 80;
/** 整库注入包的正文总字符硬上限（PRD：超 50 篇切索引式之前的保险丝） */
const MAX_FULL_PACK_CHARS = 60_000;

interface GeneratedItem {
  slug?: unknown;
  title?: unknown;
  summary?: unknown;
  tags?: unknown;
  visibility?: unknown;
  body?: unknown;
  aiUsePolicy?: {
    readable?: unknown;
    citable?: unknown;
  };
}

async function pickContentJsonPath(): Promise<string> {
  const fromEnv = process.env.SITE_CONTENT_JSON?.trim();
  if (fromEnv) {
    const p = path.resolve(fromEnv);
    await fs.access(p);
    return p;
  }
  const candidates = [
    path.resolve(process.cwd(), '../web/src/generated/content.json'),
    path.resolve(process.cwd(), 'apps/web/src/generated/content.json'),
    path.resolve(process.cwd(), '../../apps/web/src/generated/content.json'),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* next */
    }
  }
  throw new Error('site-content-index-unavailable');
}

export class FsSiteContentIndex implements SiteContentIndexPort {
  private cachedAtMs = 0;
  private cache: {
    slug: string;
    title: string;
    summary: string;
    tags: string[];
    actionable: boolean;
    body: string;
  }[] = [];

  private async readItems() {
    const file = await pickContentJsonPath();
    const st = await fs.stat(file);
    if (st.mtimeMs === this.cachedAtMs) return this.cache;

    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as {
      items?: unknown;
    };
    const items = Array.isArray(raw.items) ? (raw.items as GeneratedItem[]) : [];
    this.cache = items
      .filter(
        (item) =>
          typeof item.slug === 'string' &&
          item.visibility !== 'draft' &&
          item.visibility !== 'private' &&
          item.aiUsePolicy?.readable === true &&
          item.aiUsePolicy?.citable === true,
      )
      .slice(0, MAX_ENTRIES)
      .map((item) => ({
        slug: item.slug as string,
        title: typeof item.title === 'string' ? item.title : (item.slug as string),
        summary:
          typeof item.summary === 'string'
            ? item.summary.slice(0, MAX_SUMMARY_CHARS)
            : '',
        tags: Array.isArray(item.tags)
          ? item.tags.filter((t): t is string => typeof t === 'string').slice(0, 5)
          : [],
        actionable:
          (item.aiUsePolicy as { actionable?: unknown })?.actionable === true,
        body: typeof item.body === 'string' ? item.body : '',
      }));
    this.cachedAtMs = st.mtimeMs;
    return this.cache;
  }

  async loadCitable() {
    const items = await this.readItems();
    return items.map(({ body: _body, ...rest }) => rest);
  }

  async loadCitableFull() {
    const items = await this.readItems();
    // items 按日期倒序（构建产物保证）：超预算时从最旧的一端丢弃
    const out: SiteContentFullEntry[] = [];
    let used = 0;
    for (const item of items) {
      if (used + item.body.length > MAX_FULL_PACK_CHARS) break;
      out.push(item);
      used += item.body.length;
    }
    return out;
  }
}
