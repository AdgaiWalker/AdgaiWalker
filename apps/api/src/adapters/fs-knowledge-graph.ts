/**
 * 文件系统知识图谱 — 复用 web 构建产物 content.json，用同一份 shared 纯函数建图。
 *
 * 为什么这样接：`buildKnowledgeGraph` 是纯函数，web（gen 期产出 graph.json）与 API
 * （请求期现算）共用**同一份实现**，不存在第二套建图规则。
 *
 * 已知差异（诚实记账，PRD §8-D9）：API 运行时没有 Git，`created` 回落 frontmatter.date，
 * 因此服务端不参与 Animate 排序；附件集合是尽力而为（content/log 不可达时为空）。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildKnowledgeGraph,
  type GraphSourceItem,
  type KnowledgeGraph,
} from '@walker/shared';
import type { KnowledgeGraphPort } from '../ports/knowledge-graph.port';

interface GeneratedItem {
  slug?: unknown;
  title?: unknown;
  date?: unknown;
  updated?: unknown;
  hall?: unknown;
  type?: unknown;
  form?: unknown;
  domain?: unknown;
  series?: unknown;
  seriesOrder?: unknown;
  tags?: unknown;
  summary?: unknown;
  body?: unknown;
  visibility?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asSeriesOrder(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

async function pickContentJsonPath(): Promise<string> {
  const fromEnv = process.env.SITE_CONTENT_JSON?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    await fs.access(resolved);
    return resolved;
  }
  const found = await firstExisting([
    path.resolve(process.cwd(), '../web/src/generated/content.json'),
    path.resolve(process.cwd(), 'apps/web/src/generated/content.json'),
    path.resolve(process.cwd(), '../../apps/web/src/generated/content.json'),
  ]);
  if (!found) throw new Error('knowledge-graph-unavailable');
  return found;
}

/** content/log 是构建期目录；盒子与开发机可达时用它列附件，不可达则退化为空 */
async function bestEffortAttachments(): Promise<string[]> {
  const dir = await firstExisting([
    path.resolve(process.cwd(), '../content/log'),
    path.resolve(process.cwd(), 'content/log'),
    path.resolve(process.cwd(), '../../content/log'),
  ]);
  if (!dir) return [];
  try {
    const entries = await fs.readdir(dir);
    return entries.filter(
      (name) => !/\.(md|mdx)$/i.test(name) && !name.startsWith('.'),
    );
  } catch {
    return [];
  }
}

export class FsKnowledgeGraph implements KnowledgeGraphPort {
  private cachedAtMs = 0;
  private cache: KnowledgeGraph | null = null;

  async load(): Promise<KnowledgeGraph> {
    const file = await pickContentJsonPath();
    const stat = await fs.stat(file);
    if (this.cache && stat.mtimeMs === this.cachedAtMs) return this.cache;

    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as { items?: unknown };
    const items = Array.isArray(raw.items) ? (raw.items as GeneratedItem[]) : [];
    const source: GraphSourceItem[] = items
      .filter(
        (item) =>
          typeof item.slug === 'string' &&
          item.visibility !== 'draft' &&
          item.visibility !== 'private',
      )
      .map((item) => ({
        slug: asString(item.slug),
        title: asString(item.title) || asString(item.slug),
        date: asString(item.date),
        updated: asString(item.updated),
        hall: asString(item.hall),
        type: asString(item.type),
        form: asString(item.form),
        domain: asString(item.domain),
        series: asString(item.series),
        seriesOrder: asSeriesOrder(item.seriesOrder),
        tags: Array.isArray(item.tags)
          ? item.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        summary: asString(item.summary),
        body: typeof item.body === 'string' ? item.body : '',
      }));

    this.cache = buildKnowledgeGraph({
      items: source,
      attachments: await bestEffortAttachments(),
      now: new Date().toISOString(),
    });
    this.cachedAtMs = stat.mtimeMs;
    return this.cache;
  }
}
