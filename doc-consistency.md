# 文档一致性审核报告

> 审核日期：2026-06-01
> 审核范围：`CLAUDE.md`、`docs/README.md`、`docs/archive/**`、`docs/superpowers/plans/**`
> 审核原则：以代码为真，合同（content.config.ts / astro.config.mjs）为 SSOT

---

## 审核结论

- **结论**：有条件通过
- **汇总**：P0: 0 | P1: 10 | P2: 14 | P3: 4 | 待补充: 2
- **修复优先级**：P1 → P2 → P3

---

## P1 — 核心功能不一致（按文档操作会失败或产生严重误导）

### 1. CLAUDE.md 项目概述仍写 "Supabase 点赞"
- **严重级别**: P1
- **位置**: `CLAUDE.md:7`
- **证据**:
  - 文档: `"Pagefind 搜索和 Supabase 点赞"`
  - 代码: `src/pages/api/like.ts` 使用 `@upstash/redis`；`LikeCounter.astro` 调用 `/api/like` 接口
- **影响**: 新读者/Agent 以为点赞系统基于 Supabase，无法理解 `/api/like` 路由
- **建议**: 改为 `"Pagefind 搜索和 Upstash Redis 点赞"`

### 2. CLAUDE.md `type` 枚举值不完整
- **严重级别**: P1
- **位置**: `CLAUDE.md:32`
- **证据**:
  - 文档: `type（枚举：knowledge、tool、idea、project、community）`
  - 代码: `src/content.config.ts:12` → `z.enum(['knowledge', 'tool', 'idea', 'project', 'community', 'learn', 'learning'])`
- **影响**: 创建内容时不知道 `learn` / `learning` 类型可用
- **建议**: 补全为 `knowledge、tool、idea、project、community、learn、learning`

### 3. CLAUDE.md `status` 枚举值完全过时
- **严重级别**: P1
- **位置**: `CLAUDE.md:32`
- **证据**:
  - 文档: `status（枚举：thinking、practicing、verified、archived）`
  - 代码: `src/content.config.ts:31` → `z.enum(['thinking', 'validating', 'building', 'verified', 'archived'])`
- **影响**: `practicing` 在代码中不存在，构建会报错；`validating`、`building` 未记录
- **建议**: 改为 `thinking、validating、building、verified、archived`

### 4. docs/README.md 技术现状写 "Supabase REST API"
- **严重级别**: P1
- **位置**: `docs/README.md:40`
- **证据**:
  - 文档: `点赞：Supabase REST API`
  - 代码: `@upstash/redis` via `/api/like`
- **影响**: 当前决策入口文档与实际技术栈不符
- **建议**: 改为 `点赞：Upstash Redis（Vercel Marketplace）via /api/like`

### 5. docs/README.md 路由列表将 `/about/site` 列为独立页面
- **严重级别**: P1
- **位置**: `docs/README.md:42`
- **证据**:
  - 文档: `当前主要路由：…、/about、/about/site`
  - 代码: `astro.config.mjs:76` → `'/about/site': { status: 301, destination: '/about?tab=site' }`
- **影响**: 读者以为 `/about/site` 是可独立访问的页面，实际已被 301 重定向
- **建议**: 移除 `/about/site`，补充 `/about?tab=site` 说明；添加 `/content` 路由

### 6. archive/technical-architecture.md 点赞和评论信息过时
- **严重级别**: P1
- **位置**: `docs/archive/specs/2026-05-30-technical-architecture.md:15-16`
- **证据**:
  - 文档: `评论：Giscus（规划中）`、`点赞：Supabase REST API`
  - 代码: `GiscusWidget.astro` 已实现并集成到 `[slug].astro`；`@upstash/redis` 替代 Supabase
- **影响**: 归档文档虽标注 superseded，但头部标记可能被忽略
- **建议**: 在归档头部添加醒目日期戳 `"此文档技术栈信息已于 2026-05-31 更新，请以 CLAUDE.md 为准"`

### 7. archive/site-architecture-redesign.md 路由结构已失效
- **严重级别**: P1
- **位置**: `docs/archive/specs/2026-05-30-site-architecture-redesign.md:49-60`
- **证据**:
  - 文档: 列出 `/learn` 路由，声称 `/ideas` 和 `/projects` "不再独立，内容按需归入 /posts 或 /learn"
  - 代码: `/ideas`、`/projects` 均作为独立路由存在（`src/pages/ideas/index.astro`、`src/pages/projects/index.astro`）；`/learn` 不存在
- **影响**: 归档中的设计决策与实际实现完全不同，可能误导后续决策
- **建议**: 在文档头部加注 `"实际未采纳此方案——/ideas 和 /projects 保留独立，/learn 未创建"`

### 8. superpowers plan 引用已过时的 Supabase
- **严重级别**: P1
- **位置**: `docs/superpowers/plans/2026-05-30-ai-era-idea-co-creation-implementation.md:9`
- **证据**:
  - 文档: `Supabase LikeCounter existing integration`
  - 代码: LikeCounter 现在使用 Upstash Redis
- **影响**: 执行计划的参考技术栈描述过时
- **建议**: 改为 `Upstash Redis LikeCounter via /api/like`

### 9. archive/technical-architecture.md 引用不存在的文件
- **严重级别**: P1
- **位置**: `docs/archive/specs/2026-05-30-technical-architecture.md:49`
- **证据**:
  - 文档: `content-types.ts → 内容类型配置（新增）`
  - 代码: 实际文件名为 `src/lib/content-model.ts`，`content-types.ts` 从未创建
- **影响**: 按文档路径找不到文件
- **建议**: 在归档中标注实际文件名

### 10. CLAUDE.md 缺少 `/content` 路由
- **严重级别**: P1
- **位置**: `CLAUDE.md:44-56`（路由结构表）
- **证据**:
  - 文档: 路由表无 `/content`
  - 代码: `src/pages/content/index.astro` 存在，使用 Base 布局，`prerender = true`
- **影响**: `/content` 是核心新增路由（内容宇宙），遗漏导致理解不完整
- **建议**: 在路由表中添加 `| /content | 内容宇宙 | Base |`

---

## P2 — 示例不完整 / 命名不一致

### 11. CLAUDE.md 缺少 AI 可读路由
- **严重级别**: P2
- **位置**: `CLAUDE.md:44-56`（路由结构表）
- **证据**:
  - 文档: 未记录 `/llms.txt`、`/walker-style.md`、`/index.json`
  - 代码: 三个页面文件均存在（`src/pages/llms.txt.ts`、`src/pages/walker-style.md.ts`、`src/pages/index.json.ts`）
- **影响**: 外部 AI 系统/开发者不知道这些接口可用
- **建议**: 添加到路由表

### 12. CLAUDE.md 缺少 `/about/site → /about?tab=site` 重定向
- **严重级别**: P2
- **位置**: `CLAUDE.md:58-69`（重定向表）
- **证据**:
  - 文档: 重定向表无此条目
  - 代码: `astro.config.mjs:76` → `'/about/site': { status: 301, destination: '/about?tab=site' }`
- **建议**: 在重定向表末尾添加此条目

### 13. CLAUDE.md `/idea/*` 重定向描述不完整
- **严重级别**: P2
- **位置**: `CLAUDE.md:67`
- **证据**:
  - 文档: 概括为 `/idea/:slug → /posts/:slug`
  - 代码: `astro.config.mjs:68-73` 还定义了 `/idea/explore → /tools`、`/idea/explore/:slug → /tools`、`/idea/toolkit → /tools`、`/idea/sources → /tools`
- **建议**: 补充或明确标注为简化描述

### 14. CLAUDE.md 缺少 `GiscusWidget.astro` 组件文档
- **严重级别**: P2
- **位置**: `CLAUDE.md:71-81`（核心组件）
- **证据**:
  - 文档: 未提及 `GiscusWidget.astro`
  - 代码: `src/components/GiscusWidget.astro` 存在，在 `[slug].astro:10` 中导入使用
- **影响**: 评论系统组件未归档，维护者不知其存在
- **建议**: 添加到核心组件列表，说明环境变量 `PUBLIC_GISCUS_*` 依赖

### 15. CLAUDE.md 缺少 `content-universe/` 组件文档
- **严重级别**: P2
- **位置**: `CLAUDE.md:71-81`
- **证据**:
  - 文档: 未提及 `content-universe/` 目录
  - 代码: `ContentFilterTabs.astro`、`ContentUniverseCard.astro` 均存在并被 `/content` 页面使用
- **建议**: 添加到核心组件

### 16. CLAUDE.md 缺少 `content-model.ts` 辅助模块
- **严重级别**: P2
- **位置**: `CLAUDE.md:119-124`（辅助模块）
- **证据**:
  - 文档: 未提及 `content-model.ts`
  - 代码: `src/lib/content-model.ts` 定义了 `ContentSpace`、`ContentItem` 类型、`toContentItem()`、`itemBelongsToSpace()`、`contentSpaces` 等核心导出
- **影响**: 这是内容模型的核心模块，遗漏影响理解
- **建议**: 添加完整条目，说明其类型定义和内容空间分配逻辑

### 17. CLAUDE.md `content.ts` 缺少 `getPublishedContentItems` 函数
- **严重级别**: P2
- **位置**: `CLAUDE.md:122`
- **证据**:
  - 文档: 列出 `getPublishedPosts`、`getPublishedResources`、`getPublishedIdeas`、`getPublishedProjects`
  - 代码: `src/lib/content.ts` 还导出 `getPublishedContentItems()`，被 `/content`、`/about`、`/llms.txt`、`/index.json` 等多处使用
- **建议**: 补充此函数

### 18. CLAUDE.md `routes.ts` 缺少 `CONTENT` 和 `buildContentSpacePath`
- **严重级别**: P2
- **位置**: `CLAUDE.md:121`
- **证据**:
  - 文档: 列出 `POSTS`、`TOOLS`、`IDEAS`、`PROJECTS`、`buildPostPath`
  - 代码: `src/lib/routes.ts` 还导出 `CONTENT = '/content'`、`ABOUT = '/about'`、`buildContentSpacePath`
- **建议**: 补充 `CONTENT`、`ABOUT`、`buildContentSpacePath`

### 19. CLAUDE.md 内容集合 Schema 字段不完整
- **严重级别**: P2
- **位置**: `CLAUDE.md:32`
- **证据**:
  - 文档: 只提到 `title`、`date`、`tags`、`category`、`type`、`published`、`summary`、`description`、`cover`、`status`、`rating`、`url`、`qrCode`、`communities`、`videos`、`resources`
  - 代码: `content.config.ts` 还包含 `updated`、`form`、`domain`、`intent`、`valueMode`、`aiUsePolicy`、`related`、`featured` 字段
- **建议**: 补充完整字段列表，特别是 `form`、`domain`、`intent`、`valueMode`、`aiUsePolicy` 这些内容模型核心字段

### 20. CLAUDE.md 缺少 `Footer.astro` 组件文档
- **严重级别**: P2
- **位置**: `CLAUDE.md:71-81`
- **证据**:
  - 文档: 未提及 `Footer.astro`
  - 代码: `src/components/Footer.astro` 存在，被 Base.astro 使用
- **建议**: 在适当位置补充

### 21. docs/README.md 声称 "AI 可读接口未落地"
- **严重级别**: P2
- **位置**: `docs/README.md:51`
- **证据**:
  - 文档: `llms.txt、walker-style.md、结构化 index.json 仍未在站点中稳定生成`
  - 代码: 三个文件均存在且使用 `prerender = true`，`npm run build` 后可访问
- **影响**: 决策文档对已完成功能的判断不正确
- **建议**: 将此问题从"当前问题"移至已完成，或添加注释说明已落地

### 22. docs/README.md 声称 "数据台未落地"
- **严重级别**: P2
- **位置**: `docs/README.md:52`
- **证据**:
  - 文档: `访问、点赞、评论、搜索无结果等反馈还没有统一入口`
  - 代码: `AboutSiteTab.astro:232-265` 有完整的"数据台"section（PUBLIC DATA DOCK），包含内容数量统计和内容空间分布
- **影响**: 轻量数据台已实现但文档仍列为未完成
- **建议**: 更新为"轻量数据台已上线（关于站 → 数据台），完整分析后台待 Plan 4"

### 23. docs/README.md intent 标签与代码不一致
- **严重级别**: P2
- **位置**: `docs/README.md:84`
- **证据**:
  - 文档: `intent：思考、记录、教学、分享、验证、展示、复盘、连接、释放`
  - 代码: `content-model.ts:88` → `vent: '表达'`（不是"释放"）
- **影响**: 内容创作者按文档填写 intent 时最后一个值的中文描述不正确
- **建议**: 将"释放"改为"表达"

### 24. CLAUDE.md `site-stats.json` 描述引用不可达页面
- **严重级别**: P2
- **位置**: `CLAUDE.md:117`
- **证据**:
  - 文档: `被 about/index.astro 和 about/site.astro 导入`
  - 代码: `about/site.astro` 因 301 重定向到 `/about?tab=site` 而不可达；实际被 `about/index.astro`（通过 `AboutSiteTab.astro`）导入
- **建议**: 改为 `被 about/index.astro（通过 AboutSiteTab.astro）导入`

---

## P3 — 措辞 / 格式 / 链接小问题

### 25. CLAUDE.md 构建流程描述可更精确
- **严重级别**: P3
- **位置**: `CLAUDE.md:26`
- **证据**:
  - 文档: `pagefind --site dist/client`
  - 代码: `package.json:9` 一致，但 Vercel adapter 模式下 `dist/client` 是中间产物路径，不是最终部署路径
- **建议**: 保留（命令正确），但可添加注释说明这是 Vercel SSR adapter 的中间产物路径

### 26. archive/tech-architecture.md 数据层描述引用不存在的文件名
- **严重级别**: P3
- **位置**: `docs/archive/specs/2026-05-30-technical-architecture.md:49`
- **证据**:
  - 文档: `content-types.ts → 内容类型配置（新增）`
  - 代码: 实际文件为 `content-model.ts`
- **建议**: 归档文件加注实际文件名

### 27. docs/README.md 路由列表缺少 `/content`
- **严重级别**: P3
- **位置**: `docs/README.md:42`
- **证据**:
  - 文档: `当前主要路由：/、/posts、/posts/[slug]、/tools、/ideas、/projects、/about、/about/site`
  - 代码: `/content` 已上线
- **建议**: 添加 `/content`，移除 `/about/site`

### 28. docs/2026-05-31-ideas-page-redesign-spec.md 状态标记为"待实施"
- **严重级别**: P3
- **位置**: `docs/2026-05-31-ideas-page-redesign-spec.md:4`
- **证据**:
  - 文档: `状态：待实施`
  - 代码: Schema 更新已完成（文档自身 2.1/2.2 节已标注完成），但页面重做可能尚未开始
- **建议**: 如果 schema 部分已完成，将状态改为"部分实施（Schema 已更新，UI 待实施）"

---

## 待证据补充

### 29. `about/site.astro` 静态文件与 301 重定向冲突
- **严重级别**: 待证据补充
- **位置**: `src/pages/about/site.astro` vs `astro.config.mjs:76`
- **证据**:
  - `about/site.astro` 存在且 `prerender = true`，会生成静态 HTML
  - `astro.config.mjs` 定义了 `/about/site → /about?tab=site` 的 301 重定向
  - Vercel 路由优先级：静态文件 > 重定向 > 动态路由
  - 因此预渲染的静态文件可能会被直接提供，导致重定向永远不会触发
- **影响**: 如果静态文件优先级更高，用户访问 `/about/site` 会看到旧的独立页面（`about/site.astro`），而不是被重定向到 `/about?tab=site`（`AboutSiteTab.astro` 的内容）
- **建议**: 需要实测验证。如果静态文件确实优先，则 `about/site.astro` 是死代码，应删除以让重定向生效

### 30. Astro Fonts API 注入的字体被 global.css 完全覆盖
- **严重级别**: 待证据补充
- **位置**: `astro.config.mjs:22-58` vs `src/styles/global.css:28-31`
- **证据**:
  - `astro.config.mjs` 配置 Inter（→ `--font-body`）、Sora（→ `--font-heading`）
  - `global.css` 的 `@theme` 块覆盖为 Outfit（body）、Averia Gruesa Libre + Outfit（heading）
  - Astro Fonts API 仍会生成 Inter 和 Sora 的 `@font-face` 并注入，但渲染时实际不会使用
- **影响**: 用户浏览器会下载 Inter 和 Sora 字体文件但从不渲染，浪费带宽
- **建议**: 确认 Astro Fonts API 的行为——如果 `@theme` 覆盖确实导致注入字体未被使用，考虑从 `astro.config.mjs` 中移除 Inter 和 Sora，或直接在 Fonts API 中配置 Outfit 和 Averia Gruesa Libre

---

## 修复建议优先级

### 第一优先（立即修复 CLAUDE.md — 它是 AI Agent 的 SSOT）

| # | 修复内容 | 涉及行 |
|---|---------|--------|
| 1 | "Supabase 点赞" → "Upstash Redis 点赞" | L7 |
| 2 | `type` 枚举补全 `learn`、`learning` | L32 |
| 3 | `status` 枚举改为 `thinking、validating、building、verified、archived` | L32 |
| 10 | 路由表添加 `/content` | L44-56 |
| 11 | 路由表添加 `/llms.txt`、`/walker-style.md`、`/index.json` | L44-56 |
| 12 | 重定向表添加 `/about/site → /about?tab=site` | L58-69 |
| 14 | 核心组件添加 `GiscusWidget.astro` | L71-81 |
| 16 | 辅助模块添加 `content-model.ts` | L119-124 |
| 17 | `content.ts` 补充 `getPublishedContentItems` | L122 |
| 18 | `routes.ts` 补充 `CONTENT`、`ABOUT`、`buildContentSpacePath` | L121 |
| 19 | Schema 字段补充 `updated`、`form`、`domain`、`intent`、`valueMode`、`aiUsePolicy`、`related`、`featured` | L32 |

### 第二优先（修复 docs/README.md — 决策入口）

| # | 修复内容 |
|---|---------|
| 4 | 点赞技术栈更新 |
| 5 | 路由列表更新（移除 `/about/site`，添加 `/content`） |
| 21 | AI 可读接口状态改为已落地 |
| 22 | 数据台状态改为已上线（轻量版） |
| 23 | intent "释放" → "表达" |

### 第三优先（归档文件加注）

| # | 修复内容 |
|---|---------|
| 6-9 | archive 文件添加过时标注 |
| 26 | `content-types.ts` → `content-model.ts` 标注 |
