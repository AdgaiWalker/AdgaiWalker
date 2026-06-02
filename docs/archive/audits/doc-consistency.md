# Documentation Consistency Audit Report

**日期**: 2026-06-02
**范围**: CLAUDE.md, docs/README.md, src/content.config.ts, 实际代码

## 审核结论

- **结论**: 有条件通过
- **汇总**: P0:2 P1:5 P2:12 P3:5
- **修复优先级**: P0 → P1 → P2 → P3

---

## P0 — 严重误导

### 1. CLAUDE.md 列出 10 个已删除的首页组件
- **位置**: `CLAUDE.md:93`
- **证据**:
  - 文档: "首页卡片（根级）：`GreetingCard.astro`、`BrandCard.astro`、`RecentTraces.astro`、`FeaturedTools.astro`、`CalendarWidget.astro`、`MusicPlayer.astro`、`PolaroidWidget.astro`、`WalkerProfile.astro`"
  - 代码: 仅 `GreetingCard.astro` 存在，其余 7 个已全部删除
- **影响**: 任何 agent 或开发者按照文档查找这些组件都会失败
- **建议**: 仅保留 `GreetingCard.astro`
- **关联原则**: 以代码为真

### 2. CLAUDE.md 引用不存在的 `TopNavBar.astro`
- **位置**: `CLAUDE.md:88`
- **证据**:
  - 文档: "导航协调器，根据路由分发到三个子组件：`nav/TopNavBar.astro`（首页胶囊栏）..."
  - 代码: `src/components/nav/TopNavBar.astro` 不存在，`Navigation.astro` 首页不渲染任何 nav
- **影响**: agent 尝试 import 或修改 TopNavBar 会报错
- **建议**: 改为"Navigation.astro 在首页不渲染导航，在内页分发到 `SidebarNav.astro` + `MobileMenu.astro`"
- **关联原则**: 以代码为真

---

## P1 — 核心功能不一致

### 3. CLAUDE.md 列出已删除的 `CustomPalette.astro` 和 `CanvasZoomControls.astro`
- **位置**: `CLAUDE.md:92`
- **证据**:
  - 文档: "首页组件（`home/`）：...`CustomPalette.astro`（调色板）、`CanvasZoomControls.astro`（缩放控件）"
  - 代码: `src/components/home/` 下仅有 `HomeCanvas.astro` 和 `SparkBoxModal.astro`
- **影响**: phantom 组件引用
- **建议**: 移除这两个条目

### 4. docs/README.md 的 Ferry P0-P4 状态映射与实际 schema 不一致
- **位置**: `docs/README.md:90-98`
- **证据**:
  - 文档: P0=混沌显影/想法中, P1=蓝图成型/规划中, P2=执行造物/实践中, P3=偏差修正/修正中, P4=复盘沉淀/已沉淀
  - 代码: `content.config.ts` 定义 `status: z.enum(['thinking', 'validating', 'building', 'verified', 'archived'])`，无 P0-P4 映射层
- **影响**: 使用 P0-P4 中文标签作为 status 值会导致 schema 校验失败
- **建议**: 更新文档使用实际枚举值，将 Ferry P0-P4 标记为未来计划
- **关联原则**: 合同优先

### 5. `/about/site` 路由冲突：物理页面 + 301 重定向并存
- **位置**: `src/pages/about/site.astro` vs `astro.config.mjs:76`
- **证据**:
  - 文档: CLAUDE.md 路由表将 `/about/site` 标记为 301→`/about?tab=site`
  - 代码: `site.astro` 物理文件存在（308行），同时 astro.config 有 301 重定向规则。物理页面实际不可达（重定向优先）
- **影响**: `site.astro` 是死代码，且与 `AboutSiteTab.astro` 内容重复
- **建议**: 删除 `src/pages/about/site.astro`，保留 301 重定向
- **关联原则**: 以代码为真

### 6. GSAP 是核心依赖但文档完全未提及
- **位置**: `CLAUDE.md` 全文
- **证据**:
  - 文档: 无任何 GSAP 提及
  - 代码: `package.json` 有 `"gsap": "^3.15.0"`，5个源文件依赖它（`gsap-setup.ts`、`home-entrance.ts`、`scroll-fade.ts`、`page-transitions.ts`、`LikeCounter.astro`）
- **影响**: 开发者可能引入竞品动画库，或无法理解动画基础设施
- **建议**: 在架构部分添加 GSAP 为依赖，添加 `gsap-setup.ts` 说明

### 7. `getVersionChain` 和 `getSeriesEntries` 未在文档中记录
- **位置**: `CLAUDE.md:140`
- **证据**:
  - 文档: 仅列出 `getPublishedContentItems` 等 5 个查询函数
  - 代码: `content.ts` 还导出 `getVersionChain()` 和 `getSeriesEntries()`，被 `[slug].astro` 使用
- **影响**: agent 不会知道版本链和系列导航的查询函数存在
- **建议**: 补充这两个函数

---

## P2 — 示例不完整/命名不一致

### 8. 3 个客户端脚本未记录
- **位置**: `CLAUDE.md:112-120`
- **证据**:
  - 文档: 列出 7 个脚本
  - 代码: `src/scripts/` 含 10 个文件，遗漏 `gsap-setup.ts`、`home-entrance.ts`、`page-transitions.ts`
- **建议**: 补充这 3 个脚本

### 9. `src/lib/theme.ts` 未记录
- **位置**: `CLAUDE.md` 辅助模块部分
- **证据**:
  - 文档: 无提及
  - 代码: 导出 `THEMES`、`ThemeName`、`cycleTheme()`，被 `Navigation.astro` 和 `home-canvas.ts` 引用
- **建议**: 添加到辅助模块

### 10. `src/data/site-data.ts` 未记录
- **位置**: `CLAUDE.md:135` 数据文件部分
- **证据**:
  - 文档: 仅提及 `site-stats.json`
  - 代码: `site-data.ts` 导出 `articles`、`pillars`、`aiTools`、`totalCost`、`costByCategory`
- **建议**: 添加到数据文件部分

### 11. `src/types/nav.ts` 未记录
- **位置**: `CLAUDE.md` 全文
- **证据**:
  - 文档: 无提及
  - 代码: 定义 `NavItem` 和 `NavGroup` 类型
- **建议**: 在架构或辅助模块部分提及

### 12. `content-model.ts` 未记录推断函数
- **位置**: `CLAUDE.md:141`
- **证据**:
  - 文档: 列出 `toContentItem()`、`itemBelongsToSpace()` 等
  - 代码: 还导出 `inferForm()`、`inferDomain()`、`inferIntent()`、`inferValueMode()`
- **建议**: 补充推断函数

### 13. `constants.ts` 描述不完整
- **位置**: `CLAUDE.md:143`
- **证据**:
  - 文档: "共享常量（`PLATFORM_ICON_MAP` 等）"
  - 代码: 还导出 `STATUS_LABELS`、`STATUS_WEIGHT`、`SITE_EMAIL`、`CHARS_PER_MINUTE_ZH`、`MS_PER_*` 系列
- **建议**: 扩展描述

### 14. `scroll-fade.ts` 描述低估复杂度
- **位置**: `CLAUDE.md:114`
- **证据**:
  - 文档: "滚动触发 `.reveal` 元素淡入"
  - 代码: 使用 GSAP ScrollTrigger + `gsap.fromTo()` + `gsap.matchMedia()` + reduced-motion 支持
- **建议**: 改为"GSAP ScrollTrigger 驱动的 `.reveal` 滚动入场动画，含 reduced-motion 支持"

### 15. About 页面组件未记录
- **位置**: `CLAUDE.md` 核心组件部分
- **证据**:
  - 文档: 无 about 子组件提及
  - 代码: `src/components/about/SectionHeader.astro` 和 `AboutSiteTab.astro` 存在且被使用
- **建议**: 添加 about 组件条目

### 16. `ArticleNav.astro` 的归属描述不精确
- **位置**: `CLAUDE.md:47,90`
- **证据**:
  - 文档: "ArticleNav 通过 slot 注入 Navigation 侧边栏"
  - 代码: `ArticleNav` 由 `ArticleLayout.astro` import 并通过 slot 传递，不是 `[slug].astro` 直接操作
- **建议**: 明确说明注入链路：`ArticleLayout → nav-extension slot → Navigation → SidebarNav`

### 17. 主导航"首页/内容/关于"仅在非首页可见
- **位置**: `docs/README.md:74,216`
- **证据**:
  - 文档: "主导航目标：`首页 / 内容 / 关于`"
  - 代码: `Navigation.astro` 在首页不渲染 `<nav>`（`isHome ? null : ...`）
- **建议**: 补充说明首页导航由 HomeCanvas 的 identity card ghost nav 和快速入口承担

### 18. docs/ 引用不存在的视觉稿目录
- **位置**: `docs/README.md:233-237`
- **证据**:
  - 文档: ".superpowers/brainstorm/7146-1780128339/"
  - 代码: 该目录不存在
- **建议**: 移除或更新路径

### 19. docs/ 目录有 6 个未引用的文档文件
- **位置**: `docs/README.md`
- **证据**:
  - 文档: README 声称是"唯一决策入口"
  - 代码: `docs/` 下还有 `2026-05-30-ai-era-idea-co-creation-architecture-design.md`、`2026-05-31-ideas-page-redesign-spec.md`、`media/`、`AI赋能/` 等未引用文件
- **建议**: 归档到 `docs/archive/` 或从 README 链接

---

## P3 — 措辞/格式小问题

### 20. docs/README.md "当前问题"含已解决的条目
- **位置**: `docs/README.md:53-54`
- **证据**: 条目 4（AI接口）和 5（数据台）用删除线标记但仍列在"当前问题"下
- **建议**: 移到"已解决的问题"子节

### 21. CLAUDE.md 未引用 docs/README.md
- **位置**: `CLAUDE.md` 全文
- **证据**: CLAUDE.md 是 agent 的主要指引，但不提及 docs/README.md 作为决策入口
- **建议**: 添加 "决策和规划参见 docs/README.md"

### 22. docs/README.md 内容模型部分缺少 `status` 字段
- **位置**: `docs/README.md:82-88`
- **证据**: 列出 `form`、`domain`、`intent`、`valueMode`、`aiUsePolicy` 但不列 `status`
- **建议**: 补充 `status` 及其枚举值

### 23. `justify-tags.ts` 描述过于简化
- **位置**: `CLAUDE.md:117`
- **证据**: 文档仅说"标签两端对齐排版"，实际导出 `justifyTags()` + `watchJustifyTags()` 含 resize/View Transition 生命周期
- **建议**: 提及生命周期支持

### 24. `home-canvas.ts` 的 `initSparkBox` 功能未在 CLAUDE.md 提及
- **位置**: `CLAUDE.md:116`
- **证据**: 文档仅说"首页 Bento 画布拖拽、缩放、主题切换逻辑"，未提及 Spark 抽点子
- **建议**: 补充 Spark 盲盒功能描述
