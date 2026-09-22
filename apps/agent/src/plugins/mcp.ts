/**
 * mcp 插件 — stdio MCP server：把站主判断暴露为外部 agent 可调用的工具。
 * 全部返回带 slug 出处（宪法第 4 条：对机器调用方与对人一视同仁）；
 * 返回结构借鉴 llm-wiki-compiler 的 context-pack（紧凑证据包 + 引用随行）。
 */
import { Context, Service } from '@deepseek-ai/cordis';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import './code-graph.js';
import './knowledge.js';
import './persona.js';
import './telemetry.js';

export class McpService extends Service {
  static readonly provide = 'mcp';

  constructor(ctx: Context) {
    super(ctx, 'mcp');
    ctx.inject(['codeGraph', 'knowledge', 'persona', 'telemetry'], (ictx) => {
      const { codeGraph, knowledge, persona, telemetry } = ictx;
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

      server.registerTool(
        'neighbors',
        {
          description:
            '沿正文互引结构导航：返回某篇文章在 depth 跳内的邻居与连线。不可引用的文章只回存在性与位置，不回摘要。',
          inputSchema: z.object({
            slug: z.string().min(1),
            depth: z.number().int().min(1).max(5).optional().describe('展开层数，默认 1'),
          }),
        },
        async ({ slug, depth }) => {
          const result = knowledge.neighbors(slug, depth ?? 1);
          telemetry.record({ tool: 'neighbors', ok: result !== null, detail: slug });
          if (!result) {
            return text({
              error: 'not-readable',
              slug,
              hint: 'slug 不在机器可读范围内（aiUsePolicy.readable=false 或不存在）',
            });
          }
          return text({ persona: persona.toolBrief(), ...result });
        },
      );

      // ---- 代码结构（产物由 pnpm code:gen 从编译器语法树抽出，见 PRD-CODE-GRAPH）----
      server.registerTool(
        'dependencies',
        {
          description:
            '查一个文件**导入了谁**（沿 import 方向展开，动态 import 也算）。' +
            '改一个文件之前想知道「它靠什么活着」就用它。文件不存在或后缀命中多个时回 error 与候选。',
          inputSchema: z.object({
            path: z
              .string()
              .min(1)
              .describe('仓库相对路径或唯一后缀，如 apps/web/src/App.tsx 或 App.tsx'),
            depth: z.number().int().min(1).max(5).optional().describe('展开层数，默认 1'),
          }),
        },
        async ({ path: filePath, depth }) => {
          const result = codeGraph.dependencies(filePath, depth ?? 1);
          telemetry.record({
            tool: 'dependencies',
            ok: !('error' in result),
            detail: filePath,
          });
          return text(result);
        },
      );

      server.registerTool(
        'dependents',
        {
          description:
            '查一个文件**被谁导入**（沿反向 import 方向展开）。与 dependencies 是相反的问题，不要混用。',
          inputSchema: z.object({
            path: z.string().min(1).describe('仓库相对路径或唯一后缀'),
            depth: z.number().int().min(1).max(5).optional().describe('展开层数，默认 1'),
          }),
        },
        async ({ path: filePath, depth }) => {
          const result = codeGraph.dependents(filePath, depth ?? 1);
          telemetry.record({
            tool: 'dependents',
            ok: !('error' in result),
            detail: filePath,
          });
          return text(result);
        },
      );

      server.registerTool(
        'impact',
        {
          description:
            '改动影响面：谁（含间接）依赖这个文件，并按 apps/web · apps/api 等工作区单元归堆。' +
            '动手改一个被广泛依赖的文件之前，先用它看会波及哪几个应用。',
          inputSchema: z.object({
            path: z.string().min(1).describe('仓库相对路径或唯一后缀'),
            depth: z.number().int().min(1).max(10).optional().describe('反向展开层数，默认 5'),
          }),
        },
        async ({ path: filePath, depth }) => {
          const result = codeGraph.impact(filePath, depth ?? 5);
          telemetry.record({ tool: 'impact', ok: !('error' in result), detail: filePath });
          return text(result);
        },
      );

      server.registerTool(
        'architecture_health',
        {
          description:
            '代码结构体检摘要：环依赖 / 解析不到的 import / 从入口不可达的死文件 / 包反向依赖应用' +
            '（四项硬伤，进基线、新增即失败），以及超大文件与超级枢纽（风格项，只告警）。',
          inputSchema: z.object({}),
        },
        async () => {
          const result = codeGraph.healthSummary();
          telemetry.record({ tool: 'architecture_health', ok: !('error' in result) });
          return text(result);
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
