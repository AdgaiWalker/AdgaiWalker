# 判断代理 v1 执行清单（apps/agent · Cordis 组合）

来源：2026-09-06 产品讨论定案。愿景两段：**近期**——Wiki 承载站主的判断/方法论/世界观，外部 AI 经 MCP 调用这些内容指导决策；**远期**——具身智能读取知识库复刻决策（归 VISION「远·具身」，只保留「方法论写成带步骤的行动指南」这一写作习惯，不做机器人）。

存在证明：dsh 本身即一个 Cordis 应用、行为跟随注入的人设与知识运行——判断代理 = 更小的 dsh，知识换成 `content.json`，人设换成站主方法论。45% 零件已在本仓库运转（小影整库注入模式、aiUsePolicy 权限层、引用诚实系统）。参考资料已备：`~/Desktop/deepseek-harness`（全历史 + tags）、`~/Desktop/pi`、`~/Desktop/agent-runtime-backup/`（见其 MANIFEST.md，含 2026-09-06 GitHub 取经调查新增的 4 个参考仓库）。

**2026-09-06 GitHub 取经调查定案**：① dsh 的 `packages/mcp` 是 **MCP 客户端**（agent 消费外部 MCP 工具），服务端须自建，地基锁官方 `@modelcontextprotocol/server` **v2**（StdioServerTransport + registerTool + zod；v2 实现 2026-07-28 规范）；② Cordis 依赖用 `@deepseek-ai/cordis`（与 dsh 同源同版本，避免追上游 unstable API），上游 `cordiverse/cordis` 仅作对照；③ 工具设计抄 [llm-wiki-compiler] 的 context-pack 思路（紧凑证据包 + 引用随行），但 v1 不引入其 LLM 编译管线与 freshness 状态机。

## 定案（不再议）

1. **Cordis 以新建 `apps/agent` 组合进入产品，不迁移任何现有服务**（此前否决迁移的结论维持）。
2. 一个应用两种身份：对他人 agent 是 **MCP 服务**（他们的 AI 调用站主判断）；对站主是**自有 Cordis 运行时**（未来工具/技能/具身接口在自己的组合里生长）。
3. **v1 是工具型，不带自己的模型**：只暴露结构化知识工具（检索/读取/清单，全部带 slug 出处），智能留在调用方 agent——这是 MCP 哲学；「自带推理回答」由站内小影承担，判断代理 v2+ 再考虑 ask 类工具走 dsh。
4. 权限与出处：数据源 `content.json`（只读静态）；`aiUsePolicy.citable=false` 的内容**永不出现**在任何返回；每条知识带 slug 出处（诚实原则对机器调用方同样成立）。
5. **排期：取代原「MCP v1 周末支线」位，位于主线「初稿全链」之后**——背后站着转过一次循环的判断代理，才是可发布的产品故事（「我的方法论已在这套循环里交付验证，现在你可以让你的 AI 直接调用它」）。

## 主线排位（当前主序，2026-09-06 定）

观测 P0 → dsh 换工作站 runner → **站主初稿走完全链（心脏）** → 共创文案 + 周报转题苗 → admin 流水线视图 → **判断代理 v1（本清单）** → 观测 P1 →（9/17 验证盒复盘）。冻结条款：第一篇发布前不启动本清单的编码工作，新想法只记账不排期。

## 架构：四插件起步

```
apps/agent（新 pnpm workspace 包，Cordis 组合）
├── knowledge 插件 —— 读 content.json，aiUsePolicy 过滤，内存索引（slug→title/tags/summary/body）
├── persona 插件   —— 站主判断注入：方法论 + 决策风格（迁移小影 prompt 模式，输出合同带 citations）
├── mcp 插件       —— stdio MCP server：工具三件（见 A3），资源=citable 清单
└── telemetry 插件 —— 调用回写主站 FeatureEvent（管理端点 + token env；失败不阻断，本地日志兜底）
```

## 原子任务

> **2026-09-06 优先级变更（站主指令）**：主线暂停，判断代理脚手架提前解冻——A0/A1/A2/A3 于当日完成（详见各勾选与验收实录），A4 以 stub 形态落地（回写 FeatureEvent 留待主线恢复后接），A5 dogfooding 由站主择时执行。

- [x] **A0 骨架与参照核对**（2026-09-06 完成）｜`apps/agent` 建包（pnpm workspace、typecheck 接入根链 `pnpm -r run typecheck`）；依赖锁定 `@deepseek-ai/cordis@^4.0.1`（与 dsh 同源）+ `@modelcontextprotocol/server@2.0.0` + `zod@4`。｜验收实录：根链 typecheck 含 agent 通过；stdio 冒烟 initialize 返回 `walker-judgment 0.1.0`，tools/list 四工具齐。
- [x] **A1 knowledge 插件**（2026-09-06 完成）｜读 `content.json`（`WALKER_CONTENT_JSON` 可覆盖）；`readable=false` 永不入索引、空索引拒启；search（标题3/标签2/摘要1 打分，仅 citable，命中理由随行）/ get（仅 readable）/ methodology（domain 聚合）/ citableList。｜验收实录：3 项单测全过（私有内容不入索引、可读不可引用不进检索但可精读、空索引拒启）。
- [x] **A2 persona 插件**（2026-09-06 完成，简版）｜判断注入常量（第三人称、保持原意注明 slug、没有就说没写过、duola 判断与调用方推理分层标注）；工具描述共用口径。｜验收：模板随 search/list 返回（冒烟中 persona 随行确认）。
- [x] **A3 mcp 插件**（2026-09-06 完成）｜四工具：`search_judgment` / `read_article` / `list_methodology` / `list_citable`（原定「一个资源」以工具形式提供——脚手架决策，资源形式待 registerResource API 核实后可换）；全部返回带 slug 出处。｜验收实录：stdio 冒烟真实检索命中（`molan-ai-file-assistant` 等标签命中理由随行）；未命中 slug 如实返回 `not-readable`。
- [x] **A4 telemetry 插件**（2026-09-14 接线完成）｜主站新增管理端点 `POST /admin/events`（`ObservabilityController`，token 防线内）：按 `FEATURE_KEYS` 字典校验、`props` 上限 2KB、只落 FeatureEvent 不改业务状态；`agent.mcp` 已登记进 shared 字典。插件侧每条工具调用上报 `attempt` + `success`/`fail` 两条（`actorType=owner`，`failCode=empty-result` 表示未命中），未配 `WALKER_ADMIN_TOKEN` 时如实打一行「仅本地记录」，端点不可达/500/超时只落 stderr——**记录不得改变业务结果**。｜验收实录：假端点断言两条事件体与 token；端点不可达、HTTP 500、未配 token 三路均不抛错；本地真机闭环：curl 写入 `agent.mcp` → `GET /admin/usage/stats` 读回 owner `attempt:1 success:1`（与 guest 分列不混）。
- [ ] **A5 dogfooding 验收**｜站主本机 MCP 客户端（Claude Code / Codex 等）配置该 server；问「duola 会怎么评估 X」类问题，返回 ≥1 篇带出处方法论并给出贴合人设的建议。｜验收：真实客户端一次成功调用 + 截图/记录归档本文件底部；一次含敏感词查询确认脆弱内容（AI-1/citable=false）不外泄。
- [x] **A6 部署与文档**（2026-09-14 完成文档侧）｜`apps/agent/README.md` 保留「三步启动」并补 telemetry 上报说明（`WALKER_ADMIN_URL` / `WALKER_ADMIN_TOKEN`、失败不阻断、stdout 是协议通道）；`docs/api/README.md` 登记 `POST /api/admin/events`；本清单勾选回写。｜验收：新机器按 README 三步内跑起来（A5 由站主执行时一并复核）。
- [ ] **A7 v2 触发条件（只记账不排期）**｜HTTP/SSE 公网暴露（才碰 Caddy 白名单/token/限流；Node Streamable HTTP 传输走 `@modelcontextprotocol/node`）、ask 工具（走 dsh）、按域工具扩展、**经 dsh `mcp-client` 反向挂载**（让小影/未来 agent 把判断代理当外部工具调用——调查确认 dsh 原生支持，一条配置即可）、社区插件货架选型（`agent-runtime-backup/awesome-dsh-plugins`，280+：记忆/技能/多 Agent）——均以「外部真实用户或自用高频缺口」为触发。

## 明确不做

现有服务迁移 Cordis（已否决）；判断代理自带 LLM（v1 工具型）；任何写操作；向量检索；绕过 aiUsePolicy 的任何出口；在第一篇真实初稿发布前启动编码。

## 全局验收门

`pnpm typecheck`（含新包）→ 本包单测 → A5 dogfooding 实录；主站改动为零（v1 不动 apps/api）。
