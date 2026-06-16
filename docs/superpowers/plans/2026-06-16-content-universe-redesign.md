# 内容宇宙（/content）重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/content` 从「卡片墙目录」改成「内容流」——时间倒序、最新在上、色点分类、预告给肉、纸墨中性。

**Architecture:** 纯展示层重写。新建 `ContentStreamItem` 扁平列表项组件，重写 `content/index.astro`（hero 砍装饰 + 流式列表 + 底部图例），`ContentFilterTabs` 改文字链接，`ContentUniverseCard` 确认无其他引用后删除。数据层不动（复用 `getPublishedContentItems` + 既有筛选 JS），仅加 `SPACE_COLOR` 常量与 `getMainSpace` 辅助。

**Tech Stack:** Astro 6 + Vitest（逻辑测试）+ 既有 `content-model.ts` / `shared/format` / 筛选 JS。

**Spec:** `docs/superpowers/specs/2026-06-16-content-universe-redesign-design.md`

---

## File Structure

- **Modify** `src/knowledge/content-model.ts` — 加 `SPACE_COLOR` 常量 + `getMainSpace()` 辅助
- **Create** `src/knowledge/content-model.test.ts` — `SPACE_COLOR` / `getMainSpace` 单测
- **Create** `src/components/content-universe/ContentStreamItem.astro` — 扁平列表项（色点 + 标题 + 时间锚点 + 预告 + 形态）
- **Modify** `src/pages/content/index.astro` — hero 砍装饰、列表改用 `ContentStreamItem` 流式、加底部图例、纸墨配色
- **Modify** `src/components/content-universe/ContentFilterTabs.astro` — chip 按钮 → 文字链接
- **Delete** `src/components/content-universe/ContentUniverseCard.astro` — 确认仅 `/content` 引用后删

---

## Task 1: 空间色常量 + 主空间取值（TDD）

**Files:**
- Modify: `src/knowledge/content-model.ts`（末尾追加）
- Test: `src/knowledge/content-model.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

创建 `src/knowledge/content-model.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { SPACE_COLOR, getMainSpace, type ContentItem } from './content-model';

function makeItem(partial: Partial<ContentItem>): ContentItem {
  return {
    id: 'x', title: 't', href: '/x', date: new Date('2026-06-01'),
    tags: [], type: 'knowledge', form: 'article', domain: 'ai',
    intent: 'think', valueMode: 'both', isExternal: false,
    aiUseLevel: 'AI-2', related: [],
    ...partial,
  } as ContentItem;
}

describe('content-model 空间色 + 主空间', () => {
  it('SPACE_COLOR 覆盖 6 个具体空间', () => {
    expect(Object.keys(SPACE_COLOR).sort()).toEqual(
      ['ideas', 'learning', 'life', 'progress', 'tools', 'works'],
    );
  });

  it('getMainSpace：项目 → works', () => {
    expect(getMainSpace(makeItem({ type: 'project' }))).toBe('works');
  });
  it('getMainSpace：点子 → ideas', () => {
    expect(getMainSpace(makeItem({ type: 'idea' }))).toBe('ideas');
  });
  it('getMainSpace：生活领域 → life', () => {
    expect(getMainSpace(makeItem({ domain: 'cooking' }))).toBe('life');
  });
  it('getMainSpace：普通文章无具体空间 → null', () => {
    expect(getMainSpace(makeItem({ type: 'knowledge', domain: 'ai' }))).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/knowledge/content-model.test.ts`
Expected: FAIL — `SPACE_COLOR` / `getMainSpace` 未导出。

- [ ] **Step 3: 在 content-model.ts 末尾追加实现**

```ts
/** 6 个具体空间配色（色点 + 图例共用，单一真相源） */
export const SPACE_COLOR: Record<Exclude<ContentSpace, 'all'>, string> = {
  progress: '#7c3aed',
  life: '#16a34a',
  learning: '#2563eb',
  tools: '#d97706',
  works: '#0891b2',
  ideas: '#f59e0b',
};

/** 取内容的主空间（第一个匹配的具体空间，按 contentSpaces 顺序）；无具体空间返回 null */
export function getMainSpace(item: ContentItem): Exclude<ContentSpace, 'all'> | null {
  for (const space of contentSpaces) {
    if (space.id === 'all') continue;
    if (itemBelongsToSpace(item, space.id)) return space.id;
  }
  return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/knowledge/content-model.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: 类型检查**

Run: `npx astro check`
Expected: 0 errors。

- [ ] **Step 6: 提交**

```bash
git add src/knowledge/content-model.ts src/knowledge/content-model.test.ts
git commit -m "feat(content): SPACE_COLOR 常量 + getMainSpace 辅助（内容流色点）"
```

---

## Task 2: ContentStreamItem 扁平列表项组件

**Files:**
- Create: `src/components/content-universe/ContentStreamItem.astro`

- [ ] **Step 1: 创建组件**

创建 `src/components/content-universe/ContentStreamItem.astro`：

```astro
---
import { SPACE_COLOR, getMainSpace, formLabels, type ContentItem, type ContentSpace } from '@/knowledge/content-model';

interface Props {
  item: ContentItem;
  spaces: ContentSpace[];
}
const { item, spaces } = Astro.props;

const FRESH_DAYS = 7;
const mainSpace = getMainSpace(item);
const dotColor = mainSpace ? SPACE_COLOR[mainSpace] : '#a8a29e';
const isFresh = (Date.now() - item.date.getTime()) < FRESH_DAYS * 86_400_000;
const mm = String(item.date.getMonth() + 1).padStart(2, '0');
const dd = String(item.date.getDate()).padStart(2, '0');
const dateLabel = `${mm}.${dd}`;
const summary = item.summary ?? '';
---

<article class:list={["stream-item", { fresh: isFresh }]} data-spaces={spaces.join(' ')}>
  <a class="stream-link" href={item.href} target={item.isExternal ? '_blank' : undefined} rel={item.isExternal ? 'noopener noreferrer' : undefined}>
    <span class="stream-dot" style={`background:${dotColor}`} aria-hidden="true"></span>
    <div class="stream-body">
      <div class="stream-row">
        <h2 class="stream-title">{item.title}</h2>
        <span class:list={["stream-date", { fresh: isFresh }]}>{dateLabel}{isFresh && <span class="fresh-tag">新</span>}</span>
      </div>
      {summary && <p class="stream-blurb">{summary}</p>}
      <span class="stream-form">{formLabels[item.form]}</span>
    </div>
  </a>
</article>

<style>
  .stream-item { border-bottom: 1px solid rgba(0,0,0,0.06); }
  .stream-link { display: flex; gap: 0.9rem; padding: 1.05rem 0; color: inherit; text-decoration: none; }
  .stream-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 0.7rem; }
  .stream-body { flex: 1; min-width: 0; }
  .stream-row { display: flex; justify-content: space-between; align-items: baseline; gap: 0.9rem; }
  .stream-title {
    margin: 0;
    font-family: var(--font-heading, Georgia, serif);
    font-size: 1.3rem;
    line-height: 1.3;
    color: var(--color-heading, #2a2522);
    font-weight: 600;
    letter-spacing: -0.01em;
    transition: color 0.15s;
  }
  .stream-link:hover .stream-title { color: var(--color-brand, #c4704a); }
  .stream-date {
    font-family: var(--font-mono, monospace);
    font-size: 0.82rem;
    color: rgba(120,113,108,0.7);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .stream-date.fresh { color: var(--color-brand, #c4704a); font-weight: 700; }
  .fresh-tag {
    display: inline-block; margin-left: 0.4rem;
    font-family: var(--font-body, sans-serif);
    font-size: 0.62rem; font-weight: 800; color: #fff;
    background: var(--color-brand, #c4704a);
    padding: 0.06rem 0.32rem; border-radius: 3px;
    vertical-align: middle;
  }
  .stream-blurb { margin: 0.35rem 0 0; font-size: 0.86rem; line-height: 1.55; color: rgba(120,113,108,0.85); }
  .stream-form { display: block; margin-top: 0.3rem; font-size: 0.72rem; color: rgba(168,162,158,0.9); }

  body.theme-aurora .stream-title,
  body.theme-sunset .stream-title,
  body.theme-mint .stream-title { color: var(--color-heading, #f5f5f4); }
  body.theme-aurora .stream-blurb,
  body.theme-sunset .stream-blurb,
  body.theme-mint .stream-blurb { color: rgba(231,229,228,0.7); }
</style>
```

- [ ] **Step 2: 类型检查**

Run: `npx astro check`
Expected: 0 errors。

- [ ] **Step 3: 提交**

```bash
git add src/components/content-universe/ContentStreamItem.astro
git commit -m "feat(content): ContentStreamItem 扁平列表项（内容流）"
```

---

## Task 3: 重写 content/index.astro（hero 砍装饰 + 流式列表 + 图例）

**Files:**
- Modify: `src/pages/content/index.astro`

- [ ] **Step 1: 重写 frontmatter（排序 + 主空间映射）**

把 `content/index.astro` 的 frontmatter（`---` 内）改为：

```astro
---
import ContentFilterTabs from '@/components/content-universe/ContentFilterTabs.astro';
import ContentStreamItem from '@/components/content-universe/ContentStreamItem.astro';
import Base from '@/layouts/Base.astro';
import { getPublishedContentItems } from '@/knowledge/content';
import {
  contentSpaces,
  itemBelongsToSpace,
  SPACE_COLOR,
  type ContentSpace,
} from '@/knowledge/content-model';

export const prerender = true;

const allItems = (await getPublishedContentItems())
  .slice()
  .sort((a, b) => b.date.getTime() - a.date.getTime());

const activeSpace: ContentSpace = 'all';

const counts = Object.fromEntries(
  contentSpaces.map((space) => [
    space.id,
    allItems.filter((item) => itemBelongsToSpace(item, space.id)).length,
  ]),
) as Record<ContentSpace, number>;

function getItemSpaces(item: (typeof allItems)[number]): ContentSpace[] {
  return contentSpaces
    .filter((space) => space.id !== 'all' && itemBelongsToSpace(item, space.id))
    .map((space) => space.id);
}

const legendSpaces = contentSpaces.filter((s) => s.id !== 'all');
---
```

- [ ] **Step 2: 重写 body（hero 砍装饰 + 流 + 图例）**

把 `<Base>...</Base>` 内的 `<section class="content-universe-shell">` 整段替换为：

```astro
<Base
  title="内容宇宙 · Walker"
  description="Walker 的内容宇宙：所有公开内容按时间倒序汇集，最新在上，持续生长。"
  ogDescription="Walker 的内容宇宙：所有公开内容按时间倒序汇集，最新在上，持续生长。"
>
  <section class="stream-shell">
    <header class="stream-hero">
      <p class="stream-kicker">内容宇宙</p>
      <h1 class="stream-tagline">点子是<em>驱动力</em>，生活是<em>土壤</em>。</h1>
      <p class="stream-count">持续更新 · <strong>{counts.all}</strong> 篇</p>
    </header>

    <ContentFilterTabs activeSpace={activeSpace} counts={counts} />

    <p class="active-space-note" data-active-space-note aria-live="polite">
      当前显示：全部内容。
    </p>

    <div class="stream-list" aria-label="内容流">
      {allItems.map((item) => (
        <ContentStreamItem item={item} spaces={getItemSpaces(item)} />
      ))}
    </div>

    <div class="empty-state" data-empty-state hidden>
      <p>这个内容空间暂时还没有公开内容。</p>
    </div>

    <footer class="stream-legend" aria-label="空间配色图例">
      {legendSpaces.map((s) => (
        <span class="legend-item">
          <i class="legend-dot" style={`background:${SPACE_COLOR[s.id as keyof typeof SPACE_COLOR]}`}></i>
          {s.label}
        </span>
      ))}
    </footer>
  </section>
</Base>
```

- [ ] **Step 3: 重写 `<style>`（纸墨配色）**

把 `<style>...</style>` 整段替换为：

```astro
<style>
  .stream-shell { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem 4rem; }

  .stream-hero { margin-bottom: 1.5rem; }
  .stream-kicker { margin: 0; color: var(--color-muted, #a8a29e); font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; }
  .stream-tagline { margin: 0.6rem 0 0; font-size: clamp(1.4rem, 3vw, 1.9rem); line-height: 1.4; color: var(--color-heading, #2a2522); font-weight: 600; }
  .stream-tagline em { font-style: normal; color: var(--color-brand, #c4704a); }
  .stream-count { margin: 0.7rem 0 0; font-size: 0.78rem; color: var(--color-muted, #a8a29e); }
  .stream-count strong { color: var(--color-text-muted, #78716c); font-weight: 700; }

  .active-space-note { margin: 0.5rem 0 1rem; color: var(--color-muted, #a8a29e); font-size: 0.78rem; }

  .stream-list { margin-top: 0.5rem; }

  .empty-state { padding: 3rem 1rem; text-align: center; color: var(--color-muted, #a8a29e); font-size: 0.9rem; }

  .stream-legend { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 2.5rem; padding-top: 1.2rem; border-top: 1px solid rgba(0,0,0,0.06); }
  .legend-item { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; color: var(--color-muted, #a8a29e); }
  .legend-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }

  @media (max-width: 640px) {
    .stream-shell { padding: 2rem 1.25rem 3rem; }
    .stream-row { flex-direction: row; }
  }
</style>
```

- [ ] **Step 4: 保留筛选 `<script>` 不变**

`content/index.astro` 底部既有的 `<script>`（`updateContentFilter` / `applyContentView` / `initContentFilter`，基于 `data-spaces` + URL `?space=`）**保持原样不动**。删掉 view-toggle 相关（`getRequestedView` / `applyContentView` / view-btn 事件），因为新设计无网格/列表切换。

具体：保留 `validSpaces` / `spaceLabels` / `getRequestedSpace` / `updateContentFilter` / `initContentFilter` / `astro:page-load` / `astro:before-swap`；删除 `getRequestedView` / `applyContentView` 及 view-btn click 监听。

- [ ] **Step 5: 类型检查 + 构建**

Run: `npx astro check && npm run build`
Expected: 0 errors，build Complete。

- [ ] **Step 6: 提交**

```bash
git add src/pages/content/index.astro
git commit -m "feat(content): /content 改为内容流（hero 砍装饰 + 流式列表 + 图例）"
```

---

## Task 4: ContentFilterTabs 改文字链接

**Files:**
- Modify: `src/components/content-universe/ContentFilterTabs.astro`

- [ ] **Step 1: 读现有组件确认结构**

Run: 读 `src/components/content-universe/ContentFilterTabs.astro`，确认它渲染 `data-space` 的 tab（筛选 JS 依赖 `data-space` 属性 + `is-active` class，这些**必须保留**）。

- [ ] **Step 2: 把 tab 视觉从 chip 按钮改成文字链接**

只改 `<style>` 里的 tab 样式（去 pill 背景/边框，改文字 + 当前项下划线），**不改** `data-space` / `is-active` / `aria-current` 的逻辑与 class 名（筛选 JS 依赖）。关键样式目标：

```css
/* tab 容器：一行文字链接，不是 pill 组 */
.filter-tabs { display: flex; gap: 1rem; flex-wrap: wrap; padding: 0; margin: 0 0 0.5rem; }
/* 单个 tab：纯文字，当前项下划线 */
.filter-tab {
  padding: 0 0 0.15rem;
  border: 0;
  background: transparent;
  color: var(--color-muted, #a8a29e);
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1.5px solid transparent;
}
.filter-tab.is-active {
  color: var(--color-heading, #2a2522);
  border-bottom-color: var(--color-brand, #c4704a);
}
```

实际 class 名以现有组件为准，只替换样式声明，不动结构/属性。

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx astro check && npm run build`
Expected: 0 errors，Complete。

- [ ] **Step 4: 提交**

```bash
git add src/components/content-universe/ContentFilterTabs.astro
git commit -m "style(content): 筛选 tab 改文字链接（去 pill）"
```

---

## Task 5: 删除 ContentUniverseCard（确认无其他引用）

**Files:**
- Delete: `src/components/content-universe/ContentUniverseCard.astro`

- [ ] **Step 1: 确认引用范围**

Run: `grep -rn "ContentUniverseCard" src/`
Expected: 只有 `src/pages/content/index.astro` 引用（Task 3 已改用 `ContentStreamItem`，应已无引用）。若还有其他引用，**停止删除**，保留组件并在本任务备注。

- [ ] **Step 2: 删除文件**

Run: `rm src/components/content-universe/ContentUniverseCard.astro`

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx astro check && npm run build`
Expected: 0 errors，Complete（无残留引用）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore(content): 移除废弃的 ContentUniverseCard（已被 ContentStreamItem 取代）"
```

---

## Task 6: 全量验证 + 视觉对比

**Files:** 无（验证任务）

- [ ] **Step 1: 三件套验证**

Run: `npx astro check && npm run test && npm run build`
Expected: astro check 0 errors；test 全过（含 Task 1 新增 5）；build Complete + Pagefind。

- [ ] **Step 2: 浏览器视觉验证**

打开 `http://localhost:4321/content`（dev server 已在跑），确认：
- hero 只有 kicker + 标语 + 「持续更新 · N 篇」，无渐变/装饰圆
- 内容是**单列扁平流**，最新在上
- 每条：色点 + 标题（serif）+ 日期（mono 右侧）+ 预告 + 形态（小灰字）
- 最近 7 天内的条目日期是品牌色 + 「新」标签
- 底部有空间色图例
- 点筛选文字链接，过滤生效

- [ ] **Step 3: 截图对比 mockup**

用 chrome-devtools 截 `/content`，与 `content-redesign-mockup.html` 右栏对照，确认方向一致。

- [ ] **Step 4: 最终提交（如有零散调整）**

```bash
git add -A
git commit -m "chore(content): 内容流重设计收尾"
```

---

## Self-Review（计划自检）

- **Spec 覆盖**：hero 砍装饰 ✓ / 扁平流 ✓ / 色点+标题+时间锚点+预告+形态 ✓ / 纸墨+6 空间色 ✓ / 最新 7 天带「新」✓ / 筛选文字链接 ✓ / 底部图例 ✓ / 删 ContentUniverseCard ✓ / 不做分页·分组·chip 墙 ✓。
- **Placeholder**：无 TBD/TODO，每个 step 有完整代码或命令。
- **类型一致**：`SPACE_COLOR: Record<Exclude<ContentSpace,'all'>, string>`、`getMainSpace → Exclude<ContentSpace,'all'> | null`、`ContentStreamItem` Props `{item, spaces}` 在 Task 1/2/3 一致。
- **数据现实**：普通文章无具体空间 → `getMainSpace` 返回 null → 色点灰 fallback（Task 2 `dotColor` 处理）。
