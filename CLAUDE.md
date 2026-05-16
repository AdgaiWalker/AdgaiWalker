# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指引。

## 项目概述

Walker（秋知 / AdgaiWalker）的个人博客 — 基于中文 Astro 6 站点，部署在 Vercel 上。站点地址：https://iwalk.pro。博客包含可拖拽的 Bento Box 首页、侧边栏导航、带目录的文章阅读模式，以及「Dock」资源库板块。

## 常用命令

```bash
npm run dev        # 启动开发服务器 (astro dev)
npm run build      # 生产构建 + Pagefind 索引生成
npm run preview    # 本地预览生产构建
```

未配置测试套件和代码检查工具。类型检查使用 `@astrojs/check`。

## 架构

### 渲染与部署

- **输出模式**：通过 `@astrojs/vercel` 适配器的 `server` 模式（SSR）
- **首页**（`src/pages/index.astro`）是唯一预渲染页面（`prerender = true`）
- 构建流程：`astro build` → `pagefind --site dist/client --output-path .vercel/output/static/pagefind`
- 部署在 Vercel 上（`vercel.json` 指定了框架和构建命令）

### 内容集合

在 `src/content.config.ts` 中使用 Astro 的 glob loader 定义了两个集合：

- **`log`** — 博客文章和想法（`src/content/log/`）。支持 `.md` 和 `.mdx`。Schema 必填字段：`title`、`date`、`tags`、`category`（`ai`|`life`）、`type`（`article`|`thought`|`photo`|`project`|`idea`）。可选字段：`videos`（B站/YouTube 嵌入）、`resources`（工具链接）。
- **`dockItem`** — 资源/工具库条目（`src/content/dock/`）。Schema：`name`、`description`、`category`（`tool`|`skill`|`info-source`|`community`）、`tags`，可选 `rating` 和 `url`。

### 布局系统

四个布局，均基于 `Base.astro`：

1. **`Base.astro`** — 根外壳。处理 SEO meta、OG 标签、JSON-LD、环境粒子画布、鼠标光晕、噪点纹理。接受 `pureMode` 参数以移除装饰层（用于文章阅读模式）。设置 `--walker-nav-width` CSS 变量控制侧边栏宽度。
2. **`SidebarLayout.astro`** — 通用内页布局，带页面头部（标题 + 图标 + 计数）。用于列表页：`/ai`、`/life`、`/ai/learn`、`/ai/sources`、`/ai/toolkit`、`/ai/ideas`。
3. **`ArticleLayout.astro`** — 三栏文章视图（导航 → 目录 → 内容）。`pureMode=true` 实现纯净阅读。将 `ArticleSidebar` 注入到 Navigation 的 slot 中，在导航栏内展示文章列表。
4. **`DockLayout.astro`** — `/dock` 页面的主从布局。通过拖拽手柄实现可调整列宽，`localStorage` 持久化。按分类分组展示 dock 条目。

### 路由结构

| 路径                                       | 页面                | 布局            |
| ---------------------------------------- | ----------------- | ------------- |
| `/`                                      | 首页（Bento Box，预渲染） | 仅 Base        |
| `/ai`                                    | AI 文章列表           | SidebarLayout |
| `/ai/[slug]`                             | AI 文章详情           | ArticleLayout |
| `/ai/learn`                              | 学习页               | SidebarLayout |
| `/ai/sources`                            | 信息源页              | SidebarLayout |
| `/ai/toolkit`                            | 工具箱页              | SidebarLayout |
| `/ai/ideas`                              | 想法页               | SidebarLayout |
| `/life`                                  | 生活文章列表            | SidebarLayout |
| `/life/[slug]`                           | 生活文章详情            | ArticleLayout |
| `/dock`                                  | 资源库列表             | DockLayout    |
| `/dock/[slug]`                           | 资源详情              | DockLayout    |
| `/about`                                 | 关于页               | FullscreenLayout |
| `/rss.xml`、`/ai/rss.xml`、`/life/rss.xml` | RSS 订阅源           | —             |

### 核心组件

- **`Navigation.astro`** — 常驻左侧导航栏（桌面端 260px，移动端顶部栏）。按 `[` 键可折叠。包含导航链接、搜索触发器（`⌘K`）和 `nav-extension` slot 用于注入页面特定内容（如文章列表）。
- **`SearchModal.astro`** — 基于 Pagefind 的搜索。通过 `⌘K` 或搜索按钮触发。
- **`ArticleSidebar.astro`** — 在文章详情页注入到 Navigation 中的文章列表。
- **`TableOfContents.astro`** — 文章页的粘性目录。通过 `toc-tracker.ts` 跟踪滚动位置。
- **`LikeCounter.astro`** — 直连 Supabase 的页面点赞（无 API 中间层）。

### 样式

- **Tailwind CSS v4** 通过 `@tailwindcss/vite` 插件（无 `tailwind.config` 文件 — 使用基于 CSS 的 `@theme` 配置）
- **`src/styles/global.css`** — 全局样式表，`@theme` 块定义了完整的设计令牌系统（颜色、字体）
- 设计令牌：品牌色 `#35bfab`（薄荷青），字体：Sora（标题）、Inter + Noto Sans SC（正文）、JetBrains Mono（代码）
- 玻璃拟态面板通过 `.panel-glass` 类实现（40px 圆角、背景模糊、内发光）
- 阅读模式：`pureMode` 属性触发 `.reading-mode` 类，使用暖色羊皮纸背景
- 自定义 SVG 光标位于 `/cursor.svg`

### 客户端脚本（`src/scripts/`）

- **`ambient.ts`** — 首页背景的 Canvas 粒子动画
- **`scroll-fade.ts`** — 滚动触发的淡入动画（`.reveal` 元素）
- **`sidebar-state.ts`** — 侧边栏折叠/展开，`localStorage` 持久化
- **`toc-tracker.ts`** — 文章目录的当前标题跟踪

### Remark 插件

**`remark-rich-embed.ts`** — 将 `![](url)` Markdown 图片根据 URL 转换为富媒体嵌入：

- B站 → 嵌入播放器 iframe
- YouTube → 嵌入播放器 iframe
- 音频文件（`.mp3`、`.wav` 等）→ `<audio>` 播放器
- GitHub 仓库 → 样式化链接卡片
- 其他 URL → 通用链接卡片

### 点赞系统

纯前端实现：`LikeCounter.astro` 使用 `@supabase/supabase-js` 直连 Supabase，无服务端 API 层。

## 路径别名

```json
"@/*": ["src/*"]
```

## 内容创作

- 语言：中文（zh-CN）。所有 UI 文案和内容均为中文。
- Markdown 文件支持 MDX 以实现交互组件。
- Frontmatter `videos` 字段接受含 `platform` 枚举的对象：`bilibili`、`douyin`、`xiaohongshu`、`youtube`、`github`、`zhihu`。
- Frontmatter `resources` 字段接受含 `type` 枚举的对象：`tool`、`feishu`、`github`、`website`、`download`。
