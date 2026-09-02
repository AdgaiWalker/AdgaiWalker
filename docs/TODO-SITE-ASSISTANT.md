# 站内助手执行 TODO

配套 [`PRD-SITE-ASSISTANT.md`](./PRD-SITE-ASSISTANT.md) 的执行清单。规则：按优先级串行推进，同优先级内按编号；每个任务勾掉前必须过它的验收；小问题按「决策授权」自决并记入日志，红线问题停下报告。

## 优先级框架

| 级 | 内容 | 为什么这个位置 |
|---|---|---|
| **P0** | 引擎链路：harness 跑通 + Run 合同 + 双适配器 + /api/assistant | 外部风险最高（rc 软件）且是一切的地基；其中纯代码部分与环境无关，可与 install 并行 |
| **P1** | 访客界面：对话框 + 三入口 + noindex 处理 | 价值交付点；不依赖生产，本地即验 |
| **P2** | 公网上线：预算熔断 + 盒子部署 + Vercel 反代 | 影响面大，放最后；依赖 P0/P1 全绿 |
| **P3** | 按证据启动（不排期） | 流式/ACP/索引注入/dsh-im 渠道/记忆插件 |

---

## P0 引擎链路

### T0.1 环境（阻塞 T0.2）

- [x] Corepack 启用 pnpm@11.7.0（仓库 `packageManager` 锁定值）
  - 命令：`corepack enable && cd ~/Desktop/deepseek-harness && corepack prepare pnpm@11.7.0 --activate && pnpm -v`
  - 验收：`pnpm -v` 输出 11.7.0 ✅（2026-08-30）

### T0.2 安装与构建（后台跑，与 T1 并行）

- [x] `pnpm install`（31.1s；两个 bin 链接 WARN 为 workspace 自引用，无影响）
- [x] `pnpm run build` ✅（零 error，218 client artifacts）

### T0.3 冒烟与实测（依赖 T0.2）

- [x] `pnpm dsh --profile headless "只回复 pong"` —— **全链路实测通过**：SDK 客户端连 clone runtime，模型真回 `pong`（3043ms）；期间发现并解决：① `~/.dsh` 默认 provider 是 grok（无适配器）→ 建独立 `~/.dsh-assistant`（deepseek + read-only）；② 子进程 cwd 必须指 clone（否则宿主仓库旧版 cordis 污染解析）
- [x] runtime 常驻内存实测：**224MB**（远低于 800MB 推翻线；盒子 2C2G 可养）
- [x] `--profile sdk` 可起 ✅（e2e 即经此路径）

### T1.1 Run 合同 + 纯函数（无环境依赖，立即可写）

- [x] `packages/shared/src/assistant.ts` + `assistant.test.ts` ✅（5 测试绿；`feature-keys` 增 `assistant.ask`）

### T1.2 端口 + 规则兜底（无环境依赖）

- [x] `apps/api/src/ports/assistant-runner.port.ts`（简化：去掉 openSession，会话由首次 ask 自然产生）
- [x] `apps/api/src/adapters/rule-assistant.adapter.ts` ✅

### T1.3 harness 适配器（依赖 T0.2/T0.3 完成后联调，代码可先写、假 runner 单测）

- [x] `apps/api/src/adapters/harness-assistant.adapter.ts`：SDK client、单飞锁、15s 超时弃结果并重拉 runtime、`onModuleDestroy` 清理；启动配方实测固化（clone bin + cwd=clone + 独立 DSH_HOME + read-only）
- [x] `fs-site-content-index.ts` 扩展 `loadCitableFull()`（60K 字符硬上限）
- [x] 假 runtime 单测 6 项全绿（关/开/多轮/超时重建/坏输出/异常）

### T1.4 数据模型与落库

- [x] Prisma 增 `AssistantSession` + `AssistantRun`（SQLite 与 PG 对齐双写）；db push ✅

### T1.5 服务、控制器、接线、契约文档

- [x] `assistant.service.ts`（限流/校验/落库 try-catch 不阻断回答）+ `assistant.controller.ts` + kernel 接线 + `docs/api/README.md` ✅

### T1.6 测试与本地 e2e（P0 完成门）

- [x] 全测试：shared 47 + api 65 全绿；typecheck 4 项目绿
- [x] e2e 实录（2026-08-30，AI_ENABLED=true）：
  - 「duola 是谁？」→ AI 回答准确（综合 DoraZoom/GoOut/墨览/点子共促群），引用 cc-intro/idea-cocreate/dorazoom 全 citable，11.6s
  - 「想学 AI 从哪开始？」→ 学习路径式回答，引用 cc-intro/codex-intro/idea-cocreate，13.0s
  - 多轮追问「你刚提到的第一篇标题是什么？」→ 正确接住上文答《CC入门》，同 sessionId，**2.3s**（多轮不重发包）
  - 落库验证：AssistantRun×3 / AssistantSession×3 / FeatureEvent×6
- [x] STATUS.md「已交付」补一行 ✅

---

## P1 访客界面 ✅（2026-08-30 完成）

### T2.1 路由与入口注册

- [x] routes.ts 增 `assistant: '/ask'`；App.tsx 挂载；nav「读」组加「助手」项 ✅（注：Vite 文件监视漏了 routes.ts 一次编辑，touch 后恢复——dev 环境现象，不影响构建）

### T2.2 API 门面 + useAssistant hook

- [x] `publicApi.assistant()` + `useAssistant`（消息流/sessionId 内存态/错误态）+ 3 项单测 ✅

### T2.3 AssistantPanel 组件与样式

- [x] AssistantPanel（消息气泡/AI 徽标/citations 链接/转化出口/诚实提示/「最长约 15 秒」加载态）+ AskPage（`?q=` 只预填不自动发送——发送即产生 AI 调用）+ walker.css 样式 ✅

### T2.4 三个入口

- [x] SearchModal 无结果 →「问站内助手 →」带 `?q=`；AboutPage/MePage「问站内助手」按钮；侧栏「助手」项 ✅（浏览器全实测：搜索词自动带入预填）

### T2.5 noindex 与构建门

- [x] site.ts SPA_SHELL_ROUTES 增 `/ask`；`build:web`（SPA 壳 4→5）+ `verify:geo` + `test:web`（72）+ `test:api`（65）+ typecheck ×4 全绿 ✅

### 浏览器实测记录（2026-08-30）

- 「duola 平时用什么工具写文章？」→ **诚实红线教科书**：资料没写就承认「不敢乱说」，给沾边线索（Typedown/ZoomIt/CodeBuddy）并建议问本人，引用 cc-intro/design-for-people（gear 页不在可引用集，边界正确）

## P1.5 站主问题池（admin）✅

- [x] T2.6 `GET /assistant/runs?limit=`（经仓储端口，倒序、citations 解析为数组）+ api/README 同步 ✅
- [x] T2.7 admin「助手问题」页（过程组，线索/题苗之间）：问题/AI 或规则/耗时/引用/时间 + 「转题苗」按钮（`POST /seeds`，人工点击=人工主选）✅
- 实测：curl 返回 4 条真实记录（含浏览器提问）；「已转题苗」为前端本地态（决策日志）

## P2 公网上线

### T3.1 预算熔断 ✅（2026-08-30）

- [x] Prisma 增 `AssistantBudget`（date 唯一、requests/tokensIn/tokensOut；SQLite+PG 双写）✅
- [x] `assistant.service.ts` 前置检查：AI 开时按 UTC+8 日期计数，超 `ASSISTANT_DAILY_LIMIT`（默认 200，env 可调）→ 直接路由规则兜底 + `budget-exceeded` fail 事件（兜底回答仍落库进问题池）；存储失败 fail-open 不阻断 ✅
- [x] 单测 5 项：未触顶走 AI / 触顶降级且不调 runner / AI 关不计数 / 存储失败放行 / 日期键格式 ✅（api 70 测试全绿）

### T3.2 盒子 runtime 分发 ✅ 方案 b 定案（2026-08-30，本地全验证）

- [x] ~~方案 a 打包 clone~~ → **采用方案 b**：盒子 `npm i @deepseek-ai/dsh@0.1.2-alpha.3`（该版本有 profile 首用自动初始化；rc.2 没有——实测确认）
- [x] 本地端到端验证：apps/api 的 SDK client(rc.2) → npm runtime(alpha.3) → **pong 1.3s**；适配器加 `DSH_RUNTIME_BIN` 覆盖（生产指 npm bin，本地默认仍 clone），经适配器本体再验 **pong 3.2s** ✅
- [x] `ops/windows/install-dsh.ps1` 安装脚本 + ops README 助手部署节 ✅

### T3.3 盒子部署 ⛔ 被防火墙阻塞（2026-08-30）

- [ ] SSH 被远端关闭：本对话出口 IP `54.179.46.241`（AWS 段，Mac 代理出口）不在腾讯云防火墙 TCP 22 白名单；本机无腾讯云 CLI/云 API 凭据，无法自改——**等用户：控制台把 22 端口源更新为 `54.179.46.241/32`，或关掉 Mac 代理用既有白名单 IP**
- [ ] 上线步骤（SSH 通后）：clone 仓库到 `C:\Walker\app` → pnpm install/build 链 → `install-dsh.ps1` → 放置凭据 → `.env` 追加（见 ops README 助手册）→ `install-tasks.ps1` → `dsh-win32` 诊断 → `/health` 验证

### T3.4 Vercel 反代与切流（待 T3.3）

- [ ] `vercel.json`：`/api/*` → 盒子 8788（保留现有 301 表与 headers）
- [ ] 生产验收：`/api/health` 200、真问全链路、熔断演练、`pnpm accept` 绿
- [ ] STATUS.md 记「生产切流」+ 验证盒起算

## P3 按证据启动（不排期，触发条件见 PRD 5.3 / 10 节）

SSE 流式 / ACP profile 升级（需 cancel 时）/ 索引式注入（>50 篇）/ dsh-im·dsh-qqbot 渠道 / 记忆类插件（先过隐私评审）

---

## 决策授权（用户已授权自行决定）

**可直接决定并记日志**：包管理器替代方案、超时/上限数值微调（±50% 内）、组件与文件命名、静态兜底文案内容、测试组织方式、loadCitableFull 截断策略、hook 会话态实现。

**必须停下报告**：PRD 非协商原则被触碰、推翻条件触发（内存超 800MB / 质量持续差 / 兜底率持续高）、需要花钱或需要用户提供凭据、需要动生产（盒子/Vercel）。

## 决策日志

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-08-30 | V1 会话态存内存不加 localStorage | 陈旧 session 语义复杂；多轮价值在单次访问内已覆盖 |
| 2026-08-30 | `/ask` 进 SPA_SHELL_ROUTES（noindex） | 对话页无索引价值，防 SPA 壳泄漏 SEO |
| 2026-08-30 | 助手用独立 `DSH_HOME=~/.dsh-assistant`（deepseek + read-only），与开发者 `~/.dsh`（grok + danger-full-access）隔离 | 不污染站主开发环境；生产隔离形态先行 |
| 2026-08-30 | runtime 用 clone 的 bin.ts（0.1.2-alpha.1，`DSH_RUNTIME_DIR` 可覆盖），npm `dsh-sdk-client@0.1.1-rc.2` 仅作 TS 客户端库；子进程 cwd 必须指 clone | npm runtime 0.1.1-rc.2 无 profile 自动初始化且与 fallback 链接混版；clone 已实测全链路通 |
| 2026-08-30 | 助手不消耗游客 intake 配额，仅按 IP 限流（同 RATE_LIMITS）；存储失败不阻断回答 | 回答是产品本体、落库是观测；与 intake（线索落库即产品）责任相反 |
| 2026-08-30 | 端口简化：去掉 openSession，会话由首次 ask 产生 | 贴合 SDK run() 形态；避免预签空 session 语义 |
| 2026-08-30 | 早期「DeepSeek 余额不足」报错未再复现，e2e 三问全通——按可用处理，持续观测 | 首问 11.6s/13.0s 贴近 15s 上限，若首问兜底率升高，优先把首问超时调至 22.5s（±50% 自决权限内）或瘦身整库包 |
| 2026-08-30 | `/ask?q=` 只预填不自动发送 | 发送即产生真实 AI 调用（成本），让访客确认后再发 |
| 2026-08-30 | 问题池「已转题苗」用 admin 前端本地态，不加 schema 列 | V1 不为观测便利扩数据模型；确有持久化需要再加 `convertedSeedId`（对齐 ContentFeedback 先例） |
| 2026-08-30 | 对话框加 Enter 发送（Shift+Enter 换行，输入法组词中不触发）；`?q=` 只在值变化时同步 | 排查「无法发送」时发现：长命 IAB 标签页热更 25+ 次会重置组件态清空输入；且该面板中途出现输入投递失效（鼠标键盘事件均不达页面，JS 层正常）——环境问题非产品问题，产品流程已在 DOM 级全链路验证（问→AI 答→引用链接→徽标） |
| 2026-08-30 | 预算按 UTC+8 日期键计数；存储失败 fail-open | 站点中文时区跨日重置直觉正确；熔断是成本保险丝，不能因观测存储故障把回答也熔掉 |
| 2026-08-30 | 盒子 runtime 定案方案 b（npm `dsh@0.1.2-alpha.3` + `DSH_RUNTIME_BIN` 指向），本地默认仍 clone | alpha.3 有 profile 首用自动初始化（rc.2 实测没有）；免传 1GB+ clone；两形态均实测 pong |
