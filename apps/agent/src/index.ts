/**
 * 判断代理 v1 组合入口 — Cordis 面（TODO-AGENT A0）。
 * 用法：pnpm --filter @walker/agent start（stdio MCP server）
 * 配置：WALKER_CONTENT_JSON 覆盖 content.json 路径（默认 ../web/src/generated/content.json）
 */
import path from 'node:path';
import process from 'node:process';
import { Context } from '@deepseek-ai/cordis';
import { KnowledgeService } from './plugins/knowledge.js';
import { PersonaService } from './plugins/persona.js';
import { TelemetryService } from './plugins/telemetry.js';
import { McpService } from './plugins/mcp.js';

const contentPath =
  process.env.WALKER_CONTENT_JSON ??
  path.resolve(process.cwd(), '../web/src/generated/content.json');

const ctx = new Context();
await ctx.plugin(KnowledgeService, { contentPath });
await ctx.plugin(PersonaService);
await ctx.plugin(TelemetryService);
await ctx.plugin(McpService);
// stdio server 持有事件循环；进程由调用方（MCP client）生命周期管理
