/**
 * walker MCP Server — 让 Claude Code / Claude Desktop 直接查询内容库
 *
 * 工具列表：
 *   walker_query   — 多条件过滤查询
 *   walker_search  — 全文搜索
 *   walker_get     — 按_slug_取完整内容（含正文）
 *   walker_stats   — 内容统计概览
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getAll,
  findBySlug,
  query,
  search,
  countByType,
  invalidateCache,
  type QueryFilter,
} from '../knowledge/content-query';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 精简输出：列表类工具只返回关键元数据，不返回正文 */
function summarize(item: { slug: string; frontmatter: Record<string, unknown> }) {
  const fm = item.frontmatter;
  return {
    slug: item.slug,
    title: fm.title,
    type: fm.type,
    status: fm.status,
    domain: fm.domain,
    date: fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : fm.date,
    summary: fm.summary,
    tags: fm.tags,
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'walker-content',
  version: '0.1.0',
});

// --- walker_query --------------------------------------------------------

server.tool(
  'walker_query',
  '多条件过滤查询 Walker 的内容库（文章、点子、工具、项目、学习指南等）',
  {
    type: z
      .enum(['knowledge', 'tool', 'idea', 'project', 'community', 'learn', 'learning'])
      .optional()
      .describe('内容类型'),
    status: z
      .enum(['thinking', 'validating', 'building', 'verified', 'archived'])
      .optional()
      .describe('状态'),
    domain: z
      .enum(['ai', 'coding', 'product', 'philosophy', 'life', 'cooking', 'calligraphy', 'reading', 'travel', 'emotion', 'community'])
      .optional()
      .describe('领域'),
    intent: z
      .enum(['think', 'record', 'teach', 'share', 'verify', 'showcase', 'reflect', 'connect', 'vent'])
      .optional()
      .describe('意图'),
    form: z
      .enum(['article', 'note', 'diary', 'rant', 'gallery', 'video', 'recipe', 'calligraphy', 'resource', 'project', 'idea', 'lesson'])
      .optional()
      .describe('形式'),
    tags: z.array(z.string()).optional().describe('标签（OR 语义，匹配任一）'),
    published: z.boolean().optional().describe('是否已发布'),
    series: z.string().optional().describe('系列名'),
    level: z.enum(['入门', '学徒', '专家']).optional().describe('学习阶段'),
  },
  async (params) => {
    const results = query(params as QueryFilter);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(results.map(summarize), null, 2),
        },
      ],
    };
  },
);

// --- walker_search -------------------------------------------------------

server.tool(
  'walker_search',
  '全文搜索：在标题、摘要、正文中搜索关键词（大小写不敏感）',
  { text: z.string().describe('搜索文本') },
  async ({ text }) => {
    const results = search(text);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(results.map(summarize), null, 2),
        },
      ],
    };
  },
);

// --- walker_get ----------------------------------------------------------

server.tool(
  'walker_get',
  '按 slug 获取完整内容（包含 frontmatter 元数据和 markdown 正文）',
  { slug: z.string().describe('内容 slug（文件名去掉扩展名，如 "卡牌桌"') },
  async ({ slug }) => {
    invalidateCache(); // 确保读取最新文件内容
    const item = findBySlug(slug);
    if (!item) {
      return {
        content: [{ type: 'text' as const, text: `未找到内容: ${slug}` }],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              slug: item.slug,
              filePath: item.filePath,
              frontmatter: item.frontmatter,
              body: item.body,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// --- walker_stats --------------------------------------------------------

server.tool(
  'walker_stats',
  '内容库统计概览（总数、各类型数量、最近内容）',
  {},
  async () => {
    const all = getAll();
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              total: all.length,
              byType: countByType(),
              recent: all.slice(0, 5).map(summarize),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('walker MCP server failed:', err);
  process.exit(1);
});
