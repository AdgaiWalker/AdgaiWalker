# 命名重构执行清单

> 来源：全项目命名审查，2026-05-26
> 分支：`codex/refactor-todo`

---

## 优先级说明

| 等级 | 含义 | 验收标准 |
|------|------|----------|
| **P0** | 删死代码，零风险 | 文件删除，构建通过 |
| **P1** | 基础函数重命名，多文件影响 | 所有引用点更新，构建通过 |
| **P2** | 文件重命名/移动，组件级影响 | 导入路径更新，构建通过 |
| **P3** | 去重/小修，降低维护负担 | 逻辑不变，构建通过 |

---

## P0 — 删除死代码（零风险，先清理噪音）

### 0.1 删除 `src/components/NavigationConsole.astro`
- **原因**：数字时钟组件，无任何文件引用
- **影响**：无
- **验收**：文件删除，`npm run build` 通过

### 0.2 删除 `src/components/DockItemCard.astro`
- **原因**：工具卡片组件，无任何文件引用
- **影响**：无
- **验收**：文件删除，`npm run build` 通过

### 0.3 删除 `src/components/WriteArticlePill.astro`
- **原因**：首页控制按钮组件，无任何文件引用
- **影响**：无
- **验收**：文件删除，`npm run build` 通过

### 0.4 删除 `src/data/toolkit-notes.ts`
- **原因**：导出 `aiModelNotes`/`workflowNotes`/`savingNotes`，无任何文件引用
- **影响**：无。若 `src/data/` 目录清空，一并删除目录
- **验收**：文件/目录删除，`npm run build` 通过

### 0.5 删除 `src/utils/formats.ts`
- **原因**：导出 `FORMAT_LABELS`/`FORMAT_ICONS`，无任何文件引用。且与 `src/lib/format.ts` 名字易混淆
- **影响**：无。若 `src/utils/` 目录清空，一并删除目录
- **验收**：文件/目录删除，`npm run build` 通过

### 0.6 删除 `glow-gold` CSS 规则
- **位置**：`src/styles/global.css` 约第 441 行
- **原因**：定义了但无任何模板使用，且颜色值与 `glow-cyan` 完全相同（不是金色）
- **影响**：无
- **验收**：规则删除，`npm run build` 通过

### P0 验收检查
```bash
npm run build
```
全部 P0 完成后构建必须通过，无任何报错。

---

## P1 — 基础函数重命名（多文件影响）

### 1.1 `getPublishedTools()` → `getPublishedResources()`
- **定义**：`src/lib/content.ts:9`
- **引用点**（3 处）：
  - `src/pages/tools/index.astro:3` — import
  - `src/pages/tools/index.astro:8` — 调用
  - `src/pages/index.astro:7` — import
  - `src/pages/index.astro:12` — 调用
- **步骤**：
  1. 修改 `src/lib/content.ts` 函数名
  2. 更新 `src/pages/tools/index.astro` import 和调用
  3. 更新 `src/pages/index.astro` import 和调用
- **验收**：全局搜索 `getPublishedTools` 无残留，构建通过

### 1.2 `formatDateShort` → `formatDateCompact`
- **定义**：`src/lib/format.ts:1`
- **引用点**（2 处）：
  - `src/pages/posts/index.astro:5` — import
  - `src/pages/posts/index.astro:67` — 调用
  - `src/components/RecentTraces.astro:8` — import
  - `src/components/RecentTraces.astro:68` — 调用
- **步骤**：
  1. 修改 `src/lib/format.ts` 函数名
  2. 更新 `src/pages/posts/index.astro` import 和调用
  3. 更新 `src/components/RecentTraces.astro` import 和调用
- **验收**：全局搜索 `formatDateShort` 无残留，构建通过

### 1.3 `formatDateLong` → `formatDateLocale`
- **定义**：`src/lib/format.ts:7`
- **引用点**（1 处）：
  - `src/pages/posts/[slug].astro:14` — import
  - `src/pages/posts/[slug].astro:83` — 调用
- **步骤**：
  1. 修改 `src/lib/format.ts` 函数名
  2. 更新 `src/pages/posts/[slug].astro` import 和调用
- **验收**：全局搜索 `formatDateLong` 无残留，构建通过

### 1.4 `formatDateFull` → `formatDateNumeric`
- **定义**：`src/lib/format.ts:15`
- **引用点**（1 处）：
  - `src/components/RecentTraces.astro:8` — import
  - `src/components/RecentTraces.astro:58` — 调用
- **步骤**：
  1. 修改 `src/lib/format.ts` 函数名
  2. 更新 `src/components/RecentTraces.astro` import 和调用
- **验收**：全局搜索 `formatDateFull` 无残留，构建通过

### 1.5 `postSlug()` → `buildPostPath()`
- **定义**：`src/lib/routes.ts:8`
- **引用点**（4 处）：
  - `src/pages/rss.xml.ts:4` — import
  - `src/pages/rss.xml.ts:17` — 调用
  - `src/pages/posts/index.astro:3` — import
  - `src/pages/posts/index.astro:66` — 调用
  - `src/pages/posts/[slug].astro:11` — import
  - `src/pages/posts/[slug].astro:172` — 调用
  - `src/components/RecentTraces.astro:7` — import
  - `src/components/RecentTraces.astro:33,67` — 调用
- **步骤**：
  1. 修改 `src/lib/routes.ts` 导出名
  2. 更新上述 4 个文件的 import 和调用
- **验收**：全局搜索 `postSlug` 无残留，构建通过

### P1 验收检查
```bash
npx astro check    # 类型检查
npm run build      # 生产构建
```
确认：
- 所有旧函数名全局搜索零结果
- 构建无错误
- 开发服务器启动后，/posts、/tools、/ 首页正常渲染

---

## P2 — 文件重命名与移动（组件/脚本级影响）

### 2.1 `DockShowcase.astro` → `FeaturedTools.astro`
- **位置**：`src/components/DockShowcase.astro` → `src/components/FeaturedTools.astro`
- **引用点**（1 处）：
  - `src/components/home/HomeCanvas.astro:5` — `import DockShowcase from '../DockShowcase.astro'`
  - `src/components/home/HomeCanvas.astro:77` — `<DockShowcase entries={toolEntries} />`
- **步骤**：
  1. 重命名文件
  2. 更新 `HomeCanvas.astro` import 路径和标签名
- **验收**：搜索 `DockShowcase` 无残留，首页构建通过

### 2.2 `toc-tracker.ts` → `toc-highlight.ts`
- **位置**：`src/scripts/toc-tracker.ts` → `src/scripts/toc-highlight.ts`
- **引用点**（1 处）：
  - `src/layouts/ArticleLayout.astro:150` — `import '../scripts/toc-tracker'`
- **步骤**：
  1. 重命名文件
  2. 更新 `ArticleLayout.astro` import 路径
- **验收**：搜索 `toc-tracker` 无残留，文章页构建通过

### 2.3 移动内容组件到 `src/components/content/`
- **移动清单**：
  | 组件 | 原路径 | 新路径 |
  |------|--------|--------|
  | `BilibiliVideo.astro` | `src/components/` | `src/components/content/` |
  | `DialogueBubble.astro` | `src/components/` | `src/components/content/` |
  | `PromptBlock.astro` | `src/components/` | `src/components/content/` |

- **引用点**：
  - `src/pages/posts/[slug].astro:6,7,9` — 三个 import 需更新路径
  - `src/content/log/dialogue-on-subtraction.mdx:9,10` — MDX 文件中的 import 路径需更新（`../../components/` → `../../components/content/`）
- **步骤**：
  1. 创建 `src/components/content/` 目录
  2. 移动三个文件
  3. 更新 `[slug].astro` 中三处 import 路径
  4. 更新 MDX 文件中两处 import 路径
- **验收**：搜索旧路径无残留，文章详情页构建通过，含 MDX 组件的文章（如 dialogue-on-subtraction）渲染正常

### P2 验收检查
```bash
npm run build
```
确认：
- 旧文件名全局搜索零结果
- 首页 Bento Box 卡片正常（FeaturedTools 卡片可见）
- 文章详情页 TOC 高亮正常
- 含 DialogueBubble/PromptBlock 的 MDX 文章渲染正常

---

## P3 — 去重与收尾（降低维护负担）

### 3.1 消除 ArticleNav.astro 中的内联日期格式化
- **位置**：`src/components/article/ArticleNav.astro:24-25`
- **现状**：内联 `formatShortDate` 函数，逻辑与 `formatDateCompact`（P1.2 已重命名）完全相同
- **步骤**：
  1. 删除 `ArticleNav.astro` 第 24-25 行的内联函数
  2. 添加 `import { formatDateCompact } from '@/lib/format'`
  3. 将第 51、73 行的 `formatShortDate()` 调用替换为 `formatDateCompact()`
- **验收**：搜索 `formatShortDate` 无残留，文章列表页渲染正常

### P3 验收检查
```bash
npx astro check
npm run build
```

---

## 全局验收（所有阶段完成后）

```bash
# 1. 类型检查
npx astro check

# 2. 生产构建（含 Pagefind 索引）
npm run build

# 3. 启动开发服务器手动验证
npm run dev
# → 首页（FeaturedTools 卡片正常）
# → /posts 列表页（日期格式正确）
# → /posts/[slug] 文章页（TOC 高亮、MDX 组件正常）
# → /tools 页（工具列表正常）
# → RSS /rss.xml（链接正确）
```

---

## 不在本轮范围的事项（记录备忘）

| 事项 | 原因 |
|------|------|
| 内容集合名 `log` → `entry` 统一概念 | 涉及 content schema + 全部 content 查询 + 所有模板变量名，影响面过大，建议单独 PR |
| CSS 类名统一规范（BEM vs utility 混用） | 纯视觉层重构，无功能影响，优先级低 |
| `home-canvas.ts` 拆分（260 行混合职责） | 需要更详细的架构设计，不在命名重构范围 |
| `PLATFORM_ICON_MAP` → `PLATFORM_ICONS` | 微调，影响小，可随其他改动顺带处理 |
| ArticleNav.astro 中的 `articles` / `logs` 变量名统一 | 与 `entry` 概念统一绑定，推迟到集合重命名时一起处理 |

---

## 执行顺序建议

```
P0.1 → P0.2 → P0.3 → P0.4 → P0.5 → P0.6 → P0验收
  ↓
P1.1 → P1.2 → P1.3 → P1.4 → P1.5 → P1验收
  ↓
P2.1 → P2.2 → P2.3 → P2验收
  ↓
P3.1 → 全局验收
```

每个 P 级别完成后执行一次构建验证，确保不积累错误。
