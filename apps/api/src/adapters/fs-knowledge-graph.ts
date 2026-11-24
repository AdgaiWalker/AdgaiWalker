/**
 * 文件系统知识图谱 — 直接从 content/log 正本读取并用 shared 纯函数建图（唯一路径，不依赖 generated/content.json）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import {
  buildKnowledgeGraph,
  normalizeLegacyBody,
  normalizeLf,
  resolveVisibility,
  type GraphSourceItem,
  type KnowledgeGraph,
} from '@walker/shared';
import type { KnowledgeGraphPort } from '../ports/knowledge-graph.port';
import { resolveContentLogDir } from './content-log-dir';

const asString = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v.trim() : '');
const asOrder = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export class FsKnowledgeGraph implements KnowledgeGraphPort {
  private cacheKey = '';
  private cache: KnowledgeGraph | null = null;

  async load(): Promise<KnowledgeGraph> {
    let dir: string;
    try { dir = await resolveContentLogDir(); } catch { throw new Error('knowledge-graph-unavailable'); }

    const names = (await fs.readdir(dir)).sort();
    const parts: string[] = [dir];
    const mdFiles: string[] = [];
    const attachments: string[] = [];

    for (const name of names) {
      if (name.startsWith('.')) continue;
      const stat = await fs.stat(path.join(dir, name)).catch(() => null);
      if (!stat?.isFile()) continue;
      parts.push(`${name}:${stat.mtimeMs}:${stat.size}`);
      if (/\.(md|mdx)$/i.test(name)) mdFiles.push(name);
      else attachments.push(name);
    }

    const key = parts.join('|');
    if (this.cache && this.cacheKey === key) return this.cache;

    const items: GraphSourceItem[] = [];
    for (const name of mdFiles) {
      const slug = name.replace(/\.(md|mdx)$/i, '');
      const raw = normalizeLf(await fs.readFile(path.join(dir, name), 'utf8'));
      let parsed: ReturnType<typeof matter>;
      try { parsed = matter(raw); } catch { continue; }
      const d = (parsed.data ?? {}) as Record<string, unknown>;
      if (resolveVisibility(d) !== 'public') continue;
      items.push({
        slug,
        title: asString(d.title) || slug,
        date: asString(d.date),
        updated: asString(d.updated),
        hall: asString(d.hall),
        type: asString(d.type),
        form: asString(d.form),
        domain: asString(d.domain),
        series: asString(d.series),
        seriesOrder: asOrder(d.seriesOrder),
        tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
        summary: asString(d.summary) || asString(d.description),
        body: normalizeLegacyBody(parsed.content ?? ''),
      });
    }

    this.cache = buildKnowledgeGraph({ items, attachments, now: new Date().toISOString() });
    this.cacheKey = key;
    return this.cache;
  }
}
