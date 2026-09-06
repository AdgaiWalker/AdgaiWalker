# @walker/agent — 判断代理 v1（Cordis 组合 · MCP）

把站主的判断库（`content.json` + `aiUsePolicy`）暴露为外部 agent 可经 MCP 调用的工具。执行清单见 `docs/TODO-AGENT.md`。

## 三步启动

```bash
pnpm install                      # 1. 装依赖（monorepo 内已就绪可跳过）
pnpm --filter @walker/agent test  # 2. 跑测试（aiUsePolicy fail-closed 用例）
pnpm --filter @walker/agent start # 3. 起 stdio MCP server（保持前台，等 MCP client 接入）
```

配置：`WALKER_CONTENT_JSON` 覆盖内容路径（默认 `../web/src/generated/content.json`，即 monorepo 的 web 构建产物）。

## MCP client 接入（以 Claude Code 为例）

```json
{ "mcpServers": { "walker-judgment": { "command": "pnpm", "args": ["--filter", "@walker/agent", "start"], "cwd": "<本仓库根>" } } }
```

## 工具面（全部返回带 slug 出处）

| 工具 | 说明 | 权限 |
|---|---|---|
| `search_judgment(query)` | 检索站主相关判断，紧凑证据包 + persona 随行 | 仅 citable |
| `read_article(slug)` | 精读判断原文 | 仅 readable |
| `list_methodology(domain?)` | 方法论领域地图（domain 分组） | 仅 citable |
| `list_citable()` | 全部可引用判断清单 | 仅 citable |

## 组合（Cordis）

`src/index.ts` 依次装配四插件：`knowledge`（读 content.json，readable=false 永不入索引、空索引拒启）→ `persona`（站主判断注入）→ `telemetry`（调用观测走 stderr——stdout 是 MCP 协议通道）→ `mcp`（stdio server，`ctx.inject` 待三服务就绪后挂载）。

v2 触发条件（HTTP 公网、ask 工具、经 dsh mcp-client 反挂载）见 TODO-AGENT A7。
