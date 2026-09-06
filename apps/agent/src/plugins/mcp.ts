/**
 * mcp 插件 — stdio MCP server：把站主判断暴露为外部 agent 可调用的工具。
 * 全部返回带 slug 出处（宪法第 4 条：对机器调用方与对人一视同仁）；
 * 返回结构借鉴 llm-wiki-compiler 的 context-pack（紧凑证据包 + 引用随行）。
 */
import { Context, Service } from '@deepseek-ai/cordis';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import './knowledge.js';
import './persona.js';
import './telemetry.js';

export class McpService extends Service {
  static readonly provide = 'mcp';

  constructor(ctx: Context) {
    super(ctx, 'mcp');
    ctx.inject(['knowledge', 'persona', 'telemetry'], (ictx) => {
      const { knowledge, persona, telemetry } = ictx;
      const server = new McpServer({ name: 'walker-judgment', version: '0.1.0' });
      const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });

      server.registerTool(
        'search_judgment',
        {
          description: `${persona.toolBrief()} 按问题检索 duola 的相关判断，返回带 slug 出处的证据包。`,
          inputSchema: z.object({ query: z.string().min(1).describe('要咨询的问题或关键词') }),
        },
        async ({ query }) => {
          const results = knowledge.search(query);
          telemetry.record({ tool: 'search_judgment', ok: results.length > 0, detail: query.slice(0, 80) });
          return text({ persona: persona.prompt, note: results.length ? undefined : 'duola 还没写过这个话题', results });
        },
      );

      server.registerTool(
        'read_article',
        {
          description: '精读一篇判断原文（仅 aiUsePolicy.readable 的文章可读）。',
          inputSchema: z.object({ slug: z.string().min(1) }),
        },
        async ({ slug }) => {
          const entry = knowledge.get(slug);
          telemetry.record({ tool: 'read_article', ok: entry !== null, detail: slug });
          if (!entry) return text({ error: 'not-readable', slug, hint: 'slug 不存在或该文不可读给机器' });
          const { readable: _r, citable: _c, ...doc } = entry;
          return text(doc);
        },
      );

      server.registerTool(
        'list_methodology',
        {
          description: 'duola 方法论的领域地图（按 domain 分组，可选过滤）。',
          inputSchema: z.object({ domain: z.string().optional() }),
        },
        async ({ domain }) => {
          const groups = knowledge.methodology(domain);
          telemetry.record({ tool: 'list_methodology', ok: true, detail: domain });
          return text({ persona: persona.toolBrief(), groups });
        },
      );

      server.registerTool(
        'list_citable',
        { description: '全部可引用判断的清单（slug + 标题 + 领域）。', inputSchema: z.object({}) },
        async () => {
          const list = knowledge.citableList();
          telemetry.record({ tool: 'list_citable', ok: true });
          return text({ count: list.length, list });
        },
      );

      ictx.effect(() => async () => {
        await server.close();
      });

      void server.connect(new StdioServerTransport());
    });
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcp: McpService;
  }
}
