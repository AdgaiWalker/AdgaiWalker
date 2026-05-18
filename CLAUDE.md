# CLAUDE.md

本文件为 Claude Code 在此仓库中工作时提供指引。

## 项目概述

Walker（秋知 / AdgaiWalker）的个人博客，基于中文 Astro 6 站点，部署在 Vercel。站点地址：https://iwalk.pro。站点包含可拖拽 Bento Box 首页、统一文章列表与阅读页、AI 探索资源页、侧边栏导航、Pagefind 搜索和 Supabase 点赞。

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
- **预渲染**：主要内容页启用 `prerender = true`，包括首页、文章列表、文章详情、关于页、404、AI 子页面和探索页；旧动态路由 `/ai/[slug]`、`/life/[slug]` 保留为服务端 301 跳转。
- **图片服务**：Vercel Image Optimization 已启用，`@astrojs/vercel` adapter 配置了 `imageService` 和图片尺寸。
- **性能配置**：Astro `prefetch.defaultStrategy = 'hover'`，并启用 `experimental.svgo`。
- **构建流程**：`astro build` → `pagefind --site dist/client --output-path .vercel/output/static/pagefind`。

### 内容集合

在 `src/content.config.ts` 中定义两个集合：

- **`log`**：博客文章和想法，来源 `src/content/log/`。支持 `.md` 和 `.mdx`。Schema 包含 `title`、`date`、`tags`、`category`、`type`、`published`、`summary`、`description`、`cover`、`videos`、`resources` 等字段。`videos.platform` 支持 `bilibili`、`douyin`、`xiaohongshu`、`youtube`、`github`、`zhihu`。
- **`dockItem`**：AI 探索资源条目，来源 `src/content/dock/`。Schema 包含 `name`、`description`、`category`、`tags`、`rating`、`url`、`published`。

### 布局系统

共有五个布局：

1. **`Base.astro`**：根外壳。处理共享 head、JSON-LD、导航、页脚、环境粒子画布、鼠标光晕和阅读模式。共享 head 由 `src/components/shared/HeadCommon.astro` 提供。
2. **`SidebarLayout.astro`**：通用内页布局，带页面头部、图标和计数。用于 `/posts`、`/ai/learn`、`/ai/sources`、`/ai/ideas` 等列表型页面。
3. **`ArticleLayout.astro`**：三栏文章视图，导航栏注入 `ArticleNav`，内容区使用 `pureMode=true` 的阅读模式。
4. **`DockLayout.astro`**：`/explore` 和 `/explore/[slug]` 的主从布局，使用 `column-resize.ts` 实现可调整列宽。
5. **`FullscreenLayout.astro`**：独立全屏外壳，不基于 `Base.astro`。用于 `/about`。

### 路由结构

| 路径 | 页面 | 布局 |
| --- | --- | --- |
| `/` | 首页 Bento Box | Base |
| `/posts` | 统一文章列表 | SidebarLayout |
| `/posts/[slug]` | 统一文章详情 | ArticleLayout |
| `/ai` | 重定向到 `/posts` | Astro redirects |
| `/ai/[slug]` | 旧 AI 文章 URL，301 到 `/posts/[slug]` | Astro.redirect |
| `/ai/learn` | 学习页 | SidebarLayout |
| `/ai/sources` | 信息源页 | SidebarLayout |
| `/ai/toolkit` | 工具箱页，三栏可调列宽 | Base |
| `/ai/ideas` | Idea 页 | SidebarLayout |
| `/life` | 重定向到 `/posts` | Astro redirects |
| `/life/[slug]` | 旧生活文章 URL，301 到 `/posts/[slug]` | Astro.redirect |
| `/explore` | AI 探索资源列表 | DockLayout |
| `/explore/[slug]` | AI 探索资源详情 | DockLayout |
| `/about` | 关于页 | FullscreenLayout |
| `/404` | 404 页面 | Base |
| `/rss.xml`、`/ai/rss.xml`、`/life/rss.xml` | RSS 订阅源 | 无布局 |

### 核心组件

- **`Navigation.astro`**：常驻左侧导航栏，桌面端可折叠，移动端为顶部栏。包含搜索触发器和 `nav-extension` slot。
- **`SearchModal.astro`**：基于 Pagefind 的搜索，通过 `⌘K` 或搜索按钮触发。
- **`ArticleNav.astro`**：文章详情页导航列表，支持列表/卡片视图。
- **`TableOfContents.astro`**：文章页粘性目录，通过 `toc-tracker.ts` 跟踪当前标题。
- **`ArticleCard.astro`**、**`IdeaCard.astro`**：文章与 Idea 卡片。
- **`CategoryPanel.astro`**、**`DockShowcase.astro`**、**`DockItemCard.astro`**：探索资源分类和展示组件。
- **`RecentTraces.astro`**、**`RandomRecommend.astro`**：首页内容推荐组件。
- **`LikeCounter.astro`**：通过原生 `fetch()` 调用 Supabase REST API，无 Supabase 客户端 SDK 依赖。

### 图标与样式

- 图标统一使用 `astro-icon` + `@iconify-json/lucide`，在构建期内联 SVG。不再加载 Iconify CDN 运行时。
- Tailwind CSS v4 通过 `@tailwindcss/vite` 插件接入，无 `tailwind.config`。
- `src/styles/global.css` 使用 `@theme` 定义颜色和 `--font-cjk`。`--font-body`、`--font-heading`、`--font-mono` 由 Astro Fonts API 注入。
- 字体通过 Astro Fonts API + fontsource provider 自托管：Inter、Sora、JetBrains Mono、Noto Sans SC。
- 玻璃面板使用 `.panel-glass`，阅读模式由 `pureMode` 触发 `.reading-mode`。
- 自定义 SVG 光标位于 `/cursor.svg`。

### 客户端脚本

- **`ambient.ts`**：首页背景 Canvas 粒子动画。
- **`scroll-fade.ts`**：滚动触发 `.reveal` 元素淡入。
- **`sidebar-state.ts`**：侧边栏折叠/展开，使用 `localStorage` 持久化。
- **`toc-tracker.ts`**：文章目录当前标题跟踪。
- **`column-resize.ts`**：DockLayout 和工具箱页面列宽调整。
- **`justify-tags.ts`**：文章列表和信息源页标签两端对齐。

### Remark 插件

`remark-rich-embed.ts` 将 Markdown 中的 `![](url)` 按 URL 类型转换为富媒体嵌入：

- B 站和 YouTube：播放器 iframe。
- 音频文件：`<audio>` 播放器。
- GitHub 仓库：样式化链接卡片。
- 其他 URL：通用链接卡片。

插件输出静态 HTML 和内联 SVG，不依赖 Iconify 运行时。

## 路径别名

```json
"@/*": ["src/*"]
```

## 内容创作

- 语言：中文（zh-CN），UI 文案和内容以中文为主。
- Markdown 支持 MDX，可在文章中使用交互组件。
- `cover` 支持内容图片或远程图片 URL。
- `resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`。
