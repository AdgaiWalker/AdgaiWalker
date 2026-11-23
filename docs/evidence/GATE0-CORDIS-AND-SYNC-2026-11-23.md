---
status: active
type: evidence
title: 第 0 关前置取证与一页裁决书（Cordis 演进与双端同步修复）
version: v1.0
last_verified: 2026-11-23
ssot: false
applies_to: [api, admin, web, agent, ops]
---

# 第 0 关：前置取证与一页裁决书

> 依据任务书：[PROPOSAL-CORDIS-EVOLUTION-AND-SYNC.md](../specs/PROPOSAL-CORDIS-EVOLUTION-AND-SYNC.md) 第三节与第四节「第 0 关」。
> 取证日期：2026-11-23（本地仓库 HEAD `61b6c13`；生产盒子 `walker-tencent` 只读实测 HEAD `3f958c7`，经站主明确授权经 SSH 只读采集）。未修改生产服务器任何状态，未写业务代码。

---

## 一、一页裁决书（结论先行）

### 1. 总裁决

| 关卡 | 裁决 | 一句话理由 |
|---|---|---|
| **第 1 关：双端同步与发布正确性修复（不依赖 Cordis）** | **GO（立即放行）** | 8 项缺陷已 100% 从源码证实；去除衍生 JSON 入库的唯一运行时阻塞点（`fs-knowledge-graph.ts`）已定位且极小，可独立根治日常写作痛点。 |
| **`apps/api` 整体迁入 Cordis 取代 Nest** | **REJECTED（当前否决）** | [PLAN.md](../../PLAN.md) §6 触发条件未满足；API 的 7 处长驻效应中 5 处与不可逆持久化/单槽子进程/`main.ts` 顺序恢复门强绑定，强迁只会变大变脆。 |
| **第 2 关：Cordis 插件化验证切片** | **DEFERRED / NARROW（第 1 关完成后有条件触发）** | 仅在两条窄路径中二选一：**2A（首选，零双容器风险）** 在已有 Cordis 的 `apps/agent` 统一版本到 `4.0.2` 并落地「快照变更→`KnowledgeService` 反应式刷新」；**2B（限时 14 天实验）** 仅把第 1 关的后台同步任务挂进 `apps/api` 的独立子 `Context`，不碰 HTTP 路由与 Prisma，超期或超预算即拆回第 1 关。 |

### 2. Cordis 适用 / 不适用清单

| 分类 | 归属模块 / 效应 | 依据（来自 `@deepseek-ai/cordis@4.0.2` 源码与本仓库） |
|---|---|---|
| **适用（纯运行时可逆效应 / 响应式协效应）** | ① `apps/agent` 的 `KnowledgeService`（监听 `active.json` 切换并驱动下游 `McpService` 重载）<br/>② 第 1 关拆分后的**后台同步/轮询任务**（若有运行期启停或策略切换需求）<br/>③ `ReminderScanService` 的 5 分钟定时器（弱候选，当前无热插拔需求） | Cordis `Fiber` + `ctx.effect` + `inject` 原生解决可逆资源清理与上游依赖撤离/恢复。 |
| **不适用（不可逆状态 / 顺序恢复门 / 外部世界）** | ① `PrismaAdapter`（SQLite 连接与 27 条 schema 迁移）<br/>② `main.ts` 的 10 步 fail-closed 启动恢复门（`restoreGate` → `manifestReplay` → `deletion/export` 补跑 → 放行流量）<br/>③ `HarnessAssistantAdapter`（~224MB 常驻 `dsh` 进程，其内部已是 Cordis）<br/>④ `AgentExecutionService`（单槽租约与进程树清理）<br/>⑤ Git 远端推送、Vercel 部署、`content/versions` 只追加写入、`AdminRequestLog` fail-closed 审计、`Caddyfile` 公网白名单 | `cordis@4.0.2` 的 `Fiber._unload()` 并行执行顶层 disposer 且**吞掉清理异常记日志（fail-open）**；且上游基础服务重载会**级联卸载全树依赖插件**，无法提供启动顺序屏障或外部世界回滚。 |

### 3. 单向门 vs 双向门分类

| 门类 | 具体决策项 | 约束 |
|---|---|---|
| **单向门（难回头，必须先备后切）** | 生产 SQLite 表结构变更（如新增草稿表/同步状态表）、既有公开 URL（`/posts/:slug`、`/posts/:slug/v/:n`）、`content/versions` 既有历史目录格式、`Caddyfile` 公网路由白名单、从 Git 主分支停止追踪 `apps/web/src/generated/*.json`（需同步更新全部 CI/构建脚本） | 任何单向门必须先通过本地隔离演练与 `backup-walker.ps1` 一致性快照；**第 1 关优先尽量不加新迁移，若必须加则保持纯扩展式向前兼容**。 |
| **双向门（可随时回退）** | 同步策略实现切换（GitHub API vs 独立工作树）、`fs-knowledge-graph.ts` 读取来源、`GitSyncBadge` UI 状态展示、第 2 关的 Cordis 子 `Context` 包装、`apps/api` 内静默模块整理 | 全部放在端口/接口之后；触发止损线时可在 1 个 PR 内无损退回。 |

### 4. 硬性预算上限

| 维度 | 第 1 关（同步与发布正确性修复） | 第 2 关（窄 Cordis 验证切片，仅条件触发后适用） |
|---|---|---|
| **代码净变化** | 优先净减或小幅净增：**非测试代码净增 ≤ +400 行**（须含明确拆除清单，删掉旧假同步/补丁按钮/衍生 JSON 提交逻辑） | **非测试样板净增 ≤ +150 行**；若仅为包一层 Cordis 净增超过 150 行且无实测收益，立刻止损 |
| **工期上限** | 2–3 天（含真实裸仓库 + 双克隆 CI 故障注入套件） | 2A ≤ 1 天；2B ≤ 1.5 天，且双 DI 容器并存**硬性到期日 = 合入后 14 天** |
| **2C2G 盒子内存预算** | 同步/发布期间峰值 RSS 增量 **≤ +80MB**（现行在盒子跑 `pnpm content:gen + backfill + git` 容易冲击 512MB 余量门，改造后应**下降**而非上升） | 常驻 RSS 增量 **≤ +15MB**；G03 内存余量门禁（默认 512MB）零退化 |

### 5. 预注册预测（已用 2026-11-23 生产实测基线锁定，后续以实际产出核对）

> 生产基线已于 2026-11-23 经 `ssh walker-tencent` 只读采集完成（`C:\Walker\data\walker-v2.db`、`C:\Walker\logs\api.log`、`C:\Walker\app\data\runs`）。**在开始第 1 关代码前，建议先将本文件与提案提交进 Git，以提交时间戳固定「预测先于实施」。**

| 编号 | 指标 | 生产实测基线（2026-11-23） | 预注册目标（第 1 关后） | 预注册目标（第 2 关后） | 验证方式 |
|---|---|---|---|---|---|
| P1 | 双端 5 类对抗场景 + LF/CRLF + 伪造 Webhook 签名 | 缺真实双克隆故障注入；Webhook 零验签；衍生 JSON 必冲突；`other-content-dirty` 阻断多草稿；Windows CRLF 实测已污染 `3f958c7` | **7/7 黑盒场景在 CI 全绿**（真实 `--bare` + 双克隆） | 保持全绿 | `pnpm test:api` + CI |
| P2 | 网页发布或同步中断后，生产代码目录 `git status` | `verify()` 写 `content/versions` 后必脏；`4b1aa53` 因 `behind` 拒推遗留 `UNKNOWN` 且重推产出仅含 CRLF 漂移的幽灵提交 `3f958c7` | **生产代码目录恒干净（0 脏文件、0 stash、0 rebase 残留、0 幽灵提交）** | 保持不变 | 集成测试 + 盒子复检 |
| P3 | 发布端到端完成率（`PUBLISHED` + `SYNCED`）与人工介入 | **0 / 3 到达 `PUBLISHED`（0%）**：2 笔永久滞留 `VERIFYING`（`assistantIndexState=PENDING`）、1 笔 `UNKNOWN`（`non-fast-forward` 拒推）；手动保存冲突 **2 / 11（18.2%）**；`verify` 1 次 409、`prepare` 1 次 403 | **非同篇冲突场景端到端 `PUBLISHED` + `SYNCED` 完成率 = 100%**；手动 SSH / 删草稿 / 人工解冲突 = **0 次**；同篇冲突显式保留双方不丢稿 | 与第 1 关持平（不靠 Cordis 改善） | 生产 `ContentRelease` / `AdminRequestLog` / `api.log` |
| P4 | 同步/发布耗时与盒子资源扰动 | `POST /sync/pull` 均耗 **21.4s**（3 次）；`GET /sync/status` 均耗 **4.05s**（同步执行 `git fetch`）；`POST /release/preflight` 被 5s 轮询打 **432 次**（均 214ms）；发布脚本耗时 **14.4s–42.6s**；盒子可用内存 **545MB / 2015MB**（仅高出 512MB 门禁 33MB），`api.log` 录得多次 SQLite 5000ms 事务/Socket 超时（6.4s–22.1s） | 状态查询 **P95 < 500ms**（不阻塞在同步 `git fetch`）；去除 5s `preflight` 轮询风暴；单篇同步/发布均值 **< 5s**（非 Vercel 等待期）；发布期间不触发 SQLite 超时、可用内存不跌破 512MB 门禁；零假绿灯 | 不劣于第 1 关 | 生产 `AdminRequestLog` + `api.log` + 盒子内存采样 |
| P5 | 受控需求回放（选 `f1285bb` 社媒追踪、`04eb087` 同步、`c43dae9` 草稿清理 3 项历史需求） | 当前基准分支各自触碰的中心接线/非业务文件数（动手前按历史 commit 精确建表） | 第 1 关不承诺改变全局接线文件数 | 若做第 2 关，新增/替换同类同步或知识插件时，消费方 `git diff` = **0 行**，非插件自身修改文件数 **≤ 1 处（装配清单）** | 受控分支 `git diff --stat` |
| P6 | `apps/agent` 知识快照更新生效方式（若选 2A） | 当前 `KnowledgeService` 仅启动时读一次，快照切换必须重启进程 | 不变 | 无需重启进程，卸载/重载 20 轮监听器与 watcher 句柄归零 | `apps/agent` 自动化属性测试 |

---

## 二、前置取证详实记录

### 取证 1：Cordis 论文与本地 `@deepseek-ai/cordis@4.0.2` 源码核实

1. **论文核实状态（如实标注）**：
   - 通过 arXiv 公开元数据与摘要核实：*A Programming Paradigm for Spatiotemporal Composability*（`arXiv:2608.25512`，作者 Yifan Shi、Wei Zhang、Tianyi Cui，Peking University & DeepSeek-AI，2026-08-26 提交，论文仓库 `github.com/cordiverse/paper`）。
   - **诚实局限**：本轮仅核实了 arXiv 摘要与仓库本地安装的完整 TypeScript 源码，**未直接通读论文完整 PDF 证明章节**；本裁决的所有运行时行为断言均直接以本地源码为准。
2. **本地 `@deepseek-ai/cordis@4.0.2` 一手源码核实**（路径：`node_modules/.pnpm/@deepseek-ai+cordis@4.0.2.../node_modules/@deepseek-ai/cordis/src/`）：
   - `context.ts`（146 行）：`Context` 是 Proxy，内置 `reflect` / `registry` / `events` / `logger` 四个服务，提供 `extend`、`isolate`、`intercept` 作用域隔离。
   - `service.ts`（115 行）：`Service` 构造即注册到 `ctx.reflect.provide()`，随所属 `Fiber` 卸载自动注销，支持 `[Service.check]` 可用性谓词与 `[Service.resolveConfig]` 拦截配置合并。
   - `fiber.ts`（754 行）——**三条决定工程取舍的关键实现细节**：
     1. **单 `effect()` 内 LIFO，但顶层 `_unload()` 是并行且 fail-open**：单次 `ctx.effect()` 内部收集的 disposer 按 `reverse()` 串行链式清理（`fiber.ts:431-440`）；但 `Fiber._unload()` 对该 Fiber 挂的所有顶层 `_disposables` 用 `Promise.all` 并行清理，且 `catch (reason) { this.ctx.logger.error(reason) }` **吞错记日志**（`fiber.ts:675-686`）。这与本项目 `AdminRequestLog` / `restoreGate` 的 **fail-closed 顺序屏障**语义相反。
     2. **启动失败可回滚，运行期回调异常不兜底**：`_reload()` 捕获插件启动/配置校验异常，置 `FiberState.FAILED` 并调用 `_unload()` 回滚已注册效应（`fiber.ts:646-673`）；但异步回调/请求处理中抛出的未捕获异常不会由 `Fiber` 隔离。
     3. **上游服务变更触发全下游卸载**：`_refresh()` 以 `inject` 中每个服务的 `impl.fiber.uid` 拼出 `epoch`（`fiber.ts:611-623`），任一必需上游重载或撤离都会触发所有下游 Fiber 进入 `UNLOADING`。因此持久化连接或鉴权核绝不可轻易重载。
   - `registry.ts`（337 行）：支持函数 / 类 / `{ apply }` 三种插件形态、`StandardSchemaV1` 同步配置校验与 `ctx.inject()`。
   - **版本分裂实测**：[apps/agent/package.json](../../apps/agent/package.json) 依赖 `@deepseek-ai/cordis: ^4.0.1`，[apps/api/package.json](../../apps/api/package.json) 锁定 `4.0.2`（附带 `cordis-plugin-group / hmr / include / loader / timer` 供 `dsh` 使用）。目前分属不同进程暂无冲突；任何跨包共享 Context 前必须先统一版本。

### 取证 2：现有接缝与长驻生命周期效应全量盘点

1. **接缝现状**：`apps/api/src/ports/` 共 **70 个端口**、`adapters/` 共 **73 个适配器**、[kernel.module.ts](../../apps/api/src/kernel.module.ts) 共 **522 行 / 76 个 `provide:` 注册项**。API 已经是端口/适配器分层，缺的不是抽象缝，而是集中接线拆解与同步拓扑修正。
2. **`apps/api/src` 全部长驻生命周期效应（全仓非测试源码穷举）**：

| # | 文件 | 持有资源 / 钩子 | 与 `main.ts` 恢复门耦合 | 适合 Cordis？ |
|---|---|---|---|---|
| 1 | [prisma.adapter.ts](../../apps/api/src/adapters/prisma.adapter.ts) | SQLite 连接（`OnModuleDestroy` `$disconnect`） | 底层依赖 | **否**（不可逆持久连接；级联卸载风险） |
| 2 | [harness-assistant.adapter.ts](../../apps/api/src/adapters/harness-assistant.adapter.ts) | 常驻 `dsh` 子进程（~224MB，`OnModuleDestroy` `close`） | 独立 | **否**（`dsh` 内部已是 Cordis；2C2G 严控进程数） |
| 3 | [agent-execution.service.ts](../../apps/api/src/execution/agent-execution.service.ts) | `pump` 定时器 + `runtime.close()` + 单槽租约 | 在 [main.ts](../../apps/api/src/main.ts) L65 恢复门后启动 | **否**（强绑定租约与单槽纪律） |
| 4 | [assistant-event-recorder.service.ts](../../apps/api/src/assistant/assistant-event-recorder.service.ts) | `replayTimer` `setInterval`（spool 回放） | `OnModuleInit/Destroy` | 弱（无热插拔需求） |
| 5 | [conversation-deletion.service.ts](../../apps/api/src/log-resources/conversation-deletion.service.ts) | `resumeTimer` `setInterval` | 在 [main.ts](../../apps/api/src/main.ts) L50 恢复门内执行 `resumePending()` | **否**（绑定 `restoreGate`） |
| 6 | [conversation-export.service.ts](../../apps/api/src/log-resources/conversation-export.service.ts) | `maintenanceTimer` `setInterval` | 在 [main.ts](../../apps/api/src/main.ts) L54-56 恢复门内执行 | **否**（绑定 `restoreGate`） |
| 7 | [reminder-scan.service.ts](../../apps/api/src/reminder/reminder-scan.service.ts) | 每 5 分钟 `timer` `setInterval` | 在 [main.ts](../../apps/api/src/main.ts) L62-64 启动补检+定时器 | 弱（纯定时器，无热切换诉求） |
| 8 | [content-sync.service.ts](../../apps/api/src/content-sync/content-sync.service.ts) + [pnpm-content-release.runner.ts](../../apps/api/src/adapters/pnpm-content-release.runner.ts) | Webhook `setImmediate` 后台任务 / 缓存 / 按需发布子进程 | 独立（当前缺生命周期清理） | **唯一现实候选（待第 1 关重构拓扑后按需决定）** |

3. **`apps/agent` 现有 Cordis 使用审计**：
   - [apps/agent/src/index.ts](../../apps/agent/src/index.ts) 线性注册 5 个插件；
   - [apps/agent/src/plugins/knowledge.ts](../../apps/agent/src/plugins/knowledge.ts) 仅在 `constructor` 一次性同步读 `active.json` 并构建内存图谱，**没有监听变更或响应重建**（即 [PLAN.md](../../PLAN.md) §2 描述的「协效应：发布→知识反应式刷新」尚未兑现）。

### 取证 3：`PLAN.md` §6 解冻触发条件核验

- **原条款**（[PLAN.md](../../PLAN.md) §6 第 143 行）：`工作站迁入 Cordis 组合面 | 解冻触发：工作站成为长驻编排器（热装卸真需求出现）`。
- **实测核验结论：未满足。**
  1. 内容生产节奏为 **32 篇文章总量、近 90 天 7 次 `content/log` 提交**，不存在高频不停服热装卸业务插件的运维刚需；
  2. `apps/api` 中 7 处长驻效应里 5 处强依赖 `main.ts` 的 10 步 fail-closed 启动恢复屏障或单槽进程控制，引入动态热插拔会增加脆弱性而非降低复杂度；
  3. 本项目历史失败记录（`to-do.md` G03：把上线门放进热路径导致 28 个既有测试失败）说明，违背既有边界硬塞通用机制代价极高；
  4. 已有 Cordis 组合面 `apps/agent` 本身都还没用上响应式协效应，优先在那里验证（2A）比把 Nest 拆一半风险低一个数量级。

### 取证 4：同步与发布链路的确定性证据 vs 待采集生产假设

#### A. 代码已 100% 证实的确定性发现（可直接驱动第 1 关设计）

1. **代码部署树与内容工作树混布**：生产盒子 `C:\Walker\app` 同时跑编译态 `apps/api/dist` 和 `admin.iwalk.pro` 的内容读写；[content-sync.service.ts](../../apps/api/src/content-sync/content-sync.service.ts) 直接在其中执行 `git pull origin main --rebase --autostash`。
2. **衍生 JSON 进主分支的阻塞点已精确查清**：全仓穷举 `apps/web/src/generated/{content,graph,article-versions}.json` 的读取方发现：
   - `apps/web` 仅在构建期读取，且 [build-web.ts](../../scripts/build-web.ts) L11 在 Vercel 构建时**本就会执行 `pnpm content:gen`**；
   - [fs-site-content-index.ts](../../apps/api/src/adapters/fs-site-content-index.ts) 早已改读 `public-snapshots`，不再读 `generated/content.json`；
   - **整个 `apps/api` 运行时仅剩 [fs-knowledge-graph.ts](../../apps/api/src/adapters/fs-knowledge-graph.ts) L64-66 一处还在读 `generated/content.json`**。改由它直接从内容仓储按需建图并缓存后，3 个衍生 JSON 文件即可彻底退出 Git 追踪，根治「两端改不同文章必冲突」。
3. **发布核验后反向弄脏工作区**：[content-release.service.ts](../../apps/api/src/content-release/content-release.service.ts) L483-510 在 `git push` + Vercel 核验通过之后才写 `content/versions`，导致每次成功上线后磁盘立刻变脏。
4. **多篇草稿阻断单篇发布**：[content-release.service.ts](../../apps/api/src/content-release/content-release.service.ts) L255-275 因草稿直接落盘在 `content/log`，遇到第二篇脏文件即报 `other-content-dirty` 阻断发布。
5. **跨平台换行符无规范**：本地 Mac 上 31 篇 `.md` 当前均为 LF（0 篇 CRLF），但 [.gitattributes](../../.gitattributes) 缺失 `text=auto eol=lf` 规则，Windows 盒子若默认 `core.autocrlf=true` 会导致原始字节 SHA-256 CAS（[fs-content-file.repository.ts](../../apps/api/src/adapters/fs-content-file.repository.ts)）与 `git status` 漂移。
6. **假绿灯与静默吞错**：[content-sync.service.ts](../../apps/api/src/content-sync/content-sync.service.ts) L46-56 捕获 `git fetch` 失败仅记 warn；[GitSyncBadge.tsx](../../apps/admin/src/components/GitSyncBadge.tsx) L80-90 把 `unknown / diverged / ahead / dirty` 均显示为绿色「GitHub 已同步」，且前端查询默认不传 `force=true`。
7. **公网 Webhook 零验签**：[content-sync.controller.ts](../../apps/api/src/content-sync/content-sync.controller.ts) L30-40 与 [Caddyfile](../../ops/windows/Caddyfile) L87-93 暴露公网 `POST /webhooks/github` 且无 `X-Hub-Signature-256` 校验。
8. **既有附件资产现状（不可误伤）**：`content/log` 含 31 篇 `.md` + 1 篇 `.mdx`（`codex-intro.mdx`，引用 `public/learn/codex/img{1,2,3}.png`）+ 2 个裸图片文件（`skill结构图.png`、`微信支付码.jpg`）。第 1 关迁移必须无损保留。

#### B. 生产现场实测取证（2026-11-23 经 `ssh walker-tencent` 只读采集）

所有待核实假设均已取得第一手生产现场实锤：

1. **发布端到端完成率 0%（0 / 3 `PUBLISHED`）**：`C:\Walker\data\walker-v2.db` 共 3 条 `ContentRelease`——`rel_18543c21-972`（`2026-11-02`）与 `rel_eb792bd6-56f`（`2026-11-19`）全部永久滞留 `VERIFYING`（`verifiedAt=null`、`assistantIndexState=PENDING`），`rel_cfbde4e6-38d`（`2026-11-19`）落入 `UNKNOWN`（`release-outcome-unknown`）。
2. **`UNKNOWN` 失败的精确现场（`run_1795150874749_5435729d`，耗时 42.6s）**：
   - `2026-11-20 04:06:40` `api.log` 记录 `WARN [ContentSyncService] git fetch origin main 失败（如实降级）`，盒子未感知本地 Mac 已推送的 `61b6c13`（2026-11-11 QR 码改动），界面仍亮假绿灯；
   - 随后的 `content:publish --push` 本地建了提交 `4b1aa53`（仅 30 行文章却在 3 个衍生 JSON 制造 439 行改动），推远端被 GitHub 以 `! [rejected] HEAD -> main (non-fast-forward)` 拒推，发布单直接卡死在 `UNKNOWN`。
3. **Windows CRLF 污染致跨平台哈希永久不匹配（实锤）**：
   - 盒子 `C:/Walker/bin/mingit-2.53.0.3/etc/gitconfig` 实测为 `core.autocrlf=true`，且计划任务 `WalkerApi` 以 `SYSTEM / ServiceAccount` 运行，远端走 SSH `git@github.com:AdgaiWalker/AdgaiWalker.git`；
   - `2026-11-21 03:06` 执行 `git pull --rebase` 时，Git 把 `content/log/2026-11-19.md` 与版本 blob 改写为 CRLF（`\r\n`），随后重发产出幽灵提交 `3f958c7`——`git show 3f958c7` 直接证实整个提交只把 `content.json` / `article-versions.json` 中的 `\n` 改成了 `\r\n` 与时间戳；
   - **致命连锁反应**：Windows 盒子按 `\r\n` 计算 `sourceHash` / `publicHash`，而 Vercel（Linux）检出按 `\n` 构建，两侧 SHA-256 天然不等，导致 `verify()` 永远无法确证，问答快照 `assistantIndexState` 永远停在 `PENDING`。
4. **2C2G 资源挤压与 SQLite 超时（新发现第 9、10 项根因）**：
   - 盒子空闲物理内存仅 **545MB / 2015MB**（`node` 常驻 49.4MB、`caddy` 14.4MB），仅高出 512MB 内存门禁 33MB；
   - `AdminRequestLog` 实测：`POST /admin/content/release/preflight` 被前端 5 秒轮询打 **432 次**（均 214ms）、`GET /admin/content/sync/status` 均耗 **4.05s**（同步等 `git fetch`）、`POST /admin/content/sync/pull` 均耗 **21.4s**；
   - `api.log` 多次出现 `Transaction API error: Transaction already closed (5000ms timeout, passed 6455ms / 7581ms / 22109ms)` 与 `AdminRequestLogMiddleware` 的 SQLite `Socket timeout`——重型子进程 + 高频轮询在 2C2G 上直接挤爆 SQLite 事务窗口。
   - 手动保存 `content.manual-save.conflict` 2 / 11（**18.2% 冲突率**）。

> **附：本地与远端现状提醒**：当前本地 Mac 在 `61b6c13`，远端 `origin/main` 已有盒子推送的 `4b1aa53`（文章 `2026-11-19.md`）与 `3f958c7`（CRLF 幽灵提交）。进入第 1 关编码前应先将本地同步到 `origin/main` 最新提交（避免开发分支与线上内容分叉）。

---

## 三、生产盒子一键只读取证命令（Windows PowerShell）

以下命令**100% 只读**（不修改任何文件、Git 状态或数据库），直接在腾讯云 Windows 盒子 PowerShell 粘贴执行，把输出结果贴回即可补全预注册基线：

```powershell
# Pure ASCII & 100% read-only diagnostic script for Windows PowerShell 5.1 / 7+
# Credentials in remote URLs are redacted automatically before output.
Set-Location C:\Walker\app
Write-Output "=== 1. GIT STATUS ==="
git status --porcelain=v2 -b
Write-Output "=== 2. GIT STASH ==="
git stash list
Write-Output "=== 3. GIT LOG (10) ==="
git log --graph --oneline --all -n 10
Write-Output "=== 4. GIT CONFIG (redacted) ==="
git config --list --show-origin | Select-String -Pattern "autocrlf|eol|credential|remote\.origin|user\." | ForEach-Object {
  $_ -replace '(https?://)[^@\s]+@', '$1<REDACTED>@'
}

Write-Output "=== 5. TASK, NODE & MEMORY ==="
node -v
(Get-ScheduledTask -TaskName WalkerApi).Principal | Format-List UserId, LogonType
Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize
Get-Process node, caddy -ErrorAction SilentlyContinue | Select-Object Name, Id, @{N='WS_MB';E={[math]::Round($_.WorkingSet64/1MB,1)}}

Write-Output "=== 6. SQLITE BASELINE (read-only) ==="
@'
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let dbPath = 'C:/Walker/data/walker-v2.db';
try {
  const envText = fs.readFileSync('apps/api/.env', 'utf8');
  const m = envText.match(/^\s*DATABASE_URL\s*=\s*["']?file:([^"'\r\n]+)["']?/m);
  if (m && m[1]) dbPath = m[1].trim();
} catch {}
console.log('DB_PATH:', dbPath);
const db = new DatabaseSync(dbPath, { readOnly: true });
for (const [label, sql] of [
  ['releases_by_stage', "SELECT stage, COALESCE(errorCode,'') AS errorCode, count(*) AS cnt FROM ContentRelease GROUP BY stage, errorCode"],
  ['recent_releases', "SELECT id, targetSlug, stage, assistantIndexState, COALESCE(errorCode,'') AS err, publishApprovedAt, verifiedAt FROM ContentRelease ORDER BY publishApprovedAt DESC LIMIT 15"],
  ['content_admin_requests', "SELECT method, path, statusCode, count(*) AS cnt, round(avg(durationMs)) AS avgMs FROM AdminRequestLog WHERE path LIKE '%content%' GROUP BY method, path, statusCode"],
  ['content_audits', "SELECT action, outcome, count(*) AS cnt FROM AuditRecord WHERE action LIKE 'content.%' GROUP BY action, outcome"],
]) {
  console.log('==', label, '==');
  console.table(db.prepare(sql).all());
}
'@ | node --input-type=module

Write-Output "=== 7. API LOG TAIL (sync/release/git, last 40 matches) ==="
Get-Content C:\Walker\logs\api.log -Tail 400 | Select-String -Pattern "sync|git|publish|release|webhook|conflict|UNKNOWN|error" -CaseSensitive:$false | Select-Object -Last 40
```

---

## 四、第 1 关进入条件与下一步

1. **基线已采集完成**：P1–P6 预注册基线与目标已全部回填完毕，**建议先提交本裁决书与提案进 Git**（以提交时间戳固定「预测先于实施」），同时拉齐本地 `main` 到远端 `3f958c7`（含线上 `2026-11-19.md`）；
2. **第 1 关必须根治的 10 项已证实根因（代码 8 项 + 生产实锤新增 2 项）**：
   - 彻底切断生产 `C:\Walker\app` 运行态代码树上的 `git pull --rebase` / `git push`（避免与代码提交互相 `non-fast-forward` 撞车）；
   - 将 `fs-knowledge-graph.ts` 改为直接从内容源计算图谱，取消 Git 对 `apps/web/src/generated/{content,graph,article-versions}.json` 的追踪（消除 30 行文章带出 439 行 JSON 假冲突）；
   - 草稿区与发布提交物理分离（支持多草稿并存且不阻断单篇发布），发布版本写入与推送次序闭合（不再在核验后反向弄脏工作区）；
   - `.gitattributes` 强制 LF **且** 内容读取/写入/哈希归一化为 LF（彻底终结 Windows `\r\n` vs Vercel Linux `\n` 导致 `verify()` 永远失败的死结）；
   - 消除 `ContentReleasePanel` 5 秒 `preflight` 轮询风暴（实测 432 次）与 `GET /sync/status` 同步阻塞 4s `git fetch`、避免在 2C2G 盒子上挤爆 SQLite 5000ms 事务超时；
   - Webhook 增加 HMAC-SHA256 验签、`GitSyncBadge` 诚实展示全部状态与错误（禁止假绿灯）。
