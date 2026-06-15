# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Walker（秋知 / AdgaiWalker）的个人空间 / 数字花园，基于中文 Astro 6 站点，部署在 Vercel。站点地址：https://iwalk.pro。首页为可拖拽 Bento Box 画布，展示身份卡片、最近文章、快速入口和 Spark 抽点子盲盒；内页包含文章列表与阅读页、资源工具页、点子库、项目页、学习指南页、内容宇宙、侧边栏导航、Pagefind 搜索、Upstash Redis 点赞和 Giscus 评论。站点结构对齐"个人前进系统"：思考（posts）、资源（tools）、点子（ideas）、项目（projects）、学习（learn）。决策和规划参见 `docs/README.md`。

## 常用命令

```bash
npm run dev        # 启动开发服务器
npm run build      # 生产构建 + Pagefind 索引生成
npm run build:mcp  # 编译 MCP server（src/mcp/ + src/knowledge/content-query.ts → dist/mcp/index.mjs）
npm run preview    # 本地预览生产构建
npm run test       # 运行 Vitest 单元测试（npm run test:watch 为 watch 模式）
npx astro check    # Astro 类型检查
```

跑单个测试文件：`npx vitest run src/services/perception.service.test.ts`。

测试基于 Vitest（`vitest.config.ts`），测试文件位于 `src/services/*.test.ts` 和 `src/stores/*.test.ts`（含 `agent-orchestrator`、`perception`、`matching`、`visibility`、`invite-access`、`profile`、`brief`、`hit-rate`、`match-session.store` 等）。补充验证依赖 `npm run build`（构建通过）和 `npx astro check`（类型检查）。

## 环境变量

参见 `.env.example` 获取完整配置说明。关键分组：

- **必填（生产）**：`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（点赞、匹配、对话存储）、`ADMIN_PASSWORD`（管理后台）、`CRON_SECRET`（批处理 Cron）。
- **Giscus 评论**：`PUBLIC_GISCUS_REPO` / `PUBLIC_GISCUS_REPO_ID` / `PUBLIC_GISCUS_CATEGORY` / `PUBLIC_GISCUS_CATEGORY_ID`。未配置时评论组件不渲染。
- **AI 匹配（可选）**：通过 AI Gateway 配置（服务商 API key、`baseUrl`、`model`），配置存 Redis hash `ai-gateway:config`，在 `/admin/ai-gateway` 管理页维护（预设 DeepSeek / OpenAI / Anthropic / 自定义）。未配置时仅使用本地规则匹配，不调用模型、不产生费用。`ANTHROPIC_API_KEY` 已不再被代码直接读取。
- **Admin 内容编辑**：`GITHUB_TOKEN`。供 `/api/admin/content/[slug]` 回写内容到 GitHub。
- **限流**：`MATCH_DAILY_LIMIT`（默认 20）、`MATCH_MINUTE_LIMIT`（默认 5）、`MATCH_GLOBAL_DAILY_LIMIT`（默认 1000）。

## 架构

### 关键架构模式

- **双查询系统**：`src/knowledge/content.ts` 依赖 Astro 构建上下文（`getCollection`），仅在 `.astro` 页面中可用；`src/knowledge/content-query.ts` 直接读文件系统（`gray-matter`），独立于 Astro，供 MCP server 和 Agent 使用。两者查询同一内容源但通过不同方式。
- **Redis 降级模式**：所有 Redis 依赖（点赞、匹配限流、对话存储、网关配置、洞察数据）都实现了 `Upstash Redis → 内存/本地文件` 的降级链。生产环境必须配置 Redis；开发环境无 Redis 仍可运行。
- **Admin 认证**：基于 Cookie HMAC 签名（7 天有效），密钥为 `ADMIN_PASSWORD` 环境变量。`src/lib/admin-auth.ts` 导出 `isAdmin()` 检查函数，所有 admin 页面和 API 路由统一引用。
- **内容编辑回写**：Admin 内容编辑器（`/admin/content/edit`）通过 GitHub API（`GITHUB_TOKEN`）回写 markdown 文件，而非直接写文件系统。
- **AI Gateway 统一入口**：所有 AI 调用通过 `src/agent/gateway.ts` 的 `callGateway()` 统一入口，流程：Pretext → 敏感词检测 → API key 检查 → AI 调用 → 输出检测 → 日志。
- **双 Git 边界**：产品仓库（本仓库 AdgaiWalker，保护 `reality`）与 skill 仓库（`.agents/skills/walker-northstar`，独立 git，保护 `blueprint` + references）分开管理。`.agents/` 在产品仓库 `.gitignore` 中。

### 渲染与部署

- **输出模式**：`output: 'server'`，通过 `@astrojs/vercel` 适配器部署。
- **预渲染**：启用 `prerender = true` 的页面包括：首页、`/posts`、`/posts/[slug]`、`/tools`、`/ideas`、`/projects`、`/projects/ferry`、`/content`、`/learn`、`/learn/guide/[level]/[tool]`、`/about`、`/404`、`/index.json`、`/llms.txt`、`/walker-style.md`，以及全部 `/admin/*` 页面；其余（如 `/api/*`、`/rss.xml`）为服务端动态渲染。旧动态路由 `/ai/[slug]`、`/life/[slug]` 保留为服务端 301 跳转。
- **图片服务**：Vercel Image Optimization 已启用，`@astrojs/vercel` adapter 配置了 `imageService` 和图片尺寸。
- **性能配置**：Astro `prefetch.defaultStrategy = 'hover'`，并启用 `experimental.svgo`。
- **构建流程**：`astro build` → `pagefind --site dist/client --output-path .vercel/output/static/pagefind`。

### 内容集合

在 `src/content.config.ts` 中定义一个集合：

- **`log`**：博客文章、想法、工具、项目和学习指南，来源 `src/content/log/`。支持 `.md` 和 `.mdx`。Schema 包含以下字段：
  - 基础：`title`、`date`、`updated`（可选）、`tags`、`category`、`published`、`visibility`（`public`/`draft`/`private`，可选，优先于 `published`）、`summary`、`description`、`cover`、`rating`（1-5）、`url`、`qrCode`。
  - 分类：`type`（枚举：`knowledge`、`tool`、`idea`、`project`、`community`、`learn`、`learning`）、`status`（枚举：`thinking`、`validating`、`building`、`verified`、`archived`）。
  - 内容模型：`form`（`article`/`note`/`diary`/`rant`/`gallery`/`video`/`recipe`/`calligraphy`/`resource`/`project`/`idea`/`lesson`）、`domain`（`ai`/`coding`/`product`/`philosophy`/`life`/`cooking`/`calligraphy`/`reading`/`travel`/`emotion`/`community`）、`intent`（`think`/`record`/`teach`/`share`/`verify`/`showcase`/`reflect`/`connect`/`vent`）、`valueMode`（`utility`/`existence`/`both`）。
  - AI 策略：`aiUsePolicy`（含 `level`：`AI-0`~`AI-4`、`readable`、`citable`、`actionable`、`reason`）。
  - 关联：`related`（ID 数组）、`featured`（布尔）。
  - 版本与系列：`version`（版本号，数字）、`previousVersion`（上一版 slug）、`series`（系列名，自由文本）、`seriesOrder`（系列内序号）。版本迭代用 `version` + `previousVersion` 串联同一篇文章的不同版本（独立文件、独立 URL）。系列连载用 `series` + `seriesOrder` 串联同一主题的多篇文章。
  - 学习指南专属：`level`（`入门`/`学徒`/`专家`）、`emoji`、`subtitle`、`yValue`（效果范围描述）、`graduation`（毕业项目）、`safetyNote`（安全提醒）、`shareAction`（分享建议）。这些字段仅在 `type: learn` 时使用。
  - 媒体与资源：`communities`（对象数组）、`videos`（`videos.platform` 支持 `bilibili`、`douyin`、`xiaohongshu`、`youtube`、`github`、`zhihu`）、`resources`（`resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`）。

### 布局系统

共有四个布局：

1. **`Base.astro`**：根外壳。处理共享 head、JSON-LD、导航、页脚、格线纹理背景、鼠标光晕和阅读模式。共享 head 由 `src/components/shared/HeadCommon.astro` 提供。
2. **`SidebarLayout.astro`**：通用内页布局，带页面头部、图标和计数。用于 `/posts`、`/tools`、`/ideas`、`/projects` 等列表型页面。
3. **`ArticleLayout.astro`**：两栏布局（TOC 目录 + 文章正文），`ArticleNav` 由 `ArticleLayout` import 并通过 `nav-extension` slot 注入 Navigation → SidebarNav，内容区使用 `pureMode=true` 的阅读模式。文章页侧边栏初始折叠隐藏，鼠标悬停左边缘或按 `[` 键展开。移动端有浮动导航 FAB。
4. **`FullscreenLayout.astro`**：全屏页面布局，包裹 `Base.astro` 并通过 `fullscreen` 标志隐藏导航、页脚和环境效果。用于 `/about`。

### 路由结构

| 路径 | 页面 | 布局 |
| --- | --- | --- |
| `/` | 个人空间（可拖拽 Bento Box 画布） | Base |
| `/posts` | 文章列表（思考） | SidebarLayout |
| `/posts/[slug]` | 文章详情 | ArticleLayout |
| `/tools` | 资源列表（工具） | SidebarLayout |
| `/ideas` | 点子库 | SidebarLayout |
| `/projects` | 项目列表 | SidebarLayout |
| `/projects/ferry` | Ferry 项目页（生态系统谱系树 + 时间线） | Base |
| `/learn` | 学习指南（含指南 Tab + 学习感悟 Tab） | Base |
| `/learn/guide/[level]/[tool]` | 学习指南详情（入门/学徒/专家 × 工具） | Base |
| `/content` | 内容宇宙（多维度内容聚合） | Base |
| `/about` | 关于（含关于我/关于站 Tab） | FullscreenLayout |
| `/about?tab=site` | 关于站（Tab 切换） | FullscreenLayout |
| `/admin` | 管理仪表盘（内容统计 + 快捷入口） | Admin（独立样式） |
| `/admin/login` | 管理员登录 | Admin（独立样式） |
| `/admin/insights` | 数据看板（管理员专属） | Admin（独立样式） |
| `/admin/ai-gateway` | AI Gateway 配置与监控（服务商/模型/日志） | Admin（独立样式） |
| `/admin/topics` | 选题库（管理员专属） | Admin（独立样式） |
| `/admin/review` | 需求复盘（NeedCase 簇视图 + 逐条视图） | Admin（独立样式） |
| `/admin/hit-rate` | 内容命中率（已发布内容 × 关联需求簇 resolved/stuck） | Admin（独立样式） |
| `/admin/brief` | 创作简报（选题 → 简报 → 编辑器） | Admin（独立样式） |
| `/admin/content` | 内容列表管理（管理员专属） | Admin（独立样式） |
| `/admin/content/edit` | 内容编辑器（管理员专属） | Admin（独立样式） |
| `/404` | 404 页面 | Base |
| `/rss.xml` | RSS 订阅源 | 无布局 |
| `/llms.txt` | AI 可读站点地图 | 无布局（静态文本） |
| `/walker-style.md` | AI 可读风格指南 | 无布局（静态文本） |

### API 路由

| 路径 | 功能 | 认证 |
|------|------|------|
| `/api/match` | 用户需求匹配（HTTP 薄层 → `agentOrchestrator.handleNeed` → 本地匹配 + AI Gateway）。后端 gate：public 返回 401，需受邀或管理员。 | 无（IP/会话限流） |
| `/api/match-end` | 结束匹配会话 | 无（sessionId） |
| `/api/match-feedback` | 推荐结果反馈（`resolved`/`stuck`/`not-fit`/`want-tutorial`/`first-draft`/`next-step-clear`/`wrong-direction`/`need-tutorial`），回写 NeedCase feedbackStatus | 无 |
| `/api/match-process` | 批处理需求聚类生成 TopicCandidate（Cron 触发） | CRON_SECRET |
| `/api/match-history` | 用户对话历史（按 sessionId 列表） | 无（sessionId） |
| `/api/invite/verify` | 邀请码验证准入（签名 Cookie 建立 invited 会话 + 建 UserProfile） | 无（邀请码） |
| `/api/profile` | 用户画像读写（personaAnchor 锚点）+ 删除请求 | invited 会话 |
| `/api/stats` | 公开统计（匹配总数/内容数/类别分布） | 无 |
| `/api/insights` | 洞察数据 + 选题操作 | admin cookie / CRON_SECRET |
| `/api/like` | 文章点赞（Upstash Redis） | 无（IP 限流） |
| `/api/admin/auth` | 管理员登录/登出/状态检测 | admin cookie（GET） |
| `/api/admin/conversations` | 管理员查看所有对话 | admin cookie |
| `/api/admin/review` | NeedCase 复盘列表 + review 状态更新 | admin cookie |
| `/api/admin/hit-rate` | 内容命中率聚合 | admin cookie |
| `/api/admin/brief` | 选题创作简报生成 | admin cookie |
| `/api/admin/inspiration` | 站主灵感选题入口（双源选题池） | admin cookie |
| `/api/admin/content/[slug]` | 内容 CRUD（GitHub API 回写） | admin cookie |
| `/api/admin/gateway` | AI Gateway 配置 CRUD + 测试连接 + 撤销/重置 | admin cookie |
| `/index.json` | AI 可读内容索引 JSON | 无布局（静态 JSON） |

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
- **学习感悟**：`type: learn | learning | knowledge` 的 log 条目，显示在"学习感悟"Tab 下，本质是文章列表。
- **数据层**：`src/data/learn-data.ts` 定义 `LearnLevel`（阶段）、`LearnTool`（工具指南）接口和 `learnLevels` 常量。页面通过 `getPublishedLearningPosts()` 查询感悟类文章。
- **路由**：`/learn`（列表页，`?tab=guide` / `?tab=journal` 切换）→ `/learn/guide/[level]/[tool]`（指南详情，SSG 预渲染）。

### 核心组件

- **`Navigation.astro`**：导航协调器。首页不渲染导航（画布内 identity card ghost nav 提供导航）；内页分发到 `nav/SidebarNav.astro`（桌面侧边栏）和 `nav/MobileMenu.astro`（移动端顶栏）。包含搜索触发器（`⌘K`）、主题切换按钮（桌面+移动端）。`nav-extension` slot 通过 `Base.astro` 传入，`ArticleLayout` 通过此 slot 注入文章列表。
- **`SearchModal.astro`**：基于 Pagefind 的搜索，通过 `⌘K` 或搜索按钮触发。
- **`ArticleNav.astro`**（`article/`）：文章详情页导航列表，支持文字/卡片视图。
- **`TableOfContents.astro`**（`article/`）：文章页粘性目录，通过 `toc-highlight.ts` 高亮当前标题。
- **首页组件**（`home/`）：`HomeCanvas.astro`（Bento 画布 — 身份条、最近文章、快速入口、Spark 抽点子盲盒）。盲盒弹窗逻辑内联在 `home-canvas.ts` 的 `initSparkBox`（流星粒子 + 随机脑洞），无独立 `SparkBoxModal.astro` 组件。
- **首页卡片**（根级）：`GreetingCard.astro`（头像交互卡，含社交链接）。
- **内容宇宙组件**（`content-universe/`）：`ContentFilterTabs.astro`（空间筛选 Tab）、`ContentUniverseCard.astro`（统一内容卡片），用于 `/content` 页面。
- **`ToolMatchChat.astro`**（`tools/`）：工具匹配对话组件，提供 `/api/match` 匹配会话的前端 UI；含邀请 gate（GET `/api/profile` 身份探测，public 时弹邀请码弹窗）。
- **`InviteGate.astro`**（`tools/`）：邀请码弹窗组件（≤10 字锚点输入 + 示例 chip + consent，PII 命中拦截）。
- **`ResourceCard.astro`**（根级）：资源链接卡片，在文章详情页 `posts/[slug].astro` 中使用。
- **`GiscusWidget.astro`**（根级）：基于 GitHub Discussions 的评论组件，配置通过 `PUBLIC_GISCUS_*` 环境变量注入，主题跟随 `walker-theme-change` 事件自动切换。在 `[slug].astro` 中使用。
- **`Footer.astro`**（根级）：全局页脚，被 `Base.astro` 使用。
- **内容组件**（`content/`）：`BilibiliVideo.astro`、`DialogueBubble.astro`、`PromptBlock.astro`，用于 MDX 文章内嵌，在 `[slug].astro` 中注册为组件映射。
- **`LikeCounter.astro`**：点赞按钮组件，客户端调 `/api/like` 接口。服务端 API 路由 `src/pages/api/like.ts` 使用 Upstash Redis（Vercel Marketplace）存储计数，同 IP 每路径 60s 冷却。Redis 不可用时降级为 `FALLBACK` 常量（基线计数 17861）。环境变量 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（优先）或 `KV_REST_API_URL` / `KV_REST_API_TOKEN`（降级备选）由 Vercel 自动注入。
- **About 页面组件**（`about/`）：`SectionHeader.astro`（通用 section 标题组件）。关于我 / 关于站两个 Tab 的内容直接内联在 `about/index.astro`，无独立 `AboutSiteTab.astro` 组件。
- **`AdminEditBar.astro`**（`admin/`）：管理员浮动编辑栏组件，自检测 admin cookie，仅在文章详情页 `posts/[slug].astro` 中注入，提供编辑/新建/删除入口。

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
- **`toc-highlight.ts`**：文章目录当前标题高亮，通过 IntersectionObserver 追踪。
- **`justify-tags.ts`**：文章列表标签两端对齐排版，导出 `justifyTags()` 和 `watchJustifyTags()`，含 resize 和 View Transition 生命周期支持，依赖 `@chenglou/pretext`。
- **`home-canvas.ts`**：首页 Bento 画布拖拽、主题切换、Spark 抽点子盲盒（`initSparkBox`）、状态栏反应和点击水波纹逻辑。
- **`tilt-effect.ts`**：3D 卡片透视倾斜效果，导出 `setupTilt(selector, options)`，被 Base.astro 和 about.astro 使用。
- **`with-lifecycle.ts`**：Astro View Transition 生命周期工具，导出 `registerLifecycle(init)`。

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

#### knowledge/（知识库）

- **`content.ts`**：Astro 构建时内容查询函数（`getPublishedContentItems`、`getPublishedPosts`、`getPublishedResources`、`getPublishedIdeas`、`getPublishedProjects`、`getPublishedLearningPosts`），集中过滤和排序逻辑。还导出 `getVersionChain()`（获取文章版本链）和 `getSeriesEntries()`（获取系列文章列表）。仅在 Astro 渲染上下文中可用。
- **`content-query.ts`**：独立查询引擎（见上文 Agent 化基础设施）。
- **`content-model.ts`**：内容模型核心。定义 `ContentSpace`（`all`/`progress`/`life`/`learning`/`tools`/`works`/`ideas`）、`ContentItem` 接口、`toContentItem()` 适配器（将 Astro log 条目投影为多维度内容项）、`itemBelongsToSpace()` 空间分配逻辑、`contentSpaces` 元数据数组。推断函数 `inferForm()`、`inferDomain()`、`inferIntent()`、`inferValueMode()` 从内容属性派生维度。还导出 `formLabels`、`domainLabels`、`intentLabels`、`valueModeLabels` 等显示映射。
- **`visibility.ts`**：内容可见性解析。`resolveContentVisibility()` 根据 `visibility` 和 `published` 字段推断内容为 `public`/`draft`/`private`。优先使用显式 `visibility` 字段，降级到 `published` 布尔值。

#### profiles/（画像系统）

- **`tool-profiles.ts`**：工具画像数据。每个工具的结构化画像（`ToolProfile` 接口），含 `bestFor`、`avoidWhen`、`strengths`、`limitations`、`requires`、`alternatives`、`nextSteps`。供 Agent 匹配时引用。
- **`resource-index.ts`**：站内资源索引（`MatchResource` 接口），供匹配 Agent 查找推荐内容。定义需求分类（`NeedCategory`）、人群标签（`AudienceGroup`）、AI 阶段（`AiStage`）、工具适配类型（`ToolFit`）、判断结论（`FitVerdict`）等枚举和标签映射。

#### agent/（匹配 Agent — Planning 层）

- **`match.ts`**：本地匹配引擎，导出 `matchSiteResources()`，返回 `MatchResult`（已显式导出类型）。接收用户需求，基于关键词评分 + 站内资源索引进行本地初筛，输出分类、资源、串联语、判断结论、摩擦层、能力方向。不依赖 AI API，被 `agent-orchestrator.service.ts` 的 `planRecommendation` 调用，可独立运行。
- **`gateway.ts`**：统一 AI 调用网关。流程：Pretext → 敏感词检测 → API key 检查 → AI 调用 → 输出检测 → 日志。支持 OpenAI 兼容格式（DeepSeek / OpenAI / 中转站）和 Anthropic 原生格式。所有 AI 调用通过 `callGateway()` 统一入口，带超时控制、降级回退和 Redis 日志。导出 `readGatewayLogs()` 供管理页查询。
- **`gateway-config.ts`**：网关配置管理。预设 4 个服务商（DeepSeek / OpenAI / Anthropic / 自定义），配置存 Redis（hash `ai-gateway:config`），无 Redis 时降级到内存 + 本地文件 `.gateway-config.json`。支持配置更新（带历史记录）、撤销、重置、测试连接（`testGatewayConnection`）、调用统计（`getGatewayStats`）。
- **`pretext.ts`**：AI Pretext 系统。根据调用路由和内容推断场景（`match_search` / `match_chat` / `insight` / `content_gen` / `general`），为每个场景生成专属系统提示，附加全局行为规则。
- **`sensitive.ts`**：敏感词管控。六类分治词库（色情/暴力/赌博/违禁/辱骂/自伤），输入拦截 + 输出过滤，命中时降级为 fallback。
- **`ai-utils.ts`**：AI 响应解析工具。从容错文本中提取 JSON（`extractLikelyJson`、`safeParseJsonObject`），类型守卫和数组规范化。
- **`insight.ts`**：需求洞察。从 NeedCase 需求事件中聚类，生成 `TopicCandidate`（选题候选，含 clusterKey、density、roleDistribution、优先级）。批处理接口 `processPendingNeedCases()`：同簇合并、回写 NeedCase `topicCandidateId`。
- **`privacy.ts`**：隐私护盾。PII 脱敏（邮箱、手机号、密钥、联系方式、身份证）、文本压缩、未成年人判断（`isMinorAudience`）。被 PerceptionService 和对话 API 调用。

#### services/（应用服务层 — 编排 + 业务服务）

业务编排层，API 路由只做协议层（解析、限流、响应），业务委托给 service。`agent-orchestrator.service.ts` 是 `/api/match` 的业务核心。

- **`interfaces.ts`**：业务层端口。定义 `MatchingServicePort`、`VisibilityServicePort`（角色 `public`/`invited`/`admin` × 可见性 `public`/`draft`/`private`/`admin-only`）、`UserContextServicePort`、`InviteAccessServicePort`、`UserProfileServicePort`、`AgentOrchestratorPort`、`PerceptionServicePort`、`FeedbackServicePort`、`AdminReviewServicePort`、`SafetyServicePort`。
- **`agent-orchestrator.service.ts`**：`/api/match` 的业务核心（取代旧 `question.service.ts`）。按六模块生命周期编排 `handleNeed`：`perceive`（PerceptionService）→ `planRecommendation`（本地匹配 + 模型增强 + 字段挑选）→ `persistSession`（会话/统计/消息）→ `buildAgentRecommendation` + `safetyFlags` → `recordNeedCase`（生成 + 保存 NeedCase，失败降级记 Incident）→ `buildResponsePayload`。AI 失败降级本地规则；NeedCase 保存失败不阻断用户响应。对外 `handleNeed` 签名稳定，内部拆为命名步骤函数。
- **`perception.service.ts`**：六模块之 Perception。消息截断、逐条 PII 脱敏 + 压缩、最新需求提取、未成年标记，经 `PerceptionServicePort` 暴露。
- **`user-context.service.ts`**：汇总身份（`admin`/`invited`/`public`）+ invited 会话 + 画像为 `UserContext`。
- **`invite-access.service.ts`**：邀请码验证准入（`verifyAndAdmit`）。
- **`profile.service.ts`**：用户画像读写删除（`personaAnchor` 锚点，零 PII，写入前过 `redactSensitiveText`）。
- **`safety.service.ts`**：输入评估 + Incident 事件记录。
- **`feedback.service.ts`**：反馈保存并回写 NeedCase 的 `feedbackStatus`。
- **`admin-review.service.ts`**：NeedCase 复盘列表 + admin review 状态管理。
- **`brief.service.ts`**：选题创作简报生成（规则给角度/结构，不代写正文）。
- **`hit-rate.service.ts`**：按已发布内容聚合关联需求簇的 resolved/stuck 命中率。
- **`matching.service.ts`** / **`visibility.service.ts`**：本地匹配（`matchNeed`）/ 可见性判断（`canSee`、`redactNeedCase`、`filterStats`）。

#### stores/（数据仓储端口层）

- **`ports.ts`**：数据层端口。定义 `NeedCase`（核心业务对象）、`MatchSession`、`ConversationMessage`、`MatchFeedbackType`（8 种）、`TopicCandidate`、`InviteCode`、`InvitedSession`、`UserProfile`、`Incident`、`PublicStats` 等接口及对应 RepositoryPort；`MatchSessionRepositoryPort` 含 `createSessionId`/`saveMessages`/`incrementStats`（会话生命周期收口）。上层只依赖这些接口。
- **`match-session.store.ts`** / **`need-case.store.ts`** / **`feedback.store.ts`** / **`invite-code.store.ts`** / **`invited-session.store.ts`** / **`user-profile.store.ts`** / **`incident.store.ts`**：各仓储的工厂实现，**委托给 `conversation/store.ts`**。

#### conversation/（存储实现层）

- **`store.ts`**：Redis + 内存降级的存储实现。管理 `MatchSession`、`NeedCase`（取代旧 DemandEvent）、`TopicCandidate`、`MatchFeedbackEvent`、`ConversationMessage`、`InvitedSession`、`UserProfile`、`Incident` 生命周期，导出 `getRedis()`、`createSessionId()`、`saveConversationMessages()`、`getNeedCaseStats()`（取代旧 `getDemandStats`）、`getTopicCandidates()`、`saveNeedCase()`、`redactNeedCasesBySession()` 等。被 `stores/` 仓储委托调用，也被 MCP server 和 `/api/match-feedback`（`saveMatchFeedback`）直接引用。

#### shared/（共享工具）

- **`routes.ts`**：路由常量（`HOME`、`POSTS`、`TOOLS`、`IDEAS`、`PROJECTS`、`FERRY`（`/projects/ferry`）、`CONTENT`、`ABOUT`、`LEARN`、`buildPostPath`、`buildContentSpacePath`、`buildLearnGuidePath`），被 Navigation、RSS、内容宇宙、学习页等模块引用。
- **`format.ts`**：日期格式化（`formatDateCompact` → `MM/DD`、`formatDateLocale` → zh-CN 本地化、`formatDateNumeric` → `YYYY/MM/DD`）。
- **`constants.ts`**：共享常量：`PLATFORM_ICON_MAP`（平台图标映射）、`STATUS_LABELS`（状态中文标签）、`STATUS_WEIGHT`（状态排序权重）、`SITE_EMAIL`（站点邮箱）、`CHARS_PER_MINUTE_ZH`（中文阅读速度）、`MS_PER_*` 时间常量。
- **`workspaces.ts`**：页面工作区映射。`getWorkspaceForPath()` 根据路径返回所属工作区（`content`/`learn`/`tools`/`ideas`/`projects`/`about`），供导航高亮和上下文推断使用。

#### 其他

- **`src/lib/admin-auth.ts`**：管理员认证。Cookie HMAC 签名（7 天有效），导出 `isAdmin()`（请求检查）、`signToken()`、`verifyToken()`、`authCookie()`、`clearCookie()`。被所有 admin 页面和 `/api/insights`、`/api/admin/*` 路由引用。
- **`src/lib/invited-session-auth.ts`**：受邀会话认证。HMAC 签名 Cookie（复用 `ADMIN_PASSWORD` 密钥），导出 `readInvitedSessionId()`。被 `/api/match` gate、`/api/profile` 引用。
- **`src/lib/theme.ts`**：多主题循环工具。导出 `THEMES`（`nature`/`aurora`/`sunset`/`mint`）、`ThemeName` 类型、`cycleTheme()` 函数。被 `Navigation.astro`、`home-canvas.ts`、`FullscreenLayout.astro` 引用。
- **`src/lib/admin-content-store.ts`**：Admin 内容存储适配。通过 GitHub API（`GITHUB_TOKEN`）读写 `src/content/log/` 下的 markdown 文件，`GITHUB_TOKEN` 未配置时抛 503。被 `/api/admin/content/[slug]` 引用。
- **`src/types/nav.ts`**：导航类型定义。`NavItem`（`label`、`href`、`icon`、`hint?`）和 `NavGroup`（`title?`、`items`），被 `Navigation.astro` 和 `SidebarNav.astro` 引用。

## 路径别名

```json
"@/*": ["src/*"]
```

## 文档治理

`docs/` 不是当前项目工作台。当前有效的 PRD、计划、架构和执行状态统一放在 `.agents/skills/walker-northstar/references/`（walker-northstar skill 仓库，独立 git）。`docs/` 仅保留三类材料：归档（`docs/archive/`）、架构决策记录（`docs/adr/`）、专题资料（`docs/AI赋能/` 等）。详见 `docs/README.md`。

## 内容创作

- 语言：中文（zh-CN），UI 文案和内容以中文为主。
- 文件命名：中文 slug（如 `设计为人与内容搭桥.md`），方便 Obsidian 检索。MDX 同理（如 `减法对话.mdx`）。
- Markdown 支持 MDX，可在文章中使用交互组件。
- `cover` 支持内容图片或远程图片 URL。
- `resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`。
- 版本迭代：同一篇文章认知升级时新建文件（如 `设计为人与内容搭桥 v2.md`），通过 `version` + `previousVersion` 字段串联。文章详情页底部自动显示版本链导航。
- 系列连载：通过 `series` + `seriesOrder` 字段串联同一主题的多篇文章。文章详情页底部自动显示系列导航（系列名 + 序号 + 上一篇/下一篇）。
- 学习指南：`type: learn` 的内容条目作为学习指南，需设置 `level`（`入门`/`学徒`/`专家`）和教学元数据字段（`emoji`、`subtitle`、`yValue`、`graduation`、`safetyNote`、`shareAction`）。指南详情页路由为 `/learn/guide/[level]/[tool]`。
