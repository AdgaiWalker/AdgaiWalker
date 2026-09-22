/**
 * 判断代理 v1 组合入口 — Cordis 面（TODO-AGENT A0）。
 * 用法：pnpm --filter @walker/agent start（stdio MCP server）
 * 配置：
 * - `WALKER_CONTENT_JSON` 覆盖 content.json 路径（默认 ../web/src/generated/content.json）
 * - `WALKER_CODE_GRAPH_JSON` / `WALKER_CODE_GRAPH_HEALTH_JSON` 覆盖代码图谱两份产物路径
 */
import path from 'node:path';
import process from 'node:process';
import { Context } from '@deepseek-ai/cordis';
import { CodeGraphService } from './plugins/code-graph.js';
import { KnowledgeService } from './plugins/knowledge.js';
import { PersonaService } from './plugins/persona.js';
import { TelemetryService } from './plugins/telemetry.js';
import { McpService } from './plugins/mcp.js';

const contentPath =
  process.env.WALKER_CONTENT_JSON ??
  path.resolve(process.cwd(), '../web/src/generated/content.json');

// 代码图谱产物（pnpm code:gen 生成）：公开面与内部面各一份，agent 两份都读
const codeGraphPath =
  process.env.WALKER_CODE_GRAPH_JSON ??
  path.resolve(process.cwd(), '../web/src/generated/codegraph.json');
const codeGraphHealthPath =
  process.env.WALKER_CODE_GRAPH_HEALTH_JSON ??
  path.resolve(process.cwd(), '../web/src/generated/codegraph-health.json');

const ctx = new Context();
await ctx.plugin(KnowledgeService, { contentPath });
await ctx.plugin(CodeGraphService, { codeGraphPath, healthPath: codeGraphHealthPath });
await ctx.plugin(PersonaService);
await ctx.plugin(TelemetryService);
await ctx.plugin(McpService);
// stdio server 持有事件循环；进程由调用方（MCP client）生命周期管理
