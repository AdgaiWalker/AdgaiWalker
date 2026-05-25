# Walker 博客 PRD 与实际代码差距报告

> 审核时间：2026-05-17  
> 目标文件：`docs/walker-blog-prd.md`  
> 实际代码范围：`src/`、`astro.config.mjs`、`package.json`、`src/content/**`  
> 审核原则：以实际代码为准，目标文件作为产品目标与验收基准。

## 审核结论

- **结论**：有条件通过
- **汇总**：P0:0 P1:1 P2:4 P3:1 待证据补充:0
- **主要风险**：首页搜索承诺与实际代码不一致，用户按 PRD 使用首页搜索会失败。
- **修复优先级**：先修首页搜索，再处理 Lucide/Emoji 规范和内容分类/内容缺口。

## 差距清单

### 首页搜索入口与 Cmd/Ctrl + K 实际不可用

- **严重级别**：P1
- **位置**：`docs/walker-blog-prd.md:116`
- **目标描述**：首页要求“支持搜索和 `Cmd/Ctrl + K`”。
- **代码证据**：
  - `src/pages/index.astro:48` 只有 `id="search-trigger"` 的按钮。
  - `src/pages/index.astro:267-270` 快捷键逻辑只查找 `#search-modal` 并切换 hidden。
  - `src/layouts/Base.astro:86-89` 首页 `isHome` 时不渲染 `Navigation`。
  - `src/components/Navigation.astro:2` 和 `src/components/Navigation.astro:31-33` 显示 `SearchModal` 只挂在 `Navigation` 内。
- **实际差距**：首页没有渲染 `SearchModal`，`search-trigger` 也没有点击监听；因此首页按钮和快捷键都找不到可打开的搜索弹层。
- **影响**：核心首页交互按 PRD 操作会失败，且 Pagefind 搜索无法从首页进入。
- **建议**：在首页或 `Base.astro` 首页分支显式渲染 `SearchModal`，并为 `#search-trigger` 绑定打开逻辑；最好复用 `SearchModal.astro` 的打开事件，避免首页和内页搜索逻辑分叉。

### `/ai/toolkit` 使用 Emoji 承担分区语义

- **严重级别**：P2
- **位置**：`docs/walker-blog-prd.md:35-36`、`docs/walker-blog-prd.md:370`
- **目标描述**：图标使用 Lucide，不用 Emoji 承担界面语义；新增图标使用 Lucide。
- **代码证据**：
  - `src/pages/ai/toolkit.astro:62` 使用 `🧠`。
  - `src/pages/ai/toolkit.astro:72` 使用 `🛠️`。
  - `src/pages/ai/toolkit.astro:94` 使用 `✨`。
  - `src/pages/ai/toolkit.astro:116` 使用 `🧭`。
  - `src/pages/ai/toolkit.astro:126` 使用 `💸`。
  - `src/pages/ai/toolkit.astro:136` 使用 `📌`。
- **实际差距**：工具箱页的核心分区标题仍依赖 Emoji 表达语义。
- **影响**：违反 PRD 的图标系统约束，也会让界面语义来源不统一。
- **建议**：替换为 `astro-icon` 的 Lucide 图标，例如 `brain`、`wrench`、`sparkles`、`compass`、`badge-dollar-sign`、`pin`。

### 搜索弹层仍包含手写 SVG 图标

- **严重级别**：P2
- **位置**：`docs/walker-blog-prd.md:35`、`docs/walker-blog-prd.md:370`
- **目标描述**：图标使用 Lucide。
- **代码证据**：
  - `src/components/SearchModal.astro:2` 已引入 `Icon`。
  - `src/components/SearchModal.astro:15` 只有 `iconOnly` 分支使用 `lucide:search`。
  - `src/components/SearchModal.astro:23` 默认搜索按钮仍是内联 `<svg>`。
  - `src/components/SearchModal.astro:42` 输入框左侧仍是内联 `<svg>`。
  - `src/components/SearchModal.astro:209` 搜索结果箭头仍是内联 `<svg>`。
- **实际差距**：同一组件内同时存在 Lucide 和手写 SVG，未完全符合统一图标规范。
- **影响**：图标来源不一致，后续主题、尺寸、可维护性都更难统一。
- **建议**：将三处内联 SVG 替换为 `Icon name="lucide:search"` 和 `Icon name="lucide:arrow-right"`。

### `/explore` 空状态使用 Emoji 提示

- **严重级别**：P3
- **位置**：`docs/walker-blog-prd.md:35-36`
- **目标描述**：不用 Emoji 承担界面语义。
- **代码证据**：`src/pages/explore/index.astro:18` 文案为 `👈 请在左侧列表中选择一项查看详情。`
- **实际差距**：空状态提示使用 Emoji 作为方向提示。
- **影响**：轻微违反界面语义规范，但不阻断功能。
- **建议**：用 Lucide `arrow-left` 或调整文案为“请在左侧列表中选择一项查看详情”。

### `/ai/ideas` 没有真实 `type: idea` 内容

- **严重级别**：P2
- **位置**：`docs/walker-blog-prd.md:194`、`docs/walker-blog-prd.md:351`
- **目标描述**：PRD 已记录“真实 `type: idea` 内容不足”，待办要求补真实 Idea 内容。
- **代码证据**：
  - `src/pages/ai/ideas.astro:14` 只展示 `data.category === 'ai' && data.type === 'idea'` 的内容。
  - `src/pages/ai/ideas.astro:89-91` 无内容时展示“暂无 Idea，敬请期待”。
  - `src/content/log/*` 当前未检索到 `type: idea` frontmatter。
- **实际差距**：Schema 和页面已经准备好，但内容集合中没有公开 Idea 条目，页面会落入空状态。
- **影响**：`/ai/ideas` 作为导航入口存在，但用户进入后看不到实际内容。
- **建议**：新增至少 2-3 篇 `category: ai`、`type: idea`、带 `status` 和 `claimInfo` 的内容，或在 PRD 中把当前阶段标为“功能可用，内容待补”。

### `dockItem` 分类迁移仍未完成

- **严重级别**：P2
- **位置**：`docs/walker-blog-prd.md:271-272`
- **目标描述**：`design-review-skill.md` 应评估迁移为 `skill`，`aigc-wechat.md` 应评估迁移为 `community`。
- **代码证据**：
  - `src/content/dock/design-review-skill.md:4` 当前仍是 `category: info-source`。
  - `src/content/dock/aigc-wechat.md:4` 当前仍是 `category: info-source`。
  - `src/pages/ai/toolkit.astro:11-16` 工具箱只收 `tool` 和 `skill`。
  - `src/pages/ai/sources.astro:8` 信息源页收 `info-source` 和 `community`。
- **实际差距**：PRD 已点名的分类评估尚未落地；`design-review-skill` 仍不会出现在工具箱 Skill 分区，交流群也仍以信息源分类展示。
- **影响**：资源被分流到不完全匹配的页面，用户从“工具箱/Skill”路径找不到 design-review skill。
- **建议**：如果语义确认无误，将 `design-review-skill.md` 改为 `category: skill`，将 `aigc-wechat.md` 改为 `category: community`；若暂不迁移，应在 PRD 中写明保留理由。

## 已对齐项

- `/ai` 与 `/life` 重定向已在 `astro.config.mjs:44-47` 实现。
- 旧文章 URL `/ai/[slug]`、`/life/[slug]` 已分别在 `src/pages/ai/[slug].astro` 和 `src/pages/life/[slug].astro` 以 301 跳转到 `/posts/[slug]`。
- `log` 与 `dockItem` 的核心 Schema 与 PRD 数据模型基本一致，见 `src/content.config.ts`。
- `/posts`、`/posts/[slug]`、`/ai/learn`、`/ai/sources`、`/ai/toolkit`、`/explore`、`/about`、`/404` 的页面文件均存在，并使用了 PRD 指定或等价的布局。

## 建议修复顺序

1. 修复首页搜索：渲染 `SearchModal`，绑定首页搜索按钮，统一快捷键逻辑。
2. 替换 `/ai/toolkit` 和 `/explore` 的 Emoji 语义提示为 Lucide。
3. 清理 `SearchModal.astro` 中的内联 SVG。
4. 决定并执行 `dockItem` 分类迁移。
5. 补充真实 Idea 内容，或调整 PRD 对 `/ai/ideas` 当前阶段的表述。

