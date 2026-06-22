# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Walker（秋知 / AdgaiWalker）的个人空间 / 数字花园，基于中文 Astro 6 站点，部署在 Vercel。站点地址：https://iwalk.pro。首页为可拖拽 Bento Box 画布，展示身份卡片、最近文章、快速入口和 Spark 抽点子盲盒；内页包含文章列表与阅读页、资源工具页、点子库、项目页、学习指南页、内容宇宙、侧边栏导航、Pagefind 搜索、Upstash Redis 点赞和 Giscus 评论。站点结构对齐"个人前进系统"：思考（posts）、资源（tools）、点子（ideas）、项目（projects）、学习（learn）。后台是**决策系统而非页面集合**：把需求/主张/反馈/系统事件变成 Evidence → Decision → Action → Outcome 的可追踪闭环（单一 `WorkItem` 聚合根，见架构节），内容详情页通过 BlockFeedback 采集阅读结果回流后台。决策和规划参见 `docs/README.md`；后台与内容详情页综合设计见 `docs/design/`。

## 常用命令

```bash
npm run dev        # 启动开发服务器
npm run build      # 生产构建 + Pagefind 索引生成（esbuild 转译，不做类型检查）
npm run build:mcp  # 编译 MCP server（src/mcp/ + src/knowledge/content-query.ts → dist/mcp/index.mjs；esbuild 转译，不做类型检查）
npm run preview    # 本地预览生产构建
npm run test       # 运行 Vitest 单元测试（npm run test:watch 为 watch 模式）
npm run test:e2e   # 运行 Playwright E2E（自动起 dev server，单 worker 顺序执行；TOC 高亮/工作台会话对时序敏感，不可并发）
npx astro check    # Astro 类型检查（改任何 .ts 后必跑；build/build:mcp/test 全过也不代表类型对）
```

跑单个测试文件：`npx vitest run src/services/perception.service.test.ts`。跑单个 E2E：`npx playwright test tests/e2e/content-feedback.spec.ts`。

测试基于 Vitest（`vitest.config.ts`），默认 node 环境。测试文件分布在 `src/**/*.test.ts`：`src/services/`、`src/stores/`、`src/knowledge/`、`src/lib/`、`src/agent/`、`src/pages/api/`，以及 `src/scripts/`（客户端脚本测试）。客户端脚本测试（如 `tool-match-chat.test.ts`、`with-lifecycle.test.ts`）因涉及 DOM，在文件首行用 `// @vitest-environment happy-dom` 注释切换到 happy-dom 环境（`happy-dom` 是 devDependency，按文件启用，不影响其他 node 环境测试）。Admin API 路由集成测试（如 `src/pages/api/admin/workbench.api.test.ts`）直接调路由处理函数 + 模拟 admin 会话 cookie，覆盖未授权/非法 body/非法状态迁移/正常完整迁移。E2E 测试在 `tests/e2e/*.spec.ts`（Playwright，`playwright.config.ts` 单 worker）：通过 `/api/auth/dev-preview`（仅本机 dev）建立 owner 会话，用页面内同源 fetch 绕开 CSRF；涉及写真实内容文件的测试（如 `topic-content-publish`、`topic-to-editor`）用 afterAll 强制清理，不污染真实内容。

**验证四件套（改代码后都要跑，缺一不可）**：`npx astro check`（类型，tsc 严格检查）→ `npm run test`（单元/集成逻辑）→ `npm run build`（构建 + SSR 渲染）→ `npm run test:e2e`（浏览器真实闭环，TOC/工作台/反馈/选题到发布）。注意 `build` / `build:mcp` 走 esbuild **只转译、不做类型检查**——未定义引用、类型不匹配不会被报，运行时才 ReferenceError；只有 `astro check` 抓类型错。所以改任何 `.ts` 后必须先跑 `astro check`，不能只靠 build / test 判定通过。

## 环境变量

参见 `.env.example` 获取完整配置说明。关键分组：

- **必填（生产）**：`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（点赞、匹配、对话存储）、`COOKIE_SECRET`（会话 cookie 签名密钥，独立于登录密码）、`CRON_SECRET`（批处理 Cron）。`ADMIN_PASSWORD` 降级为 owner 账号一次性 bootstrap 密钥（建 owner 后可退役）。
- **Giscus 评论**：`PUBLIC_GISCUS_REPO` / `PUBLIC_GISCUS_REPO_ID` / `PUBLIC_GISCUS_CATEGORY` / `PUBLIC_GISCUS_CATEGORY_ID`。未配置时评论组件不渲染。
- **AI 匹配（可选）**：通过 AI Gateway 配置（服务商 API key、`baseUrl`、`model`），配置存 Redis hash `ai-gateway:config`，在 `/admin/ai-gateway` 管理页维护（预设 DeepSeek / OpenAI / Anthropic / 自定义）。未配置时仅使用本地规则匹配，不调用模型、不产生费用。`ANTHROPIC_API_KEY` 仍作为 `src/agent/gateway.ts` 的运行时 fallback 被读取（`config.apiKey || import.meta.env.ANTHROPIC_API_KEY`）；建议只在 `/admin/ai-gateway` 配置 key，不依赖环境变量。
- **Admin 内容编辑**：`GITHUB_TOKEN`。供 `/api/admin/content/[slug]` 回写内容到 GitHub。
- **限流**：`MATCH_DAILY_LIMIT`（默认 20）、`MATCH_MINUTE_LIMIT`（默认 5）、`MATCH_GLOBAL_DAILY_LIMIT`（默认 1000）。`MATCH_RATE_LIMIT_SALT`（IP 哈希限流盐值，缺省时用内部默认值）。内容反馈（`/api/content-feedback`，60s/5 次）与阅读遥测（`/api/content-telemetry`，60s/20 次）限流在 `lib/rate-limiter.ts`。**`effectiveMax` 环境感知**：生产严格按 config.max；开发/测试（!PROD）放宽 ×50（所有测试/开发机共享同一来源 IP，跨用例合法提交不该撞上单访客限流）。
- **批处理认证**：`MATCH_PROCESS_SECRET`。供 cron 触发 `/api/match-process`（需求聚类生成 TopicCandidate）时 Bearer 认证。
- **MCP（可选）**：`MCP_ENABLE_PRIVATE_INSIGHTS`。设为 `true` 时 MCP server 的 `walker_insights` 工具返回需求洞察数据；缺省时该工具返回错误提示，不暴露私有数据。
- **NorthStar 经营开关（P5）**：`NORTHSTAR_ENABLED`（可选，默认 `false`）。仅 Walker 决定开启经营（订单/支付）时设 `true`；关闭时 `NorthStarService` 所有写操作返回 `northstar-disabled`，个人闭环完整运行。真实支付商（Stripe/支付宝）凭据与合规属 Human Gate，需另行配置生产 `PaymentProviderPort`（默认 `DevSyntheticPaymentProvider` 不真实收费）。
- **注册门票**：`INVITE_CODES`（可选，env 一次性种子）+ 后台 `/admin/invite-codes` 生成的 managed 码（`stores/managed-invite-code.store.ts`，Redis 持久化，默认一人一码）。`/api/auth/register` 校验+消费（env/managed 都认，managed 记 usedBy 追踪谁用了哪个码）。
- ⚠️ **`vercel env pull` 不导出加密 secret 真实值**：`KV_*`、`CRON_SECRET`、`COOKIE_SECRET`、`GITHUB_TOKEN` 等拉到本地 `.env` 都是空——本地连不上生产 Redis、也拿不到 CRON 鉴权。需连 Redis 时走 Upstash 控制台或部署到 Vercel 运行时。另：**生产 Redis 经 Vercel KV 集成接入（实际变量 `KV_REST_API_URL` / `KV_REST_API_TOKEN`）**，`like.store.ts` 与 `conversation/store.ts` 的 `getRedis()` 同时兼容 `UPSTASH_*` 前缀，任一存在即可。

## 架构

### 关键架构模式

- **双查询系统**：`src/knowledge/content.ts` 依赖 Astro 构建上下文（`getCollection`），仅在 `.astro` 页面中可用；`src/knowledge/content-query.ts` 直接读文件系统（`gray-matter`），独立于 Astro，供 MCP server 和 Agent 使用。两者查询同一内容源但通过不同方式。
- **Redis 降级模式**：所有 Redis 依赖（点赞、匹配限流、对话存储、网关配置、洞察数据）都实现了 `Upstash Redis → 内存/本地文件` 的降级链。生产环境必须配置 Redis；开发环境无 Redis 仍可运行。
- **账号认证**：身份模型 `public / user / admin / owner`（用户 < 管理员 admin < 站主 owner）。会话统一 `walker-session` cookie（HMAC 签名，密钥 `COOKIE_SECRET`，30 天，payload 带 `{sid, role}`）。`src/lib/admin-auth.ts` 导出 `isAdmin()`（admin+owner 有后台权限）+ `isOwner()`（仅 owner 可指派角色/删账号）；`src/lib/account-auth.ts` 签发/校验会话 token。注册 = 邀请码门票 + 用户名 + scrypt 密码（零 PII）。后台 `/admin/accounts`（用户管理：列表/详情/搜索/改角色/重置/封禁/删除级联）+ `/admin/invite-codes`（邀请码生成/禁用/usedBy 追踪）+ `/account`（用户自助改密/画像/删号）。忘密走站主重置。
- **内容编辑回写**：Admin 内容编辑器（`/admin/content/edit`）通过 GitHub API（`GITHUB_TOKEN`）回写 markdown 文件，而非直接写文件系统。
- **AI Gateway 统一入口**：所有 AI 调用通过 `src/agent/gateway.ts` 的 `callGateway()` 统一入口，流程：Pretext → 敏感词检测 → API key 检查 → AI 调用 → 输出检测 → 日志。
- **双 Git 边界**：产品仓库（本仓库 AdgaiWalker，保护 `reality`）与 skill 仓库（`.agents/skills/walker-northstar`，独立 git，保护 `blueprint` + references）分开管理。`.agents/` 在产品仓库 `.gitignore` 中。
- **后台决策聚合（WorkItem，P0-B/C/D + P1）**：后台业务状态权威化——决定/行动/结果不再存 localStorage，统一走单一 `WorkItem` 聚合根（`stores/ports.ts` 的 `WorkItem` + `WorkItemRepositoryPort`），承载 `evidenceRefs / decision / actions / outcomes / history`（append-only）。设计基线见 `docs/design/admin-content-hai-razor.md`（hai-razor：合并四套独立 Store 为一个聚合，保留语义不建物理边界）。状态机在 `services/workbench.service.ts`（`proposal→pending→accepted→acting→awaiting-verification→resolved` + rejected/paused），守护信任边界：无 evidenceRefs 不进 pending、无 expectedOutcome 不进 authorized、无 completed Action 不记 Outcome、AI 无证据只能是 proposal、每次状态变化写 history（actor/from→to/reason）。工作台 SSR 首屏从 `getTodayProjection` 投影，localStorage 只保留 TOC 折叠等 UI 偏好。
- **存储环境合同（storage-mode，P0-B03）**：`lib/storage-mode.ts` 定义 `redis | memory-development | unavailable`。开发/测试无 Redis 允许显式内存降级；**生产/预览缺 Redis 时写 API 返回 503 storage-unavailable，不静默退回内存制造假持久**（hai-razor 护栏）。工作台页显示当前存储模式与持久性风险。
- **系统健康事实合同（admin-shell-state，P0-A02）**：后台侧栏状态从真实事实推导（`deriveAdminSystemHealth`：Gateway 配置 + 调用统计 + 事件），四态 `healthy/degraded/unavailable/unknown` + `lastCheckedAt`。**零数据落 unknown，缺配置落 unavailable，绝不硬编码"系统可用"**。`/admin/ai-gateway` 删除写死成本（¥48/200）、零调用伪 100% 成功率、取模降级分布、"2h 前"等无来源数字。
- **双反馈渠道（MatchFeedback ≠ ContentFeedback，P1-A/B/C）**：`MatchFeedbackEvent`（需求匹配会话结果，需 sessionId）与 `ContentFeedbackEvent`（内容阅读结果，匿名访客可提交）**分开存储、分开计算、并列解释，不合并分母**（hai-razor）。`hit-rate.service.ts` 的 `buildContentOutcomeSummaries` 输出 `matchOutcome` + `contentOutcome` 两个并列分组，无反馈返回 null 不返 0% 失败。
- **阅读深度遥测（ContentTelemetry，P3-A，第三并列信号）**：`ContentTelemetryEvent`（`content_progress`≥50% / `content_complete`≥90%，匿名）与上述两类反馈**并列、不合并分母**，构成 hit-rate 的 `readingOutcome`（uniqueReaders/completed/completionRate）。隐私最小化：per-page-load readerToken（sessionStorage 随机 UUID，非跨会话/非身份）、尊重 DNT、**不采 IP/referrer/UA**、schemaVersion=1。客户端 `scripts/content-telemetry.ts` 极简页内 beacon（无 beforeunload/中间步进），`/api/content-telemetry` 公开端点用 TTL 内容缓存避免高频全量扫描。
- **资产生命周期统一（P2-B）**：Experience/Rule/Skill 各有历史状态枚举（`maturity`/`status`/`admissionStatus`），不重命名（会破坏数据），改用 `normalizeAssetStage` 统一映射到 `observed→candidate→validated→stable→retired`。`AssetService.promote` 晋升时回写各资产本地枚举 + 记录 `AssetEvidenceLink`（来源 Outcome/Experience + Walker 批准 + 理由，append-only + 单调 seq）。**注册 Skill 前必须有 Outcome/Experience 支撑证据，否则 missing-evidence**（护栏：知识不等于产能）；证据不足只生成 `LearningRequest`，不注册 Skill。可反查"某资产由哪些 Outcome 支持"（`getSupportingEvidence` + `/api/admin/assets/evidence`）。`/admin/assets` 页统一展示晋升活动 + 待补证任务。
- **P4 Skill 注册护栏（默认拒绝）**：注册到 admitted（registered-limited/stable）前必须满足 `validateSkillRegistration`（共享校验器）——适用边界 `applicableBoundary` + 失败边界 `failureBoundary` + ≥1 反例 `negativeExamples` + 覆盖 normal/boundary/reject/failure 的 evalSet，否则 `missing-boundary`/`missing-counterexample`/`missing-eval-set`。**两条路径都强制**：`/api/admin/assets/promote` 与 `/api/admin/skills?action=admission`（到 admitted）共用校验器，防 skills 页旁路。Skill 带 `registrationTier`（limited/stable）+ `paused` 运行时开关 + `admissionSnapshots`（append-only，支持 `pauseSkill`/`resumeSkill`/`rollbackSkill`）。
- **P4 Contributor 对象级授权（object-authz，默认拒绝）**：`src/lib/object-authz.ts` 的 `canPerformObjectAction` 与既有 role 正交——不修改 `AccountRole` 枚举（不触动认证边界），Contributor = role=user + 至少一条 `ObjectGrant`（grantee/resourceType/resourceId('*')/actions/expiresAt TTL）。owner/admin 全通过；其余需命中未过期 grant。`authorizeAndAudit` 每次决策写 `ActionAuditEntry`（allowed/denied）。授权**策略**（哪些 grant）待 Walker 定后写入。
- **AI proposal 安全护栏（P4）**：WorkItem 加 `expiresAt`。AI 来源（`queue=ai-asset`）无证据假设**不进入"立即处理"（now）**且有默认 14 天 `expiresAt`；`getTodayProjection` 过滤过期 proposal（保留审计，不删）。Walker 自己的 user-demand/walker-thesis 提案可自由设 now（人的判断不护栏）。
- **P5 NorthStar 经营（默认 OFF + Port+合成适配器；赞赏为个人可用形态）**：`src/lib/northstar-range.ts` 的 `isNorthStarEnabled()`（env `NORTHSTAR_ENABLED`，默认 OFF）。`NorthStarService`（订单状态机 created→paying→paid→fulfilled/refunded）在 OFF 时所有写返回 `northstar-disabled`，个人闭环完整运行（`northstar-containment` 测试守护私密数据不泄漏）。`PaymentProviderPort` + `DevSyntheticPaymentProvider`（不真实收费）；真实商（支付宝/微信）API **需商户资质（营业执照/商户号），个人无资质不可用**——SDK（`alipay-sdk-nodejs-all`/`wechatpay-node-v3`）免费但需商户凭证，保留为未来路径。**个人可用的经营形态是赞赏（个人收款码）**：`SupportConfig`（微信/支付宝赞赏码 QR URL + 可选爱发电/Ko-fi 外链 + 文案），`/support` 页展示，访客扫码付，无 SDK/无商户号/免费。与 `MediaObjectStoragePort`（文件dev/Blob生产）、AI Gateway 同 Port+适配器模式。

### 渲染与部署

- **输出模式**：`output: 'server'`，通过 `@astrojs/vercel` 适配器部署。
- **预渲染**：启用 `prerender = true` 的页面包括：首页、`/posts`、`/posts/[slug]`、`/tools`、`/ideas`、`/projects`、`/projects/ferry`、`/content`、`/learn`、`/learn/guide/[level]/[tool]`、`/about`、`/404`、`/index.json`、`/graph.json`、`/llms.txt`、`/walker-style.md`；其余（如 `/api/*`、`/rss.xml`）及除登录外的全部 `/admin/*` 页面为服务端动态渲染（请求期 `isAdmin()` 鉴权）。旧动态路由 `/ai/[slug]`、`/life/[slug]` 保留为服务端 301 跳转。
- **图片服务**：Vercel Image Optimization 已启用，`@astrojs/vercel` adapter 配置了 `imageService` 和图片尺寸。
- **性能配置**：Astro `prefetch.defaultStrategy = 'hover'`，并启用 `experimental.svgo`。
- **构建流程**：`astro build` → `pagefind --site dist/client --output-path .vercel/output/static/pagefind`。

### 内容集合

在 `src/content.config.ts` 中定义一个集合：

- **`log`**：博客文章、想法、工具、项目和学习指南，来源 `src/content/log/`。支持 `.md` 和 `.mdx`。Schema 包含以下字段：
  - 基础：`title`、`date`、`updated`（可选）、`tags`、`category`、`published`、`visibility`（`public`/`draft`/`private`，可选，优先于 `published`）、`summary`、`description`、`cover`、`rating`（1-5）、`url`、`qrCode`。
  - 分类：`type`（枚举：`knowledge`、`tool`、`idea`、`project`、`community`、`learn`）、`status`（枚举：`thinking`、`validating`、`building`、`verified`、`archived`）。

  > ⚠️ **`learning` 命名陷阱**：曾存在内容 type 别名 `learning`（已删除，0 内容使用）。现仓库里的 `'learning'` 字面量有三重不同含义，**不要混淆**：(1) `ContentSpace='learning'`（内容宇宙的"学习笔记"空间概念，保留）；(2) `NeedCategory='learning'`（需求分类，`profiles/resource-index.ts` + `agent/match.ts`，保留）；(3) `AbilityType='learning-path'`（能力类型，保留）。内容 type 只剩 `learn`。
  - 内容模型：`form`（`article`/`note`/`diary`/`rant`/`gallery`/`video`/`recipe`/`calligraphy`/`resource`/`project`/`idea`/`lesson`）、`domain`（`ai`/`coding`/`product`/`philosophy`/`life`/`cooking`/`calligraphy`/`reading`/`travel`/`emotion`/`community`）、`intent`（`think`/`record`/`teach`/`share`/`verify`/`showcase`/`reflect`/`connect`/`vent`）、`valueMode`（`utility`/`existence`/`both`）。
  - AI 策略：`aiUsePolicy`（含 `level`：`AI-0`~`AI-4`、`readable`、`citable`、`actionable`、`reason`）。
  - 关联：`related`（ID 数组）、`featured`（布尔）、`sourceTopicId`（关联选题 ID，可选）。
  - 版本与系列：`version`（版本号，数字）、`previousVersion`（上一版 slug）、`series`（系列名，自由文本）、`seriesOrder`（系列内序号）。版本迭代用 `version` + `previousVersion` 串联同一篇文章的不同版本（独立文件、独立 URL）。系列连载用 `series` + `seriesOrder` 串联同一主题的多篇文章。
  - 学习指南专属：`level`（`入门`/`学徒`/`专家`）、`emoji`、`subtitle`、`yValue`（效果范围描述）、`graduation`（毕业项目）、`safetyNote`（安全提醒）、`shareAction`（分享建议）。这些字段仅在 `type: learn` 时使用。
  - 媒体与资源：`communities`（对象数组）、`videos`（`videos.platform` 支持 `bilibili`、`douyin`、`xiaohongshu`、`youtube`、`github`、`zhihu`）、`resources`（`resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`）。

### 布局系统

共有四个布局：

1. **`Base.astro`**：根外壳。处理共享 head、JSON-LD、导航、页脚、格线纹理背景、鼠标光晕和阅读模式。共享 head 由 `src/components/shared/HeadCommon.astro` 提供。
2. **`SidebarLayout.astro`**：通用内页布局，带页面头部、图标和计数。用于 `/posts`、`/tools`、`/ideas`、`/projects` 等列表型页面。
3. **`ContentShell.astro`**（`src/layouts/`）：统一块阅读容器，被 `/posts/[slug]` 唯一引用（canonical 文章详情布局）。不预设布局模式、不探测首块类型；块自声明宽度等级（CSS 变量 `--cs-width-full/normal/narrow` + `--cs-toc-offset`），容器只提供阅读基础设施（进度条、TOC、反馈区）。`toc-highlight.ts` 按滚动位置激活当前目录项（滚动位置作真相源，比纯 IntersectionObserver 更可靠，保证首屏与间隙总有 active 项）。**注意**：曾存在重复实现 `src/components/blocks/ContentShell.astro`（含移动 TOC drawer/FAB），已按 hai-razor 删除；旧 `ArticleLayout.astro` 零引用后也已退役删除（P2-A）。
4. **`FullscreenLayout.astro`**：全屏页面布局，包裹 `Base.astro` 并通过 `fullscreen` 标志隐藏导航、页脚和环境效果。用于 `/about`。

### 路由结构

| 路径 | 页面 | 布局 |
| --- | --- | --- |
| `/` | 个人空间（可拖拽 Bento Box 画布） | Base |
| `/posts` | 文章列表（思考） | SidebarLayout |
| `/posts/[slug]` | 文章详情（TOC + 进度 + BlockFeedback + LikeCounter + Giscus） | ContentShell（`src/layouts/`） |
| `/tools` | 资源列表（工具） | SidebarLayout |
| `/ideas` | 点子库 | SidebarLayout |
| `/projects` | 项目列表 | SidebarLayout |
| `/projects/ferry` | Ferry 项目页（生态系统谱系树 + 时间线） | Base |
| `/learn` | 学习指南（含指南 Tab + 学习感悟 Tab） | Base |
| `/learn/guide/[level]/[tool]` | 学习指南详情（入门/学徒/专家 × 工具） | Base |
| `/content` | 内容宇宙（多维度内容聚合） | Base |
| `/about` | 关于（含关于我/关于站 Tab） | FullscreenLayout |
| `/support` | 赞赏/支持页（P5 个人收款码：微信/支付宝赞赏码 QR + 可选外链，SSR 读 SupportConfig） | Base |
| `/about?tab=site` | 关于站（Tab 切换） | FullscreenLayout |
| `/admin` | 工作台（服务端投影 WorkItem + NeedCase + 站主主张 + 系统事件；去 localStorage 业务状态） | Admin（AdminLayout） |
| `/login` | 统一登录/注册（用户 + owner 同入口） | FullscreenLayout |
| `/admin/login` | 重定向到 /login（owner 账号登录入口） | Admin（独立样式） |
| `/admin/accounts` | 账号管理（列表/搜索/重置/封禁/改角色） | Admin（独立样式） |
| `/admin/accounts/[username]` | 单用户详情（基本信息/会话/需求/操作含删除） | Admin（独立样式） |
| `/admin/invite-codes` | 邀请码管理（生成/列表/禁用/删除） | Admin（独立样式） |
| `/account` | 用户自助（改密/画像/删号） | Base |
| `/admin/insights` | 数据看板（管理员专属） | Admin（独立样式） |
| `/admin/ai-gateway` | AI Gateway 配置与监控（服务商/模型/日志） | Admin（独立样式） |
| `/admin/topics` | 选题库（管理员专属） | Admin（独立样式） |
| `/admin/review` | 需求复盘（NeedCase 簇视图 + 逐条视图） | Admin（独立样式） |
| `/admin/hit-rate` | 内容命中率（已发布内容 × 关联需求簇 resolved/stuck；双信号结果分组 matchOutcome/contentOutcome） | Admin（独立样式） |
| `/admin/outcomes` | 结果与下一步（已记录 Outcome 的 WorkItem + suggestNextAction 派生的候选动作按钮） | Admin（独立样式） |
| `/admin/brief` | 创作简报（选题 → 简报 → 编辑器，"去编辑器创作"预填 sourceTopicId） | Admin（独立样式） |
| `/admin/content` | 内容列表管理（管理员专属） | Admin（独立样式） |
| `/admin/content/edit` | 内容编辑器（管理员专属） | Admin（独立样式） |
| `/admin/incidents` | 安全事件/失败降级待复盘（Incident） | Admin（独立样式） |
| `/admin/rules` | 规则候选池（observed → candidate → validated → stable → retired） | Admin（独立样式） |
| `/admin/experiences` | 经验验证系统（事件采集 → 复盘 → 模式 → Skill 候选） | Admin（独立样式） |
| `/admin/skills` | Skill 准入与 Agent 路由（候选 → 准入 → 注册/降级为方法卡） | Admin（独立样式） |
| `/admin/assets` | 资产生命周期（Experience/Rule/Skill 统一晋升活动 + 证据链 + 学习请求补证） | Admin（AdminLayout） |
| `/admin/grants` | Contributor 对象级授权管理（创建/撤销 ObjectGrant + 6 角色模板，owner 可写） | Admin（AdminLayout） |
| `/admin/northstar` | NorthStar 经营管理（赞赏设置 + offers/orders，门控 isNorthStarEnabled） | Admin（AdminLayout） |
| `/404` | 404 页面 | Base |
| `/rss.xml` | RSS 订阅源 | 无布局 |
| `/llms.txt` | AI 可读站点地图 | 无布局（静态文本） |
| `/walker-style.md` | AI 可读风格指南 | 无布局（静态文本） |
| `/index.json` | AI 可读内容索引 JSON（预渲染静态产物） | 无布局（静态 JSON） |
| `/graph.json` | AI 可读内容关系图谱 JSON（预渲染静态产物） | 无布局（静态 JSON） |

### API 路由

| 路径 | 功能 | 认证 |
|------|------|------|
| `/api/match` | 用户需求匹配（HTTP 薄层 → `agentOrchestrator.handleNeed` → 本地匹配 + AI Gateway）。后端 gate：public 返回 401，需受邀或管理员。 | 无（IP/会话限流） |
| `/api/match-end` | 结束匹配会话 | 无（sessionId） |
| `/api/match-feedback` | 推荐结果反馈（`resolved`/`stuck`/`not-fit`/`want-tutorial`/`first-draft`/`next-step-clear`/`wrong-direction`/`need-tutorial`），回写 NeedCase feedbackStatus | 无 |
| `/api/content-feedback` | 公开内容阅读反馈（`useful`/`needs-more`/`outdated`，匿名访客可提交；sourceTopicId 服务端派生；IP 哈希频率限流 60s/5 次 + 429；note 脱敏限长） | 无（IP 限流） |
| `/api/content-telemetry` | 公开阅读深度遥测（`content_progress`/`content_complete`，匿名；per-page-load readerToken、DNT 尊重、无 IP/referrer/UA、schemaVersion=1；限流 60s/20 次 + 503；TTL 内容缓存） | 无（IP 限流） |
| `/api/admin/support` | 赞赏配置读写（个人收款码 QR URL + 外链 + 文案；GET/PUT） | admin cookie |
| `/api/admin/grants` | Contributor 对象级授权 CRUD（GET/POST/DELETE，owner 可写） | admin cookie（写 owner only） |
| `/api/admin/northstar/offers` | NorthStar 商品/服务/能力 CRUD（写操作门控 isNorthStarEnabled） | admin cookie |
| `/api/admin/northstar/orders` | NorthStar 订单 create/pay/fulfill/refund（门控 isNorthStarEnabled，DevSynthetic provider） | admin cookie |
| `/api/admin/workbench` | 工作台今日投影 / 队列状态列表（view=today\|decisions\|actions\|outcomes，queue/status 过滤） | admin cookie |
| `/api/admin/workbench/[id]` | 单个 WorkItem 详情（含 evidenceRefs/decision/actions/outcomes/history） | admin cookie |
| `/api/admin/decisions` | 创建 WorkItem 提案（POST，证据完整可 requestDecision 进 pending） | admin cookie |
| `/api/admin/decisions/[id]` | 作出决定 / 请求决定 / 覆盖优先级（PATCH，decide\|requestDecision\|overridePriority） | admin cookie |
| `/api/admin/actions` | 为 WorkItem 创建行动（POST，仅 accepted；expectedOutcome 必填） | admin cookie |
| `/api/admin/actions/[id]` | 更新行动状态（PATCH，authorized/in-progress/completed/blocked/cancelled） | admin cookie |
| `/api/admin/outcomes` | 为已执行 Action 记录结果（POST，successful/partial/failed/inconclusive） | admin cookie |
| `/api/admin/assets/promote` | 资产晋升（POST，统一阶段 + Outcome/Experience 来源 + Walker 批准；注册 Skill 前必须有证据） | admin cookie |
| `/api/admin/assets/evidence` | 查看某资产由哪些 Outcome/Experience 支持（GET ?kind=&assetId=） | admin cookie |
| `/api/admin/learning-requests` | 学习请求 GET 列表 / POST 创建 / PATCH 完成补证（证据不足时不注册 Skill） | admin cookie |
| `/api/match-process` | 批处理需求聚类生成 TopicCandidate（Cron 触发） | CRON_SECRET |
| `/api/match-history` | 用户对话历史（按 sessionId 列表） | 无（sessionId） |
| `/api/auth/register` | 邀请码门控注册（用户名+密码+锚点，建账号+消费邀请+建会话） | 无 |
| `/api/auth/login` | 用户名密码登录（用户/owner 同入口，防枚举） | 无 |
| `/api/auth/logout` | 登出（撤销会话+清 cookie） | 会话 |
| `/api/auth/setup` | owner 账号一次性 bootstrap（凭 ADMIN_PASSWORD，建后自锁） | 无 |
| `/api/auth/change-password` | 用户自助改密（需当前密码） | user 会话 |
| `/api/admin/accounts` | 账号列表（admin） | admin |
| `/api/admin/accounts/reset` | 站主重置某用户密码（返回临时密码） | admin |
| `/api/admin/accounts/status` | 站主封禁/解封 | admin |
| `/api/admin/accounts/role` | 站主指派角色（仅 owner） | owner |
| `/api/admin/accounts/[username]` | 单用户详情（账号/画像/会话/需求） | admin |
| `/api/admin/accounts/delete` | 删账号级联（会话+画像+需求脱敏，仅 owner） | owner |
| `/api/admin/invite-codes` | 邀请码 GET 列表 / POST 生成(owner) / DELETE | owner |
| `/api/admin/invite-codes/disable` | 禁用邀请码（owner） | owner |
| `/api/profile` | 用户画像读写（personaAnchor 锚点） | user 会话 |
| `/api/stats` | 公开统计（匹配总数/内容数/类别分布） | 无 |
| `/api/insights` | 洞察数据 + 选题操作 | admin cookie / CRON_SECRET |
| `/api/like` | 文章点赞（Redis→内存降级，0 起步真实计数） | 无（IP 限流） |
| `/api/admin/auth` | 管理员登录/登出/状态检测 | admin cookie（GET） |
| `/api/admin/conversations` | 管理员查看所有对话 | admin cookie |
| `/api/admin/review` | NeedCase 复盘列表 + review 状态更新 | admin cookie |
| `/api/admin/hit-rate` | 内容命中率聚合 | admin cookie |
| `/api/admin/brief` | 选题创作简报生成 | admin cookie |
| `/api/admin/inspiration` | 站主灵感选题入口（双源选题池） | admin cookie |
| `/api/admin/content/[slug]` | 内容 CRUD（GitHub API 回写） | admin cookie |
| `/api/admin/content/[slug]/history` | 文章 git 提交历史列表（GitHub Commits API / 本地 git log） | admin cookie |
| `/api/admin/content/[slug]/version` | 某历史版本内容（`?ref=<commitSha>`） | admin cookie |
| `/api/admin/gateway` | AI Gateway 配置 CRUD + 测试连接 + 撤销/重置 | admin cookie |
| `/api/admin/incidents` | 未解决的安全事件/失败降级记录（Incident）供复盘 | admin cookie |
| `/api/admin/rules` | 规则候选池 CRUD（observed → candidate → validated → stable → retired） | admin cookie |
| `/api/admin/skills` | Skill 候选 CRUD（candidate → admitted → demoted-to-method） | admin cookie |
| `/api/admin/experience-events` | 经验事件采集与查询（U10） | admin cookie |
| `/api/profile/delete-request` | 用户画像删除请求（标记 `deleteRequestedAt` 软删除） | user 会话 |
| `/api/search-events` | 记录搜索无结果查询（内容缺口信号，fire-and-forget） | 无 |

以下旧路由保留为 301 重定向（定义在 `astro.config.mjs`）：

| 旧路径 | 重定向目标 |
| --- | --- |
| `/ai` | `/tools` |
| `/ai/learn` | `/posts` |
| `/ai/sources`、`/ai/toolkit` | `/tools` |
| `/ai/ideas` | `/ideas` |
| `/ai/:slug` | `/posts/:slug` |
| `/idea` | `/tools` |
| `/idea/explore`、`/idea/explore/:slug`、`/idea/toolkit`、`/idea/sources` | `/tools` |
| `/idea/ideas` | `/ideas` |
| `/idea/:slug` | `/posts/:slug` |
| `/life` | `/posts` |
| `/life/:slug` | `/posts/:slug` |
| `/about/site` | `/about?tab=site` |

### 学习指南页（/learn）

学习指南是一个独立于文章系统的教学模块，数据来源有两部分：

- **指南内容**：`type: learn` 的 log 集合条目（`.md`/`.mdx`），通过 `level` 字段分配到入门/学徒/专家三个阶段。每个指南的 frontmatter 包含 `emoji`、`subtitle`、`yValue`、`graduation`、`safetyNote`、`shareAction` 等教学元数据。指南详情页使用 `src/styles/learn.css` 的独立样式。
- **学习感悟**：`type: learn | knowledge` 的 log 条目，显示在"学习感悟"Tab 下，本质是文章列表。（旧 `type: learning` 别名已删除；`getPublishedLearningPosts` 不再匹配 `learning` type。）
- **数据层**：`src/data/learn-data.ts` 定义 `LearnLevel`（阶段）、`LearnTool`（工具指南）接口和 `learnLevels` 常量。页面通过 `getPublishedLearningPosts()` 查询感悟类文章。
- **路由**：`/learn`（列表页，`?tab=tracks` 轨道 / `?tab=thoughts` 思考 / `?tab=guide` 帮你学 切换）→ `/learn/guide/[level]/[tool]`（指南详情，SSG 预渲染）。旧 `?tab=journal` URL 通过 `learn/index.astro` 的三元判断重定向到 `tracks`（向后兼容保留，不再作为新契约）。

### 核心组件

- **`Navigation.astro`**：导航协调器。首页不渲染导航（画布内 identity card ghost nav 提供导航）；内页分发到 `nav/SidebarNav.astro`（桌面侧边栏）和 `nav/MobileMenu.astro`（移动端顶栏）。包含搜索触发器（`⌘K`）、主题切换按钮（桌面+移动端）。`nav-extension` slot 通过 `Base.astro` 传入，`ArticleLayout` 通过此 slot 注入文章列表。
- **`SearchModal.astro`**：基于 Pagefind 的搜索，通过 `⌘K` 或搜索按钮触发。
- **`ArticleNav.astro`**（`article/`）：文章详情页导航列表，支持文字/卡片视图。
- **`TableOfContents.astro`**（`article/`）：文章页粘性目录，通过 `toc-highlight.ts` 高亮当前标题。
- **首页组件**（`home/`）：`HomeCanvas.astro`（Bento 画布 — 身份条、最近文章、快速入口、Spark 抽点子盲盒）。盲盒弹窗逻辑内联在 `GreetingCard.astro`（流星粒子 + 随机脑洞），无独立 `SparkBoxModal.astro` 组件。
- **首页卡片**（根级）：`GreetingCard.astro`（头像交互卡，含社交链接）。
- **内容宇宙组件**（`content-universe/`）：`ContentFilterTabs.astro`（空间筛选文字链接）、`ContentStreamItem.astro`（内容流扁平列表项：色点 + 标题 + 时间锚点 + 预告 + 形态），用于 `/content` 页面。
- **`ToolMatchChat.astro`**（`tools/`）：工具匹配对话组件，提供 `/api/match` 匹配会话的前端 UI；身份探测（GET `/api/profile`：200=user/admin、401=public），public 用户点提问或后端 401 时跳 `/login` 注册。
- **`ResourceCard.astro`**（根级）：资源链接卡片，在文章详情页 `posts/[slug].astro` 中使用。
- **`GiscusWidget.astro`**（根级）：基于 GitHub Discussions 的评论组件，配置通过 `PUBLIC_GISCUS_*` 环境变量注入，主题跟随 `walker-theme-change` 事件自动切换。在 `[slug].astro` 中使用。
- **`Footer.astro`**（根级）：全局页脚，被 `Base.astro` 使用。
- **内容组件**（`content/`）：`BilibiliVideo.astro`、`DialogueBubble.astro`、`PromptBlock.astro`，用于 MDX 文章内嵌，在 `[slug].astro` 中注册为组件映射。
- **`LikeCounter.astro`**：点赞按钮组件，客户端调 `/api/like` 接口。计数与降级逻辑在 `src/stores/like.store.ts`（`LikeStore` 接口 + 内存/Upstash 实现 + `createLikeStore()` 工厂）：有 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（优先）或 `KV_REST_API_URL` / `KV_REST_API_TOKEN`（降级备选，Vercel 自动注入）时用 Redis `incr` 原子自增（修旧 read-then-write 并发丢赞）；否则或 Redis 运行时异常走内存降级（dev 无 Redis 也能真点真涨，重启丢失）。**0 起步真实计数，不再有写死的假基数**。`/api/like` 是 HTTP 薄层（路径白名单 + 每 IP 每路径 60s 冷却 + 单页 999999 上限）。
- **`BlockFeedback.astro`**（`blocks/`）：内容阅读结果反馈组件（P1-B），位于正文结束后、评论前。三档明确信号（有用/需补充/已过时），需补充/已过时展开可选说明，提交到 `/api/content-feedback`。成功显示"已收到"不显示伪造统计；失败保留表单可重试；localStorage 仅防同浏览器重复提示（不作成功证据）；noscript 降级；aria-live + 键盘 + 44px 点击区。与 LikeCounter 区分：点赞是弱信号，这是直接导向行动的结果反馈。
- **`AdminLayout.astro`**（`admin/`）：后台共享壳（一级模块导航 + 二级上下文导航 + 个人菜单 + 系统健康侧栏）。Props 含 `systemHealth`（healthy/degraded/unavailable/unknown）+ `systemHealthCheckedAt`（最近检查时间），由各页用 `deriveAdminSystemHealth` 从真实事实推导后传入。客户端交互用 `registerLifecycle` + AbortController 单次注册。
- **`AuthChip.astro`**（`auth/`）：身份芯片（右上角登录/用户菜单），自检测 `walker-session` cookie 状态，显示登录/用户头像入口。配套脚本 `src/scripts/auth-chip.ts` 负责会话刷新与登出逻辑。
- **About 页面组件**（`about/`）：`SectionHeader.astro`（通用 section 标题组件）。关于我 / 关于站两个 Tab 的内容直接内联在 `about/index.astro`，无独立 `AboutSiteTab.astro` 组件。
- **`AdminEditBar.astro`**（`admin/`）：管理员浮动编辑栏组件，自检测 admin cookie，仅在文章详情页 `posts/[slug].astro` 中注入。「编辑」按钮触发就地编辑态（不跳页），「历史」按钮打开版本历史 modal，「删除」直调 DELETE API。脚本内 import `inline-editor.ts` + 初始化 `version-history.ts`。
- **就地编辑组件**（`admin/`）：`InlineEditor.astro`（编辑器骨架：正文/预览/元数据三 tab + 工具栏，预渲染隐藏 admin 激活）、`MetadataForm.astro`（frontmatter 结构化表单 + raw YAML 兜底，`data-field` 控件）、`VersionHistory.astro`（版本时间线 modal + jsdiff）。就地模式挂 `/posts/[slug]`（接管 `#article-body`），独立模式挂 `/admin/content/edit`（新建/brief）。

### 图标与样式

- 图标统一使用 `astro-icon` + `@iconify-json/lucide`，在构建期内联 SVG。不再加载 Iconify CDN 运行时。
- Tailwind CSS v4 通过 `@tailwindcss/vite` 插件接入，无 `tailwind.config`。
- `src/styles/global.css` 使用 `@theme` 定义颜色和 `--font-cjk`。`--font-body`、`--font-heading`、`--font-mono` 由 Astro Fonts API 注入。
- 字体通过 Astro Fonts API + fontsource provider 自托管：Outfit（body）、Averia Gruesa Libre（heading）、JetBrains Mono（mono）、Noto Sans SC（CJK）。所有字体构建期内联，无外部 CDN 依赖。
- 多主题系统：`.theme-nature`（默认亮色）、`.theme-aurora`（暗色霓虹）、`.theme-sunset`（暖色暗色）、`.theme-mint`（绿色暗色），各定义完整的 CSS 自定义属性。
- 代码块语法高亮使用 `shikiConfig: { theme: 'github-dark' }`。
- 玻璃面板使用 `.panel-glass`，阅读模式由 `pureMode` 触发 `.reading-mode`。
- 自定义 SVG 光标位于 `/cursor.svg`。
- **动画库**：GSAP（`gsap` ^3.15.0），含 ScrollTrigger 插件。全局配置在 `gsap-setup.ts`，提供 `gsap`、`mm`（matchMedia）导出。

### 客户端脚本

- **`gsap-setup.ts`**：GSAP 全局配置，注册 ScrollTrigger 插件，导出 `gsap` 实例和 `mm`（matchMedia）。被其他 GSAP 脚本统一引用。
- **`scroll-fade.ts`**：GSAP ScrollTrigger 驱动的 `.reveal` 元素滚动入场动画，含 `gsap.matchMedia()` reduced-motion 支持。
- **`home-entrance.ts`**：首页 `.draggable-card` 元素 GSAP stagger 入场动画（back.out 缓动）。
- **`page-transitions.ts`**：全站页面切换动效（`gsap.fromTo` 淡入 + 微上移），消除与 Astro 内置 fade 的冲突。
- **`sidebar-state.ts`**：侧边栏折叠/展开，通过 `data-sidebar-collapsed` 属性控制，使用 `localStorage` 持久化。
- **`toc-highlight.ts`**：文章目录当前标题高亮。按滚动位置激活当前目录项（`resolveActiveByScroll` 作真相源，比纯 IntersectionObserver 更可靠——保证首屏与标题间隙总有 active 项；接近文档底部激活末项），并把活跃项滚动进 `.toc-sidebar-inner` 可视区。容器选择逻辑抽到 `toc-highlight.logic.ts`（`resolveTocScrollContainer`，优先 canonical `.toc-sidebar-inner`，安全回退到 toc 自身），含单测。
- **`justify-tags.ts`**：文章列表标签两端对齐排版，导出 `justifyTags()` 和 `watchJustifyTags()`，含 resize 和 View Transition 生命周期支持，依赖 `@chenglou/pretext`。
- **`home-canvas.ts`**：首页 Bento 画布拖拽、主题切换、状态栏反应和点击水波纹逻辑（Spark 抽点子盲盒已迁移至 `GreetingCard.astro`）。
- **`tilt-effect.ts`**：3D 卡片透视倾斜效果，导出 `setupTilt(selector, options)`，被 Base.astro 和 about.astro 使用。
- **`with-lifecycle.ts`**：Astro View Transition 生命周期工具，导出 `registerLifecycle(init)`。内部 `runCleanup()` 在 `astro:page-load` 和 `astro:before-swap` 触发后**立即置空 cleanup 引用**，保证每个生命周期阶段至多清理一次（15+ 个消费者，契约不要求 cleanup 幂等）。
- **`inline-editor.ts`**：就地/独立编辑器逻辑（`InlineEditor.astro` 配套）。导出 `enterInlineEditor(slug)`（就地模式入口）、`initStandaloneEditor(slug, draftTemplate, topicId?)`（独立模式）。含 marked 客户端预览、frontmatter ↔ YAML 双向同步、localStorage 草稿、sha 乐观锁冲突、Ctrl+S 保存、`data-inline-editing` 钩子。从选题进入编辑时携带 `topicId`，保存时显式回传内容 API（与 frontmatter `sourceTopicId` 双通道保留关联）。
- **`version-history.ts`**：版本历史逻辑（`VersionHistory.astro` 配套）。导出 `initVersionHistory()`，监听 `version-history:open` 事件。含 git 历史拉取、jsdiff 渲染、回退（复用 PUT 新提交）。
- **`tool-match-chat.ts`**：工具匹配对话编排器。导出 `mountToolMatch(root)`，返回 cleanup 函数。闭包内管理身份探测、会话状态、计时器、DOM 事件绑定，用 AbortController 统一清理监听器。调用 `tool-match-view.ts` 的渲染函数。被 `ToolMatchChat.astro` 通过 `registerLifecycle` 挂载。
- **`tool-match-view.ts`**：工具匹配视图层（纯函数）。导出 `renderPlainResponse`/`renderResultCard`/`renderDiagnosisResponse`/`renderComplianceResponse`/`renderPromptBox` 渲染函数 + `escapeHtml`/`escapeAttr` 转义 + `MatchResponse`/`ActionPlanResult`/`ChatMessage` 等类型。零状态依赖、零 DOM 副作用，只接收 data 返回 HTML 字符串，便于独立单测。

### Remark 插件

`remark-rich-embed.ts` 将 Markdown 中的 `![](url)` 按 URL 类型转换为富媒体嵌入：

- B 站和 YouTube：播放器 iframe。
- 音频文件：`<audio>` 播放器。
- GitHub 仓库：样式化链接卡片。
- 其他 URL：通用链接卡片。

插件输出静态 HTML 和内联 SVG，不依赖 Iconify 运行时。

### Agent 化基础设施

独立于 Astro 构建管道的内容查询和 Agent 接口层，用于让 LLM / Agent 结构化地读写 Obsidian markdown 内容。

- **`src/knowledge/content-query.ts`**：独立查询引擎。直接读文件系统，用 `gray-matter` 解析 frontmatter + body，提供 `getAll()`、`findBySlug()`、`query(filter)`、`search(text)`、`countByType()` 查询函数。带内存缓存，`invalidateCache()` 清空。不依赖 Astro 构建上下文。
- **`src/mcp/index.ts`**：基于 `@modelcontextprotocol/sdk` 的 MCP server（stdio transport），注册 5 个工具：`walker_query`（多条件过滤）、`walker_search`（全文搜索）、`walker_get`（按 slug 取完整内容）、`walker_stats`（内容统计概览）、`walker_insights`（需求洞察统计，**默认私有**，需环境变量 `MCP_ENABLE_PRIVATE_INSIGHTS=true` 才返回数据，否则返回错误提示）。封装 `content-query.ts` 的查询能力为 MCP 协议。
- **`scripts/build-mcp.cjs`**：将 TypeScript 源码（content-query + MCP server）编译打包为单个 `dist/mcp/index.mjs`。`npm run build:mcp` 一键构建。`dist/` 在 `.gitignore` 中，不进 git。

### 数据文件

- **`src/data/site-stats.json`**：关于页面的动态数据源，含 `costs`（花费记录）、`siteTimeline`（站点开发时间线）、`personalTimeline`（个人成长时间线，含 `children` 用于 NOW 节点子内容）、`roadmap`（`done` + `planned`）。被 `about/index.astro` 导入（经 `site-data.ts` 派生），更新此文件即可刷新关于页的动态内容。
- **`src/data/site-data.ts`**：关于站页面派生数据，导出 `articles`、`pillars`、`aiTools`、`totalCost`、`costByCategory`。被 `about/index.astro` 引用。
- **`src/data/learn-data.ts`**：学习指南数据层，定义 `LearnLevel`（入门/学徒/专家阶段）、`LearnTool`（工具指南）、`ToolSection` 接口与 `learnLevels` 常量（另有 `learnTools` 数组与 `safetyTable` 安全提醒表）。被 `/learn` 页面和指南详情页引用。
- **`src/data/ferry-ecosystem.ts`**：Ferry 生态系统谱系数据。`FerryNode`（角色 `root`/`trunk`/`branch`/`fruit`，类型 `theory`/`methodology`/`skill`/`product`/`experience`），导出 `ferryTree`、`flattenFerryTree()`、`groupByRole()`。被 `/projects/ferry` 引用。
- **`src/data/learning-tracks.ts`**：学习轨道数据层。三层架构（`cognition`/`craft`/`exploration`），`LearningTrack`、`LearningNote`、`Milestone` 接口与 `learningTracks` 常量，`getTrackProgress()` 进度计算。
- **`src/data/tools-data.ts`**：`/tools` 资源页数据源。导出 `communities`、`aiResources`、`aiTools`、`infra`、`bloggers`、`skills` 常量，新增/修改资源只改此文件。

### 模块架构

业务逻辑采用四层架构：API 路由（HTTP 薄层）→ `services/`（应用服务 / 业务编排）→ `stores/` + `services/interfaces.ts`（端口抽象）→ `conversation/store.ts`（存储实现）。`/api/match` 的 Agent 编排按**六模块边界**分层（Perception / Memory / Planning / Tools / Orchestration / Observability，定义见 `.agents/skills/walker-northstar/references/planning/agent-six-modules-architecture.md`），`NeedCase` 是核心业务对象（取代旧 DemandEvent）。`docs/adr/ADR-0001` 记录了从 `src/lib` + `src/data` 按职责拆分为 knowledge/profiles/agent/conversation/shared 的历史起点；此后新增 `services/`（应用服务层）和 `stores/`（数据仓储端口层）。Astro 展示层文件（pages/、layouts/、components/、scripts/、styles/）保持原位不动。

**分层约定**：`knowledge/` 只含纯查询与纯函数（Astro 构建期内容读取 + 计算），**不直连 store**。需要跨层组合（如 content 读取 + store 需求统计聚合）的编排放 `services/`（典型例子：`ideas.service.ts` 组合 `getPublishedIdeas` + `getNeedCaseStats`）。统计聚合查询（`getNeedCaseStats` 等）按既有模式直接由 service 调用 store 自由函数，不走单实体 RepositoryPort（后者只管 CRUD）。

#### knowledge/（知识库）

- **`content.ts`**：Astro 构建时内容查询函数（`getPublishedContentItems`、`getPublishedPosts`（含 `knowledge`/`idea`/`project`/`learn`）、`getPublishedResources`、`getPublishedIdeas`、`getPublishedProjects`、`getPublishedLearningPosts`、`getPublishedThoughts`），集中过滤和排序逻辑。还导出 `getVersionChain()`（获取文章版本链）和 `getSeriesEntries()`（获取系列文章列表）。仅在 Astro 渲染上下文中可用。
- **`content-query.ts`**：独立查询引擎（见上文 Agent 化基础设施）。
- **`content-model.ts`**：内容模型核心。定义 `ContentSpace`（`all`/`progress`/`life`/`learning`/`tools`/`works`/`ideas`）、`ContentItem` 接口、`toContentItem()` 适配器（将 Astro log 条目投影为多维度内容项）、`itemBelongsToSpace()` 空间分配逻辑、`contentSpaces` 元数据数组。推断函数 `inferForm()`、`inferDomain()`、`inferIntent()`、`inferValueMode()` 从内容属性派生维度。`buildInternalHref()` 处理内部链接、`toContentItem()` 用 `entry.data.url ?? buildInternalHref(entry)` 生成**权威 href**（外链内容带 GitHub URL 时直接用外链，搜索 DTO 不再重新合成）。还导出 `formLabels`、`domainLabels`、`intentLabels`、`valueModeLabels` 等显示映射。
- **`navigation.ts`**：搜索 DTO 与导航链接。`toSearchItem(item)` 直接用 `item.href`（来自 content-model 的权威链接，**单一真相源**，不按 type/id 重建）、`getSearchModalData()` 聚合搜索项 + 固定页面链接、`searchPageLinks` 常量。
- **`posts.ts`**：文章展示纯查询（摘要提取、相关文章计算），有单测保护。
- **`ideas.ts`**：点子纯函数模块。只导出 `getDemandSignal()`（需求信号打分）、`sortIdeasByStatusAndDate()`（按状态权重 + 日期排序）、`PUBLIC_DEMAND_SIGNAL_MIN` 常量和类型。**不直连 store**——页面编排由 `services/ideas.service.ts` 承接。
- **`visibility.ts`**：内容可见性解析。`resolveContentVisibility()` 根据 `visibility` 和 `published` 字段推断内容为 `public`/`draft`/`private`。优先使用显式 `visibility` 字段，降级到 `published` 布尔值。

#### profiles/（画像系统）

- **`tool-profiles.ts`**：工具画像数据。每个工具的结构化画像（`ToolProfile` 接口），含 `bestFor`、`avoidWhen`、`strengths`、`limitations`、`requires`、`alternatives`、`nextSteps`。供 Agent 匹配时引用。
- **`resource-index.ts`**：站内资源索引（`MatchResource` 接口），供匹配 Agent 查找推荐内容。定义需求分类（`NeedCategory`）、人群标签（`AudienceGroup`）、AI 阶段（`AiStage`）、工具适配类型（`ToolFit`）等枚举和标签映射。

#### agent/（匹配 Agent — Planning 层）

- **`match.ts`**：本地匹配引擎，导出 `matchSiteResources()`，返回 `MatchResult`（已显式导出类型）。接收用户需求，基于关键词评分 + 站内资源索引进行本地初筛，输出分类、资源、串联语、判断结论、摩擦层、能力方向。不依赖 AI API，被 `agent-orchestrator.service.ts` 的 `planRecommendation` 调用，可独立运行。
- **`gateway.ts`**：统一 AI 调用网关。流程：Pretext → 敏感词检测 → API key 检查 → AI 调用 → 输出检测 → 日志。支持 OpenAI 兼容格式（DeepSeek / OpenAI / 中转站）和 Anthropic 原生格式。所有 AI 调用通过 `callGateway()` 统一入口，带超时控制、降级回退和 Redis 日志。导出 `readGatewayLogs()` 供管理页查询。
- **`gateway-config.ts`**：网关配置管理。预设 4 个服务商（DeepSeek / OpenAI / Anthropic / 自定义），配置存 Redis（hash `ai-gateway:config`），无 Redis 时降级到内存 + 本地文件 `.gateway-config.json`。支持配置更新（带历史记录）、撤销、重置、测试连接（`testGatewayConnection`）、调用统计（`getGatewayStats`）。
- **`pretext.ts`**：AI Pretext 系统。根据调用路由和内容推断场景（`match_search` / `match_chat` / `insight` / `content_gen` / `general`），为每个场景生成专属系统提示，附加全局行为规则。
- **`sensitive.ts`**：敏感词管控。六类分治词库（色情/暴力/赌博/违禁/辱骂/自伤），输入拦截 + 输出过滤，命中时降级为 fallback。
- **`ai-utils.ts`**：AI 响应解析工具。从容错文本中提取 JSON（`extractLikelyJson`、`safeParseJsonObject`），类型守卫和数组规范化。
- **`insight.ts`**：需求洞察。从 NeedCase 需求事件中聚类，生成 `TopicCandidate`（选题候选，含 clusterKey、density、roleDistribution、优先级）。批处理接口 `processPendingNeedCases()`：同簇合并、回写 NeedCase `topicCandidateId`。
- **`privacy.ts`**：隐私护盾。PII 脱敏（邮箱、手机号、密钥、联系方式、身份证）、文本压缩、未成年人判断（`isMinorAudience`）。被 PerceptionService 和对话 API 调用。
- **`tools-manifest.ts`**：六模块 Tools 清单单一真相源，定义各模块暴露的工具函数签名与元数据。配套单测 `tools-manifest.test.ts`。

#### services/（应用服务层 — 编排 + 业务服务）

业务编排层，API 路由只做协议层（解析、限流、响应），业务委托给 service。`agent-orchestrator.service.ts` 是 `/api/match` 的业务核心。

- **`interfaces.ts`**：业务层端口。定义 `MatchingServicePort`、`VisibilityServicePort`（角色 `public`/`user`/`admin` × 可见性 `public`/`draft`/`private`/`admin-only`）、`UserContextServicePort`、`AccountServicePort`（注册/登录/登出/改密/重置/封禁/owner bootstrap）、`UserProfileServicePort`（按 username）、`AgentOrchestratorPort`、`PerceptionServicePort`、`FeedbackServicePort`、`AdminReviewServicePort`、`SafetyServicePort`、`WorkbenchServicePort`（WorkItem 决策聚合：createProposal/requestDecision/decide/createAction/updateAction/recordOutcome/overridePriority/getTodayProjection/list）、`ContentFeedbackServicePort`（公开内容反馈：submit/findByContent/findByTopic/findRecent）、`AssetServicePort`（资产晋升：promote/getSupportingEvidence/recentPromotions/createLearningRequest/listLearningRequests/fulfillLearningRequest）。所有 service 返回机器可读 code（`WorkbenchResult`/`ContentFeedbackResult`/`AssetResult`），API 层据此映射 HTTP 状态，不靠中文文案判断。
- **`agent-orchestrator.service.ts`**：`/api/match` 的业务核心（取代旧 `question.service.ts`）。按六模块生命周期编排 `handleNeed`：`perceive`（PerceptionService）→ `planRecommendation`（本地匹配 + 模型增强 + 字段挑选）→ `persistSession`（会话/统计/消息）→ `buildAgentRecommendation` + `safetyFlags` → `recordNeedCase`（生成 + 保存 NeedCase，失败降级记 Incident）→ `buildResponsePayload`。AI 失败降级本地规则；NeedCase 保存失败不阻断用户响应。对外 `handleNeed` 签名稳定，内部拆为命名步骤函数。
- **`perception.service.ts`**：六模块之 Perception。消息截断、逐条 PII 脱敏 + 压缩、最新需求提取、未成年标记，经 `PerceptionServicePort` 暴露。
- **`user-context.service.ts`**：汇总身份（`admin`/`user`/`public`）+ user 会话 + 画像为 `UserContext`。
- **`account.service.ts`**：账号核心服务。注册（邀请码门控）、登录（用户名+scrypt 密码+建会话）、登出（撤销会话+清 cookie）、改密、封禁/解封、owner bootstrap（仅首次凭 ADMIN_PASSWORD 建 owner）。被 `/api/auth/*`、`/api/admin/accounts/*` 引用。
- **`profile.service.ts`**：用户画像读写删除（`personaAnchor` 锚点，零 PII，写入前过 `redactSensitiveText`）。
- **`safety.service.ts`**：输入评估 + Incident 事件记录。
- **`feedback.service.ts`**：反馈保存并回写 NeedCase 的 `feedbackStatus`。
- **`admin-review.service.ts`**：NeedCase 复盘列表 + admin review 状态管理。
- **`brief.service.ts`**：选题创作简报生成（规则给角度/结构，不代写正文）。
- **`hit-rate.service.ts`**：内容反馈结果聚合。`calculateContentHitRates`（旧：按已发布内容聚合关联需求簇 resolved/stuck 命中率）+ `buildContentOutcomeSummaries`（P1-C：双信号结果分组，`matchOutcome` 来自 NeedCase.feedbackStatus，`contentOutcome` 来自 ContentFeedbackEvent.signal，两组并列不合并分母，无反馈返回 null 不返 0% 失败）+ `getLikeLeaderboard`。
- **`ideas.service.ts`**：点子页编排服务（`createIdeasService(deps)` 工厂，deps 注入模式）。`getIdeasPageData()` 组合 content 读取（`getPublishedIdeas`）+ 需求统计聚合（`getNeedCaseStats`，近 30 天）+ astro render，调用 knowledge/ideas 的纯函数打分。**knowledge 层不直连 store**——store 聚合由本 service 承接（与 about/insights/mcp 直接消费 `getNeedCaseStats` 的既有模式一致，统计聚合走 store 自由函数而非 NeedCaseRepositoryPort）。
- **`workbench.service.ts`**：WorkItem 决策聚合的业务编排（P0-B/C/D + P1）。所有状态迁移在此完成（页面/前端不拼装业务事实）。守护 hai-razor 信任边界：无证据不进 pending、无 expectedOutcome 不进 authorized、无 completed Action 不记 Outcome、AI 无证据只能 proposal、每次状态变化写 append-only history（actor/时间/from→to/reason）。`overridePriority` 保存优先级覆盖的 from→to 理由与历史（不抹掉原排序依据）。`suggestNextAction`（纯函数，导出）按 Outcome 结果派生下一步候选动作（successful→evaluate-asset / partial→create-content / failed→update-content / inconclusive→create-learning-request），不自动执行。
- **`content-feedback.service.ts`**：内容阅读反馈业务编排（P1-A）。验证 contentId 对应真实公开内容（不存在→content-not-found），sourceTopicId 从内容元数据派生（忽略客户端传入），note 走 `redactSensitiveText` + `compactText` 限长脱敏，写入 `ContentFeedbackEvent`。生产缺 Redis 返回 storage-unavailable 不静默丢反馈。
- **`asset.service.ts`**：资产统一晋升链路（P2-B）。`promote` 把统一 `AssetLifecycleStage` 映射回 Experience/Rule/Skill 各自本地枚举并回写，同时记录 `AssetEvidenceLink`（来源 Outcome/Experience + Walker 批准 + 理由 + 单调 seq）。注册 Skill 前 `missing-evidence` 守护；`createLearningRequest`/`fulfillLearningRequest` 处理证据不足补证；`getSupportingEvidence`/`recentPromotions` 反查支撑来源。
- **`matching.service.ts`** / **`visibility.service.ts`**：本地匹配（`matchNeed`）/ 可见性判断（`canSee`、`redactNeedCase`、`filterStats`）。
- **`northstar.service.ts`**：NorthStar 经营服务（订单状态机 created→paying→paid→fulfilled/refunded；门控 `isNorthStarEnabled()`，关闭时所有写返回 `northstar-disabled`）。
- **`appearance.service.ts`**：后台外观配置服务（主题/布局/媒体设置读写，扩展了系统外观管理能力）。
- **`content-telemetry.service.ts`**：阅读深度遥测编排（验证 readerToken、防重复、TTL 缓存、`content_progress`/`content_complete` 事件写入）。

#### stores/（数据仓储端口层）

- **`ports.ts`**：数据层端口。定义 `AuthState`（`public`/`user`/`admin`）、`UserAccount`（用户名+scrypt 密码哈希，零 PII）/`AccountRepositoryPort`、`UserSession`/`SessionRepositoryPort`、`NeedCase`（核心业务对象，带 `username` 归属）、`MatchSession`、`ConversationMessage`、`MatchFeedbackType`（8 种）、`TopicCandidate`、`InviteCode`、`UserProfile`（按 username）、`Incident`、`PublicStats`、`WorkItem`（后台决策聚合根：evidenceRefs/decision/actions/outcomes/history，状态机 proposal→...→resolved，来源队列 user-demand/walker-thesis/system-event/ai-asset）/`WorkItemRepositoryPort`、`ContentFeedbackEvent`（内容阅读反馈，signal useful/needs-more/outdated）/`ContentFeedbackRepositoryPort`、`AssetKind`/`AssetLifecycleStage`/`normalizeAssetStage`/`AssetEvidenceLink`/`AssetEvidenceLinkRepositoryPort`（资产生命周期统一映射 + 晋升证据链）、`LearningRequest`/`LearningRequestRepositoryPort`（证据不足补证任务）等接口及对应 RepositoryPort；`MatchSessionRepositoryPort` 含 `createSessionId`/`saveMessages`/`incrementStats`（会话生命周期收口）。上层只依赖这些接口。
- **`match-session.store.ts`** / **`need-case.store.ts`** / **`feedback.store.ts`** / **`invite-code.store.ts`**（env 种子 + Redis 用量）/ **`managed-invite-code.store.ts`**（后台生成的邀请码，Redis `auth:invite-code:*` + `auth:invite-codes` 集合，generate/list/disable/delete/recordUsedBy）/ **`account.store.ts`**（UserAccount，Redis `auth:account:*` + SETNX 占名 + updateRole/delete）/ **`session.store.ts`**（UserSession，Redis `auth:session:*` + user→session 索引，listByUsername/killAllByUsername）/ **`user-profile.store.ts`** / **`incident.store.ts`** / **`work-item.store.ts`**（WorkItem，Redis `match:workitem:*` + 活跃列表 + 状态索引）/ **`content-feedback.store.ts`**（ContentFeedback，Redis `content-feedback:*` + 按内容/选题索引）/ **`asset-evidence-link.store.ts`**（AssetEvidenceLink，Redis `asset-link:*` + 按资产索引 + 单调 seq）/ **`learning-request.store.ts`**（LearningRequest，Redis `learning-request:*` + 按状态索引）：各仓储的工厂实现（account/session/managed-invite 自包含 Redis+内存，其余委托 `conversation/store.ts`）。
- **`like.store.ts`**：点赞计数仓储（独立于 conversation/store）。`LikeStore` 接口 + `InMemoryLikeStore`（Map 计数 + 时间戳冷却）+ `UpstashLikeStore`（Redis `incr` 原子自增、`set ex` 冷却，运行时异常降级内存）+ `createLikeStore()` 工厂（有 KV/UPSTASH 凭据用 Upstash，否则内存）。**0 起步真实计数，无写死假基数**。被 `/api/like` 调用。

#### conversation/（存储实现层）

- **`store.ts`**：Redis + 内存降级的存储实现。管理 `MatchSession`、`NeedCase`（取代旧 DemandEvent）、`TopicCandidate`、`MatchFeedbackEvent`、`ConversationMessage`、`UserProfile`、`Incident`、`WorkItem`（match:workitem:*）、`ContentFeedbackEvent`（content-feedback:*）、`AssetEvidenceLink`（asset-link:*）、`LearningRequest`（learning-request:*）生命周期，导出 `getRedis()`、`createSessionId()`、`saveConversationMessages()`、`getNeedCaseStats()`（取代旧 `getDemandStats`）、`getTopicCandidates()`、`saveNeedCase()`、`redactNeedCasesByUsername()`、`saveWorkItem/listWorkItems/listActiveWorkItems`、`saveContentFeedback/findContentFeedbackByContent/findRecentContentFeedback`、`saveAssetEvidenceLink/findAssetEvidenceLinks`、`saveLearningRequest/findLearningRequestsByStatus` 等。被 `stores/` 仓储委托调用，也被 MCP server 和 `/api/match-feedback`（`saveMatchFeedback`）直接引用。

#### shared/（共享工具）

- **`routes.ts`**：路由常量（`HOME`、`POSTS`、`TOOLS`、`IDEAS`、`PROJECTS`、`FERRY`（`/projects/ferry`）、`CONTENT`、`ABOUT`、`LEARN`、`buildPostPath`、`buildContentSpacePath`、`buildLearnGuidePath`），被 Navigation、RSS、内容宇宙、学习页等模块引用。
- **`format.ts`**：日期格式化（`formatDateCompact` → `MM/DD`、`formatDateLocale` → zh-CN 本地化、`formatDateNumeric` → `YYYY/MM/DD`）。
- **`constants.ts`**：共享常量：`PLATFORM_ICON_MAP`（平台图标映射）、`STATUS_LABELS`（状态中文标签）、`STATUS_WEIGHT`（状态排序权重）、`SITE_EMAIL`（站点邮箱）、`CHARS_PER_MINUTE_ZH`（中文阅读速度）、`MS_PER_*` 时间常量。
- **`workspaces.ts`**：页面工作区映射。`getWorkspaceForPath()` 根据路径返回所属工作区（`content`/`learn`/`tools`/`ideas`/`projects`/`about`），供导航高亮和上下文推断使用。

#### 其他

- **`src/lib/admin-auth.ts`**：站主身份判定。仅导出 `isAdmin(request)`（纯 cookie 同步：读 `walker-session` + 校验 role=admin，无需 Redis）。被所有 admin 页面和 `/api/insights`、`/api/admin/*` 路由引用。旧的 `signToken/authCookie` 等已退役（owner 走账号系统）。
- **`src/lib/account-auth.ts`**：统一会话 cookie。`signSessionToken`/`verifySessionToken`（payload `{sid, role, iat}`，密钥 `COOKIE_SECRET`）、`readSessionId`/`readSessionPayload`、`sessionCookie`/`clearSessionCookie`、`createSessionId`。被 `/api/auth/*`、`/api/match`、`/api/profile` 等引用。
- **`src/lib/theme.ts`**：多主题循环工具。导出 `THEMES`（`nature`/`aurora`/`sunset`/`mint`）、`ThemeName` 类型、`cycleTheme()` 函数。被 `Navigation.astro`、`home-canvas.ts`、`FullscreenLayout.astro` 引用。
- **`src/lib/admin-content-store.ts`**：Admin 内容存储适配。通过 GitHub API（`GITHUB_TOKEN`）读写 `src/content/log/` 下的 markdown 文件，`GITHUB_TOKEN` 未配置时抛 503（开发态降级本地文件）。`ContentFileStore` 接口含 `read(path, {ref?})`（支持读历史版本：GitHub `?ref=` / 本地 `git show`）、`write`、`delete`、`exists`、`listHistory(path, {perPage?})`（GitHub Commits API / 本地 `git log`）。被 `/api/admin/content/[slug]` 及其子路由 `history` / `version` 引用。
- **`src/lib/admin-content-helpers.ts`**：Admin 内容路由共享工具（去重提取）。导出 `jsonResponse` / `getContentStore` / `validateSlug` / `getPath` / `getContentId` / `getToken` / `CONTENT_PATH_PREFIX`。被 `[slug].ts`、`[slug]/history.ts`、`[slug]/version.ts` 引用。
- **`src/lib/frontmatter-editor.ts`**：frontmatter ↔ YAML 纯函数。导出 `parseDoc(raw)` / `serializeDoc(doc)` / `FORM_ENUMS`（与 `content.config.ts` 枚举一致）/ `FORM_MANAGED_KEYS`。被 `MetadataForm.astro`、`inline-editor.ts`、`version-history.ts` 引用。
- **`src/lib/content-draft.ts`**：未保存草稿 localStorage 暂存纯函数。导出 `loadDraft` / `saveDraft` / `clearDraft`（key `walker:draft:<slug>`，损坏/不可用降级 null）。被 `inline-editor.ts` 引用。
- **`src/lib/storage-mode.ts`**：存储环境合同（P0-B03）。`resolveStorageMode({hasRedis, environment})` → `redis | memory-development | unavailable`（开发/test 无 Redis 允许内存；生产/预览缺 Redis 必须 unavailable）。`isWritable` / `isPersistent`。被 workbench/content-feedback service 用于判定写 API 是否允许。
- **`src/lib/rate-limiter.ts`**：基础频率限流（P1-A04）。`consumeRateLimit(namespace, ip, config)` 用 IP 的 SHA-256 哈希 + 滚动窗口计数（Redis INCR+EXPIRE 原子；无 Redis 内存降级），**不用 IP 明文长期识别**（窗口过期丢弃哈希）。`hashIdentifier` 不暴露明文。被 `/api/content-feedback` 使用。
- **`src/lib/admin-actor.ts`**：从 admin 请求派生操作者身份（用于审计与 WorkItem history.actor）。`resolveAdminActor(request)` 优先用会话 username，失败回退 role；**不信任客户端传入的 actor**（所有 service 的 actor 由这里派生）。
- **`src/components/admin/admin-shell-state.ts`**：系统健康事实合同（P0-A02）。`AdminSystemHealth`（healthy/degraded/unavailable/unknown）+ `deriveAdminSystemHealth({configured, lastProbeOk, stats, hasGatewayIncident})` 从真实事实推导，零数据落 unknown、缺配置/探测失败落 unavailable、绝不硬编码 healthy。被各 admin 页传入 AdminLayout。
- **`src/types/nav.ts`**：导航类型定义。`NavItem`（`label`、`href`、`icon`、`hint?`）和 `NavGroup`（`title?`、`items`），被 `Navigation.astro` 和 `SidebarNav.astro` 引用。

## 路径别名

```json
"@/*": ["src/*"]
```

## 文档治理

`docs/` 不是当前项目工作台。当前有效的 PRD、计划、架构和执行状态统一放在 `.agents/skills/walker-northstar/references/`（walker-northstar skill 仓库，独立 git）。`docs/` 保留四类材料：归档（`docs/archive/`）、架构决策记录（`docs/adr/`）、专题资料（`docs/AI赋能/` 等）、**设计输入与审计**（`docs/design/`）。`docs/design/` 存放后台与内容详情页综合实施方案、可执行 to-do、hai-razor 审计等**候选设计输入**——它们是 reality 实施的依据与执行记录回写处，但不拥有当前执行权（执行权在 `references/working/` 三件套，确认切换轮次后迁入）。详见 `docs/README.md`。

## 内容创作

- 语言：中文（zh-CN），UI 文案和内容以中文为主。
- 文件命名：中文 slug（如 `设计为人与内容搭桥.md`），方便 Obsidian 检索。MDX 同理（如 `减法对话.mdx`）。
- Markdown 支持 MDX，可在文章中使用交互组件。
- `cover` 支持内容图片或远程图片 URL。
- `resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`。
- 版本迭代：同一篇文章认知升级时新建文件（如 `设计为人与内容搭桥 v2.md`），通过 `version` + `previousVersion` 字段串联。文章详情页底部自动显示版本链导航。
- 系列连载：通过 `series` + `seriesOrder` 字段串联同一主题的多篇文章。文章详情页底部自动显示系列导航（系列名 + 序号 + 上一篇/下一篇）。
- 学习指南：`type: learn` 的内容条目作为学习指南，需设置 `level`（`入门`/`学徒`/`专家`）和教学元数据字段（`emoji`、`subtitle`、`yValue`、`graduation`、`safetyNote`、`shareAction`）。指南详情页路由为 `/learn/guide/[level]/[tool]`。
