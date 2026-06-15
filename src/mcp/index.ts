/**
 * walker MCP Server — 让 Claude Code / Claude Desktop 直接查询内容库
 *
 * 工具列表：
 *   walker_query    — 多条件过滤查询
 *   walker_search   — 全文搜索
 *   walker_get      — 按 slug 取完整内容（含正文）
 *   walker_stats    — 内容统计概览
 *   walker_insights — 需求洞察统计
 *
 * 公开边界：所有内容工具只返回 public 且非 AI-0 的内容
 * （与 /index.json、/graph.json 同一套 AI 可读边界）。
 * draft / private / admin-only / AI-0 内容不通过 MCP 暴露。
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

/** AI 可读判断：AI 使用级别非 AI-0（AI-0 = 明确不希望被 AI 读取）。
 *  visibility（draft/private）已由 content-query 过滤，这里补 AI-0 边界。 */
function isAiReadable(item: { frontmatter: Record<string, unknown> }): boolean {
  const policy = item.frontmatter.aiUsePolicy as { level?: string } | undefined;
  return policy?.level !== 'AI-0';
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'walker-content',
  version: '0.2.0',
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
    const results = query(params as QueryFilter).filter(isAiReadable);
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
    const results = search(text).filter(isAiReadable);
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
    if (!isAiReadable(item)) {
      return {
        content: [{ type: 'text' as const, text: `该内容标记为 AI-0（AI 不可读），不通过 MCP 暴露: ${slug}` }],
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
    const all = getAll().filter(isAiReadable);
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

// --- walker_insights -----------------------------------------------------

server.tool(
  'walker_insights',
  '查询需求洞察统计：需求分类、卡点层级、能力方向、反馈分布、合规转向率、代码 Agent 误用率和日趋势。数据来自站内匹配器收集的匿名用户需求。',
  {
    days: z.number().optional().describe('统计最近 N 天的数据，默认 30'),
  },
  async ({ days }) => {
    if (process.env.MCP_ENABLE_PRIVATE_INSIGHTS !== 'true') {
      return {
        content: [{ type: 'text' as const, text: '需求洞察属于站主私有数据，默认不通过 MCP 暴露。' }],
        isError: true,
      };
    }

    // MCP server 运行在独立进程，store.ts 的 Redis 连接需要环境变量
    // 如果 Redis 不可用，getNeedCaseStats 会返回零值
    try {
      const { getNeedCaseStats } = await import('../conversation/store');
      const stats = await getNeedCaseStats({ days: days ?? 30 });
      // 字段白名单：只返回聚合统计，不含 topNeeds（具体用户需求摘要）
      const {
        totalCases,
        totalSessions,
        byCategory,
        byFrictionLayer,
        byAbilityType,
        byFeedbackType,
        byReviewStatus,
        complianceRedirectRate,
        codeAgentMisuseRate,
        dailyTrend,
      } = stats;
      const safeStats = {
        totalCases,
        totalSessions,
        byCategory,
        byFrictionLayer,
        byAbilityType,
        byFeedbackType,
        byReviewStatus,
        complianceRedirectRate,
        codeAgentMisuseRate,
        dailyTrend,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(safeStats, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `洞察查询失败: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('walker MCP server failed:', err);
  process.exit(1);
});
