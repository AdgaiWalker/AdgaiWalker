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

- [ ] **A0 骨架与参照核对**｜monorepo 新建 `apps/agent`（pnpm workspace、tsconfig、typecheck 接入根链）；**学习材料：`agent-runtime-backup/nano-cordis`（下午可读完的最小 Cordis 语义，含 composition/persistence 测试范本）+ dsh clone 的 `packages/bundle/sdk-minimal/cordis.patch.yml` 与 persona/system-prompt 插件**；依赖锁定：`@deepseek-ai/cordis`（与 dsh 同源）+ `@modelcontextprotocol/server` v2。｜验收：`pnpm -r typecheck` 含新包通过；空组合能以 stdio 起 MCP server 并响应 initialize。
- [ ] **A1 knowledge 插件**｜读 `content.json`（路径可 env 覆盖，默认 monorepo 构建产物）；只收 `aiUsePolicy.readable=true` 条目入索引；提供 `search(text)`（标题/标签/摘要简单打分即可，不上向量）、`get(slug)`、`byDomain(domain)`。｜验收：单测覆盖 citable=false 过滤与检索排序；content.json 缺失时报错不空转。
- [ ] **A2 persona 插件**｜站主决策人设模板：第三人称、方法论优先、答不了就直说、输出建议附出处 slug；模板文本放本包常量（不进 shared——它不是双端合同）。｜验收：模板单测断言关键规则在场；与 A3 工具描述共同构成调用方可见的「使用说明」。
- [ ] **A3 mcp 插件**｜三个工具：`search_judgment(query) → [{slug,title,summary,why}]`、`read_article(slug) → {title,body,tags,aiUsePolicy}`（仅 readable）、`list_methodology(domain?) → 高频 form/intent 聚合清单`；一个资源：citable 清单。**所有返回带 slug**；返回结构借鉴 llm-wiki-compiler 的 context-pack（紧凑证据包 + 引用随行），v1 用关键词/标签打分即可，不引 BM25/图扩展。｜验收：MCP 客户端断言工具 schema 与返回结构；citable=false 内容不出现在任何工具返回（负向测试）。
- [ ] **A4 telemetry 插件**｜计数回写主站 `POST` 管理事件端点（`x-admin-token` 走 env；端点沿用现有 FeatureEvent 面）；失败本地记日志不阻断。｜验收：假端点断言事件体（featureKey=`agent.mcp`，attempt/success）；端点不可达时工具调用仍成功。
- [ ] **A5 dogfooding 验收**｜站主本机 MCP 客户端（Claude Code / Codex 等）配置该 server；问「duola 会怎么评估 X」类问题，返回 ≥1 篇带出处方法论并给出贴合人设的建议。｜验收：真实客户端一次成功调用 + 截图/记录归档本文件底部；一次含敏感词查询确认脆弱内容（AI-1/citable=false）不外泄。
- [ ] **A6 部署与文档**｜`npx`/本地脚本启动方式写 README；`docs/api/README.md` 不动（非 HTTP 面）；本清单勾选回写；ops 手册登记「独立进程、只读数据、token 只进 env」。｜验收：新机器按 README 三步内跑起来。
- [ ] **A7 v2 触发条件（只记账不排期）**｜HTTP/SSE 公网暴露（才碰 Caddy 白名单/token/限流；Node Streamable HTTP 传输走 `@modelcontextprotocol/node`）、ask 工具（走 dsh）、按域工具扩展、**经 dsh `mcp-client` 反向挂载**（让小影/未来 agent 把判断代理当外部工具调用——调查确认 dsh 原生支持，一条配置即可）、社区插件货架选型（`agent-runtime-backup/awesome-dsh-plugins`，280+：记忆/技能/多 Agent）——均以「外部真实用户或自用高频缺口」为触发。

## 明确不做

现有服务迁移 Cordis（已否决）；判断代理自带 LLM（v1 工具型）；任何写操作；向量检索；绕过 aiUsePolicy 的任何出口；在第一篇真实初稿发布前启动编码。

## 全局验收门

`pnpm typecheck`（含新包）→ 本包单测 → A5 dogfooding 实录；主站改动为零（v1 不动 apps/api）。
