# @walker/agent — 判断代理 v1（Cordis 组合 · MCP）

把站主的判断库（`content.json` + `aiUsePolicy`）暴露为外部 agent 可经 MCP 调用的工具。历史实录见 `docs/archive/TODO-AGENT.md`。

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

## 工具面（全部返回带 slug 或文件路径出处）

| 工具 | 说明 | 权限 / 范围 |
|---|---|---|
| `search_judgment(query)` | 检索站主相关判断，紧凑证据包 + persona 随行 | 仅 citable |
| `read_article(slug)` | 精读判断原文 | 仅 readable |
| `list_methodology(domain?)` | 方法论领域地图（domain 分组） | 仅 citable |
| `list_citable()` | 全部可引用判断清单 | 仅 citable |
| `neighbors(slug, depth?)` | 沿正文互引结构导航：返回 depth 跳内的邻居与连线 | fail-closed（不可引用仅返回存在性与位置） |
| `dependencies(path, depth?)` | 查文件**导入了谁**（依赖分析） | 代码结构 |
| `dependents(path, depth?)` | 查文件**被谁导入**（反向引用） | 代码结构 |
| `impact(path, depth?)` | 改动影响面分析（按 workspace 单元归堆） | 代码结构 |
| `architecture_health()` | 代码结构体检摘要（环/坏引用/死文件/反向依赖等） | 代码结构 |

## 组合（Cordis）

`src/index.ts` 依次装配五插件：`knowledge`（读 content.json 或公开快照，readable=false 永不入索引、空索引拒启）→ `codeGraph`（读取代码依赖图谱与体检产物）→ `persona`（站主判断注入）→ `telemetry`（调用观测，见下）→ `mcp`（stdio server，注册上述 9 项工具，`ctx.inject` 待各服务就绪后挂载）。

## telemetry：调用观测回写

每次工具调用会向主站管理端点 `POST /admin/events` 上报两条事件（`featureKey=agent.mcp`，`actorType=owner`）：`attempt` + `success`/`fail`，携带 `{ tool, detail }`。

| env | 默认 | 说明 |
|---|---|---|
| `WALKER_ADMIN_URL` | `http://127.0.0.1:8788` | 主站地址 |
| `WALKER_ADMIN_TOKEN` | 无 | 管理 token（`x-admin-token`）。**未配置时只打本地日志，不假装已上报** |

红线：**记录不得改变业务结果**——上报失败（端点不可达 / 4xx / 5xx / 3s 超时）只在 stderr 记一行，工具调用照常返回；stdout 是 MCP stdio 协议通道，观测输出只能走 stderr。数据落入 FeatureEvent 表，可通过 `GET /admin/usage/stats` 读取（`agent.mcp` 一行）。

v2 触发条件（HTTP 公网、ask 工具、经 dsh mcp-client 反挂载）见 `docs/archive/TODO-AGENT.md` A7。
