/**
 * knowledge 插件 — 读 content.json（web 运行时同一真相源），按 aiUsePolicy 过滤入索引。
 * 宪法第 3 条：readable=false 永不入索引；citable=false 不出现在检索/推荐，
 * 但 readable 时仍可按 slug 精读（与站内小影同一权限语义）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Service } from '@deepseek-ai/cordis';
import type { KnowledgeEntry, MethodologyGroup, SearchHit } from '../types.js';

export interface KnowledgeConfig {
  /** content.json 路径（相对 cwd 或绝对） */
  contentPath: string;
}

export class KnowledgeService extends Service {
  static readonly provide = 'knowledge';

  private readonly entries: KnowledgeEntry[] = [];

  constructor(ctx: Context, config: KnowledgeConfig) {
    super(ctx, 'knowledge');
    const full = path.resolve(config.contentPath);
    const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as { items?: unknown[] };
    if (!Array.isArray(raw.items)) throw new Error(`knowledge: content.json 无 items（${full}）`);
    for (const item of raw.items) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      const policy = (e.aiUsePolicy ?? {}) as { readable?: unknown; citable?: unknown };
      const readable = policy.readable === true;
      if (!readable) continue; // aiUsePolicy.readable=false 永不进索引（fail-closed）
      this.entries.push({
        slug: String(e.slug ?? ''),
        title: String(e.title ?? ''),
        summary: String(e.summary ?? ''),
        tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string') : [],
        domain: typeof e.domain === 'string' ? e.domain : undefined,
        form: typeof e.form === 'string' ? e.form : undefined,
        intent: typeof e.intent === 'string' ? e.intent : undefined,
        body: typeof e.body === 'string' ? e.body : '',
        readable,
        citable: policy.citable === true,
      });
    }
    if (this.entries.length === 0) throw new Error('knowledge: 可读条目为 0，拒绝空索引启动');
  }

  /** 检索：只推 citable=true；命中理由随行（诚实出处） */
  search(query: string, limit = 10): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = this.entries
      .filter((e) => e.citable)
      .map((e) => {
        const title = e.title.toLowerCase();
        const summary = e.summary.toLowerCase();
        const tags = e.tags.map((t) => t.toLowerCase());
        let score = 0;
        const reasons: string[] = [];
        if (title.includes(q)) {
          score += 3;
          reasons.push('标题命中');
        }
        if (tags.some((t) => t.includes(q) || q.includes(t))) {
          score += 2;
          reasons.push('标签命中');
        }
        if (summary.includes(q)) {
          score += 1;
          reasons.push('摘要命中');
        }
        return { e, score, why: reasons.join('、') || '弱相关' };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map(({ e, why }) => ({ slug: e.slug, title: e.title, summary: e.summary, tags: e.tags, why }));
  }

  /** 精读：仅 readable 条目；不存在或不可读返回 null */
  get(slug: string): KnowledgeEntry | null {
    const hit = this.entries.find((e) => e.slug === slug);
    return hit && hit.readable ? hit : null;
  }

  /** 方法论聚合：citable 条目按 domain 分组（站主判断的领域地图） */
  methodology(domain?: string): MethodologyGroup[] {
    const pool = this.entries.filter((e) => e.citable && (!domain || e.domain === domain));
    const groups = new Map<string, MethodologyGroup>();
    for (const e of pool) {
      const key = e.domain ?? '未分类';
      const g = groups.get(key) ?? { domain: key, count: 0, intents: [], titles: [] };
      g.count += 1;
      if (e.intent && !g.intents.includes(e.intent)) g.intents.push(e.intent);
      if (g.titles.length < 8) g.titles.push(e.title);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }

  /** citable 清单（MCP 暴露面） */
  citableList(): Array<{ slug: string; title: string; domain?: string }> {
    return this.entries.filter((e) => e.citable).map(({ slug, title, domain }) => ({ slug, title, domain }));
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    knowledge: KnowledgeService;
  }
}
