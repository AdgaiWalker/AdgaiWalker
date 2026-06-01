# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Walker（秋知 / AdgaiWalker）的个人空间 / 数字花园，基于中文 Astro 6 站点，部署在 Vercel。站点地址：https://iwalk.pro。首页为可拖拽 Bento Box 画布，展示身份卡片、最近文章、精选工具、项目入口、点子入口和社交链接；内页包含文章列表与阅读页、资源工具页、点子库、项目页、内容宇宙、侧边栏导航、Pagefind 搜索、Upstash Redis 点赞和 Giscus 评论。站点结构对齐"个人前进系统"：思考（posts）、资源（tools）、点子（ideas）、项目（projects）。

## 常用命令

```bash
npm run dev        # 启动开发服务器
npm run build      # 生产构建 + Pagefind 索引生成
npm run preview    # 本地预览生产构建
npx astro check    # Astro 类型检查
```

## 架构

### 渲染与部署

- **输出模式**：`output: 'server'`，通过 `@astrojs/vercel` 适配器部署。
- **预渲染**：主要内容页启用 `prerender = true`，包括首页、文章列表、文章详情、资源列表、点子列表、项目列表、关于页、404；旧动态路由 `/ai/[slug]`、`/life/[slug]` 保留为服务端 301 跳转。
- **图片服务**：Vercel Image Optimization 已启用，`@astrojs/vercel` adapter 配置了 `imageService` 和图片尺寸。
- **性能配置**：Astro `prefetch.defaultStrategy = 'hover'`，并启用 `experimental.svgo`。
- **构建流程**：`astro build` → `pagefind --site dist/client --output-path .vercel/output/static/pagefind`。

### 内容集合

在 `src/content.config.ts` 中定义一个集合：

- **`log`**：博客文章、想法、工具和项目，来源 `src/content/log/`。支持 `.md` 和 `.mdx`。Schema 包含以下字段：
  - 基础：`title`、`date`、`updated`（可选）、`tags`、`category`、`published`、`summary`、`description`、`cover`、`rating`（1-5）、`url`、`qrCode`。
  - 分类：`type`（枚举：`knowledge`、`tool`、`idea`、`project`、`community`、`learn`、`learning`）、`status`（枚举：`thinking`、`validating`、`building`、`verified`、`archived`）。
  - 内容模型：`form`（`article`/`note`/`diary`/`rant`/`gallery`/`video`/`recipe`/`calligraphy`/`resource`/`project`/`idea`/`lesson`）、`domain`（`ai`/`coding`/`product`/`philosophy`/`life`/`cooking`/`calligraphy`/`reading`/`travel`/`emotion`/`community`）、`intent`（`think`/`record`/`teach`/`share`/`verify`/`showcase`/`reflect`/`connect`/`vent`）、`valueMode`（`utility`/`existence`/`both`）。
  - AI 策略：`aiUsePolicy`（含 `level`：`AI-0`~`AI-4`、`readable`、`citable`、`actionable`、`reason`）。
  - 关联：`related`（ID 数组）、`featured`（布尔）。
  - 媒体与资源：`communities`（对象数组）、`videos`（`videos.platform` 支持 `bilibili`、`douyin`、`xiaohongshu`、`youtube`、`github`、`zhihu`）、`resources`（`resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`）。

### 布局系统

共有四个布局：

1. **`Base.astro`**：根外壳。处理共享 head、JSON-LD、导航、页脚、格线纹理背景、鼠标光晕和阅读模式。共享 head 由 `src/components/shared/HeadCommon.astro` 提供。
2. **`SidebarLayout.astro`**：通用内页布局，带页面头部、图标和计数。用于 `/posts`、`/tools`、`/ideas`、`/projects` 等列表型页面。
3. **`ArticleLayout.astro`**：两栏布局（TOC 目录 + 文章正文），`ArticleNav` 通过 slot 注入 Navigation 侧边栏，内容区使用 `pureMode=true` 的阅读模式。
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
| `/content` | 内容宇宙（多维度内容聚合） | Base |
| `/about` | 关于（含关于我/关于站 Tab） | FullscreenLayout |
| `/about?tab=site` | 关于站（Tab 切换） | FullscreenLayout |
| `/404` | 404 页面 | Base |
| `/rss.xml` | RSS 订阅源 | 无布局 |
| `/llms.txt` | AI 可读站点地图 | 无布局（静态文本） |
| `/walker-style.md` | AI 可读风格指南 | 无布局（静态文本） |
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

### 核心组件

- **`Navigation.astro`**：导航协调器，根据路由分发到三个子组件：`nav/TopNavBar.astro`（首页胶囊栏）、`nav/SidebarNav.astro`（内页左侧边栏）、`nav/MobileMenu.astro`（移动端汉堡菜单）。包含搜索触发器、主题切换按钮。`nav-extension` slot 通过 `Base.astro` 传入。
- **`SearchModal.astro`**：基于 Pagefind 的搜索，通过 `⌘K` 或搜索按钮触发。
- **`ArticleNav.astro`**（`article/`）：文章详情页导航列表，支持文字/卡片视图。
- **`TableOfContents.astro`**（`article/`）：文章页粘性目录，通过 `toc-highlight.ts` 高亮当前标题。
- **首页组件**（`home/`）：`HomeCanvas.astro`（Bento 画布）、`SparkBoxModal.astro`（火花弹窗）、`CustomPalette.astro`（调色板）、`CanvasZoomControls.astro`（缩放控件）。
- **首页卡片**（根级）：`GreetingCard.astro`、`BrandCard.astro`、`RecentTraces.astro`、`FeaturedTools.astro`、`CalendarWidget.astro`、`MusicPlayer.astro`、`PolaroidWidget.astro`、`WalkerProfile.astro`。
- **内容宇宙组件**（`content-universe/`）：`ContentFilterTabs.astro`（空间筛选 Tab）、`ContentUniverseCard.astro`（统一内容卡片），用于 `/content` 页面。
- **`ResourceCard.astro`**（根级）：资源链接卡片，在文章详情页 `posts/[slug].astro` 中使用。
- **`GiscusWidget.astro`**（根级）：基于 GitHub Discussions 的评论组件，配置通过 `PUBLIC_GISCUS_*` 环境变量注入，主题跟随 `walker-theme-change` 事件自动切换。在 `[slug].astro` 中使用。
- **`Footer.astro`**（根级）：全局页脚，被 `Base.astro` 使用。
- **内容组件**（`content/`）：`BilibiliVideo.astro`、`DialogueBubble.astro`、`PromptBlock.astro`，用于 MDX 文章内嵌，在 `[slug].astro` 中注册为组件映射。
- **`LikeCounter.astro`**：点赞按钮组件，客户端调 `/api/like` 接口。服务端 API 路由 `src/pages/api/like.ts` 使用 Upstash Redis（Vercel Marketplace）存储计数，同 IP 每路径 60s 冷却。Redis 不可用时降级为 `FALLBACK_COUNT` 常量。环境变量 `KV_REST_API_URL` / `KV_REST_API_TOKEN` / `REDIS_URL` 由 Vercel 自动注入。

### 图标与样式

- 图标统一使用 `astro-icon` + `@iconify-json/lucide`，在构建期内联 SVG。不再加载 Iconify CDN 运行时。
- Tailwind CSS v4 通过 `@tailwindcss/vite` 插件接入，无 `tailwind.config`。
- `src/styles/global.css` 使用 `@theme` 定义颜色和 `--font-cjk`。`--font-body`、`--font-heading`、`--font-mono` 由 Astro Fonts API 注入。
- 字体通过 Astro Fonts API + fontsource provider 自托管：Outfit（body）、Averia Gruesa Libre（heading）、JetBrains Mono（mono）、Noto Sans SC（CJK）。所有字体构建期内联，无外部 CDN 依赖。
- 多主题系统：`.theme-nature`（默认亮色）、`.theme-aurora`（暗色霓虹）、`.theme-sunset`（暖色暗色）、`.theme-mint`（绿色暗色），各定义完整的 CSS 自定义属性。
- 代码块语法高亮使用 `shikiConfig: { theme: 'github-dark' }`。
- 玻璃面板使用 `.panel-glass`，阅读模式由 `pureMode` 触发 `.reading-mode`。
- 自定义 SVG 光标位于 `/cursor.svg`。

### 客户端脚本

- **`scroll-fade.ts`**：滚动触发 `.reveal` 元素淡入。
- **`sidebar-state.ts`**：侧边栏折叠/展开，通过 `data-sidebar-collapsed` 属性控制，使用 `localStorage` 持久化。
- **`toc-highlight.ts`**：文章目录当前标题高亮，通过 IntersectionObserver 追踪。
- **`justify-tags.ts`**：文章列表标签两端对齐排版，依赖 `@chenglou/pretext`。
- **`home-canvas.ts`**：首页 Bento 画布拖拽、缩放、主题切换逻辑。
- **`tilt-effect.ts`**：3D 卡片透视倾斜效果，导出 `setupTilt(selector, options)`，被 Base.astro 和 about.astro 使用。
- **`with-lifecycle.ts`**：Astro View Transition 生命周期工具，导出 `registerLifecycle(init)`。

### Remark 插件

`remark-rich-embed.ts` 将 Markdown 中的 `![](url)` 按 URL 类型转换为富媒体嵌入：

- B 站和 YouTube：播放器 iframe。
- 音频文件：`<audio>` 播放器。
- GitHub 仓库：样式化链接卡片。
- 其他 URL：通用链接卡片。

插件输出静态 HTML 和内联 SVG，不依赖 Iconify 运行时。

### 数据文件

- **`src/data/site-stats.json`**：关于页面的动态数据源，含 `costs`（花费记录）、`siteTimeline`（站点开发时间线）、`personalTimeline`（个人成长时间线，含 `children` 用于 NOW 节点子内容）、`roadmap`（`done` + `planned`）。被 `about/index.astro`（通过 `AboutSiteTab.astro`）导入，更新此文件即可刷新关于页的动态内容。

### 辅助模块

- **`src/lib/routes.ts`**：路由常量（`HOME`、`POSTS`、`TOOLS`、`IDEAS`、`PROJECTS`、`CONTENT`、`ABOUT`、`buildPostPath`、`buildContentSpacePath`），被 Navigation、RSS、内容宇宙等模块引用。
- **`src/lib/content.ts`**：内容查询函数（`getPublishedContentItems`、`getPublishedPosts`、`getPublishedResources`、`getPublishedIdeas`、`getPublishedProjects`），集中过滤和排序逻辑。
- **`src/lib/content-model.ts`**：内容模型核心。定义 `ContentSpace`（`all`/`progress`/`life`/`learning`/`tools`/`works`/`ideas`）、`ContentItem` 接口、`toContentItem()` 适配器（将 Astro log 条目投影为多维度内容项）、`itemBelongsToSpace()` 空间分配逻辑、`contentSpaces` 元数据数组。还导出 `formLabels`、`domainLabels`、`intentLabels`、`valueModeLabels` 等显示映射。
- **`src/lib/format.ts`**：日期格式化（`formatDateCompact` → `MM/DD`、`formatDateLocale` → zh-CN 本地化、`formatDateNumeric` → `YYYY/MM/DD`）。
- **`src/lib/constants.ts`**：共享常量（`PLATFORM_ICON_MAP` 等）。

## 路径别名

```json
"@/*": ["src/*"]
```

## 内容创作

- 语言：中文（zh-CN），UI 文案和内容以中文为主。
- Markdown 支持 MDX，可在文章中使用交互组件。
- `cover` 支持内容图片或远程图片 URL。
- `resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`。
