> Archived: This document has been superseded by `docs/README.md`. It is kept only for historical context.
>
> ⚠️ **未采纳此方案（2026-06-01）**：实际 `/ideas` 和 `/projects` 保留为独立路由；`/learn` 未创建；新增了 `/content` 内容宇宙路由。请以 `CLAUDE.md` 路由表为准。

# 站点架构重设计

日期：2026-05-30
状态：已确认
范围：iwalk.pro 全站架构

---

## 1. 设计原则

1. **内容决定形式** — 内容的性质决定页面的形态，UI/UX 为帮助理解内容而存在。
2. **因为需要所以存在** — 页面、分类、功能只在有真实需求时才出现。
3. **内容主动找人** — 最小化用户操作，内容自动呈现和更新。
4. **可自然扩展** — 新内容类型通过配置添加，不需要重构。

## 2. UI 元素模型

所有 UI 元素归结为两种基本形式：

| 元素  | 本质       | 用途             |
| --- | -------- | -------------- |
| 卡片  | 容器，承载信息  | 展示内容、导航入口、信息块  |
| 按钮  | 触发器，执行动作 | 导航跳转、功能触发、状态切换 |

卡片可嵌套（大卡套小卡）。具体命名（导航按钮、功能按钮、圆角卡片等）只是形态变化，本质不变。

## 3. 导航模型

| 导航目的        | 形式   | 例子               |
| ----------- | ---- | ---------------- |
| 分类导航（去哪个板块） | 栏/按钮 | 侧边栏、目录卡、Tab 切换按钮 |
| 类导航（去哪篇内容）  | 卡片   | 文章卡片、工具卡片        |
| 内容导航（内容内定位） | 列表   | TOC 目录           |
| 交互触发        | 按钮   | 点赞、评论、分享         |

## 4. 长期价值排序

决定资源投入优先级：

1. **知识库** — 可复用、可扩展、可产品化的教学内容
2. **思考** — 不可替代的个人认知资产
3. **资源** — 实用但需要持续维护
4. **关于** — 一次性消费的基础设施

## 5. 站点结构

```
iwalk.pro
├── /                 首页画布
├── /posts            思考（时间线流）
├── /tools            资源（需要驱动的工具卡）
├── /learn            知识库（Tab 切换）
├── /about            关于（Tab 切换）
├── /404              404 页面
└── /rss.xml          RSS 订阅源
```

砍掉的页面：`/ideas`、`/projects` 不再独立，内容按需归入 `/posts` 或 `/learn`。
合并的页面：`/about` 和 `/about/site` 合并为一个页面（`/about/site` 做 301 重定向到 `/about`）。

## 6. 各页面规格

### 6.1 首页 `/`

定位：个人画布。所有内容通过卡片呈现。

组件架构：

- 全屏画布，无顶部胶囊栏，无固定侧边栏
- 目录卡：画布上的一张卡片，包含站点头像 + "AdGai Wiki" + 三个导航入口（资源/知识库/关于）+ 无搜索
- 最近思考卡：展示最新 2-3 篇文章，点击进入 `/posts`
- 资源卡：展示评分最高的工具，点击进入 `/tools`
- 了解 Walker 引导卡：点击跳转 `/about`

删除的组件：

- CustomPalette（手动调色板）→ 改为天气/季节自动主题
- SparkBoxModal（随机点子弹窗）→ 玩具性质，无实际功能
- Projects 链接卡、Ideas 链接卡 → 空壳，内容归入其他页面
- 搜索触发按钮 → 首页不需要，内页保留

保留的组件：

- HomeCanvas.astro（画布容器）
- GreetingCard.astro → 可选保留，增加点击跳转 `/about` 的交互信号
- RecentTraces.astro → 最近思考卡
- FeaturedTools.astro → 资源卡
- CanvasZoomControls.astro → 缩放控件保留，主题切换改为自动

天气/季节自动主题：

- 调用免费天气 API（如 wttr.in），根据所在城市当前天气/季节自动切换 orb 颜色和氛围色调
- 春晴 → 暖色、夏晴 → 清凉绿、秋天 → 暖橙、冬天 → 冷色调、阴雨天 → 低调暗色

### 6.2 思考 `/posts`

定位：个人认知资产流。包含世界观、方法论、实践复盘、生活记录，不分类。

布局：SidebarLayout
组织：按时间倒序，按年份分组（保持现状）
改动：无结构改动，文章详情页增加 `updated` 时间显示和 Giscus 评论区

### 6.3 资源 `/tools`

定位：需要驱动的工具库。

布局：SidebarLayout
组织：按时间倒序（保持现状）
改动：工具卡的 `summary` 写法规范为「为了___，我用了___」，从收藏夹逻辑改为需要驱动逻辑

### 6.4 知识库 `/learn`（新增）

定位：个人学习记录 + 教学内容。

布局：全屏内容页，Tab 切换

Tab 结构：

**Tab 1：教程**

- 数据来源：`log` 集合 `type: 'learn'`，或独立数据文件
- 内容：AI 赋能教学体系（入门→学徒→专家→大师）
- 形式：阶段卡片，每个阶段展示框架、内容、安全坎、毕业任务
- 来源文件：`C:\Users\26296\Desktop\AI赋能\目录.md` + `具体.md`

**Tab 2：学习中**

- 数据来源：`log` 集合 `type: 'learning'`，或轻量 JSON/md 文件
- 内容：当前正在学的东西、存的资料链接、碎片笔记
- 形式：轻量列表卡，不需要完整文章，一条笔记/一个链接即可

默认显示 Tab 1（教程），Tab 切换通过按钮实现，无页面跳转。

### 6.5 关于 `/about`

定位：统一的关于页面，合并原 `/about` 和 `/about/site`。

布局：全屏内容页，Tab 切换

Tab 结构：

**Tab 1：关于我**

- Hero 区域（视频或动态背景）
- 航行者宣言 + 三态指示器（准备出发/正在出发/歇会再出发）
- 头像 + 核心叙事（Walker 不是人名，是一种状态）
- 马哲名言
- 社交链接
- 引路人致谢

**Tab 2：关于站**

- 为什么建（三篇文章引用）
- 是什么（四柱定义：思考/资源/知识库/关于）
- 怎么做的（需求驱动选型过程）
- 开发时间线（从 site-stats.json 读取）
- 发布流程、AI 工具栈、总成本
- 开源声明 + GitHub

**Tab 3：路线图**

- 当前层：自动从内容集合读取最新文章/项目状态
- 个人时间线（从 site-stats.json 读取 personalTimeline）
- 已上线 / 计划中（从 site-stats.json 读取 roadmap）
- 社群入口（点子共促二维码）

默认显示 Tab 1（关于我），Tab 切换通过按钮实现，无页面跳转。
`/about/site` 做 301 重定向到 `/about`。

### 6.6 文章详情 `/posts/[slug]`

保持现状：ArticleLayout（三栏：侧边栏 + TOC + 正文）
新增：

- 文章底部 Giscus 评论区
- 文章顶部显示 `updated` 时间（如 frontmatter 中存在）
- 资源卡渲染（已有 `resources` 字段）

## 7. 内容数据架构

### 7.1 配置驱动的内容类型

新增 `src/lib/content-types.ts`，定义所有内容类型：

```ts
export const contentTypes = [
  {
    type: 'knowledge',
    label: '思考',
    route: '/posts',
    icon: 'lucide:pen-line',
    hint: 'POSTS',
    desc: '写下来的思考，走过的路不想白走',
    showInNav: true,
  },
  {
    type: 'tool',
    label: '资源',
    route: '/tools',
    icon: 'lucide:wrench',
    hint: 'TOOLS',
    desc: '验证过的工具，便宜好用能解决问题',
    showInNav: true,
  },
  {
    type: 'learn',
    label: '知识库',
    route: '/learn',
    icon: 'lucide:graduation-cap',
    hint: 'LEARN',
    desc: 'AI 赋能教学，先用再学',
    showInNav: true,
  },
  // 以下类型存在内容后才显示在导航中
  {
    type: 'learning',
    label: '学习中',
    route: '/learn',
    icon: 'lucide:book-open',
    showInNav: false, // 不在主导航显示，在 /learn 的 tab 内
  },
  {
    type: 'idea',
    label: '点子',
    route: '/posts',
    icon: 'lucide:lightbulb',
    showInNav: 'auto', // 有内容才在思考页中显示
  },
  {
    type: 'project',
    label: '项目',
    route: '/posts',
    icon: 'lucide:rocket',
    showInNav: 'auto',
  },
]
```

导航组件（SidebarNav、TopNavBar）从配置生成，不硬编码。新增内容类型只需：

1. `content.config.ts` 加 type 枚举值
2. `content-types.ts` 加一条配置
3. 写内容文件

### 7.2 Schema 扩展

在现有 `log` 集合 schema 中增加：

```ts
updated: z.date().optional(),        // 内容更新时间
```

`type` 枚举新增：`'learn'`、`'learning'`

暂不添加 `need`、`practice_value`、`agent_notes` 等 PRD 字段。等内容量和习惯建立后再补充。

### 7.3 内容流动规则

| 内容类型          | 写在哪里                | 出现在哪               |
| ------------- | ------------------- | ------------------ |
| 思考/世界观/方法论/生活 | `type: 'knowledge'` | `/posts` + 首页最近思考卡 |
| 工具/资源         | `type: 'tool'`      | `/tools` + 首页资源卡   |
| 教程/教学         | `type: 'learn'`     | `/learn` 教程 tab    |
| 学习笔记/资料       | `type: 'learning'`  | `/learn` 学习中 tab   |
| 点子            | `type: 'idea'`      | `/posts` 内展示（标签区分） |
| 项目            | `type: 'project'`   | `/posts` 内展示（标签区分） |
| 个人动态          | `site-stats.json`   | `/about` 路线图 tab   |

## 8. 反馈闭环

### 8.1 读者反馈通道

| 读者行为  | 实现方式                       | Walker 怎么收到             |
| ----- | -------------------------- | ----------------------- |
| 点赞    | Supabase LikeCounter（已有）   | Supabase 后台数据           |
| 评论    | Giscus（GitHub Discussions） | GitHub 通知邮件             |
| 提问/建议 | 统一浮动反馈按钮                   | 微信群/Email/GitHub Issues |

### 8.2 统一反馈入口

全站右下角浮动按钮，点击展开：

- 点子共促社群（二维码）
- Email（praxiswalker@gmail.com）
- GitHub Issues

### 8.3 内容更新标记

- 文章 frontmatter 增加 `updated` 字段
- 文章详情页显示「最后更新于 YYYY-MM-DD」
- 读者知道内容是否还在维护

## 9. Agent 预留

第一版不做 Agent 入口，但内容结构从现在开始准备：

- 每篇内容有 `title` + `summary` + `tags` + `type` → Agent 可理解内容类型
- 教程有阶段结构 → Agent 可按用户水平推荐
- 工具有场景描述 → Agent 可按需求匹配
- 未来补充 `walker-style.md` 记录行事风格和方法论

## 10. 全局功能

| 功能          | 实现                       | 状态                  |
| ----------- | ------------------------ | ------------------- |
| 天气/季节自动主题   | wttr.in API + orb 颜色映射   | 新增，替换 CustomPalette |
| 浮动反馈按钮      | 全站右下角，社群/Email/GitHub    | 新增                  |
| Giscus 评论   | 文章和教程底部                  | 新增                  |
| 内容更新标记      | frontmatter `updated` 字段 | 新增                  |
| 点赞          | Supabase（已有）             | 保持                  |
| RSS         | （已有）                     | 保持                  |
| Pagefind 搜索 | （已有）内页保留，首页去掉            | 调整                  |

## 11. 移动端（待讨论）

本次设计以桌面端为主。移动端需单独讨论：

- Bento 画布在移动端的表现形式
- 侧边栏在移动端的折叠方式
- Tab 切换在移动端的交互

## 12. 不做的事

- 不添加 Walker PRD 中的 `need`、`practice_value`、`agent_notes` 等 schema 字段
- 不做独立 `/ideas` 和 `/projects` 页面
- 不做 Agent 在线问答入口
- 不做登录、私密内容、后台编辑器
- 不做 Obsidian 自动同步
- 不在首页保留手动调色板和搜索按钮


