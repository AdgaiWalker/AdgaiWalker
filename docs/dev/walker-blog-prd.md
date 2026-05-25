# Walker 博客 PRD

版本：v3.1  
日期：2026-05-17  
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
| 目录滚动 | 当前标题高亮 | `toc-tracker.ts` |
| 侧栏折叠 | 宽度、图标、状态记忆 | `sidebar-state.ts` |
| 点赞 | 图标状态、计数变化 | `LikeCounter.astro` |
| 搜索 | 快捷键、弹层、输入状态 | `SearchModal.astro` |

## 3. 路由

```text
/                         首页
/posts                    文章列表
/posts/[slug]             文章详情

/ai                       重定向到 /posts
/ai/[slug]                重定向到 /posts/[slug]
/ai/learn                 AI 学习
/ai/sources               信息源
/ai/toolkit               工具箱
/ai/ideas                 Idea

/life                     重定向到 /posts
/life/[slug]              重定向到 /posts/[slug]

/explore                  资源列表
/explore/[slug]           资源详情

/about                    关于
/404                      404

/rss.xml
/ai/rss.xml
/life/rss.xml
```

不做：
- `/about-me`
- `/dock`
- `/ai` 独立文章总览
- `/life` 独立文章总览

## 4. 导航

| 入口 | 路径 | Lucide |
| --- | --- | --- |
| 文章 | `/posts` | `pen-line` |
| AI 探索 | `/explore` | `package` |
| 学习 | `/ai/learn` | `book-open` |
| Idea | `/ai/ideas` | `lightbulb` |

实现：
- `Navigation.astro`
- `WalkerProfile.astro`

## 5. 页面规格

### 5.1 首页 `/`

定位：个人桌面。

内容：
- `WalkerProfile`
- `DockShowcase`
- `GreetingCard`
- `RecentTraces`
- `RandomRecommend`
- `NavigationConsole`
- `CalendarWidget`
- `MusicPlayer`
- `LikeCounter`

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

### 5.4 `/ai/learn`

定位：AI 学习文章入口。

数据：
- `log`
- `category === 'ai'`

形式：
- `ArticleCard`
- 阅读路径优先，不做重装饰

### 5.5 `/ai/sources`

定位：信息网站、社群、内容源。

数据：
- `dockItem`
- `category === 'info-source' || category === 'community'`

形式：
- `DockItemCard`
- 搜索
- 标签筛选

### 5.6 `/ai/toolkit`

定位：工具、Skill、方法入口。

数据：
- `dockItem`
- `toolkit-notes.ts`

形式：
- 文档式清单
- 左侧文章导航
- 工具、Skill、模型分工和工作流分区
- 可调列宽

### 5.7 `/ai/ideas`

定位：AI 想法和项目认领。

数据：
- `log`
- `category === 'ai'`
- `type === 'idea'`

状态：
- `open`
- `completed`

当前差距：
- Schema 已支持
- 真实 `type: idea` 内容不足

### 5.8 `/explore`

定位：AI 探索资源库。

要求：
- 使用 `DockLayout`
- 数据来自 `dockItem`
- 列表页展示资源
- 详情页展示单个资源

### 5.9 `/about`

定位：个人介绍与关于本站。

要求：
- 使用 `FullscreenLayout`
- 视频 Hero
- 个人简介
- 技能兴趣
- 社交链接
- 页面点赞

### 5.10 `/404`

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
- `category: 'ai' | 'life'`
- `type: 'article' | 'thought' | 'photo' | 'project' | 'idea'`
- `published`
- `summary`
- `description`
- `cover`
- `status: 'open' | 'completed'`
- `claimInfo`
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

### 6.2 `dockItem`

字段：
- `name`
- `description`
- `category: 'tool' | 'skill' | 'info-source' | 'community'`
- `tags`
- `rating`
- `url`
- `published`

当前内容差距：
- `design-review-skill.md` 仍是 `info-source`，应评估迁移为 `skill`
- `aigc-wechat.md` 仍是 `info-source`，应评估迁移为 `community`

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
- redirects：`/ai -> /posts`、`/life -> /posts`
- integrations：MDX、Sitemap、astro-icon

## 8. Layout

| Layout | 用途 |
| --- | --- |
| `Base.astro` | 全站基础外壳 |
| `SidebarLayout.astro` | 列表型内页 |
| `ArticleLayout.astro` | 文章详情 |
| `DockLayout.astro` | 资源主从布局 |
| `FullscreenLayout.astro` | 关于页 |

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
| `ambient.ts` | 首页背景动效 |
| `scroll-fade.ts` | 滚动淡入 |
| `sidebar-state.ts` | 侧栏状态 |
| `toc-tracker.ts` | 目录高亮 |
| `column-resize.ts` | 列宽调整 |
| `justify-tags.ts` | 标签排版 |

## 10. 当前状态

已完成：
- 首页 Bento 桌面
- `/posts`
- `/posts/[slug]`
- `/ai/learn`
- `/ai/sources`
- `/ai/toolkit`
- `/ai/ideas`
- `/explore`
- `/explore/[slug]`
- `/about`
- `/ai`、`/life` 重定向
- 旧文章 URL 重定向
- Lucide 图标
- 图片优化
- Pagefind

待办：

| 优先级 | 项目 |
| --- | --- |
| P1 | 评估并迁移 `dockItem` category |
| P2 | 补真实 `type: idea` 内容 |
| P2 | 增强 `WalkerProfile` 深层入口 |
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
