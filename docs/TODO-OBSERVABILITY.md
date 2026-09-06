# 观测与数据执行清单（原子版）

来源：2026-09-06 复用调查（dsh 会话数据平面 / pi 架构原则），资产见 `~/Desktop/agent-runtime-backup/MANIFEST.md`。
真相源立场：**网关事件总线（FeatureEvent/AssistantRun）是全站真相源，harness 事件只做 enrichment**；复用优先，仅批 1 写采集代码。

原则：访客匿名红线不破例（明文 IP 不落库、无画像、无新外发出口）；每个字段对应一个决策，否则不采；reasoning 流全文不落库；观测全部在 token 防线内；前端点击流与 PV 自建不做（Vercel 分析覆盖曝光）。

已拍板决策（细化时定死，执行不再议）：

1. 遥测关闭走**代码默认**：适配器 `childEnv` 注入 `DSH_TELEMETRY_DISABLED=1`（显式设 `DSH_TELEMETRY_ENABLED_OVERRIDE` 才可重开用于探针），不依赖服务器 .env。
2. dsh 会话文件（zstd）当**运行时缓存**治理：保持压缩 + 90 天按目录删除；不改 `compression`、不换 SQLite 后端（无读原文的决策场景）。
3. token 数据源 = `step/end` 事件的 `usage?: TokenUsage`（多 step 求和，缺失记 0 不记 null，与 dsh 自身 fold 的容错一致）。
4. `degradeReason` 词表（kebab，与 FeatureEvent failCode 同风格）：`ai-disabled` / `budget-exceeded` / `timeout` / `client-abort` / `queue-full` / `queue-deadline` / `bad-output` / `runtime-error`；正常 AI 回答为 null。
5. 洞察周报（InsightsService 自起 runtime）与工作站配方（codex，生产未启用）**不进批 1**，列批 3 按证据。

---

## 优先级总览

| 级 | 主题 | 为什么这个位置 | 量级 |
|---|---|---|---|
| **P0** | 运行时治理收口 | 零代码，先关隐私/磁盘两个已发生风险 | 半天 |
| **P1** | 网关侧 AI 采集 | 唯一代码批，是 P2 数据页的数据地基 | 1–2 天 |
| **P2** | 数据页三标签 | 纯查询视图，依赖 P1 产出 | 1 天 |
| **P3** | 按证据可选 | 每项都有触发条件，不预先投入 | 按需 |

依赖链：P0 独立可先行；P2 依赖 P1 的 AssistantRun 新列；P1 内部 1→2→3→4→5 顺序（shared 合同先行，schema 次之，适配器/服务最后）。

---

## P0 · 运行时治理（零风险收口）

- [ ] **P0-1 遥测默认关闭（代码层）**｜`apps/api/src/adapters/harness-assistant.adapter.ts`｜`buildDefaultRuntimeFactory` 的 `childEnv` 增加 `DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_ENABLED_OVERRIDE ? undefined : '1'`；同文件单测断言 child env 含该键。｜验收：AI 开时起 runtime 的测试里 env 断言通过；ops README 注明重开方式（设 override + 重启）。
- [ ] **P0-2 会话清理脚本**｜新增 `ops/windows/prune-dsh-sessions.ps1`（**纯 ASCII 注释**，参数 `-Days 90`，删 `%USERPROFILE%\.dsh-assistant\sessions` 下 LastWriteTime 早于阈值的 `session-*` 目录，输出删除数与释放量，`-WhatIf` 干跑）｜验收：服务器干跑一次输出统计，正式跑一次后 `dir /s` 文件数下降，站点 assistant 功能不受影响（下一问自动重建会话）。
- [ ] **P0-3 手册回写**｜`ops/windows/README.md`｜「备份与恢复」表补一行（dsh 会话目录=缓存、90 天清理、不属恢复对象）；「部署验证清单」后补「周期运维」小节登记 prune 脚本的可选 schtasks 月任务注册命令。｜验收：手册与实际脚本参数一致。

## P1 · 网关侧 AI 采集（唯一代码批）

- [ ] **P1-1 shared 合同扩展**｜`packages/shared/src/assistant.ts`｜`AssistantRunResult` 增可选字段：`usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number }`、`firstChunkMs?: number`、`queueWaitMs?: number`、`degradeReason?: string`；导出 `DEGRADE_REASONS` 词表常量。｜验收：shared 单测覆盖字段类型与词表完整性；老调用方（rule adapter 等不填即 undefined）typecheck 全绿。
- [ ] **P1-2 存储扩列**｜`apps/api/prisma/schema.prisma` + `schema.postgresql.prisma` + 新迁移 `20260906120000_assistant_telemetry/migration.sql`｜AssistantRun 加列 `tokensIn Int @default(0)`、`tokensOut Int @default(0)`、`cacheReadTokens Int @default(0)`、`firstChunkMs Int?`、`queueWaitMs Int?`、`degradeReason String?`；AssistantBudget 不动（列已存在）。迁移用 `prisma migrate diff --from-empty` 期望 DDL 比对（复用 T4-2 验收法）。｜验收：sqlite `db:push` 通过；迁移 DDL 与期望逐列一致。
- [ ] **P1-3 仓储端口扩展**｜`ports/assistant.repository.ts` + `adapters/prisma-assistant.repository.ts`｜`saveRun` 入参增同名字段（透传）；`bumpRequests(date)` 扩为 `bumpRequests(date, usage?: { tokensIn: number; tokensOut: number })`（upsert 原子 increment，签名向后兼容默认值）。｜验收：kernel 集成测在独立测试库跑通预算 token 累加。
- [ ] **P1-4 适配器采集**｜`adapters/harness-assistant.adapter.ts`｜(a) onNotification 除 `assistant/chunk` 外解析 `step/end`：`event.data.usage` 多条求和、`cacheReadTokens` 取 `cacheReadTokens ?? 0` 求和；(b) 首个被转发的 answer 增量到达时刻 − 拿锁时刻 = `firstChunkMs`；(c) 入队时刻 − 拿锁时刻 = `queueWaitMs`；(d) 各兜底路径标注 `degradeReason`：超时/取消=`timeout`/`client-abort`、队满=`queue-full`、排队耗尽=`queue-deadline`、输出拒收=`bad-output`、传输/协议错=`runtime-error`；(e) 指标随 RunResult 返回（fallback 结果不带 usage，但服务层仍要原因——**决定：fallback.ask 的结果由适配器补上 degradeReason 再返回**，rule adapter 本身不动）。｜验收：假 runtime 推送含 usage 的 `step/end` + text-delta 序列，断言求和/首字/排队/原因四项；五条降级路径各一个用例断言原因正确。
- [ ] **P1-5 服务层落库**｜`assistant/assistant.service.ts`｜`preflight` 的 `useFallback` 分支标注 `budget-exceeded`；`config.isAiEnabled()=false` 分支标注 `ai-disabled`（在 service 而非 adapter 判，因为开关在网关）；`settle` 把 usage/延迟/原因写 `saveRun`，token 增量写 `bumpRequests`；流式与非流式同路径。｜验收：service 单测覆盖两种网关级原因 + 落库透传；现有关税/预算用例全数不破。
- [ ] **P1-6 部署**｜服务器｜`git pull`（先 `pnpm check:content-dirty`）→ 无 lockfile 变化则跳过 install → `pnpm build:shared && pnpm build:api` → `pnpm db:push`（sqlite 加列）→ 更新 `WALKER_BUILD_VERSION` → 重启 → 四步核验 + 真发一问，查最新 AssistantRun 行 tokens/firstChunkMs 非零、`aiUsedFlag=true` 行 `degradeReason` 为 null。｜验收：线上数据行肉眼可见新列有值。

## P2 · 数据页三标签（纯查询 + UI）

- [ ] **P2-1 使用排行端点**｜`metrics/metrics.service.ts` + `metrics.controller.ts`｜`GET /admin/usage/stats?days=30`：FeatureEvent 按 `featureKey × actorType × ISO 周` 分组计数（attempt/success/fail），guest/owner 天然分列；prisma `findMany` 近 N 天后内存 fold（量小，不写 groupBy SQL）。｜验收：API 返回结构 `{ weeks[], byFeature: { [key]: { guest: {…}, owner: {…} } } }`；owner 数据不混入 guest 列。
- [ ] **P2-2 AI 观测端点**｜同上文件｜`GET /admin/ai/stats?days=30`：AssistantRun 聚合——总请求/AI 占比（aiUsedFlag）、degradeReason 直方图、tokensIn/Out 合计、elapsedMs 与 firstChunkMs 的 p50/p90（内存排序取分位）、日均预算消耗。｜验收：字段齐、空库不炸（返回零值结构）。
- [ ] **P2-3 旅程回放端点**｜同上文件｜`GET /admin/journey?days=7&anonId=`：四源按时间交错——Clue（有 anonId，可过滤）、AssistantRun（经 AssistantSession.anonId 关联可过滤）、SearchMiss / ContentFeedback（无匿名键，仅时间窗并入，标 `anonymous`）。返回按 createdAt 升序的事件流 `{ at, source, actor, text }`。｜验收：anonId 模式只见该访客两源；窗口模式四源齐且有序。
- [ ] **P2-4 admin 数据页**｜`apps/admin/src/pages/DataPage.tsx`（新）+ `shared/routes.ts`/`nav.ts` + `api/admin-api.ts` 三个 client 方法｜三标签：使用排行（表格 + 简易周趋势条）、AI 观测（卡片 + 直方图列表）、旅程回放（时间轴列表）；页首固定「砍功能三维判别」提示：低频 × 不喂循环 × 可替代才砍。｜验收：admin typecheck/test 过；三个端点各自渲染非空（对着 P1-6 产生的真数据）。
- [ ] **P2-5 契约回写与部署**｜`docs/api/README.md` 三个新端点入管理表；服务器 build:admin + 重启 + 版本核对。｜验收：文档与实现一致；admin 页公网隧道可达。

## P3 · 按证据可选（触发条件写明，不预先做）

- [ ] `session-stats` 用户层挂载（`.dsh-assistant` patch 加一行）——**仅当** P1 网关折算不够（需要 decode 拆分 / step 级细分 / 多步配方成本归因）。
- [ ] 洞察周报 token 采集（InsightsService 折 usage，InsightReport 加列）——**仅当** 周报频率上升为每周例行且需要成本核算。
- [ ] AI 推荐命中率（citations/suggestedSlug → 事后 likes/浏览 join，无新端点）——**仅当** 需要回答「推荐有没有用」的调试问题。
- [ ] token → 成本折算展示（自维护牌价常量）——**仅当** token 数据积累一个月、需要预算金额化时。
- [ ] AssistantRun 保留自动化（90 天后清正文保统计）+ prune 脚本 schtasks 月任务化——**仅当** 行量上万或磁盘吃紧。
- [ ] 工作站配方（dsh 替代 codex 作 AGENT_RUNNER）随行采集——**随该产品决策一起做**，不单独先行。

## 全局验收门（每批完成必跑）

`pnpm typecheck` → `pnpm test:shared && pnpm test:api && pnpm test:web && pnpm --filter @walker/admin test` → 改了 web/admin 再 `pnpm build:web && pnpm verify:geo`；部署侧按 AGENTS.md 部署流 + ops README 四步核验。

## 明确不做（重申）

OTLP/外部遥测后端、自建 PV、Grafana/Sentry 类监控栈、reasoning 流存储、前端点击流、session-query-sqlite 接入网关、compression:'none'。
