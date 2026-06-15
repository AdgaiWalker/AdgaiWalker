import type { APIRoute } from 'astro';

import { getAiReadableContentItems } from '@/knowledge/content';

export const prerender = true;

const SITE_URL = 'https://iwalk.pro';

function absoluteUrl(path: string) {
  return `${SITE_URL}${path}`;
}

/**
 * graph.json — AI 可读的公开内容关系图谱。
 *
 * 节点 = public 且非 AI-0 的内容（精简字段）；边 = related 关系，
 * 只保留两端都是 AI 可读节点的关系（双向去重）。
 * draft / private / admin-only / AI-0 内容不进入图谱。
 */
export const GET: APIRoute = async () => {
  const items = await getAiReadableContentItems();
  const ids = new Set(items.map(item => item.id));

  const nodes = items.map(item => ({
    id: item.id,
    title: item.title,
    url: item.isExternal ? item.href : absoluteUrl(item.href),
    type: item.type,
    form: item.form,
    domain: item.domain,
    intent: item.intent,
    valueMode: item.valueMode,
    status: item.status ?? null,
    aiUseLevel: item.aiUseLevel,
    date: item.date.toISOString(),
  }));

  // related 边：只保留双端都是 AI 可读节点的关系，无向去重
  const seen = new Set<string>();
  const edges: Array<{ from: string; to: string; type: 'related' }> = [];
  for (const item of items) {
    for (const target of item.related) {
      if (!ids.has(target)) continue;
      const key = [item.id, target].sort().join('->');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: item.id, to: target, type: 'related' });
    }
  }

  const body = {
    generatedAt: 'build-time',
    site: {
      url: SITE_URL,
      description: 'Walker 个人空间的 AI 可读内容关系图谱（仅公开且非 AI-0 内容）。',
    },
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
};
