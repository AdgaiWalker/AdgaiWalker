/**
 * knowledge 插件 — 公开上下文只读与 API 同源的已核验公开快照（fail-closed）；
 * 私有开发读取须显式给 contentPath（content.json），两者不混用。
 * 撤销集合（快照根 deny.json）逐问重新读取，撤销下一问即生效。
 * 宪法第 3 条：readable=false 永不入索引；citable=false 不出现在检索/推荐，
 * 但 readable 时仍可按 slug 精读（与站内小影同一权限语义）。
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Context, Service } from '@deepseek-ai/cordis';
import {
  buildKnowledgeGraph,
  findGraphNode,
  graphNeighbors,
  noteNodeId,
  parsePublicDenyList,
  verifyPublicSnapshot,
  type GraphNode,
  type KnowledgeGraph,
  type PublicSnapshotManifest,
} from '@walker/shared';
import type { KnowledgeEntry, MethodologyGroup, SearchHit } from '../types.js';

export interface KnowledgeConfig {
  /** 私有开发读取：content.json 路径（相对 cwd 或绝对）。显式给出即走开发模式，不应用公开撤销集合。 */
  contentPath?: string;
  /** 公开上下文：已核验公开快照目录（含 active.json / snapshots/ / deny.json）。与 API 同源。 */
  snapshotDir?: string;
}

/** 与 API 的 FsPublicSnapshotRepository 同一份读取与校验规则（fail-closed）。 */
function readActiveSnapshot(root: string): PublicSnapshotManifest {
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  const pointerPath = path.join(root, 'active.json');
  if (!fs.existsSync(pointerPath)) throw new Error('snapshot-unavailable');
  const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as { collectionHash?: string };
  if (!pointer.collectionHash) throw new Error('snapshot-unavailable');
  const file = path.join(root, 'snapshots', `${pointer.collectionHash}.json`);
  if (!fs.existsSync(file)) throw new Error('snapshot-unavailable');
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('snapshot-unavailable');
  }
  if (!verifyPublicSnapshot(snapshot, sha) || snapshot.collectionHash !== pointer.collectionHash) {
    throw new Error('snapshot-unavailable');
  }
  return snapshot;
}

/** 撤销集合状态：无文件=空集合；损坏/形状不符=全部撤销（fail-closed）。 */
type DenyState = ReadonlySet<string> | 'deny-all';

/** 机器面邻居节点：不可引用时只回存在性与位置，不回摘要（PRD-KNOWLEDGE-GRAPH §5.3） */
export type NeighborNode = {
  id: string;
  kind: GraphNode['kind'];
  slug: string;
  title: string;
  /** aiUsePolicy.citable；false 时 summary 一律缺席 */
  citable: boolean;
  summary?: string;
};

export type NeighborsResult = {
  center: NeighborNode;
  depth: number;
  nodes: NeighborNode[];
  edges: Array<{ source: string; target: string; kind: string }>;
};

export class KnowledgeService extends Service {
  static readonly provide = 'knowledge';

  private readonly entries: KnowledgeEntry[] = [];
  /** 互引结构：与 web/API 共用 shared 的同一个建图纯函数 */
  private readonly graph: KnowledgeGraph;
  /** 公开快照目录（仅快照模式存在）；撤销集合从这里逐问读取 */
  private snapshotDir: string | null = null;

  /** 私有开发读取：content.json 原样入索引，不应用公开撤销集合。 */
  private loadPrivateDev(full: string): void {
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
  }

  /** 公开上下文：只读与 API 同源的已核验快照；无基线或 hash 不符直接抛错（fail-closed）。 */
  private loadPublicSnapshot(root: string): void {
    const snapshot = readActiveSnapshot(root);
    for (const item of snapshot.items) {
      if (!item.readable) continue;
      this.entries.push({
        slug: item.slug,
        title: item.title,
        summary: item.summary,
        tags: [...item.tags],
        body: item.body,
        readable: true,
        citable: item.citable,
      });
    }
  }

  /** 撤销集合逐问重读：旧进程/旧会话也不能绕过收窄。私有开发模式不适用。 */
  private deniedNow(): DenyState {
    if (!this.snapshotDir) return new Set();
    const file = path.join(this.snapshotDir, 'deny.json');
    if (!fs.existsSync(file)) return new Set();
    try {
      const parsed = parsePublicDenyList(JSON.parse(fs.readFileSync(file, 'utf8')));
      return parsed ? new Set(parsed.slugs) : 'deny-all';
    } catch {
      return 'deny-all';
    }
  }

  private denied(state: DenyState, slug: string): boolean {
    return state === 'deny-all' || state.has(slug);
  }

  constructor(ctx: Context, config: KnowledgeConfig) {
    super(ctx, 'knowledge');
    if (config.contentPath) {
      this.loadPrivateDev(path.resolve(config.contentPath));
    } else if (config.snapshotDir) {
      this.snapshotDir = path.resolve(config.snapshotDir);
      this.loadPublicSnapshot(this.snapshotDir);
    } else {
      throw new Error('knowledge: 缺少内容来源（contentPath 或 snapshotDir）');
    }
    if (this.entries.length === 0) throw new Error('knowledge: 可读条目为 0，拒绝空索引启动');

    // 图只由**已入索引的可读条目**构成：指向不可读文章的链接会成为幽灵节点，
    // 对机器表现为「存在但不可用」，而不是悄悄带出不可读内容。
    this.graph = buildKnowledgeGraph({
      items: this.entries.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        date: '',
        type: entry.form ?? '',
        domain: entry.domain ?? '',
        tags: entry.tags,
        summary: entry.summary,
        body: entry.body,
      })),
      now: new Date().toISOString(),
    });
  }

  /**
   * 沿正文互引结构导航（MCP `neighbors`）。
   * 只回存在性与位置 + citable 摘要；slug 不在机器可读范围时返回 null。
   */
  neighbors(slug: string, depth = 1): NeighborsResult | null {
    const denyState = this.deniedNow();
    if (this.denied(denyState, slug)) return null;
    const center = findGraphNode(this.graph, noteNodeId(slug));
    if (!center) return null;
    const hood = graphNeighbors(this.graph, center.id, depth);
    const bySlug = new Map(this.entries.map((entry) => [entry.slug, entry]));

    const toNode = (node: GraphNode): NeighborNode => {
      const entry = node.kind === 'note' ? bySlug.get(node.slug) : undefined;
      const citable = entry?.citable === true && !this.denied(denyState, node.kind === 'note' ? node.slug : '');
      const title =
        node.kind === 'note'
          ? node.title
          : node.kind === 'tag'
            ? `#${node.tag}`
            : node.kind === 'ghost'
              ? node.slug
              : node.path.split('/').pop() ?? node.path;
      return {
        id: node.id,
        kind: node.kind,
        slug: node.kind === 'note' || node.kind === 'ghost' ? node.slug : '',
        title,
        citable,
        ...(citable && entry?.summary ? { summary: entry.summary } : {}),
      };
    };

    return {
      center: toNode(center),
      depth: hood.depth,
      nodes: hood.nodes.map(toNode),
      edges: hood.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
      })),
    };
  }

  /** 检索：只推 citable=true；命中理由随行（诚实出处） */
  search(query: string, limit = 10): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const denyState = this.deniedNow();
    const scored = this.entries
      .filter((e) => e.citable && !this.denied(denyState, e.slug))
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

  /** 精读：仅 readable 条目；不存在、不可读或已撤销返回 null */
  get(slug: string): KnowledgeEntry | null {
    if (this.denied(this.deniedNow(), slug)) return null;
    const hit = this.entries.find((e) => e.slug === slug);
    return hit && hit.readable ? hit : null;
  }

  /** 方法论聚合：citable 条目按 domain 分组（站主判断的领域地图） */
  methodology(domain?: string): MethodologyGroup[] {
    const denyState = this.deniedNow();
    const pool = this.entries.filter((e) => e.citable && !this.denied(denyState, e.slug) && (!domain || e.domain === domain));
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
    const denyState = this.deniedNow();
    return this.entries.filter((e) => e.citable && !this.denied(denyState, e.slug)).map(({ slug, title, domain }) => ({ slug, title, domain }));
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    knowledge: KnowledgeService;
  }
}
