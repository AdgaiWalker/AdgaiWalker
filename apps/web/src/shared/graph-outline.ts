/**
 * 图谱的 HTML 兜底结构 —— 纯函数。
 *
 * canvas 画出来的图形对爬虫完全不可见，而 Geo 门禁要求 indexable 路由有真实静态正文。
 * 因此用同一份 `graph.json` 生成语义化清单（GEO 兜底 + 无 JS 可读），
 * 由 prerender 写进 `/graph` 的静态 HTML（PRD §6.1-C）。
 */
import type { KnowledgeGraph } from '@walker/shared';

export type GraphOutlineLink = {
  slug: string;
  title: string;
  /** false 表示被引用但文章尚不存在（Obsidian 的幽灵节点） */
  resolved: boolean;
};

export type GraphOutlineEntry = {
  slug: string;
  title: string;
  summary: string;
  series: string;
  hall: string;
  links: GraphOutlineLink[];
};

export type GraphOutline = {
  entries: GraphOutlineEntry[];
  ghosts: Array<{ slug: string; referencedBy: string[] }>;
  isolated: GraphOutlineEntry[];
  series: Array<{ name: string; slugs: string[] }>;
  tagCount: number;
  attachmentCount: number;
  /** 正文内部链接总数（照抄 Obsidian 的唯一『边』） */
  linkCount: number;
};

export function buildGraphOutline(graph: KnowledgeGraph): GraphOutline {
  const noteById = new Map(
    graph.nodes
      .filter((node) => node.kind === 'note')
      .map((node) => [node.id, node]),
  );

  const linksBySource = new Map<string, GraphOutlineLink[]>();
  const referencedBy = new Map<string, string[]>();
  let linkCount = 0;

  for (const edge of graph.edges) {
    if (edge.kind !== 'link') continue;
    linkCount += 1;
    const target = graph.nodes.find((node) => node.id === edge.target);
    const source = graph.nodes.find((node) => node.id === edge.source);
    if (!target || !source || source.kind !== 'note') continue;

    const list = linksBySource.get(source.id) ?? [];
    const slug =
      target.kind === 'note' || target.kind === 'ghost' ? target.slug : '';
    if (slug && !list.some((entry) => entry.slug === slug)) {
      list.push({
        slug,
        title: target.kind === 'note' ? target.title : slug,
        resolved: target.kind === 'note',
      });
      linksBySource.set(source.id, list);
    }

    if (target.kind === 'ghost') {
      const refs = referencedBy.get(target.slug) ?? [];
      if (!refs.includes(source.slug)) refs.push(source.slug);
      referencedBy.set(target.slug, refs);
    }
  }

  const entries: GraphOutlineEntry[] = [...noteById.values()]
    .map((node) => ({
      slug: node.slug,
      title: node.title,
      summary: node.summary,
      series: node.series,
      hall: node.hall,
      links: linksBySource.get(node.id) ?? [],
    }))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

  const seriesMap = new Map<string, string[]>();
  for (const node of noteById.values()) {
    const series = node.series.trim();
    if (!series) continue;
    const list = seriesMap.get(series) ?? [];
    list.push(node.slug);
    seriesMap.set(series, list);
  }

  return {
    entries,
    ghosts: [...referencedBy.entries()]
      .map(([slug, sources]) => ({ slug, referencedBy: sources.slice().sort() }))
      .sort((a, b) => (a.slug < b.slug ? -1 : 1)),
    // 孤岛口径与 PRD §6.2 / 站主体检一致：正文内链度为 0（既没有引用别人，也没有被引用）。
    // 只用「无出链」会把「只被引用、自己不引用」的文章误判成孤岛。
    isolated: entries.filter((entry) => {
      const node = noteById.get(`note:${entry.slug}`);
      return (node?.linkDegree ?? 0) === 0;
    }),
    series: [...seriesMap.entries()]
      .map(([name, slugs]) => ({ name, slugs }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    tagCount: graph.nodes.filter((node) => node.kind === 'tag').length,
    attachmentCount: graph.nodes.filter((node) => node.kind === 'attachment').length,
    linkCount,
  };
}
