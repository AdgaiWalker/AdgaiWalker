# Walker 博客 V3 — 产品需求文档 (PRD)

> **版本**: v3.0
> **日期**: 2026-05-12
> **作者**: 秋知 (Walker)
> **状态**: 待确认
> **v3.0 变更**: 全面重构信息架构，新增学习/Idea板块，详情页改为三栏布局，新增关于我页面，JS全量转TS，点赞系统优化

---

## 一、产品定位

### 1.1 一句话描述

> 秋知的个人数字根据地 — 以 AI 探索为核心、哲学思考为底色的自媒体资源站与个人品牌空间。

### 1.2 品牌人格

| 维度 | 定义 |
|------|------|
| **身份** | 哲学专业大学生，AI 自学者 |
| **差异化标签** | 哲学思维 × AI 实践（别人无法复制的交叉点） |
| **签名** | 「行过万里水路，记录每一次停靠」 |
| **调性** | 克制、有深度、有温度、不浮躁 |

### 1.3 目标用户

| 用户类型 | 来源 | 核心需求 | 转化目标 |
|----------|------|----------|----------|
| **社媒粉丝** | B站/小红书视频引流 | 「视频里的工具链接在哪？」 | 收藏博客，长期回访 |
| **AI 学习者** | 搜索引擎/社区推荐 | 「有没有系统的学习资源？」 | 关注社媒账号 |
| **同好/创作者** | 博客圈互访 | 「这个人在做什么？有什么独特观点？」 | 建立连接 |

---

## 二、信息架构

### 2.1 导航结构

```
首页 /                        → Bento 桌面（保持现有设计）

AI 探索
├── /ai                       → AI 文章总览（所有 AI 文章，按年时间线）
├── /ai/learn                 → 学习（AI 入门文章 + 飞书文档链接，/ai 的子集）
├── /ai/sources               → 信息源（社群二维码 + 网站，卡片 + 标签筛选）
├── /ai/toolkit               → 工具箱（AI 工具 + Skill，卡片 + 标签筛选）
├── /ai/ideas                 → Idea（AI 工程研究 + 方法论 + 项目 + 省钱攻略）
└── /ai/[slug]                → 文章详情页

生活
└── /life                     → 生活日志（多媒体：文章/图片/视频）
    └── /life/[slug]          → 日志详情页

/about                        → 关于网站
/about-me                     → 关于我（第一版 Hero 风格）
```

> `/ai` 包含所有 AI 文章，`/ai/learn` 是其中入门教程的子集（通过标签或 type 筛选）。

### 2.2 AI 探索板块详解

AI 探索是站点的核心板块，按照用户的探索路径自然排列：

```
AI 探索的目的：学习、省钱、安全、质量、效率

┌──────────────────────────────────────────────────────┐
│  📚 学习                                              │
│  AI 入门文章 + 飞书文档链接                              │
│  形式：文章列表                                         │
│  参考：hylarucoder.io/posts                            │
├──────────────────────────────────────────────────────┤
│  📡 信息源                                             │
│  我常用的社群（微信群/QQ群二维码）+ 信息网站              │
│  形式：卡片 + 标签筛选                                   │
│  参考：hylarucoder.io/gear                             │
├──────────────────────────────────────────────────────┤
│  🔧 工具箱                                             │
│  我日常使用的 AI 工具（开发/设计等）+ 自定义 Skill        │
│  包括：各种 AI 的特性对比（Gemini 搞设计、GPT 写代码、    │
│        Claude 整架构+demo）、省钱方法                    │
│  形式：卡片 + 标签筛选                                   │
│  参考：hylarucoder.io/gear                             │
├──────────────────────────────────────────────────────┤
│  💡 Idea                                              │
│  AI 工程研究中的 idea、方法论和项目                       │
│  · 省钱攻略（使用中省 token 的技巧 + 买 token 的渠道）    │
│  · 方法论 idea（Prompt 优化、工作流设计等）               │
│  · 项目 idea（没时间做的 idea，可供认领）                 │
│  · 已完成的项目                                         │
│  形式：卡片（标签区分类型，status 区分状态）               │
└──────────────────────────────────────────────────────┘
```

### 2.3 生活板块

```
┌──────────────────────────────────────────────────────┐
│  🌿 生活                                              │
│  平时的思考与记录                                       │
│  形式：多媒体文章（图片/视频/文字）                       │
│  参考：lvyovo-wiki.tech/pictures                      │
└──────────────────────────────────────────────────────┘
```

---

## 三、页面需求

### 3.1 首页 `/`

**保持现有 Bento 桌面设计**，以下调整：

- [x] 去掉右栏顶部的「写文章」按钮和网格按钮
- [ ] GreetingCard（问候卡/头像区域）整体可点击，跳转到 `/about-me`
- [ ] WalkerProfile 导航链接更新为新路径

### 3.2 AI 探索 · 文章总览 `/ai`

**定位**: 所有 AI 文章的汇总页

**内容**: 全部 AI 分类文章，按年分组的时间线

**布局**: SidebarLayout（侧边栏 + 内容区）

```
┌─────────────────────────────────────┐
│  ● AI 探索                           │
│  AI Exploration                     │
│  XX 篇文章                          │
│                                     │
│  标签: [全部] [入门] [工具] [...]    │
├─────────────────────────────────────┤
│  2026年 · 7 篇                      │
│  05/10 · 标题                        │
│  05/03 · 标题                        │
│  ...                                │
└─────────────────────────────────────┘
```

### 3.3 AI 探索 · 学习 `/ai/learn`

**定位**: AI 入门知识库（`/ai` 的子集，通过标签或 type 筛选入门教程类文章）

**内容**: AI 入门教程文章，每篇可关联飞书文档链接

**布局**: SidebarLayout，文章列表（参考 hylarucoder.io/posts）

```
┌─────────────────────────────────────┐
│  ● 学习                              │
│  Learning                           │
│  XX 篇文章                          │
│                                     │
│  标签: [全部] [入门] [省钱] [...]    │
├─────────────────────────────────────┤
│  文章卡片列表（封面图 + 标题 + 摘要）│
└─────────────────────────────────────┘
```

### 3.4 AI 探索 · 信息源 `/ai/sources`

**定位**: 我从哪里获取信息 + 常用社群

**内容**:
- 社群推荐（微信群二维码、QQ群号）
- 信息网站（博客、Newsletter、播客等）

**布局**: SidebarLayout，卡片网格（3列）+ 搜索 + 标签筛选

**卡片信息**: 名称 / 简介 / 标签 / 类型标识（社群/网站）

**数据源**: `dockItem` 集合，`category: 'info-source' | 'community'`

### 3.5 AI 探索 · 工具箱 `/ai/toolkit`

**定位**: 我日常使用的工具和 Skill

**内容**:
- AI 工具推荐（开发/设计/效率等）
- 自定义 Skill（如 design-review skill）
- 各种 AI 特性对比（Gemini 搞设计、GPT 写代码、Claude 整架构+demo）

**布局**: SidebarLayout，卡片网格（3列）+ 搜索 + 标签筛选

**卡片信息**: 名称 / 简介 / 标签 / 评分(1-5星) / 类型标识（工具/Skill）

**数据源**: `dockItem` 集合，`category: 'tool' | 'skill'`

### 3.6 AI 探索 · Idea `/ai/ideas`

**定位**: AI 工程研究的探索板 — 方法论、省钱攻略、项目 idea

**内容**:
- **省钱攻略**: 使用中省 token 的技巧 + 买 token 的优惠渠道
- **方法论 idea**: Prompt 优化、工作流设计、AI 工程最佳实践
- **项目 idea**: 没时间做的 idea（可供认领）
- **已完成的项目**: 已经做出来的东西

**布局**: SidebarLayout，卡片网格，用标签区分类型，用 status 区分状态

```
┌─────────────────────────────────────┐
│  ● Idea                              │
│  Ideas & Projects                   │
│                                     │
│  [全部] [💡 开放认领] [✅ 已完成]    │
├─────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐        │
│  │ 💡 开放   │  │ ✅ 已完成  │        │
│  │ 标题      │  │ 标题      │        │
│  │ 简介      │  │ 简介      │        │
│  │ [认领]    │  │ [查看]    │        │
│  └──────────┘  └──────────┘        │
└─────────────────────────────────────┘
```

### 3.6 文章详情页 `/ai/[slug]` 和 `/life/[slug]`

**核心变更**: 从单栏改为三栏布局（参考飞书文档 + hylarucoder.io）

**三栏布局**:

```
┌──────────┬──────────┬──────────────────────┐
│ 左栏      │ 中栏      │ 右栏                  │
│ 导航栏    │ TOC 目录  │ 文章正文              │
│ (可折叠)  │          │                      │
│          │          │                      │
│ Walker   │ ON THIS  │ 标题                  │
│          │ PAGE     │ 日期 · 标签            │
│ ── AI ── │          │                      │
│  📚 学习  │ · 前言   │ [正文内容]            │
│  📡 信息源│ · 安装   │                      │
│  🔧 工具箱│ · 配置   │                      │
│  💡 Idea │ · 总结   │                      │
│  📝 文章  │          │                      │
│   ├ 文章1│          │ 📹 配套视频（如有）     │
│   ├ 文章2│          │ 🔗 相关资源（如有）     │
│   └ ...  │          │ ❤️ 点赞               │
│          │          │                      │
│ ── 生活 ──│          │                      │
│  🌿 日志  │          │                      │
│          │          │                      │
│ ──────   │          │                      │
│ 👤 关于   │          │                      │
└──────────┴──────────┴──────────────────────┘
```

**左栏 — 导航栏（可折叠）**:
- 256px 宽，固定定位
- 点击折叠按钮可收起为图标模式（64px）
- 文章导航区：展开当前分类下的文章列表，当前文章高亮
- 文章列表支持卡片视图和文字列表视图切换

**中栏 — TOC 目录**:
- 自动从文章 headings 生成
- 跟随滚动高亮当前章节
- 点击跳转到对应章节

**右栏 — 文章正文**:
- 保持现有阅读模式（parchment 背景）
- 支持 MDX 富媒体组件
- 视频/资源/点赞等模块保持不变

### 3.8 生活 · 日志列表 `/life`

**定位**: 生活思考与记录的多媒体时间线

**内容**: 随想、照片、旅行、做饭、哲学思考等多媒体文章

**布局**: SidebarLayout，多媒体时间线（参考 lvyovo-wiki.tech/pictures）

### 3.9 关于网站 `/about`

**保留现有设计**，内容更新待后续讨论。

### 3.10 关于我 `/about-me`（新增）

**定位**: 个人介绍页，第一版 demo 风格

**设计**: 参考 git 第一个版本的设计
- 全屏 HeroVideo（航海视频背景）+ "Walker" 大字 + tagline
- 下方 HarborAbout 风格的居中简介

**触发**: 首页 GreetingCard（头像/问候区域）点击跳转

---

## 四、侧边栏导航详细设计

### 4.1 详情页侧边栏结构

```
Walker

── AI 探索 ──
  📚 学习       → /ai/learn
  📡 信息源     → /ai/sources
  🔧 工具箱     → /ai/toolkit
  💡 Idea       → /ai/ideas
  📝 文章       → /ai
     └ 展开当前分类文章列表
        ├ 文章标题1 (当前高亮)
        ├ 文章标题2
        └ ...

── 生活 ──
  🌿 日志       → /life

──────
👤 关于我       → /about-me
👤 关于网站     → /about
```

### 4.2 文章列表功能

在详情页中，侧边栏的「文章」节点可展开，显示同类文章列表：

- **文字列表模式**: 紧凑，显示标题+日期
- **卡片模式**: 显示标题+摘要+标签
- 可切换两种视图
- 当前文章高亮
- 点击即跳转

---

## 五、数据模型

### 5.1 `log` — 文章/日志集合

```typescript
const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()),

    // 大分类
    category: z.enum(['ai', 'life']),

    // 内容格式
    type: z.enum([
      'article',     // 长文/教程/资源帖
      'thought',     // 随想
      'photo',       // 照片
      'project',     // 项目展示（已完成）
      'idea',        // 开放认领的 idea（新增）
    ]),

    published: z.boolean().default(true),
    summary: z.string().optional(),
    description: z.string().optional(),
    cover: z.string().optional(),

    // Idea 专属字段
    status: z.enum(['open', 'completed']).optional(), // idea 认领状态
    claimInfo: z.string().optional(),                   // 认领说明

    // 关联视频（0个或多个）
    videos: z.array(z.object({
      platform: z.enum(['bilibili', 'douyin', 'xiaohongshu', 'youtube']),
      url: z.string().url(),
      title: z.string().optional(),
    })).default([]),

    // 关联资源（0个或多个）
    resources: z.array(z.object({
      name: z.string(),
      url: z.string().url(),
      type: z.enum(['tool', 'feishu', 'github', 'website', 'download']),
      description: z.string().optional(),
    })).default([]),
  }),
});
```

### 5.2 `dockItem` — 工具箱 + 信息源

```typescript
const dockItem = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/dock' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    category: z.enum(['tool', 'skill', 'info-source', 'community']),
    tags: z.array(z.string()),
    rating: z.number().min(1).max(5).optional(),
    url: z.string().url().optional(),
    published: z.boolean().default(true),
  }),
});
```

**category 变更**:
- `tool` — AI 工具（Claude Code 等）
- `skill` — 自定义 Skill（design-review 等）← 从 info-source 拆出
- `info-source` — 信息网站（博客/Newsletter）
- `community` — 社群（微信群/QQ群）← 从 info-source 拆出

### 5.3 Idea 数据查询

`/ai/ideas` 页面查询条件：`log` 集合中 `category === 'ai' && type === 'idea'`。

省钱攻略、方法论、项目 idea 统一存入 `log` 集合，通过标签区分类型，通过 `status` 区分状态。

### 5.4 现有数据迁移

| 文件 | 原 category | 新 category | 操作 |
|------|-------------|-------------|------|
| `claude-code.md` | tool | tool | 不变 |
| `design-review-skill.md` | info-source | **skill** | 改 category |
| `aigc-wechat.md` | info-source | **community** | 改 category |

---

## 六、页面与展示形式对照

| 页面 | 路径 | 展示形式 | Layout | 参考 |
|------|------|----------|--------|------|
| 首页 | `/` | Bento 桌面（保持） | HomeLayout | lvyovo-wiki.tech |
| AI 文章总览 | `/ai` | 按年时间线 | SidebarLayout | lvyovo-wiki.tech |
| 学习 | `/ai/learn` | 文章列表 | SidebarLayout | hylarucoder.io/posts |
| 信息源 | `/ai/sources` | 卡片网格 + 标签筛选 | SidebarLayout | hylarucoder.io/gear |
| 工具箱 | `/ai/toolkit` | 卡片网格 + 标签筛选 | SidebarLayout | hylarucoder.io/gear |
| Idea | `/ai/ideas` | 卡片（标签区分类型，status 区分状态） | SidebarLayout | 独特设计 |
| 文章详情 | `/ai/[slug]` | 三栏（导航 + TOC + 正文） | ArticleLayout | 飞书文档 |
| 生活日志列表 | `/life` | 多媒体时间线 | SidebarLayout | lvyovo-wiki.tech/pictures |
| 生活日志详情 | `/life/[slug]` | 三栏（导航 + TOC + 正文） | ArticleLayout | 飞书文档 |
| 关于我 | `/about-me` | 全屏 Hero + 简介 | FullscreenLayout | 第一版 demo |
| 关于网站 | `/about` | 保留现有（内容待讨论） | SidebarLayout | — |

---

## 七、首页改动清单

| 改动 | 详情 |
|------|------|
| 去掉「写文章」按钮 | 移除右栏顶部的写文章链接 + 网格按钮 |
| GreetingCard 可点击 | 整个问候卡/头像区域包裹为 `<a href="/about-me">` |
| WalkerProfile 导航更新 | 链接改为新路径（学习/信息源/工具箱/Idea/关于网站） |

---

## 八、技术规范

### 8.1 JS → TypeScript 全量迁移

所有 `.js` 文件改为 `.ts`，添加类型注解：

| 文件 | 操作 |
|------|------|
| `src/pages/rss.xml.js` | → `.ts`，加类型 |
| `src/pages/ai/rss.xml.js` | → `.ts`，加类型 |
| `src/pages/life/rss.xml.js` | → `.ts`，加类型 |

Astro 组件内 `<script>` 标签已由 Astro 按 TypeScript 处理，无需额外改动。

### 8.2 点赞系统优化

**页面级点赞（已有，优化视觉）**:
- 文章详情页必须有，保持现有 Supabase 方案
- 视觉改进：从未点击到已点击需要有明确的视觉状态变化
  - 未点击：描边心心，中性色
  - 已点击：实心心心，红/粉色，弹跳动画，按钮背景微妙变化
  - 过渡要流畅，让用户明确感知「我点赞了」

**卡片级点赞（待确认）**:
- 列表页/卡片页上每张卡片独立的赞（工具箱、信息源、Idea、学习等）
- 数据模型：用内容唯一 ID 做 key（如 `/ai/toolkit/claude-code`），Supabase 表结构不变
- ⚠️ **具体哪些页面需要卡片级赞，待所有功能完成后统一确认**
- 实施时提醒用户逐页决定

### 8.3 技术栈（无变化）

现有技术栈完全满足 PRD v3 所有需求，零新依赖：

| 层 | 技术 | 版本 |
|----|------|------|
| 框架 | Astro | 6.1+ |
| 样式 | Tailwind CSS | 4.2+ |
| 语言 | TypeScript | 5.9+ |
| 内容 | MDX | 5.0+ |
| 搜索 | Pagefind | 1.5+ |
| 部署 | Vercel | — |
| 动态数据 | Supabase | — |
| 文本测量 | Pretext.js | latest |

---

## 九、架构设计

### 9.1 Layout 分层

四种页面形态对应四层 Layout：

```
Base.astro                    ← 最底层：head、字体、全局样式、ambient 背景
├── HomeLayout                ← 首页专用（Bento 画板）
├── SidebarLayout             ← 内页通用（侧边栏 + 内容区）
│   └── ArticleLayout         ← 详情页专用（侧边栏 + TOC + 正文）
└── FullscreenLayout          ← 关于我（全屏 Hero）
```

每个页面只需选择一个 Layout，不重复写侧边栏和 TOC 逻辑。

### 9.2 组件目录结构

```
components/
├── shared/              ← 所有页面通用
│   ├── Navigation.astro
│   ├── SearchModal.astro
│   ├── Footer.astro
│   └── LikeCounter.astro
│
├── home/                ← 首页专用
│   ├── WalkerProfile.astro
│   ├── GreetingCard.astro
│   ├── NavigationConsole.astro
│   ├── CalendarWidget.astro
│   ├── MusicPlayer.astro
│   └── ...
│
├── cards/               ← 列表页的卡片组件
│   ├── DockItemCard.astro     ← 工具/信息源/社群卡片
│   ├── ArticleCard.astro      ← 文章卡片（列表视图）
│   └── IdeaCard.astro         ← Idea 卡片（认领/已完成）
│
├── article/             ← 详情页专用
│   ├── TableOfContents.astro  ← TOC 目录
│   ├── ArticleSidebar.astro   ← 侧边栏文章列表
│   └── SidebarToggle.astro    ← 折叠按钮
│
└── content/             ← MDX 富媒体组件
    ├── BilibiliVideo.astro
    ├── DialogueBubble.astro
    ├── PromptBlock.astro
    └── ResourceCard.astro
```

### 9.3 客户端脚本

```
scripts/
├── ambient.ts           ← 背景动效（已有）
├── scroll-fade.ts       ← 滚动淡入（已有）
├── toc-tracker.ts       ← TOC 滚动高亮（新增）
├── sidebar-state.ts     ← 侧边栏折叠 + localStorage（新增）
└── like-counter.ts      ← 点赞逻辑（已有，优化视觉）
```

每个脚本独立，通过 `astro:page-load` 和 `astro:after-swap` 初始化。原生 DOM 操作，不引入框架。

> **注意**: `like-counter` 的逻辑目前内嵌在 `LikeCounter.astro` 的 `<script>` 标签中，不需要拆成独立文件。如需复用再考虑抽取。

```
Astro Content Collections
├── log (文章/日志) ──→ getStaticPaths() ──→ 静态页面
└── dockItem (工具/信息源) ──→ 页面组件直接查询

Supabase (点赞)
└── 客户端直连，无 API 中间层

Pagefind (搜索)
└── 构建时索引，客户端查询
```

### 9.5 导航状态传递

详情页通过组件 props 向下传递当前文章信息：

```
ArticleLayout.astro
  ├── props: { currentSlug, category, headings }
  ├── Navigation (currentSlug → 高亮当前导航项)
  ├── ArticleSidebar (currentSlug + 文章列表 → 高亮当前文章)
  └── TableOfContents (headings → 渲染目录)
```

无需全局状态管理，Astro props 单向数据流即可。

### 9.6 核心原则

- **布局分层，不重复** — 四种 Layout 覆盖所有页面形态
- **组件按用途分文件夹** — shared / home / cards / article / content
- **客户端脚本独立** — 原生 JS，每个功能一个文件
- **数据通过 props 向下流** — 不需要状态管理
- **零新依赖** — 现有技术栈完全够用

---

## 十、实施阶段

### Phase 1: 基础改动 + 布局搭建
- [ ] 去掉首页「写文章」按钮和网格按钮
- [ ] GreetingCard 添加点击跳转到 `/about-me`
- [ ] 更新 WalkerProfile 导航链接
- [ ] 更新 `content.config.ts`（dockItem 新增 skill/community category）
- [ ] JS → TS 全量迁移（3 个 RSS 文件）
- [ ] 点赞按钮视觉优化（未点击 → 已点击状态）
- [ ] **搭建 Layout 分层**（SidebarLayout、ArticleLayout、FullscreenLayout）
- [ ] **组件目录重组**（shared / home / cards / article / content）
- [ ] **Navigation 组件重构**（支持侧边栏模式，含"关于我"链接）
- [ ] **TOC 组件**（toc-tracker.ts）
- [ ] **侧边栏折叠**（sidebar-state.ts）

### Phase 2: 新页面 + 详情页重构
- [ ] `/about-me` — 关于我页面（FullscreenLayout，HeroVideo + HarborAbout 风格）
- [ ] `/ai` — AI 文章总览页（SidebarLayout，按年时间线）
- [ ] `/ai/learn` — 学习页面（SidebarLayout，文章列表）
- [ ] `/ai/sources` — 信息源页面（SidebarLayout，更新加入社群类型）
- [ ] `/ai/toolkit` — 工具箱页面（SidebarLayout，更新加入 Skill 类型）
- [ ] `/ai/ideas` — Idea 页面（SidebarLayout，省钱攻略 + 方法论 + 项目）
- [ ] `/ai/[slug]` — 文章详情页重构（ArticleLayout，三栏布局）
- [ ] `/life` — 生活日志列表页（SidebarLayout）
- [ ] `/life/[slug]` — 生活日志详情页重构（ArticleLayout，三栏布局）
- [ ] 侧边栏文章列表（卡片/文字两种视图）

### Phase 3: 打磨
- [ ] 视图过渡动画
- [ ] 移动端适配
- [ ] SEO 优化
- [ ] RSS 更新
- [ ] 性能审计
- [ ] ⚠️ 提醒用户确认卡片级点赞需求（逐页决定）

---

## 十一、设计参考

| 参考站 | 借鉴点 |
|--------|--------|
| **hylarucoder.io** | 侧边栏导航、文章列表页、工具卡片页、详情页三栏布局 |
| **lvyovo-wiki.tech** | Bento 桌面、毛玻璃风格、按年时间线、照片墙 |
| **飞书文档** | 三栏布局（导航 + TOC + 内容）、TOC 中栏 + 内容右栏 |
| **第一版 demo** (git `46ad406`) | 关于我页面（HeroVideo + HarborAbout） |
