/**
 * 判断代理 v1 组合入口 — Cordis 面（TODO-AGENT A0）。
 * 用法：pnpm --filter @walker/agent start（stdio MCP server）
 * 配置：
 * - 公开上下文（默认）：读与 API 同源的已核验公开快照，目录由
 *   `WALKER_PUBLIC_SNAPSHOT_DIR` 覆盖（默认 ../api/data/public-snapshots）；无基线拒绝启动
 * - 私有开发读取：显式设 `WALKER_CONTENT_JSON` 指向 content.json，不应用公开撤销集合
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

const contentPath = process.env.WALKER_CONTENT_JSON;
const snapshotDir =
  process.env.WALKER_PUBLIC_SNAPSHOT_DIR ??
  path.resolve(process.cwd(), '../api/data/public-snapshots');

// 代码图谱产物（pnpm code:gen 生成）：公开面与内部面各一份，agent 两份都读
const codeGraphPath =
  process.env.WALKER_CODE_GRAPH_JSON ??
  path.resolve(process.cwd(), '../web/src/generated/codegraph.json');
const codeGraphHealthPath =
  process.env.WALKER_CODE_GRAPH_HEALTH_JSON ??
  path.resolve(process.cwd(), '../web/src/generated/codegraph-health.json');

const ctx = new Context();
await ctx.plugin(KnowledgeService, contentPath ? { contentPath } : { snapshotDir });
await ctx.plugin(CodeGraphService, { codeGraphPath, healthPath: codeGraphHealthPath });
await ctx.plugin(PersonaService);
await ctx.plugin(TelemetryService);
await ctx.plugin(McpService);
// stdio server 持有事件循环；进程由调用方（MCP client）生命周期管理
