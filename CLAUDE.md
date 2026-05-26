# CLAUDE.md

本文件为 Claude Code 在此仓库中工作时提供指引。

## 项目概述

Walker（秋知 / AdgaiWalker）的个人博客，基于中文 Astro 6 站点，部署在 Vercel。站点地址：https://iwalk.pro。站点包含可拖拽 Bento Box 首页、统一文章列表与阅读页、资源工具页、侧边栏导航、Pagefind 搜索和 Supabase 点赞。

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
- **预渲染**：主要内容页启用 `prerender = true`，包括首页、文章列表、文章详情、资源列表、关于页、404；旧动态路由 `/ai/[slug]`、`/life/[slug]` 保留为服务端 301 跳转。
- **图片服务**：Vercel Image Optimization 已启用，`@astrojs/vercel` adapter 配置了 `imageService` 和图片尺寸。
- **性能配置**：Astro `prefetch.defaultStrategy = 'hover'`，并启用 `experimental.svgo`。
- **构建流程**：`astro build` → `pagefind --site dist/client --output-path .vercel/output/static/pagefind`。

### 内容集合

在 `src/content.config.ts` 中定义一个集合：

- **`log`**：博客文章、想法、工具和项目，来源 `src/content/log/`。支持 `.md` 和 `.mdx`。Schema 包含 `title`、`date`、`tags`、`category`、`type`（枚举：`knowledge`、`tool`、`idea`、`project`）、`published`、`summary`、`description`、`cover`、`status`（枚举：`thinking`、`practicing`、`verified`、`archived`）、`rating`（1-5）、`url`、`qrCode`、`communities`（对象数组）、`videos`、`resources` 等字段。`videos.platform` 支持 `bilibili`、`douyin`、`xiaohongshu`、`youtube`、`github`、`zhihu`。

### 布局系统

共有四个布局：

1. **`Base.astro`**：根外壳。处理共享 head、JSON-LD、导航、页脚、环境粒子画布、鼠标光晕和阅读模式。共享 head 由 `src/components/shared/HeadCommon.astro` 提供。
2. **`SidebarLayout.astro`**：通用内页布局，带页面头部、图标和计数。用于 `/posts`、`/tools` 等列表型页面。
3. **`ArticleLayout.astro`**：三栏文章视图，导航栏注入 `ArticleNav`，内容区使用 `pureMode=true` 的阅读模式。
4. **`FullscreenLayout.astro`**：独立全屏外壳，不基于 `Base.astro`。用于 `/about`。

### 路由结构

| 路径 | 页面 | 布局 |
| --- | --- | --- |
| `/` | 首页 Bento Box | Base |
| `/posts` | 统一文章列表 | SidebarLayout |
| `/posts/[slug]` | 统一文章详情 | ArticleLayout |
| `/tools` | 资源列表（工具与点子） | SidebarLayout |
| `/about` | 关于页 | FullscreenLayout |
| `/404` | 404 页面 | Base |
| `/rss.xml` | RSS 订阅源 | 无布局 |

以下旧路由保留为 301 重定向（定义在 `astro.config.mjs`）：

| 旧路径 | 重定向目标 |
| --- | --- |
| `/ai` | `/tools` |
| `/ai/learn` | `/posts` |
| `/ai/sources`、`/ai/toolkit`、`/ai/ideas` | `/tools` |
| `/ai/:slug` | `/posts/:slug` |
| `/idea`、`/idea/*` | `/tools` 或 `/posts/:slug` |
| `/life` | `/posts` |
| `/life/:slug` | `/posts/:slug` |

### 核心组件

- **`Navigation.astro`**：双模式导航——首页渲染全宽顶部栏胶囊导航，内页渲染左侧边栏（桌面端可折叠，移动端为顶部栏）。包含搜索触发器、主题切换按钮。`nav-extension` slot 通过 `Base.astro` 传入。
- **`SearchModal.astro`**：基于 Pagefind 的搜索，通过 `⌘K` 或搜索按钮触发。
- **`ArticleNav.astro`**：文章详情页导航列表，支持文字/卡片视图。
- **`TableOfContents.astro`**：文章页粘性目录，通过 `toc-tracker.ts` 跟踪当前标题。
- **`GreetingCard.astro`**、**`BrandCard.astro`**、**`RecentTraces.astro`**、**`DockShowcase.astro`**：首页 Bento Box 卡片组件。
- **`LikeCounter.astro`**：通过原生 `fetch()` 调用 Supabase REST API，无 Supabase 客户端 SDK 依赖。需要 `PUBLIC_SUPABASE_URL` 和 `PUBLIC_SUPABASE_ANON_KEY` 环境变量。

### 图标与样式

- 图标统一使用 `astro-icon` + `@iconify-json/lucide`，在构建期内联 SVG。不再加载 Iconify CDN 运行时。
- Tailwind CSS v4 通过 `@tailwindcss/vite` 插件接入，无 `tailwind.config`。
- `src/styles/global.css` 使用 `@theme` 定义颜色和 `--font-cjk`。`--font-body`、`--font-heading`、`--font-mono` 由 Astro Fonts API 注入，但 `global.css` 会覆盖 `--font-heading` 为 Averia Gruesa Libre / Outfit，`--font-body` 为 Outfit。
- 字体通过 Astro Fonts API + fontsource provider 自托管：Inter、Sora、JetBrains Mono、Noto Sans SC（实际渲染字体见 `global.css` 覆盖值）。
- 代码块语法高亮使用 `shikiConfig: { theme: 'github-dark' }`。
- 玻璃面板使用 `.panel-glass`，阅读模式由 `pureMode` 触发 `.reading-mode`。
- 自定义 SVG 光标位于 `/cursor.svg`。

### 客户端脚本

- **`scroll-fade.ts`**：滚动触发 `.reveal` 元素淡入。
- **`sidebar-state.ts`**：侧边栏折叠/展开，使用 `localStorage` 持久化。
- **`toc-tracker.ts`**：文章目录当前标题跟踪。
- **`justify-tags.ts`**：文章列表标签两端对齐排版，依赖 `@chenglou/pretext`。

注：`ambient.ts`（Canvas 粒子动画）和 `column-resize.ts`（列宽调整）存在于 `src/scripts/` 但当前未被页面导入。

### Remark 插件

`remark-rich-embed.ts` 将 Markdown 中的 `![](url)` 按 URL 类型转换为富媒体嵌入：

- B 站和 YouTube：播放器 iframe。
- 音频文件：`<audio>` 播放器。
- GitHub 仓库：样式化链接卡片。
- 其他 URL：通用链接卡片。

插件输出静态 HTML 和内联 SVG，不依赖 Iconify 运行时。

### 辅助模块

- **`src/lib/routes.ts`**：路由常量（`POSTS`、`TOOLS`、`postSlug`），被 Navigation、RSS 等模块引用，确保路由一致性。
- **`src/data/toolkit-notes.ts`**：工具页面数据（AI 模型笔记、工作流笔记、省钱笔记），按类型导出为 `[name, desc][]` 元组数组。

## 路径别名

```json
"@/*": ["src/*"]
```

## 内容创作

- 语言：中文（zh-CN），UI 文案和内容以中文为主。
- Markdown 支持 MDX，可在文章中使用交互组件。
- `cover` 支持内容图片或远程图片 URL。
- `resources.type` 支持 `tool`、`feishu`、`github`、`website`、`download`。
