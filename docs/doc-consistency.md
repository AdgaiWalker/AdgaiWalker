# 文档一致性审核报告

**审核日期**: 2026-05-26
**审核范围**: CLAUDE.md、docs/ 目录全部文档 vs 实际代码实现
**审核方法**: 三路并行 — CLAUDE.md 正向检查、docs/ 正向检查、代码反向检查

---

## 审核结论

- **结论**: **不通过**
- **汇总**: P0: 6 | P1: 9 | P2: 14 | P3: 4 | 待补充: 2
- **修复优先级**: P0 → P1 → P2 → P3
- **核心发现**: 站点已从多入口结构（/ai/*、/explore/*、/life/*）简化为三页结构（/posts、/tools、/about），但 CLAUDE.md 和 PRD 仍描述重构前架构。此外 `src/pages/tools.astro` 是遗留文件，引用已删除的 `dockItem` 集合，可能导致构建失败。

---

## P0 — 安全问题 / 严重误导

### 1. `dockItem` 集合在文档中描述但不存在
- **位置**: `CLAUDE.md:33`
- **证据**:
  - 文档: "在 `src/content.config.ts` 中定义两个集合" … "`dockItem`：AI 探索资源条目，来源 `src/content/dock/`"
  - 代码: `src/content.config.ts:42` 仅导出 `{ log }`，无 `dockItem`。`src/content/dock/` 目录为空
- **影响**: `tools.astro` 调用 `getCollection('dockItem')` 会返回空数组或构建失败
- **建议**: 从 CLAUDE.md 移除 `dockItem` 描述，或在 content.config.ts 中重新添加集合定义
- **关联原则**: 以代码为真

### 2. `DockLayout.astro` 列为五大布局之一但不存在
- **位置**: `CLAUDE.md:42`
- **证据**:
  - 文档: "4. **`DockLayout.astro`**：`/explore` 和 `/explore/[slug]` 的主从布局"
  - 代码: `src/layouts/` 仅包含 `Base.astro`、`SidebarLayout.astro`、`ArticleLayout.astro`、`FullscreenLayout.astro`
- **影响**: 文档描述了一个不存在的布局，误导架构理解
- **建议**: 移除 `DockLayout.astro` 条目
- **关联原则**: 以代码为真

### 3. 路由表约一半条目对应不存在的页面
- **位置**: `CLAUDE.md:52-64`
- **证据**:
  - 文档列出不存在的路由: `/ai/[slug]`、`/ai/learn`、`/ai/sources`、`/ai/toolkit`、`/ai/ideas`、`/explore`、`/explore/[slug]`、`/life/[slug]`
  - 代码 `src/pages/`: 实际页面为 `index.astro`、`about.astro`、`404.astro`、`posts/index.astro`、`posts/[slug].astro`、`tools.astro`、`tools/index.astro`、`rss.xml.ts`
- **影响**: 路由表严重失实
- **建议**: 完全重写路由表，仅保留实际存在的页面和重定向条目
- **关联原则**: 以代码为真

### 4. `/tools` 和 `/tools/index` 两个活跃页面未记录
- **位置**: `CLAUDE.md:46-64`（路由表缺失）
- **证据**:
  - 代码: `src/pages/tools.astro`（Base 布局）和 `src/pages/tools/index.astro`（SidebarLayout）均存在
  - 文档: 路由表中无 `/tools` 和 `/tools/index` 条目
- **影响**: 两个活跃页面完全未文档化
- **建议**: 添加 `/tools` 和 `/tools/index` 到路由表
- **关联原则**: 以代码为真

### 5. `src/pages/tools.astro` 引用不存在的 `dockItem` 集合（构建隐患）
- **位置**: `src/pages/tools.astro:10`
- **证据**:
  - 代码: `const allDockItems = await getCollection('dockItem', ({ data }) => data.published)`
  - 代码: `src/content.config.ts` 无 `dockItem` 集合定义
- **影响**: 构建时返回空数组，工具页面无内容；且 `tools.astro` 会屏蔽正常工作的 `tools/index.astro`
- **建议**: 删除 `src/pages/tools.astro`（遗留文件），让 `/tools` 路由到 `tools/index.astro`
- **关联原则**: 安全默认收紧

### 6. PRD (walker-blog-prd.md) 核心路由和数据模型全部过时
- **位置**: `docs/walker-blog-prd.md:52-76`（Section 3 路由）、`docs/walker-blog-prd.md:229-268`（Section 6 数据模型）
- **证据**:
  - 文档: `type` 为 `'article' | 'thought' | 'photo' | 'project' | 'idea'`，存在 `dockItem` 集合
  - 代码: `type` 为 `z.enum(['knowledge', 'tool', 'idea', 'project'])`，无 `dockItem`
- **影响**: 开发者按 PRD 创建内容会使用错误的 type 值
- **建议**: 重写 PRD 以匹配重组后的路由和数据结构
- **关联原则**: 合同优先

---

## P1 — 核心功能不一致

### 7. `/ai` 重定向到 `/tools` 而非文档所述的 `/posts`
- **位置**: `CLAUDE.md:52`
- **证据**:
  - 文档: "`/ai` | 重定向到 `/posts`"
  - 代码: `astro.config.mjs:61` → `'/ai': { status: 301, destination: '/tools' }`
- **影响**: 重定向目标记录错误
- **建议**: 更正为 `/ai → /tools`
- **关联原则**: 以代码为真

### 8. `log` Schema 存在 5 个未记录的字段
- **位置**: `CLAUDE.md:32`
- **证据**:
  - 文档: 仅列出 `title`、`date`、`tags`、`category`、`type`、`published`、`summary`、`description`、`cover`、`videos`、`resources`
  - 代码: schema 还包含 `status`（枚举: thinking/practicing/verified/archived）、`rating`（1-5）、`url`、`qrCode`、`communities`（对象数组）
- **影响**: 内容创作者不知道这些字段的存在
- **建议**: 添加所有缺失字段到文档
- **关联原则**: 合同优先

### 9. `type` 字段枚举值未完整记录
- **位置**: `CLAUDE.md:32`
- **证据**:
  - 文档: 仅提及 `type` 字段存在，未列出允许值
  - 代码: `z.enum(['knowledge', 'tool', 'idea', 'project'])`
- **影响**: 开发者无法确定有效的 type 值
- **建议**: 在文档中列出完整的 type 枚举值
- **关联原则**: 合同优先

### 10. 仅存在一个 RSS 源，文档声称三个
- **位置**: `CLAUDE.md:64`
- **证据**:
  - 文档: "`/rss.xml`、`/ai/rss.xml`、`/life/rss.xml` | RSS 订阅源"
  - 代码: 仅 `src/pages/rss.xml.ts` 存在
- **影响**: `/ai/rss.xml` 和 `/life/rss.xml` 返回 404
- **建议**: 仅保留 `/rss.xml`
- **关联原则**: 以代码为真

### 11. 字体实际为 Averia Gruesa Libre / Outfit，而非文档所述的 Inter / Sora
- **位置**: `CLAUDE.md:81-82`
- **证据**:
  - 文档: "字体通过 Astro Fonts API + fontsource provider 自托管：Inter、Sora、JetBrains Mono、Noto Sans SC"
  - 代码: `src/styles/global.css` 覆盖 `--font-heading: 'Averia Gruesa Libre', 'Outfit'...`、`--font-body: 'Outfit'...`
- **影响**: 实际字体与文档描述不符
- **建议**: 更新文档反映实际字体：Averia Gruesa Libre / Outfit / JetBrains Mono / Noto Sans SC
- **关联原则**: 以代码为真

### 12. SidebarLayout 描述的使用页面全部为重定向
- **位置**: `CLAUDE.md:40`
- **证据**:
  - 文档: "用于 `/posts`、`/ai/learn`、`/ai/sources`、`/ai/ideas` 等列表型页面"
  - 代码: `/ai/learn`、`/ai/sources`、`/ai/ideas` 均为 301 重定向。实际使用 SidebarLayout 的是 `/posts` 和 `/tools/index`
- **影响**: 布局使用范围描述错误
- **建议**: 更新为 "用于 `/posts`、`/tools`"
- **关联原则**: 以代码为真

### 13. `src/pages/tools.astro` 与 `tools/index.astro` 路由冲突
- **位置**: `src/pages/tools.astro` 和 `src/pages/tools/index.astro`
- **证据**:
  - 代码: 两个文件同时存在。Astro 优先使用 `tools.astro`，但该文件引用已删除的 `dockItem` 集合。`tools/index.astro` 正确引用 `log` 集合
- **影响**: 活跃页面是损坏的 `tools.astro`，掩盖了正常工作的 `tools/index.astro`
- **建议**: 删除 `src/pages/tools.astro`
- **关联原则**: 安全默认收紧

### 14. PRD 导航表与实际代码完全不符
- **位置**: `docs/walker-blog-prd.md:86-95`
- **证据**:
  - 文档: 文章(`/posts`)、AI 探索(`/explore`)、学习(`/ai/learn`)、Idea(`/ai/ideas`)
  - 代码: 首页(`/`)、思考(`/posts`)、资源(`/tools`)、关于(`/about`)
- **影响**: PRD 导航规格与实现完全不同
- **建议**: 重写 PRD Section 4
- **关联原则**: 以代码为真

### 15. PRD 首页组件列表约 50% 不正确
- **位置**: `docs/walker-blog-prd.md:103-112`
- **证据**:
  - 文档: 列出 `WalkerProfile`、`RandomRecommend`、`NavigationConsole`、`CalendarWidget`、`MusicPlayer`、`LikeCounter`
  - 代码: `index.astro` 实际使用 `GreetingCard`、`BrandCard`、`RecentTraces`、`DockShowcase`。`BrandCard` 未在 PRD 中提及
- **影响**: PRD 首页规格与实现严重脱节
- **建议**: 重写 Section 5.1
- **关联原则**: 以代码为真

---

## P2 — 示例不完整 / 命名不一致

### 16. `ambient.ts` 描述为首页背景动画但未被任何页面导入
- **位置**: `CLAUDE.md:88`
- **证据**:
  - 文档: "`ambient.ts`：首页背景 Canvas 粒子动画"
  - 代码: `src/pages/index.astro` 未导入 `ambient.ts`，首页动画由内联脚本处理
- **影响**: 文档描述了死代码功能
- **建议**: 从文档移除或标注为遗留脚本

### 17. `column-resize.ts` 描述为 DockLayout 和工具箱使用但未被任何页面导入
- **位置**: `CLAUDE.md:92`
- **证据**:
  - 文档: "`column-resize.ts`：DockLayout 和工具箱页面列宽调整"
  - 代码: `DockLayout` 不存在，`tools.astro` 未导入此脚本
- **影响**: 文档描述了未使用的功能
- **建议**: 移除此条目

### 18. 14 个组件存在但未在核心组件中列出
- **位置**: `CLAUDE.md:68-76`（核心组件部分）
- **证据**:
  - 文档列出 12 个组件，代码中 `src/components/` 有 26 个组件文件
  - 未记录: `BilibiliVideo`、`DialogueBubble`、`PromptBlock`、`ResourceCard`、`GreetingCard`、`MusicPlayer`、`NavigationConsole`、`PolaroidWidget`、`WriteArticlePill`、`BrandCard`、`CalendarWidget`、`WalkerProfile` 等
- **影响**: 超半数组件未文档化
- **建议**: 补充所有活跃组件或注明列表非详尽

### 19. `src/lib/routes.ts` 和 `src/data/toolkit-notes.ts` 未记录
- **位置**: `CLAUDE.md`（架构部分缺失）
- **证据**:
  - 代码: `routes.ts` 定义路由常量（`POSTS`、`TOOLS`、`postSlug`），被 Navigation 和 RSS 使用。`toolkit-notes.ts` 为工具页面提供内容
  - 文档: `src/lib/` 和 `src/data/` 目录未被提及
- **影响**: 关键架构模块未文档化
- **建议**: 添加路由常量和数据文件的说明

### 20. `Navigation.astro` 双模式渲染未记录
- **位置**: `CLAUDE.md:68`
- **证据**:
  - 文档: "常驻左侧导航栏，桌面端可折叠，移动端为顶部栏"
  - 代码: 首页 (`isHome`) 渲染全宽顶部栏+胶囊导航，内页渲染左侧边栏。含主题切换按钮
- **影响**: Navigation 的核心行为未准确描述
- **建议**: 更新描述，提及双模式渲染和主题切换

### 21. `shikiConfig` 配置未记录
- **位置**: `CLAUDE.md`（渲染与部署部分缺失）
- **证据**:
  - 代码: `astro.config.mjs` 配置 `shikiConfig: { theme: 'github-dark' }`
  - 文档: 未提及语法高亮配置
- **影响**: 配置透明度不足
- **建议**: 添加一行说明

### 22. Supabase 点赞所需环境变量未记录
- **位置**: `CLAUDE.md:7`（项目概述提及 Supabase 点赞）
- **证据**:
  - 代码: `LikeCounter.astro` 读取 `PUBLIC_SUPABASE_URL` 和 `PUBLIC_SUPABASE_ANON_KEY`，缺失时回退硬编码计数
- **影响**: 开发者无法正确配置点赞功能
- **建议**: 记录所需环境变量

### 23. `nav-extension` slot 归属描述不准确
- **位置**: `CLAUDE.md:68`
- **证据**:
  - 文档: "包含搜索触发器和 `nav-extension` slot"
  - 代码: `nav-extension` slot 定义在 `Base.astro:77`，通过 `<Navigation><slot name="nav-extension" /></Navigation>` 传递
- **影响**: slot 归属可能导致混淆
- **建议**: 澄清 slot 通过 Base.astro 传递

### 24. PRD Section 10 状态与实现不符
- **位置**: `docs/walker-blog-prd.md:329-355`
- **证据**:
  - 文档: 列出 `/ai/learn`、`/ai/toolkit`、`/explore` 等为"已完成"，待办含"评估迁移 `dockItem`"
  - 代码: 这些页面已全部删除，`dockItem` 已移除
- **影响**: 状态部分完全过时
- **建议**: 更新为重组后的状态

### 25. UI 图像生成文档引用旧路由
- **位置**: `docs/ui-image-generation/routes.json`、`docs/ui-image-generation/prompts.md`
- **证据**:
  - 文档: 列出 11 个路由含 `/ai/learn`、`/ai/toolkit`、`/explore` 等
  - 代码: 这些路由均已 301 重定向
- **影响**: 重新生成工作流会失败
- **建议**: 更新为当前路由

### 26. 内容重组计划的导航标签与实际代码不同
- **位置**: `docs/superpowers/plans/2026-05-26-content-reorg.md:312-323`
- **证据**:
  - 文档: 首页、知识(Knowledge)、工具(Tools & Ideas)、关于
  - 代码: 首页、思考(Thinking)、资源(Resources)、关于
- **影响**: 计划与实现使用了不同的标签措辞
- **建议**: 更新计划或代码以保持一致

### 27. `tools.astro` 使用 Emoji 作为语义图标（违反 PRD 规范）
- **位置**: `src/pages/tools.astro:125-227`
- **证据**:
  - 代码: 使用 "🧠 主力模型分工"、"🧭 极客工作流装备" 等 Emoji 标题
  - 文档: PRD 规定 "图标使用 Lucide。不用 Emoji 承担界面语义"
- **影响**: 遗留页面违反设计规范
- **建议**: 删除 `tools.astro`（如 #5 建议）

### 28. `SearchModal.astro` 仍使用内联 SVG 图标
- **位置**: `src/components/SearchModal.astro:23-26, 42-45, 209`
- **证据**:
  - 代码: 默认搜索按钮、搜索输入图标和结果箭头使用内联 `<svg>`
  - 文档: CLAUDE.md 声称 "图标统一使用 `astro-icon` + `@iconify-json/lucide`"
- **影响**: 图标来源不一致
- **建议**: 替换为 Lucide 图标组件

### 29. `docs/README.md` 不完整
- **位置**: `docs/README.md:1-5`
- **证据**:
  - 文档: 声称"此目录只保留长期有效的项目文档"并列出 `walker-blog-prd.md`
  - 代码: `docs/` 包含 15+ 额外文件，含过时的 gap 报告和旧 UI 图片
- **影响**: docs README 不反映实际目录内容
- **建议**: 更新 README 列出所有文档及其状态

---

## P3 — 措辞 / 格式 / 链接小问题

### 30. `ArticleNav` 视图名称不一致
- **位置**: `CLAUDE.md:70`
- **证据**:
  - 文档: "支持列表/卡片视图"
  - 代码: `ArticleNav.astro` 注释为 "支持文字/卡片两种视图"
- **影响**: 措辞差异，含义相似
- **建议**: 统一为 "文字/卡片视图"

### 31. `@chenglou/pretext` 依赖用途不明且未记录
- **位置**: `package.json:19`
- **证据**:
  - 代码: `"@chenglou/pretext": "^0.0.7"` 列在 dependencies 中
  - 文档: 未提及
- **影响**: 用途不明
- **建议**: 记录用途或移除

### 32. `docs/media/execution-plan.md` 交叉引用路径错误
- **位置**: `docs/media/execution-plan.md:3`
- **证据**:
  - 文档: 引用 `docs/iwalkpro-media-plan.md`
  - 代码: 实际文件在 `docs/media/iwalkpro-media-plan.md`
- **影响**: 链接失效
- **建议**: 修正为正确路径

### 33. 内容重组计划引用不存在的页面
- **位置**: `docs/superpowers/plans/2026-05-26-content-reorg.md:655-671`
- **证据**:
  - 文档: "删除 `src/pages/idea/` 目录"
  - 代码: `src/pages/idea/` 从未存在
- **影响**: 计划步骤与实际状态不符
- **建议**: 标注为历史记录

---

## 待证据补充

### 34. PRD 和代码中 `videos.platform` 的枚举值是否完全匹配
- **位置**: `CLAUDE.md:32`
- **证据**:
  - 文档: 列出 `bilibili`、`douyin`、`xiaohongshu`、`youtube`、`github`、`zhihu`
  - 代码: 需进一步确认 content.config.ts 中的实际枚举值是否完全一致
- **影响**: 不确定
- **建议**: 需进一步调查

### 35. `src/components/CategoryPanel.astro` 引用了 `DockLayout`
- **位置**: `src/components/CategoryPanel.astro`
- **证据**:
  - 代码: 组件可能引用 DockLayout 相关类型或接口
  - 文档: `CategoryPanel` 在核心组件中列出
- **影响**: 不确定，需验证是否为死代码
- **建议**: 需进一步调查

---

## 修复优先级建议

1. **立即修复 (P0)**:
   - 删除 `src/pages/tools.astro`（遗留文件，修复路由冲突和 dockItem 引用）
   - 重写 CLAUDE.md 路由表
   - 移除 `DockLayout.astro` 和 `dockItem` 集合的文档描述
   - 添加 `/tools` 和 `/tools/index` 到路由表

2. **尽快修复 (P1)**:
   - 更正 `/ai` 重定向目标为 `/tools`
   - 补充 `log` Schema 缺失字段
   - 修正字体描述
   - 更正 RSS 源数量
   - 更新 SidebarLayout 使用列表

3. **计划修复 (P2)**:
   - 清理未使用的脚本文档
   - 补充缺失组件
   - 更新或归档 PRD 和 gap 报告

4. **低优先级 (P3)**:
   - 修正措辞和链接
