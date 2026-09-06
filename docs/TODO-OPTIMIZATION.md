# 优化 TODO（源自 2026-09-05 项目完整分析）

来源：[archive/2026-09-05-项目完整分析.md](./archive/2026-09-05-项目完整分析.md)（分析基线 `6b5a5cb`，P1–P10 编号出自该报告）。

**执行状态（2026-09-06）**：T0–T4 全量完成。验收方式：隔离复现（临时 Git 仓库 / 假 runner / 拦截 spawn 参数）、真实 kernel 接线集成测（独立测试库）、全量验证链（typecheck + shared/api/web/admin 四套测试 + build:web 内嵌 GEO 门禁）全绿。遗留的部署侧人工动作见文末「部署须知」。

执行原则（继承自分析结论）：

- **缺陷修复与维护重构分批做**；每个缺陷修复配最少的高价值边界测试。
- **不放宽构建门禁迁就生成物**（发布器对齐门禁，共享 `PUBLISHED_POST_REQUIRED_FIELDS`）。
- 修复未破坏六条既有基线：静态读写分离；web 只读 `content.json`；AI 可关且引用 ⊆ citable；管理面双防线；原稿 hash 保护；shared 纯规则双端共用。

---

## T0 立即（公开安全边界 + 数据保护）— ✅ 完成

### T0-1 消除公开用户文本进 Windows shell（原 P1，高危）— ✅

- [x] `codex-agent.runner.ts`：spawn 一律 `shell:false`；prompt 走 stdin（`codex exec -`，官方非交互合同）；命令行只含固定 flag 与本机路径。
- [x] Windows 上 `CODEX_CLI_PATH` 指到 `.js` 入口时自动用 node 启动（`.cmd` shim 现代 Node 拒绝免 shell 执行）；运维要求已写入 `ops/windows/README.md`。
- [x] 守卫测试（`codex-agent.runner.test.ts`）：拦截 spawn 参数断言 `shell:false`、用户文本不出现在任何参数、prompt 经 stdin；非零退出如实报错。

### T0-2 保护未发布内容；内容提交不夹带代码（原 P4）— ✅

- [x] 新增 `pnpm check:content-dirty`（`scripts/check-uncommitted-content.ts`）：content/ 有未提交修改或未推送的内容提交即 exit 1；部署流已改为 `pnpm check:content-dirty && git pull`（AGENTS.md 已回写，删除了「直接 reset --hard 安全」的旧指引）。
- [x] `content-publish.ts`：暂存区存在非内容文件时明确拒绝；commit 用 pathspec 限定内容路径；git 调用全部免 shell。
- [x] 隔离仓库复现：无关暂存 → 拒绝且零新提交；干净暂存 → 提交只含内容路径，代码文件不进任何提交。

---

## T1 第一批：站主主链与工作站交付链走通 — ✅ 完成

### T1-1 恢复题苗主选（原 P2）— ✅

- [x] `SeedsPage`：主选改两步流——点目标线索 → 采集选题五问（中文标签，与 shared `ContentBrief` 一一对应）+ 可选 whyNow → 前端非空校验后提交。
- [x] 真实 kernel 接线集成测（`promote.kernel.integration.test.ts`，Nest Test module + KernelModule 含 ACTION_REPOSITORY）：缺 brief → `content-brief-incomplete` 且零副作用；带 brief → 建执行（含 brief）+ 自动生成写作任务。
- [x] 旧 `kernel.integration.test.ts` 手工构造补注入 ActionRepository、promote 补 brief（消除假绿路径）。

### T1-2 工作站发布产物过构建门禁（原 P3）— ✅

- [x] shared 新增 `PUBLISHED_POST_REQUIRED_FIELDS` + `missingPublishedPostFields`；`check-content-fields.ts` 门禁与 `PublicationService` 发布器共用同一合同。
- [x] 发布 frontmatter 补齐七字段（form/domain/intent/valueMode/aiUsePolicy/updated/summary；工作站默认 article/product/share/utility + AI-2 人工审核策略，模型输出可覆盖）；缺字段在写盘前即拒。
- [x] 发布状态链改为诚实语义：`publishWebsite` → **PREPARED**（文件落盘 content/log，不声称已发布）→ `pnpm content:publish --push` 上线 → `verifyWebsite` 线上校验 → PUBLISHED / FAILED；workbench 页展示发布状态与下一步提示。
- [x] 测试：frontmatter 过共享门禁断言 + verify 翻转断言 + `three-work.acceptance` 全链更新为新合同。

### T1-3 审核可恢复；取消是稳定终态（原 P5）— ✅

- [x] `WorkstationPage`：Review 按 workId/状态直接进入，审阅包与发布记录从服务端恢复（刷新不再丢入口）；审阅展示**完整候选正文**（所见即所批）；Approve 绑定审阅包 candidate.hash（未加载时自动拉取）。
- [x] `ProductionService`：每 work 运行互斥（原子 check-and-set，并发双跑 400 `work-already-running`）；AbortController 端到端传入 runner；取消后迟到结果不得覆盖终态（`WorkRepositoryPort.setStatusUnless` 条件更新 + Prisma `updateMany` 实现）；取消导致的 runner 中止归入 CANCELLED 而非 FAILED。
- [x] 测试：在途取消保持 CANCELLED 终态（无 REVIEW_READY 写入）、并发互斥拒绝、`workstation.chain.integration.test.ts` 全链（初稿→生产→刷新审阅→同 hash 批准→发布文件过门禁→线上校验 PUBLISHED）。

---

## T2 第二批：会话、流式、配额、取消的一致性 — ✅ 完成

### T2-1 助手会话归属校验（原 P6）— ✅

- [x] `AssistantService.preflight`：只有「已登记 + 属于当前访客 + harness 会话」才允许续轮；未知/他人/规则会话/存储失败一律静默开新会话（fail-closed 不阻断提问）。
- [x] 仓储新增 `findSession`；测试覆盖他人 sessionId、未知、规则会话、存储失败四种情形。

### T2-2 流式契约、deadline 与端到端取消（原 P7）— ✅

- [x] 流式展示合同（shared `extractStreamedAnswer`）：text-delta 经服务端裁剪，只外发 answer 字段已闭合文本的增量；原始模型 JSON（含 citations）不出网关；容忍 `"answer" : "` 空白变体；终值仍走 `parseAssistantOutput` 完整校验并由 done 事件整体覆盖。浏览器不再解码模型私有格式。
- [x] deadline 从入队起算（排队时间计入 15s 预算）；排队容量熔断（等待者 >3 直接规则兜底）。
- [x] 端到端取消：SSE 控制器监听客户端断流 → abort → 适配器弃结果、关 runtime、走兜底。
- [x] 浮窗接线修复：`onStop` 传入 AssistantThread（流式中可停）；外部 `inputRef` 接到真实 textarea（打开自动聚焦生效）。
- [x] 测试：流式只外发裁剪文本、排队耗尽预算不开 runtime、abort 后兜底并关实例。

### T2-3 配额消费与线索写入原子性（原 P8）— ✅

- [x] 配额改原子条件消耗（`updateMany` 单语句分支：递增 / 过期重置 / 创建 + 唯一键冲突重试），并发首消恰好一个成功。
- [x] intake 改预留/补偿：先扣配额（拒绝时零线索落库）→ AI 调用（不进事务）→ 建线索失败则释放配额；仓储新增 `release`。
- [x] 集成测（独立测试库）：并发同游客恰一次成功、配额计数=1、线索恰一条、后续拒绝仍不留孤儿。

---

## T3 第三批：状态与恢复的证据 — ✅ 完成

### T3-1 权威文档与现状对齐（原 P9）— ✅

- [x] `CLAUDE.md` Admin 鉴权段重写为现行双层凭据；`docs/api/README.md` 重写（鉴权、promote 必带 brief、工作站全部端点、PREPARED 发布链、会话归属、流式合同）。
- [x] `docs/STATUS.md` 顶部重写为当前事实（已切流/探针 200），历史探针记录注明日期；「公网未交付助手」等过时表述更新；`docs/ENGINEERING.md` Vercel 现状段同步。
- [x] `ToolsPage` 访客文案更新为当前事实（处理服务公网可用）。

### T3-2 独立测试库 + 高价值边界测试 — ✅

- [x] vitest 强制 `walker.test.db` 独立测试库（globalSetup 每次删库重建 schema；`API_TEST_DB_URL` 可显式指定 PG）；测试不再写开发库。
- [x] 分析建议的 8 个边界用例全部落地：正式 Kernel 主选（promote.kernel）；刷新后审阅批准 + 发布过门禁（workstation.chain）；并发配额只消费一次（kernel.integration）；取消后迟到结果不改终态 + 运行互斥（production.service.test）；跨身份不能续用 session（assistant.service.test）；非法终值不出网关 = 流式裁剪 + fail-closed（harness adapter test）；Windows 用户输入永不成为 shell 语法（codex runner guard test）。

### T3-3 恢复能力与版本证据 — ✅（代码与手册落地；演练待运维执行）

- [x] health 输出 `version`（`.env` 写 `WALKER_BUILD_VERSION=<git short SHA>`）；`ops/windows/README.md` 新增「部署验证清单」（版本标识 + 8788/443 归属 + 路由隔离，四步核对）。
- [x] `ops/windows/README.md` 新增「备份与恢复」：恢复对象清单（SQLite/主密钥/.env/原稿产物/未发布内容/DSH 凭据/管理凭据）+ 最低备份基线 + **演练记录表（如实标注「尚未演练」）**。

---

## T4 随后按证据 — ✅ 完成

### T4-1 RSS 40 篇上限修复（原 P10b）— ✅

- [x] 移除 `emit-static-feeds.ts` 的 `.slice(0, 40)`：RSS/JSON Feed 条目契约 = 全部 browse 条目（与 verify-geo 双侧校验同源）。构建到 41+ 篇不再必然失败。

### T4-2 PG 迁移补齐（原 P10a）— ✅

- [x] 新增迁移 `20260906000000_assistant_insights_credential`（AssistantSession/AssistantRun/AssistantBudget/Credential/InsightReport 五表）；18 张表全部有迁移覆盖，列与索引和 `prisma migrate diff --from-empty` 期望 DDL 逐项一致。启用 PG 前仍须空库重放实测（本机 Docker 未运行）。

### T4-3 维护性重构（行为保持）— ✅（除路由拆包按证据延后）

- [x] `ContentAdminService`：cwd 用 `pnpm-workspace.yaml` 定位 monorepo 根；`content:gen` 非零退出记录日志。
- [x] `ContentEditPage`：保存期间禁用按钮；响应只在用户未继续输入时回写（后到响应不覆盖新输入）。
- [x] Workstation：`load` 改纯读取（外层 run 统一错误处理，内层失败不再被外层成功清除）；创建表单稳定幂等键（重试不重复建 work）+ pending 状态。
- [x] 助手预算 fail-open 加进程内兜底计数（按日重置）并记 `budget-storage-failed` 事件。
- [x] `generate-content`：内容不变时不再重写 content.json（消灭 generatedAt 无意义 diff，实测零 diff）。
- [ ] 路由级拆包与首屏度量：**按证据延后**（先量首屏/交互时间再动手，见分析结论；当前 28 篇内容规模收益有限）。
- [ ] 观测采集（队列等待/首字延迟/tokens/降级原因）：随助手预算兜底已落第一步，完整采集待真实流量数据。

---

## 明确不做（本轮，与分析结论一致）

- 账号体系、多租户、社区网络；微服务、Redis、向量库、更换前端框架；迁移托管 PG；拆组件/通用 Manager 式重构。

## 部署须知（代码之外的人工动作）

1. ~~核对 `CODEX_CLI_PATH`~~ → **已核实（2026-09-06 SSH 实查）无需动作**：生产盒子上未装 codex、`.env` 未配 `CODEX_CLI_PATH`，卡口 AI 自上线起一直走规则兜底（改前改后行为一致）。`.env` 里的 `WALKER_DSH_RUNTIME_BIN` 已是 node + .js 入口形态（免 shell 可启动），助手不受影响。**将来若要真正启用卡口 AI**：需在盒子安装 codex、在 `.env` 配 `CODEX_CLI_PATH` 指向 `.exe` 或 `.js` 入口（不能是 `.cmd` shim）、并准备 codex 自身的模型凭据——是否引入该依赖属产品决策。
2. 部署流新增一步：`pnpm check:content-dirty` 在 `git pull` 之前（服务器 content 有未发布修改时先发布或备份）。
3. 建议在 `.env` 写 `WALKER_BUILD_VERSION=<git short SHA>`，部署后按 ops README 四步核对。
4. PG 迁移已补齐但未空库实测（本机无 Docker）；启用 PG 前先重放验证。
