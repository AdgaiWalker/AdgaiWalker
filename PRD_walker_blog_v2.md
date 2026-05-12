# Walker 博客 V2 — 产品需求文档 (PRD)

> **版本**: v2.1  
> **日期**: 2026-05-10  
> **作者**: 秋知 (Walker)  
> **状态**: 待确认  
> **v2.1 变更**: 整合 CODE 方法论，调整导航顺序为 C→O→D+E 知识流

---

## 一、产品定位

### 1.1 一句话描述

> 秋知的个人数字根据地 —— 一个以 AI 探索为核心、哲学思考为底色的自媒体资源站与个人品牌空间。

### 1.2 品牌人格

| 维度 | 定义 |
|------|------|
| **身份** | 哲学专业大学生，AI 自学者 |
| **差异化标签** | 哲学思维 × AI 实践（别人无法复制的交叉点） |
| **签名** | 「行过万里水路，记录每一次停靠」 |
| **调性** | 克制、有深度、有温度、不浮躁 |

### 1.3 在个人品牌中的角色

```
B站 / 小红书 / 抖音（前线引流）
        │
        ▼
   ┌──────────────┐
   │  Walker 博客   │  ← 数字根据地
   │  (本产品)      │
   ├──────────────┤
   │ • AI 教程资源   │  ← 视频的配套资源站
   │ • 工具推荐      │  ← 「他用了什么工具？」
   │ • 学习思考      │  ← 证明深度和体系感
   │ • 生活记录      │  ← 展示真实的人
   └──────────────┘
        │
        ▼
   飞书（重资源承载）
   • 安装包下载
   • 完整实战教程文档
```

### 1.4 目标用户

| 用户类型 | 来源 | 核心需求 | 转化目标 |
|----------|------|----------|----------|
| **社媒粉丝** | B站/小红书视频引流 | 「视频里的工具链接在哪？」 | 收藏博客，长期回访 |
| **AI 学习者** | 搜索引擎/社区推荐 | 「有没有系统的学习资源？」 | 关注社媒账号 |
| **同好/创作者** | 博客圈互访 | 「这个人在做什么？有什么独特观点？」 | 建立连接 |

---

## 二、信息架构

### 2.1 内容组织哲学：CODE 方法论

博客的内容按照 Tiago Forte「第二大脑」的 **CODE** 方法论组织，
展示知识从输入到输出的完整链路：

```
┌──────────────────────────────────────────────┐
│          CODE — 知识流动的四个阶段             │
├──────┬───────────┬───────────────────────────┤
│ 阶段  │ 含义       │ 对应博客板块               │
├──────┼───────────┼───────────────────────────┤
│  C   │ Capture   │ 📡 信息源 — 我从哪里获取信息 │
│  O   │ Organize  │ 🔧 工具箱 — 我用什么工具整理 │
│ D+E  │ Distill   │ 📝 文章  — 我提炼并表达了什么│
│      │ +Express  │    （学习笔记/教程/资源帖）  │
├──────┴───────────┴───────────────────────────┤
│ 粉丝视角：                                    │
│ 「他关注这些信息源 → 用这些工具 →              │
│   写出这些思考 → 做成这些教程」                │
│                                              │
│ 博客本身就是第二大脑的公开展示窗口。            │
└──────────────────────────────────────────────┘
```

> **设计原则**: 导航顺序严格按 C → O → D+E 排列，
> 让访客自然感受到知识的流动方向。

### 2.2 内容分类

两大板块，所有内容归入其中之一：

```
┌─────────────────────────────────────┐
│            Walker 博客               │
├──────────────┬──────────────────────┤
│  AI 探索      │  生活                │
│              │                      │
│  C · 信息源   │  • 随想              │
│  O · 工具箱   │  • 照片              │
│  D+E · 文章   │  • 旅行              │
│   (教程/笔记/ │  • 做饭              │
│    资源帖)    │  • 哲学思考          │
│              │                      │
│  (每篇可关联  │  (轻量记录，         │
│   视频+资源)  │   有温度)            │
├──────────────┴──────────────────────┤
│  关于（独立页面）                     │
└─────────────────────────────────────┘
```

### 2.3 站点地图

```
首页 /                        → Bento 桌面（已有，保持现状）
│
├── /ai/sources               → C · 信息源
├── /ai/toolkit               → O · 工具箱
├── /ai                       → D+E · 文章列表
│   └── /ai/[slug]            → 文章详情（富媒体 + 视频嵌入 + 资源链接）
│
├── /life                     → 生活 · 日志列表
│   └── /life/[slug]          → 日志详情
│
└── /about                    → 关于（独立页面）
```

### 2.4 导航结构

左侧固定侧边栏（桌面端），参考 hylarucoder.io 的分组方式。
**顺序严格遵循 CODE 流：C → O → D+E**

```
• Walker                      ← 品牌名 + 状态点

  🔍 搜索  ⌘K

  ── AI 探索 ──
  📡 信息源                    → /ai/sources    ← C · Capture
  🔧 工具箱                    → /ai/toolkit    ← O · Organize
  📝 文章                      → /ai            ← D+E · Distill + Express

  ── 生活 ──
  🌿 日志                      → /life

  ──────
  👤 关于                      → /about

  ──────
  底部：社交链接 + 签名
  「行过万里水路」
```

---

## 三、页面需求

### 3.1 首页 `/`

**保持现有 Bento 桌面设计**，不做大改动。

需要更新的部分：
- [ ] WalkerProfile 组件的导航链接改为新路径
- [ ] 左栏的 RecentTraces 改为显示「AI 探索」最新文章

### 3.2 AI 探索 · 信息源 `/ai/sources`（C · Capture）

**定位**: 「我从哪里获取信息」— CODE 第一步

**内容**: 你关注的优质信息渠道（公众号、博客、newsletter、社区等）
**布局**: 卡片网格（3列） + 搜索 + 标签筛选
**卡片信息**: 名称 / 简介 / 标签 / 链接
**数据源**: `dockItem` 集合，`category: 'info-source'`

### 3.3 AI 探索 · 工具箱 `/ai/toolkit`（O · Organize）

**定位**: 「我用什么工具」— CODE 第二步

**参考**: 现有 Dock 页面，精简为只展示工具

**内容**: 你推荐的 AI 工具合集
**布局**: 卡片网格（3列） + 搜索 + 标签筛选
**卡片信息**: 名称 / 简介 / 标签 / 评分(1-5星) / 链接
**数据源**: `dockItem` 集合，`category: 'tool'`

### 3.4 AI 探索 · 文章列表 `/ai`（D+E · Distill + Express）

**定位**: 「我提炼并表达了什么」— CODE 第三/四步

**参考**: lvyovo-wiki.tech 的文章列表页

**布局**: 
- 按年分组的时间线列表
- 每行：日期 · 标题 · 标签
- 顶部：筛选器（全部 / 标签筛选）

**筛选维度**:
- 标签筛选（多选）

**排序**: 最新在前

**样式参考**:
```
┌─────────────────────────────────────┐
│  ● AI 探索                          │
│  AI Exploration                     │
│  XX 篇文章                          │
│                                     │
│  标签: [全部] [Prompt] [Agent] ...  │
├─────────────────────────────────────┤
│                                     │
│  2026年  · 7 篇                     │
│  ┌─────────────────────────────┐    │
│  │ 05/10 · 5个改变工作流的工具   #工具│
│  │ 05/03 · Claude Code 深度体验  #AI │
│  │ 04/27 · 代码与哲学            #哲学│
│  │ ...                              │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### 3.5 文章详情 `/ai/[slug]`

**核心需求**: 一个页面承载富媒体内容 —— 正文、视频、资源链接、飞书跳转。

**页面结构**:

```
┌─────────────────────────────────────┐
│ 标题                                │
│ 日期 · 标签 · 阅读时间               │
├─────────────────────────────────────┤
│                                     │
│ [正文区域 — MDX 富媒体]              │
│                                     │
│  支持嵌入:                           │
│  • 图片（本地/外部）                  │
│  • 代码块（语法高亮）                 │
│  • B站视频播放器（iframe）            │
│  • 引用块                            │
│  • 自定义 MDX 组件                   │
│                                     │
├─────────────────────────────────────┤
│ 📹 配套视频（如有）                   │
│ ┌──────────┐ ┌──────────┐          │
│ │ B站       │ │ 小红书    │          │
│ │ [缩略图]   │ │ [缩略图]  │          │
│ │ 标题       │ │ 标题      │          │
│ └──────────┘ └──────────┘          │
├─────────────────────────────────────┤
│ 🔗 相关资源（如有）                   │
│                                     │
│ ┌───┬──────────────────┬────────┐  │
│ │ 🔧│ ChatGPT           │ 打开 → │  │
│ │ 🔧│ Claude Code       │ 打开 → │  │
│ │ 📦│ 安装包下载（飞书）   │ 下载 → │  │
│ │ 📝│ 完整教程（飞书）    │ 查看 → │  │
│ │ 🌐│ 参考网站           │ 打开 → │  │
│ └───┴──────────────────┴────────┘  │
├─────────────────────────────────────┤
│ ❤️ 点赞 · 分享                      │
└─────────────────────────────────────┘
```

**资源卡片类型**:

| type | 图标 | 行为 | 样式 |
|------|------|------|------|
| `tool` | 🔧 | 新窗口打开 | 默认样式 |
| `website` | 🌐 | 新窗口打开 | 默认样式 |
| `github` | GitHub 图标 | 新窗口打开 | 深色样式 |
| `feishu` | 飞书图标 | 新窗口打开飞书 | **醒目强调样式**（品牌色边框） |
| `download` | 📦 | 新窗口打开飞书下载 | **醒目强调样式** |

**飞书跳转卡片** 需要视觉上区别于普通链接，暗示「这是重资源，点击跳转到飞书获取」。

### 3.6 生活 · 日志列表 `/life`

**轻量的时间流设计**。

**内容类型**: 随想 / 照片 / 旅行 / 做饭 / 哲学思考
**布局**: 简洁的时间线，每条一行

### 3.7 关于 `/about`

**保留现有设计**，独立页面。

更新内容：
- 个人介绍文案（突出「哲学 × AI」标签）
- 技能标签
- 社交链接
- 联系方式

---

## 四、数据模型

### 4.1 内容集合 Schema

#### `log` — 统一的文章/日志集合

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
      'project',     // 项目展示
    ]),

    published: z.boolean().default(true),
    summary: z.string().optional(),
    description: z.string().optional(),
    cover: z.string().optional(),

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

#### `dockItem` — 工具箱 + 信息源

```typescript
const dockItem = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/dock' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    category: z.enum(['tool', 'info-source']),
    tags: z.array(z.string()),
    rating: z.number().min(1).max(5).optional(),
    url: z.string().url().optional(),
    published: z.boolean().default(true),
  }),
});
```

#### 删除的集合
- ~~`idea`~~ → 内容迁移至 `log`（category: 'ai', type: 'thought'）
- ~~`work`~~ → 内容通过 `log` 的 `videos` 字段关联

### 4.2 一篇文章的 frontmatter 示例

```yaml
---
title: 5 个改变我工作流的 AI 工具
date: 2026-05-10
tags: [工具, AI, 效率]
category: ai
type: article
published: true
summary: 本期视频推荐 5 个我每天在用的 AI 工具，附完整配置教程。
cover: /images/covers/ai-tools-5.jpg
videos:
  - platform: bilibili
    url: https://www.bilibili.com/video/BV1xxxxxxxxx
    title: 5 个改变我工作流的 AI 工具（完整版）
  - platform: xiaohongshu
    url: https://www.xiaohongshu.com/discovery/item/xxxxx
    title: AI 工具推荐（精华版）
resources:
  - name: ChatGPT
    url: https://chat.openai.com
    type: tool
    description: OpenAI 的对话式 AI
  - name: Claude Code
    url: https://docs.anthropic.com/en/docs/claude-code
    type: tool
    description: Anthropic 的 CLI 编程工具
  - name: 完整配置教程
    url: https://xxx.feishu.cn/docx/xxxxx
    type: feishu
    description: 手把手教你配置这 5 个工具
  - name: 工具安装包合集
    url: https://xxx.feishu.cn/drive/xxxxx
    type: download
    description: 所有工具的离线安装包（飞书网盘）
---

正文内容在这里……支持 MDX 富媒体组件。
```

---

## 五、技术架构

### 5.1 技术栈

| 层 | 技术 | 版本 | 说明 |
|----|------|------|------|
| **框架** | Astro | 6.1+ | 内容站首选，孤岛架构 |
| **样式** | Tailwind CSS | 4.2+ | 工具类 CSS |
| **语言** | TypeScript | 5.9+ | 类型安全 |
| **内容** | MDX | 5.0+ | Markdown + 组件 = 富媒体 |
| **搜索** | Pagefind | 1.5+ | 静态站全文搜索 |
| **部署** | Vercel | — | 边缘计算部署 |
| **数据** | Supabase | — | 点赞等动态数据 |
| **新增** | **Pretext.js** | latest | 文本测量库（见 5.3） |

### 5.2 设计系统

**参考来源**:
- **lvyovo-wiki.tech**: Bento 桌面、大圆角毛玻璃、柔和渐变背景、按年分组时间线
- **hylarucoder.io**: 侧边栏分组导航、Inter 字体、精致间距、专业感

**设计 Token**:

| Token | 值 | 用途 |
|-------|---|------|
| `--font-heading` | Sora | 标题 |
| `--font-body` | Inter | 正文 |
| `--font-mono` | JetBrains Mono | 代码/日期 |
| `--color-brand` | #35bfab | 品牌薄荷青 |
| `--color-parchment` | #2a3b3e | 主文本 |
| `--border-radius-card` | 40px | 卡片圆角 |
| `--glass-blur` | 40px | 毛玻璃模糊度 |

### 5.3 Pretext.js 集成计划

**库**: Pretext.js（15KB，Cheng Lou 作品）  
**作用**: 不通过 DOM 精确测量文本尺寸，实现 60fps 无卡顿布局

**应用场景（按优先级排列）**:

| 优先级 | 场景 | 具体用途 |
|--------|------|----------|
| P0 | **搜索结果预览** | ⌘K 搜索弹窗中，精确计算摘要文本截断位置，无需 DOM reflow |
| P1 | **文章列表虚拟滚动** | 当文章数量 > 50 时，预计算每行高度实现虚拟化列表 |
| P2 | **标签云智能布局** | 工具箱/信息源的标签筛选器，根据文字宽度自适应紧凑排列 |
| P3 | **Bento 卡片文本自适应** | 首页卡片标题根据卡片宽度动态计算最佳字号 |
| 未来 | **知识图谱节点标签** | D3.js 图谱中精确计算节点标签尺寸，避免重叠 |

---

## 六、内容迁移计划

### 6.1 现有内容处理

| 文件 | 原位置 | 新位置 | 操作 |
|------|--------|--------|------|
| `ai-design-workflow.mdx` | log | log（加 `category: ai`） | 加字段 |
| `code-and-philosophy.md` | log | log（加 `category: ai`） | 加字段 |
| `design-thinking.md` | log | log（加 `category: ai`） | 加字段 |
| `a-thought.md` | log | log（加 `category: life`） | 加字段 |
| `cooking-pasta.md` | log | log（加 `category: life`） | 加字段 |
| `mountain-trip.md` | log | log（加 `category: life`） | 加字段 |
| `hello-walker.md` | log | log（加 `category: life`） | 加字段 |
| `dialogue-on-subtraction.mdx` | log | log（加 `category: ai`） | 加字段 |
| `knowledge-graph.md` | idea → | log（`category: ai`, `type: thought`） | 迁移 + 转格式 |
| `auto-pr-review.md` | idea → | log（`category: ai`, `type: thought`） | 迁移 + 转格式 |
| `ai-blog-rebuild.md` | works → | log（`category: ai`, `type: project`，加 videos） | 迁移 |
| `ai-coding-habits.md` | works → | log（`category: ai`, `type: project`，加 videos） | 迁移 |
| `claude-code.md` | dock | dock（不变） | 无 |
| `aigc-wechat.md` | dock | dock（不变） | 无 |
| `design-review-skill.md` | dock | dock（不变） | 无 |

### 6.2 删除的页面/组件

- [x] `/compass.astro` — 删除
- [x] `/ideas.astro` — 删除
- [x] `/works.astro` — 删除
- [ ] `IdeaCard.astro` — 删除
- [ ] `WorkCard.astro` — 删除

---

## 七、实施阶段

### Phase 1: 架构重构（核心）
- [ ] 修改 `content.config.ts`（新 schema）
- [ ] 现有 log 文章加 `category` + `videos` + `resources` 字段
- [ ] 迁移 idea 和 work 内容到 log
- [ ] 重构 `Navigation.astro`（新分组导航）
- [ ] 更新 `WalkerProfile.astro` 导航链接
- [ ] 删除 Compass/Ideas/Works 页面

### Phase 2: 新页面建设
- [ ] `/ai` — AI 探索文章列表（lvyovo 风格按年时间线）
- [ ] `/ai/[slug]` — 文章详情模板（视频嵌入 + 资源链接区）
- [ ] `/ai/toolkit` — 工具箱页面
- [ ] `/ai/sources` — 信息源页面
- [ ] `/life` — 生活日志列表
- [ ] `/life/[slug]` — 生活日志详情

### Phase 3: 增强体验
- [ ] 集成 Pretext.js
- [ ] ⌘K 搜索弹窗接入 Pagefind + Pretext 截断
- [ ] 资源链接卡片组件（区分飞书/工具/下载）
- [ ] B站视频嵌入 MDX 组件
- [ ] 文章列表虚拟滚动（Pretext 预计算高度）

### Phase 4: 打磨
- [ ] 视图过渡动画（View Transitions）
- [ ] 移动端适配
- [ ] SEO 优化（每个页面 meta）
- [ ] RSS 更新（分别输出 AI 和 Life 的 feed）
- [ ] 性能审计（Lighthouse 95+）

---

## 八、成功指标

| 指标 | 目标 | 衡量方式 |
|------|------|----------|
| 新粉丝理解成本 | < 5 秒理解「这个人在做什么」 | 用户测试 |
| 资源帖使用率 | 每篇资源帖有 > 50% 的链接被点击 | Vercel Analytics |
| 回访率 | 月回访率 > 30% | Vercel Analytics |
| 性能 | Lighthouse Performance > 95 | 自动化测试 |
| 内容发布效率 | 发一篇资源帖 < 15 分钟 | 自测 |
