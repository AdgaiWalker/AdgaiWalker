# 文档一致性审核报告

**审核日期**: 2026-05-28
**审核范围**: CLAUDE.md、docs/ 全部文档 vs 源码
**审核结论**: 有条件通过

---

## 汇总

| 级别 | 数量 | 说明 |
|------|------|------|
| P0 | 2 | 缺失关键路由、PRD 严重过时 |
| P1 | 14 | 核心描述不一致、过时报告未归档 |
| P2 | 16 | 命名不准确、小遗漏、重复文件 |
| P3 | 3 | 措辞/细节 |
| **总计** | **35** | |

---

## P0

### 1. CLAUDE.md 缺少 `/about/site` 路由
- **位置**: CLAUDE.md > 路由结构表
- **证据**: 表中只有 `/about`，无 `/about/site`。实际 `src/pages/about/site.astro` 已上线。
- **影响**: 开发者不知道这个路由存在。
- **修复**: 添加行 `| /about/site | 关于网站 | FullscreenLayout |`

### 2. PRD 路由表缺少 3 个活跃页面
- **位置**: `docs/walker-blog-prd.md` Section 3
- **证据**: PRD 只列出 `/`、`/posts`、`/tools`、`/about`、`/404`、`/rss.xml`。实际还有 `/ideas`、`/projects`、`/about/site`。
- **影响**: 产品规格文档与实际站点严重脱节。
- **修复**: 添加三个路由到路由表和页面规格。

---

## P1

### 3. CLAUDE.md 重定向表错误：`/ai/ideas` 应指向 `/ideas` 非 `/tools`
- **位置**: CLAUDE.md > 旧路由重定向表
- **证据**: CLAUDE.md 将 `/ai/ideas` 归入指向 `/tools` 的组。实际 `astro.config.mjs` 中 `/ai/ideas` 重定向到 `/ideas`。
- **修复**: 单独列出 `/ai/ideas → /ideas`。

### 4. CLAUDE.md 中 Base.astro 描述包含不存在的"环境粒子画布"
- **位置**: CLAUDE.md > 布局系统 > Base.astro
- **证据**: grep `env-particles` / `粒子画布` 在 `src/` 中零结果。实际有的是格线纹理背景、噪点叠加。
- **修复**: 改为"格线纹理背景"或"噪点纹理叠加"。

### 5. CLAUDE.md 未提及 `src/data/site-stats.json`
- **位置**: CLAUDE.md > 架构部分
- **证据**: 两个 about 页面都 import 此文件，含 costs/siteTimeline/personalTimeline/roadmap。
- **修复**: 新增"数据文件"小节。

### 6. PRD 导航表只有 4 项，实际有 6 项
- **位置**: `docs/walker-blog-prd.md` Section 4
- **证据**: PRD 列 Home/Thinking/Resources/About。实际 Navigation.astro 有 6 项（含 点子/项目）。
- **修复**: 添加点子和项目行。

### 7. PRD 首页组件描述过时
- **位置**: `docs/walker-blog-prd.md` Section 5.1
- **证据**: PRD 列 GreetingCard/BrandCard/RecentTraces/FeaturedTools。实际首页已重构为 HomeCanvas 接收所有数据。
- **修复**: 更新为实际组件结构。

### 8. PRD 客户端脚本列表过时
- **位置**: `docs/walker-blog-prd.md` Section 9
- **证据**: PRD 列 4 个脚本。实际 `src/scripts/` 有 7 个，缺 home-canvas.ts、with-lifecycle.ts、tilt-effect.ts。
- **修复**: 补全脚本列表。

### 9. 根目录 `doc-consistency.md` 是过时的旧报告（本文件已覆盖）
- **位置**: `doc-consistency.md`（根目录）— 已被本报告覆盖
- **证据**: 旧版 2026-05-17 的 gap 报告引用已删除的 `dockItem` 集合等已解决问题。
- **修复**: 已覆盖为新报告。

### 10. `docs/doc-consistency.md`（2026-05-26）也已过时
- **位置**: `docs/doc-consistency.md`
- **证据**: 声称"三页结构"，实际已有 6+ 页面。其中多个 P0 问题已被后续重构解决。
- **修复**: 归档或标注已解决项。

### 11. `docs/refactor-todo.md` 任务已完成但未标记
- **位置**: `docs/refactor-todo.md` T2/T5/T9/T11/T12
- **证据**: 全部已完成。T2 的函数名与实现略有不同（4 函数 vs 计划的 2 函数）。
- **修复**: 标记为已完成，或归档。

### 12. PRD 未记录 `community` 类型
- **位置**: `docs/walker-blog-prd.md` content types 部分
- **证据**: `content.config.ts` 有 5 种 type（含 community），PRD 只列 4 种。
- **修复**: 添加 `community`。

### 13. UI 图片生成计划引用已删除的路由
- **位置**: `docs/superpowers/plans/2026-05-17-ui-image-regeneration.md` 和 `docs/ui-image-generation/prompts.md`
- **证据**: 列出 `/ai/learn`、`/ai/toolkit`、`/explore` 等已变成 301 重定向的路由。缺失 `/ideas`、`/projects`、`/about/site`。
- **修复**: 重写路由清单。

### 14. 内容重组设计规格的导航标签与实际不同
- **位置**: `docs/superpowers/specs/2026-05-26-content-reorg-design.md`
- **证据**: 文档写"首页 | 工具 | 知识 | 关于"（4 项）。实际为"首页 | 思考 | 资源 | 点子 | 项目 | 关于"（6 项）。
- **修复**: 标注最终实现差异。

### 15. PRD 中 `/ai/ideas` 重定向到 `/ideas` 但 `/ideas` 未作为页面文档化
- **位置**: `docs/walker-blog-prd.md` 重定向表 + 页面规格
- **证据**: 重定向目标存在（`src/pages/ideas/index.astro`），但 PRD 无页面规格。
- **修复**: 添加 `/ideas` 页面规格。

### 16. APoSD 审核报告中多个发现已解决但未标注
- **位置**: `docs/aposd-review.md` Finding #3/#11/#13
- **证据**: #3（Navigation 拆分）已解决。#11（with-lifecycle.ts）已存在。
- **修复**: 标注解决状态。

---

## P2

### 17. CLAUDE.md 简化了 `/idea/*` 通配符重定向
- **位置**: CLAUDE.md > 旧路由重定向表
- **证据**: 实际有 8 条具体规则，至少 `/idea/ideas → /ideas` 和 `/idea/explore/:slug → /tools` 需单独标注。
- **修复**: 补充关键差异。

### 18. ArticleLayout 描述为"三栏"但实际是两栏 grid
- **位置**: CLAUDE.md > 布局系统 > ArticleLayout.astro
- **证据**: CSS grid 为两列。ArticleNav 通过 slot 注入 Navigation sidebar。
- **修复**: 改为"两栏布局（TOC + 正文），ArticleNav 通过 slot 注入导航侧边栏"。

### 19. Base.astro `theme` prop 类型与实际主题名不匹配
- **位置**: `src/layouts/Base.astro` line 17
- **证据**: prop 为 `'nature' | 'blue' | 'emerald' | 'charcoal'`，实际用 `nature | aurora | sunset | mint`。
- **修复**: 更新 Base.astro 类型定义。

### 20. CLAUDE.md 未记录 `ResourceCard.astro` 组件
- **位置**: CLAUDE.md > 核心组件
- **证据**: `src/components/ResourceCard.astro` 存在，被 `posts/[slug].astro` 使用。
- **修复**: 添加到组件列表。

### 21. Averia Gruesa Libre 非 Astro fontsource 自托管字体但未说明
- **位置**: CLAUDE.md > 图标与样式
- **证据**: global.css 覆盖使用 Averia Gruesa Libre，此字体不在自托管列表中。
- **修复**: 标注为外部依赖字体。

### 22. PRD 字体描述未提及 CSS 覆盖
- **位置**: `docs/walker-blog-prd.md` Section 7
- **修复**: 添加 CSS 覆盖说明。

### 23. 根目录无 README.md
- **位置**: 根目录
- **证据**: 克隆后无着陆页文档。
- **修复**: 创建简短 README.md。

### 24. `docs/README.md` 文档索引不完整
- **位置**: `docs/README.md`
- **证据**: 只列 2 个活跃文档，实际含 13+ 文件。
- **修复**: 更新索引。

### 25. `docs/dev/walker-blog-prd.md` 是完全复制
- **位置**: `docs/dev/walker-blog-prd.md`
- **证据**: 与 `docs/walker-blog-prd.md` 内容完全相同。
- **修复**: 删除重复。

### 26. 内容重组计划引用不存在的文件路径
- **位置**: `docs/superpowers/plans/2026-05-26-content-reorg.md` Task 9
- **证据**: 要求删除 `src/pages/idea/` 目录，该路径从未存在。
- **修复**: 标注计划已执行。

### 27. `docs/doc-consistency.md` 字体问题机制描述不准
- **位置**: `docs/doc-consistency.md` Issue #11
- **证据**: 说 Inter/Sora 未自托管，实际已加载只是被 CSS 覆盖。
- **修复**: 补充机制说明。

### 28. CLAUDE.md 未提及 about 页面的 JSON 数据驱动
- **位置**: CLAUDE.md > 路由结构
- **证据**: about/index.astro 和 about/site.astro 都 import site-stats.json。
- **修复**: 在路由描述中说明。

### 29. `plan-next-steps.md` 已完成但未归档
- **位置**: 根目录 `plan-next-steps.md`
- **证据**: A/B/C 组全部完成。
- **修复**: 归档或删除。

### 30. CLAUDE.md `buildPostPath` 函数需验证
- **位置**: CLAUDE.md > 辅助模块 > routes.ts
- **修复**: 验证签名是否正确。

### 31. CLAUDE.md `PLATFORM_ICON_MAP` 描述过简
- **位置**: CLAUDE.md > 辅助模块 > constants.ts
- **修复**: 补充说明。

### 32. 内容重组计划导航拆分已按不同方式实现
- **位置**: `docs/superpowers/plans/2026-05-26-content-reorg.md` T11
- **修复**: 标注已完成。

---

## P3

### 33. `justify-tags.ts` 导出两个函数但 CLAUDE.md 只提功能
- **位置**: CLAUDE.md > 客户端脚本
- **修复**: 可选补充 `watchJustifyTags`。

### 34. LikeCounter 描述准确但未提及客户端 script 上下文
- **位置**: CLAUDE.md > 核心组件 > LikeCounter
- **修复**: 可选补充。

### 35. `docs/media/execution-plan.md` 交叉引用路径正确（旧报告误报）
- **位置**: `docs/media/execution-plan.md` line 3
- **修复**: 无需修复。

---

## 修复优先级

```
P0（2 条）→ P1（14 条）→ P2（16 条）→ P3（3 条）
```

**最需要立即修复的：**
1. CLAUDE.md — 添加 `/about/site` 路由、`site-stats.json` 数据文件、修正重定向表和 Base.astro 描述
2. `docs/walker-blog-prd.md` — 路由表/导航/组件/脚本全面更新
3. 过时报告归档 — `docs/doc-consistency.md`、`docs/refactor-todo.md`、`plan-next-steps.md`
