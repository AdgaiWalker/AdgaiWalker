> Archived: This document has been superseded by `docs/README.md`. It is kept only for historical context.

# Walker 博客 PRD

最后更新: 2026-05-28

版本：v3.2
日期：2026-05-28
基准：当前代码实现

## 1. 定位

Walker 是秋知的个人数字根据地。

核心内容：
- AI 探索
- 哲学思考
- 生活记录
- 工具、信息源、想法、个人介绍

目标用户：
- 社媒粉丝：找工具、资源、文章
- AI 学习者：读经验、学工作流
- 同好与创作者：判断是否值得连接

## 2. 设计理念

### 2.1 原则

1. 让每次交互得到模拟现实的回应。  
   点击、拖拽、悬停、滚动、切换状态都要有可感知反馈。

2. 合适的内容搭配合适的形式。  
   文章用阅读页；工具和信息源用卡片；首页用桌面；关于页用沉浸式页面。

3. 克制但不冷淡。  
   少解释，多状态；少装饰，多反馈。

4. 图标使用 Lucide。  
   不用 Emoji 承担界面语义。

### 2.2 交互反馈

| 交互 | 反馈 | 实现 |
| --- | --- | --- |
| 首页拖拽 | 位移、层级、缩放 | `src/pages/index.astro` |
| 卡片 hover | 阴影、透明度、倾斜 | `Base.astro`、`global.css` |
| 鼠标移动 | 背景光晕跟随 | `Base.astro` |
| 目录滚动 | 当前标题高亮 | `toc-highlight.ts` |
| 侧栏折叠 | 宽度、图标、状态记忆 | `sidebar-state.ts` |
| 点赞 | 图标状态、计数变化 | `LikeCounter.astro` |
| 搜索 | 快捷键、弹层、输入状态 | `SearchModal.astro` |

## 3. 路由

```text
/                         首页 Bento Box              Base
/posts                    文章列表                     SidebarLayout
/posts/[slug]             文章详情                     ArticleLayout
/tools                    资源列表（工具）              SidebarLayout
/ideas                    点子库                       SidebarLayout
/projects                 项目列表                     SidebarLayout
/about                    关于我                       FullscreenLayout
/about/site               关于网站                     FullscreenLayout
/404                      404                          Base
/rss.xml                  RSS 订阅源                   无布局

# 301 重定向（astro.config.mjs）
/ai                       → /tools
/ai/:slug                 → /posts/:slug
/ai/learn                 → /posts
/ai/sources               → /tools
/ai/toolkit               → /tools
/ai/ideas                 → /ideas
/idea、/idea/*            → /tools 或 /posts/:slug
/life                     → /posts
/life/:slug               → /posts/:slug
```

不做：
- `/about-me`
- `/dock`
- `/explore`
- `/ai` 独立文章总览
- `/life` 独立文章总览

## 4. 导航

| 入口 | 路径 | Lucide |
| --- | --- | --- |
| 首页 | `/` | `home` |
| 思考 | `/posts` | `pen-line` |
| 资源 | `/tools` | `wrench` |
| 点子 | `/ideas` | `lightbulb` |
| 项目 | `/projects` | `rocket` |
| 关于 | `/about` | `user` |

实现：
- `Navigation.astro`（首页为全宽顶部栏胶囊导航，内页为左侧边栏）

## 5. 页面规格

### 5.1 首页 `/`

定位：个人桌面。

组件架构：
- `HomeCanvas.astro`：主组件，接收所有数据作为 props
- `SparkBoxModal.astro`：火花弹窗
- `CustomPalette.astro`：调色板
- `CanvasZoomControls.astro`：缩放控件
- 客户端脚本：`home-canvas.ts`（拖拽、缩放、主题切换逻辑）

首页卡片（根级）：
- `GreetingCard`
- `BrandCard`
- `RecentTraces`
- `FeaturedTools`
- `CalendarWidget`
- `MusicPlayer`
- `PolaroidWidget`
- `WalkerProfile`

要求：
- Bento 卡片可拖拽
- 支持搜索和 `Cmd/Ctrl + K`
- hover 和拖拽不能造成布局跳动

### 5.2 文章列表 `/posts`

定位：统一内容入口。

要求：
- 使用 `SidebarLayout`
- 按年份和日期组织
- 展示标题、日期、分类、标签
- 支持标签排版增强

### 5.3 文章详情 `/posts/[slug]`

定位：长文阅读页。

要求：
- 使用 `ArticleLayout`
- 左侧导航、目录、正文三栏
- TOC 跟随滚动高亮
- AI 文章可展示视频、资源、Prompt、对话组件
- 生活文章可展示封面图

### 5.4 `/tools`

定位：资源列表，展示工具。

数据：
- `log` 集合，`type === 'tool'`

形式：
- 使用 `SidebarLayout`
- 卡片列表，展示标题、摘要、状态、评分、标签
- 外部链接支持新标签页打开

### 5.5 `/about`

定位：关于我。

实现：
- `about/index.astro`
- 使用 `FullscreenLayout`
- 视频 Hero
- 个人简介
- 技能兴趣
- 社交链接
- 页面点赞

### 5.5b `/about/site`

定位：关于网站。

实现：
- `about/site.astro`
- 使用 `FullscreenLayout`
- 读取 `src/data/site-stats.json` 展示站点统计

### 5.6 `/404`

要求：
- 使用 `Base.astro`
- 使用 Lucide 图标
- 提供返回首页入口

## 6. 数据模型

### 6.1 `log`

字段：
- `title`
- `date`
- `tags`
- `category`
- `type: 'knowledge' | 'tool' | 'idea' | 'project' | 'community'`
- `published`
- `summary`
- `description`
- `cover`（内容图片或远程 URL）
- `status: 'thinking' | 'practicing' | 'verified' | 'archived'`
- `rating`（1-5）
- `url`
- `qrCode`
- `communities`（对象数组，含 name、description、qrCode、badge、tag）
- `videos`
- `resources`

视频平台：
- `bilibili`
- `douyin`
- `xiaohongshu`
- `youtube`
- `github`
- `zhihu`

资源类型：
- `tool`
- `feishu`
- `github`
- `website`
- `download`

## 7. 技术规格

| 项 | 当前实现 |
| --- | --- |
| 框架 | Astro 6 |
| 部署 | Vercel adapter，`output: 'server'` |
| 样式 | Tailwind CSS v4 |
| 内容 | Astro Content Collections |
| 类型 | TypeScript，`astro/zod` |
| 搜索 | Pagefind |
| 图标 | `astro-icon` + `@iconify-json/lucide` |
| 图片 | Astro `<Image />` + Vercel Image Optimization |
| 点赞 | Supabase REST API + `fetch()` |

Astro 配置：
- `site: 'https://iwalk.pro'`
- `output: 'server'`
- `prefetch.defaultStrategy = 'hover'`
- 自托管字体：Inter、Sora、JetBrains Mono、Noto Sans SC
- redirects：`/ai -> /tools`、`/life -> /posts`
- integrations：MDX、Sitemap、astro-icon

## 8. Layout

| Layout | 用途 |
| --- | --- |
| `Base.astro` | 全站基础外壳 |
| `SidebarLayout.astro` | 列表型内页（/posts、/tools、/ideas、/projects） |
| `ArticleLayout.astro` | 文章详情 |
| `FullscreenLayout.astro` | 关于页（/about、/about/site） |

不拆：
- `HomeLayout`
- `ArticleSidebar`
- `SidebarToggle`

现状：
- 文章侧栏由 `ArticleNav.astro` 承担
- 侧栏折叠按钮在 `Navigation.astro`
- Head 由 `src/components/shared/HeadCommon.astro` 复用

## 9. 客户端脚本

| 脚本 | 用途 |
| --- | --- |
| `scroll-fade.ts` | 滚动淡入 |
| `sidebar-state.ts` | 侧栏状态 |
| `toc-highlight.ts` | 目录高亮 |
| `justify-tags.ts` | 标签排版 |
| `home-canvas.ts` | 首页 Bento 画布拖拽、缩放、主题切换 |
| `with-lifecycle.ts` | Astro View Transition 生命周期工具，导出 `registerLifecycle(init)` |
| `tilt-effect.ts` | 3D 卡片透视倾斜效果，导出 `setupTilt(selector, options)` |

注：旧的环境光晕和列宽脚本已移除。

## 10. 当前状态

已完成：
- 首页 Bento 桌面
- `/posts`、`/posts/[slug]`
- `/tools` 资源列表
- `/ideas` 点子库
- `/projects` 项目列表
- `/about` 关于我
- `/about/site` 关于网站
- `/ai`、`/life`、`/idea` 系列重定向
- 旧文章 URL 重定向
- Lucide 图标
- 图片优化
- Pagefind
- 内容重组：`dockItem` 集合已合并到 `log`（type: tool/idea）

待办：

| 优先级 | 项目 |
| --- | --- |
| P2 | 补真实 `type: idea` 内容 |
| P2 | 精修 About 页文案 |
| P3 | 评估卡片级点赞 |
| P3 | 必要时整理组件目录 |

## 11. 验收

改动页面、路由、Schema、构建配置后必须执行：

```bash
npx astro check
npm run build
```

标准：
- `astro check` 0 errors
- `npm run build` 成功
- 新路由同步更新 `src/lib/routes.ts`、导航和本 PRD
- 新图标使用 Lucide
- 新交互必须有状态反馈
