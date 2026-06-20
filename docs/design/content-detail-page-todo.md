# 内容详情页改造 — 可执行 To-do

> **历史待办，不再直接执行（2026-06-20）**  
> 唯一执行入口是 `后台与内容详情页综合可执行-to-do.md`。本文件中的 localStorage 业务反馈降级、`src/_archive` 归档与强制独立 commit 已被综合方案取代。
>
> 配套方案：`content-detail-page-plan.md`
> 仅保留为历史拆解参考。

---

## A. 审查问题修复（立即执行）

> Phase 1 遗留问题。做完 build 验证一次。预计 30 分钟。

### A1 【高】TOC 自动滚动选择器过时

- **action**：`src/scripts/toc-highlight.ts:44` 把 `.ghost-toc-inner` 改成 `.toc-sidebar-inner`
- **surface**：`src/scripts/toc-highlight.ts`
- **proof**：build 通过；浏览器滚动文章，TOC 容器跟随滚动到活跃项
- **depends-on**：none
- **自行决定**：无

### A2 【高】删死代码 `.cs-layout` 和 `.toc-fab`

- **action**：`ContentShell.astro` 删两条
  - 第 245 行附近 `.cs-layout { padding: 0 1rem; }`
  - 第 334 行附近 `.toc-fab { bottom: 1rem; right: 1rem; }`
- **surface**：`src/layouts/ContentShell.astro`
- **proof**：build 0 error；浏览器视觉无变化
- **depends-on**：none
- **自行决定**：grep 确认这两个 class 在整个 src 下零引用再删

### A3 【中】魔法数字 `362px` 改 CSS 变量

- **action**：`ContentShell.astro` 顶部 `.reading-space` 加 `--cs-toc-offset: calc(var(--cs-width-normal) / 2 + 0.75rem);`，`.toc-sidebar` 和 `.toc-expand-btn` 的 `left: calc(50% + 362px)` 改 `left: calc(50% + var(--cs-toc-offset))`
- **surface**：`src/layouts/ContentShell.astro`
- **proof**：build 通过；浏览器 TOC 位置不变（视觉等价）
- **depends-on**：A2
- **自行决定**：保留 `0.75rem` 间距（不是注释里写的 1.5rem，以实际为准）

### A4 【中】DRY 折叠/展开逻辑

- **action**：`ContentShell.astro` 的 `initTocCollapse` 抽出 `setCollapsed(collapsed: boolean)` 函数，三处调用统一
- **surface**：`src/layouts/ContentShell.astro`
- **proof**：build 通过；折叠/展开/localStorage 记忆三态都正常
- **depends-on**：none
- **自行决定**：`setCollapsed` 同时管 classList + 两个 hidden + localStorage

### A5 【中】删未使用的 `BLOCK_WIDTH_STYLES`

- **action**：`src/knowledge/block-types.ts` 删 `BLOCK_WIDTH_STYLES` 常量（第 6-10 行），保留 `BlockWidth` 类型和 `BLOCK_WIDTHS` 数组
- **surface**：`src/knowledge/block-types.ts`
- **proof**：build 通过；grep 确认无引用
- **depends-on**：none
- **自行决定**：CSS 变量是宽度唯一真相源，TS 常量删掉

### A6 【低】`BlockDialogue` class 风格统一

- **action**：`BlockDialogue.astro:15-23` 把字符串插值的 class 改成 `class:list={[...]}`
- **surface**：`src/components/blocks/BlockDialogue.astro`
- **proof**：build 通过；浏览器对话气泡渲染不变
- **depends-on**：none

### A7 【低】注释修正

- **action**：`ContentShell.astro` 修正
  - 第 11 行 Phase 3 → Phase 2
  - 第 67 行 Phase 3 → Phase 2
  - 第 148-149 行间距注释：1.5rem → 0.75rem
- **surface**：`src/layouts/ContentShell.astro`
- **proof**：无功能影响
- **depends-on**：A3

### A 组验收

```bash
npm run build  # 0 errors
npm run dev    # 浏览器验证 TOC 滚动跟随 + 折叠/展开
```

---

## B. Phase 2 — 规模交付（A 组完成后启动）

> 目标：17 篇全走 ContentShell + 反馈带接 hit-rate + ArticleLayout 退役。

### B1 【前置】确认 hit-rate API 是否支持单条反馈

- **action**：读 `src/pages/api/admin/hit-rate.ts` 和 `src/pages/api/admin/brief.ts`，确认是否有接收单条用户反馈的 endpoint
- **surface**：API 层
- **proof**：明确"有/没有/需要新增"
- **depends-on**：none
- **自行决定**：
  - 如果有 → B2 直接用
  - 如果没有 → 新增 `POST /api/admin/content-feedback`，body: `{ slug, signal: 'useful'|'needs-more'|'outdated' }`，写入 hit-rate 数据源
  - 如果 hit-rate 只读统计不能写 → 反馈先存 localStorage，Phase 3 再接

### B2 `BlockLike.astro`

- **action**：从 `src/components/LikeCounter.astro` 收拢重命名为 `BlockLike.astro`，放 `src/components/blocks/`
- **surface**：`src/components/blocks/BlockLike.astro`
- **proof**：build 通过；点赞交互 + 粒子动画正常
- **depends-on**：none
- **自行决定**：保留 LikeCounter 原文件直到 B7 完成，避免引用断裂

### B3 `BlockFeedback.astro`

- **action**：新建 `BlockFeedback.astro`，三个按钮（有用/需补充/已过时），点击 POST 到 B1 确认的 endpoint
- **surface**：`src/components/blocks/BlockFeedback.astro` + API（按 B1 决定）
- **proof**：build 通过；点击后 reload，统计可见
- **depends-on**：B1
- **自行决定**：
  - 按钮用 form submit，不做客户端 JS 框架
  - localStorage 防重复提交（key: `walker-feedback:${slug}`）
  - 已提交后按钮变灰，显示"已反馈"

### B4 ContentShell 反馈带集成

- **action**：`ContentShell.astro` 的 `feedback` prop 默认改 `true`，反馈带槽位填入 `<BlockLike>` + `<BlockFeedback>`
- **surface**：`src/layouts/ContentShell.astro`
- **proof**：所有文章底部出现反馈带，点赞和有用吗可交互
- **depends-on**：B2, B3
- **自行决定**：`[slug].astro` 不传 feedback prop，用 ContentShell 默认值

### B5 16 篇 `.md` → `.mdx` 迁移

- **action**：`src/content/log/` 下除 `Codex入门.mdx` 外的所有 `.md` 改名 `.mdx`，不改内容
- **surface**：`src/content/log/*.md`
- **proof**：build 0 error；浏览器抽样 3 篇（取不同 form）视觉无退化
- **depends-on**：A 组完成
- **自行决定**：
  - 用 `git mv` 保留历史
  - 逐个改名，避免 Astro content collections 重复 slug 报错
  - 抽样：1 篇 knowledge（如 `渡论构建`）、1 篇 community（如 `平价AI社区`）、1 篇 learn（如 `CC入门`）

### B6 Pagefind 全量验证

- **action**：build 后用 Pagefind 搜索框测试 3 个关键词（来自不同文章），确认结果包含迁移后的文章
- **surface**：Pagefind 索引
- **proof**：搜索结果数量 ≥ 迁移前
- **depends-on**：B5

### B7 frontmatter `videos`/`resources` 字段清理

- **action**：
  1. grep 所有 17 篇 frontmatter 的 `videos:` 和 `resources:`，列出有值的
  2. 如果有值 → 迁移为 body 内 `BlockVideo`/`BlockResource`（Phase 3 再做的话标记 todo）
  3. 如果全空 → `src/content.config.ts` schema 标 `.optional()` 已有，加注释 deprecated
- **surface**：`src/content.config.ts`
- **proof**：build 无 warning
- **depends-on**：B5
- **自行决定**：
  - 如果有文章用了 `videos` 字段，先不删字段，只在 body 补 `BlockVideo`，让两套并存直到 Phase 3
  - 删字段是 Phase 3 的事，Phase 2 只标记

### B8 `ArticleLayout` 退役

- **action**：grep 确认 `src/layouts/ArticleLayout.astro` 零引用后，移到 `docs/archive/` 或直接删
- **surface**：`src/layouts/ArticleLayout.astro`
- **proof**：build 0 error
- **depends-on**：B4, B5
- **自行决定**：移到 `src/_archive/` 而不是删，保留一周再清理

### B 组验收

```bash
npm run build  # 0 errors
npm run dev    # 17 篇抽样验证 + 反馈带交互 + Pagefind 搜索
```

---

## C. Phase 3 — 杠杆加速（B 组完成后启动）

> 目标：块类型扩展，作者能自由组合内容形态。

### C1 `BlockCallout.astro`

- **action**：新建高亮提示块，props: `type: 'note'|'warning'|'quote'`，`width?: BlockWidth`（默认 normal）
- **surface**：`src/components/blocks/BlockCallout.astro`
- **proof**：在 Codex入门.mdx 插入测试，build + 浏览器验证
- **depends-on**：B 组完成
- **自行决定**：
  - note → 蓝色左边框
  - warning → 橙色
  - quote → 灰色斜体

### C2 `BlockResource.astro`

- **action**：新建资源链接块，props: `name, url, type: 'tool'|'feishu'|'github'|'website'|'download', description?`，`width?: BlockWidth`（默认 normal）
- **surface**：`src/components/blocks/BlockResource.astro`
- **proof**：同上
- **depends-on**：B 组完成
- **自行决定**：复用现有 `ResourceCard.astro` 的视觉

### C3 `BlockStep.astro`

- **action**：新建步骤块，props: `step: number, title: string`，`width?: BlockWidth`（默认 normal）
- **surface**：`src/components/blocks/BlockStep.astro`
- **proof**：同上
- **depends-on**：B 组完成
- **自行决定**：
  - 编号大字 + 标题
  - 不做"完成态"checkbox（YAGNI，教程作者不需要）

### C4 新块在新文章中使用

- **action**：写一篇新 `.mdx`，至少使用 C1/C2/C3 中的一个
- **surface**：`src/content/log/*.mdx`
- **proof**：文章发布后阅读体验包含结构化块
- **depends-on**：C1, C2, C3

### C5 frontmatter `videos`/`resources` 字段彻底删除

- **action**：B7 标记 deprecated 后，确认所有文章已迁移到 body 块，从 `content.config.ts` schema 删除字段
- **surface**：`src/content.config.ts`
- **proof**：build 0 error
- **depends-on**：B7, C2

---

## 执行规则

1. **每个任务独立 commit**，message 格式 `feat(content): A1 fix toc selector` / `refactor(content): A3 extract toc offset var`
2. **A 组一次性做完**再 build 验证，不逐个验证
3. **B 组每个任务 build 一次**，因为涉及功能改动
4. **C 组按需做**，不强制顺序
5. **遇到不在自行决定栏的问题**：停下来问，不猜

## 时间盒

| 组 | 预计 | 触发停止 |
|----|------|---------|
| A | 30 分钟 | build 报错超过 3 次无法定位 |
| B | 半天 | 反馈带 API 链路超过 1 天未通 |
| C | 按需 | 单个块组件超过 2 小时未完成 |
