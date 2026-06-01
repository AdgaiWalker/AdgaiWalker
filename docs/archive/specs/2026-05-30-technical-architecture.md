> Archived: This document has been superseded by `docs/README.md`. It is kept only for historical context.
>
> ⚠️ **技术栈信息已过时（2026-06-01）**：点赞已从 Supabase 迁移到 Upstash Redis；Giscus 评论已上线；`content-types.ts` 实际创建为 `content-model.ts`。请以 `CLAUDE.md` 为准。

# 技术架构总览

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 框架 | Astro | v6 |
| 部署 | Vercel（SSR adapter） | — |
| 样式 | Tailwind CSS | v4 |
| 内容 | Astro Content Collections + Zod | — |
| 图标 | astro-icon + @iconify-json/lucide | — |
| 搜索 | Pagefind | — |
| 评论 | Giscus（规划中） | — |
| 点赞 | Supabase REST API | — |
| 构建 | Vite + @tailwindcss/vite | — |

---

## 整体分层架构

```
用户
 │
 ▼
┌─────────────────────────────────────────────────────────┐
│  页面层（src/pages/）                                     │
│  每个路由一个文件，查询数据、选择布局、组合组件              │
│  index.astro / posts/ / tools/ / learn/ / about/         │
└───────────┬─────────────────────────────────────────────┘
            │ 使用
┌───────────▼─────────────────────────────────────────────┐
│  布局层（src/layouts/）                                   │
│  Base → SidebarLayout / ArticleLayout / FullscreenLayout │
│  负责 HTML 外壳、导航、页脚、背景效果                      │
└───────────┬─────────────────────────────────────────────┘
            │ 使用
┌───────────▼─────────────────────────────────────────────┐
│  组件层（src/components/）                                │
│  nav/ home/ article/ content/ shared/ + 根级组件          │
│  可复用 UI 单元，接收 props，渲染 HTML                     │
└───────────┬─────────────────────────────────────────────┘
            │ 使用
┌───────────▼─────────────────────────────────────────────┐
│  数据层（src/lib/ + src/content/）                        │
│  content.config.ts → schema 定义                         │
│  content.ts → 查询函数（按 type 过滤和排序）               │
│  content-types.ts → 内容类型配置（新增）                   │
│  routes.ts → 路由常量                                     │
│  format.ts → 日期格式化                                   │
│  constants.ts → 共享常量                                  │
│  site-stats.json → 关于页动态数据                         │
└───────────┬─────────────────────────────────────────────┘
            │ 使用
┌───────────▼─────────────────────────────────────────────┐
│  脚本层（src/scripts/）                                   │
│  客户端 TypeScript 模块                                   │
│  home-canvas / scroll-fade / tilt-effect / sidebar-state  │
│  toc-highlight / with-lifecycle / justify-tags            │
└─────────────────────────────────────────────────────────┘
```

---

## 布局组合关系

```
Base.astro（根外壳）
│  处理：head、JSON-LD、背景效果、鼠标光晕、阅读模式
│  导入：HeadCommon、Navigation、Footer
│
├── SidebarLayout.astro
│   用途：列表型内页
│   提供：页面头部（图标+标题+计数）+ 侧边栏
│   使用页：/posts、/tools
│
├── ArticleLayout.astro
│   用途：文章详情
│   提供：TOC 目录 + 文章正文 + ArticleNav
│   使用页：/posts/[slug]
│
└── FullscreenLayout.astro
    用途：全屏沉浸页
    提供：隐藏导航/页脚/背景，全宽内容
    使用页：/about、/learn
```

---

## 数据流

### 内容从写到展示的完整路径

```
Obsidian（写作）
  │
  │  md/mdx 文件，含 frontmatter
  ▼
src/content/log/*.md(x)
  │
  │  Astro Content Collections 构建时验证 schema
  ▼
content.config.ts（schema 定义）
  │
  │  getCollection('log') + type 过滤
  ▼
src/lib/content.ts（查询函数）
  │  getPublishedPosts()      → type: knowledge/idea/project
  │  getPublishedResources()  → type: tool
  │  getPublishedLearns()     → type: learn（新增）
  │  getPublishedLearning()   → type: learning（新增）
  │
  │  查询结果传入页面
  ▼
src/pages/*.astro（页面层）
  │
  │  数据传入组件 props
  ▼
src/components/*.astro（渲染）
  │
  │  构建输出 HTML
  ▼
Vercel（部署 + 图片优化）
  │
  ▼
用户访问 iwalk.pro
```

### 内容类型路由（重构后）

```
content-types.ts（配置）
  │
  │  定义每种 type 的 label/route/icon/hint/desc/showInNav
  │
  ├── knowledge → /posts      → getPublishedPosts()
  ├── tool      → /tools      → getPublishedResources()
  ├── learn     → /learn      → getPublishedLearns()
  ├── learning  → /learn(tab) → getPublishedLearning()
  ├── idea      → /posts      → 包含在 getPublishedPosts() 中
  └── project   → /posts      → 包含在 getPublishedPosts() 中

导航组件从 content-types.ts 生成导航项：
  showInNav: true     → 始终显示
  showInNav: 'auto'   → 构建时查 count > 0 才显示
  showInNav: false    → 不在导航显示
```

---

## 导航系统

```
Navigation.astro（协调器）
│
│  根据当前路由分发到三个子组件：
│
├── 首页 → TopNavBar.astro（移除，改为画布目录卡）
│
├── 内页 → SidebarNav.astro
│   ├── 品牌标记（W / Walker）
│   ├── 搜索按钮（触发 SearchModal）
│   ├── 导航列表（从 content-types.ts 生成）
│   ├── 扩展槽（文章页注入 ArticleNav）
│   ├── 折叠按钮（sidebar-state.ts）
│   └── 底部社交链接 + 主题切换
│
└── 移动端 → MobileMenu.astro
    └── 汉堡菜单 + 搜索 + 导航列表
```

---

## 客户端脚本架构

```
with-lifecycle.ts（生命周期工具）
│  导出 registerLifecycle(fn)
│  在 astro:page-load 时 init，astro:before-swap 时 cleanup
│
├── home-canvas.ts
│   画布缩放、卡片拖拽、主题切换
│   使用 registerLifecycle 管理生命周期
│
├── scroll-fade.ts
│   IntersectionObserver 滚动淡入
│   使用 registerLifecycle 管理生命周期
│
├── sidebar-state.ts
│   侧边栏折叠/展开 + localStorage 持久化
│   自注册 astro:page-load
│
├── toc-highlight.ts
│   TOC 目录滚动高亮 + IntersectionObserver
│   自注册 astro:page-load
│
├── tilt-effect.ts
│   导出 setupTilt(selector, options)
│   调用方自行管理 cleanup
│
└── justify-tags.ts
    标签两端对齐排版
    当前未被任何页面导入（备用工具）
```

---

## 外部服务集成

```
Supabase
  └── LikeCounter.astro
      fetch() 调用 REST API
      读取 PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY
      缺失时使用 FALLBACK_COUNT 常量

Pagefind
  └── SearchModal.astro
      构建后运行：pagefind --site dist/client
      输出到 .vercel/output/static/pagefind
      客户端动态加载 pagefind UI

Giscus（规划中）
  └── 文章详情页 + 教程页底部
      基于 GitHub Discussions
      需要 GitHub 仓库配置

天气 API（规划中）
  └── 首页主题自动切换
      调用 wttr.in（免费，无需 key）
      需设计缓存和降级方案
```

---

## 构建与部署流程

```
npm run build
  │
  ├── astro build
  │   ├── 读取 src/content/log/ → 验证 schema → 生成内容集合
  │   ├── 预渲染标记 prerender 的页面
  │   ├── SSR 页面生成 Vercel serverless functions
  │   ├── 图片优化（Vercel Image Optimization）
  │   └── 输出到 dist/client + dist/server
  │
  ├── pagefind --site dist/client
  │   └── 生成搜索索引到 .vercel/output/static/pagefind
  │
  └── Vercel 部署
      ├── 预渲染页面 → CDN 静态文件
      ├── SSR 页面 → Serverless Functions
      └── 图片 → Vercel Image Optimization（按需生成）
```

发布流程（内容更新）：
```
Obsidian 写 md → 推送到 GitHub → Vercel 自动构建部署
```

---

## 重构后新增/变更的技术要素

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/lib/content-types.ts` | 内容类型配置（驱动导航和页面生成） |
| `src/pages/learn/index.astro` | 知识库页面 |
| `src/components/FloatingFeedback.astro` | 全局浮动反馈按钮 |
| `src/components/home/DirectoryCard.astro` | 首页目录卡 |
| `public/llms.txt` | AI 索引文件（阶段零手写，阶段一自动生成） |
| `public/walker-style.md` | Walker 风格说明（阶段零） |

### 变更文件

| 文件 | 变更 |
|------|------|
| `src/content.config.ts` | schema 新增 `updated`、`related` 字段；type 枚举新增 `learn`/`learning`，移除 `community` |
| `src/lib/content.ts` | `getPublishedPosts()` 扩展筛选范围；新增 `getPublishedLearns()`、`getPublishedLearning()` |
| `src/lib/routes.ts` | 新增 `LEARN` 常量 |
| `src/components/Navigation.astro` | 从 content-types.ts 生成导航项 |
| `src/components/nav/SidebarNav.astro` | 导航项从配置生成 |
| `src/pages/about/index.astro` | 合并 site.astro 内容，改为 Tab 切换 |
| `src/pages/index.astro` | 移除 TopNavBar、CustomPalette、SparkBoxModal；新增目录卡 |
| `src/scripts/home-canvas.ts` | 移除调色板和 Spark 逻辑 |
| `astro.config.mjs` | 新增重定向规则（/ideas、/projects、/about/site） |

### 删除文件

| 文件 | 原因 |
|------|------|
| `src/pages/ideas/index.astro` | 合并到 /posts |
| `src/pages/projects/index.astro` | 合并到 /posts |
| `src/pages/about/site.astro` | 合并到 /about |
| `src/components/home/SparkBoxModal.astro` | 玩具，无实际功能 |
| `src/components/home/CustomPalette.astro` | 替换为固定主题或天气自动主题 |
| `src/components/CalendarWidget.astro` | 未使用的组件 |
| `src/components/MusicPlayer.astro` | 未使用的组件 |
| `src/components/PolaroidWidget.astro` | 未使用的组件 |
| `src/components/WalkerProfile.astro` | 未使用的组件 |
