# AI Era Idea Co-Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable iwalk.pro slice of the AI-era idea co-creation architecture: a stable `/content` universe, minimal `/about` data tab, AI-readable static files, and route/navigation foundations without implementing NorthStar or full analytics.

**Architecture:** Keep the current Astro content collection as the source of truth, then add small helper modules that project existing entries into the new multi-dimensional content model. Ship additive routes and components first, keep legacy `/posts`, `/tools`, `/ideas`, and `/projects` working, and only change main navigation after `/content` is usable. AI-facing files are static/generated from existing public data and do not introduce LLM calls.

**Tech Stack:** Astro 6, Astro Content Collections + Zod, TypeScript, Tailwind CSS v4/global CSS, astro-icon Lucide icons, Pagefind existing build, Supabase LikeCounter existing integration.

---

## Scope Check

The approved spec covers three large systems: FerrySpec, iwalk.pro, and NorthStar. This implementation plan intentionally covers only **Stage 1 for iwalk.pro** plus static AI-readable foundations:

- Implement now: `/content`, content model helpers, minimal `/about?tab=data` UI, `llms.txt`, `walker-style.md`, `index.json`, route constants, and navigation update.
- Do not implement now: NorthStar, login, collaboration, MCP server, public REST API v1, RAG, AI assistant, automated analytics, or content-writing migrations.

## File Structure

### Create

- `src/lib/content-model.ts` — Defines the first-stage content model enums, labels, helpers, and `toContentItem()` adapter from Astro `log` entries.
- `src/components/content-universe/ContentFilterTabs.astro` — Presentational filter navigation for `/content` views.
- `src/components/content-universe/ContentUniverseCard.astro` — One reusable card for all projected content entries.
- `src/pages/content/index.astro` — New content universe route with view filters, multi-form/domain/intent display, and links to existing detail routes or external URLs.
- `src/pages/index.json.ts` — Prerendered AI-readable content index.
- `src/pages/llms.txt.ts` — Prerendered AI-readable site map and reading guide.
- `src/pages/walker-style.md.ts` — Prerendered Walker style/methodology document.

### Modify

- `src/content.config.ts` — Add optional first-stage fields (`updated`, `form`, `domain`, `intent`, `valueMode`, `aiUsePolicy`, `related`) while preserving existing content compatibility.
- `src/lib/content.ts` — Add `getPublishedContentItems()` and broaden posts to include knowledge/idea/project for legacy compatibility if desired.
- `src/lib/routes.ts` — Add `CONTENT` and `ABOUT` constants.
- `src/components/Navigation.astro` — Change visible nav to 首页 / 内容 / 关于 after `/content` exists.
- `src/pages/about/index.astro` — Add a lightweight data tab/section that shows content counts and feedback/data philosophy using existing data only.
- `src/pages/rss.xml.ts` — Keep existing route paths working; only update if TypeScript requires route constants.
- `astro.config.mjs` — Add redirects only if needed after inspecting current redirect config; this plan does not require deleting old routes.

### Validation commands

- `npx astro check`
- `npm run build`

---

## Task 1: Extend Content Schema Safely

**Files:**
- Modify: `src/content.config.ts`

- [x] **Step 1: Add optional schema fields without breaking existing content**

Replace the schema object in `src/content.config.ts` with this version. Keep existing fields and add only optional fields/defaults:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const aiUsePolicySchema = z.object({
  level: z.enum(['AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4']).default('AI-2'),
  readable: z.boolean().default(true),
  citable: z.boolean().default(true),
  actionable: z.boolean().default(false),
  reason: z.string().optional(),
});

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    date: z.date(),
    updated: z.date().optional(),
    tags: z.array(z.string()),
    type: z.enum(['knowledge', 'tool', 'idea', 'project', 'community', 'learn', 'learning']),
    form: z.enum([
      'article',
      'note',
      'diary',
      'rant',
      'gallery',
      'video',
      'recipe',
      'calligraphy',
      'resource',
      'project',
      'idea',
      'lesson',
    ]).optional(),
    domain: z.enum([
      'ai',
      'coding',
      'product',
      'philosophy',
      'life',
      'cooking',
      'calligraphy',
      'reading',
      'travel',
      'emotion',
      'community',
    ]).optional(),
    intent: z.enum([
      'think',
      'record',
      'teach',
      'share',
      'verify',
      'showcase',
      'reflect',
      'connect',
      'vent',
    ]).optional(),
    valueMode: z.enum(['utility', 'existence', 'both']).optional(),
    aiUsePolicy: aiUsePolicySchema.optional(),
    related: z.array(z.string()).default([]),
    published: z.boolean().default(true),
    summary: z.string().optional(),
    description: z.string().optional(),
    cover: z.union([image(), z.url()]).optional(),
    category: z.string().optional(),
    status: z.enum(['thinking', 'practicing', 'verified', 'archived']).optional(),
    rating: z.number().min(1).max(5).optional(),
    url: z.url().optional(),
    qrCode: z.string().optional(),
    communities: z.array(z.object({
      name: z.string(),
      description: z.string(),
      qrCode: z.string(),
      badge: z.string(),
      tag: z.string(),
    })).optional(),
    videos: z.array(z.object({
      platform: z.enum(['bilibili', 'douyin', 'xiaohongshu', 'youtube', 'github', 'zhihu']),
      url: z.url(),
      title: z.string().optional(),
    })).default([]),
    resources: z.array(z.object({
      name: z.string(),
      url: z.url(),
      type: z.enum(['tool', 'feishu', 'github', 'website', 'download']),
      description: z.string().optional(),
    })).default([]),
  }),
});

export const collections = { log };
```

- [x] **Step 2: Run Astro type/content validation**

Run:

```bash
npx astro check
```

Expected: no schema errors from existing markdown. If errors mention an existing `type` value, add that value to the enum only if it exists in content and is intentional.

- [x] **Step 3: Commit schema extension**

```bash
git add src/content.config.ts
git commit -m "feat: extend content metadata schema"
```

---

## Task 2: Add Content Model Adapter

**Files:**
- Create: `src/lib/content-model.ts`
- Modify: `src/lib/content.ts`

- [x] **Step 1: Create content model helper**

Create `src/lib/content-model.ts`:

```ts
import type { CollectionEntry } from 'astro:content';
import { buildPostPath, IDEAS, PROJECTS, TOOLS } from '@/lib/routes';

export type LogEntry = CollectionEntry<'log'>;

export type ContentForm =
  | 'article'
  | 'note'
  | 'diary'
  | 'rant'
  | 'gallery'
  | 'video'
  | 'recipe'
  | 'calligraphy'
  | 'resource'
  | 'project'
  | 'idea'
  | 'lesson';

export type ContentDomain =
  | 'ai'
  | 'coding'
  | 'product'
  | 'philosophy'
  | 'life'
  | 'cooking'
  | 'calligraphy'
  | 'reading'
  | 'travel'
  | 'emotion'
  | 'community';

export type ContentIntent =
  | 'think'
  | 'record'
  | 'teach'
  | 'share'
  | 'verify'
  | 'showcase'
  | 'reflect'
  | 'connect'
  | 'vent';

export type ValueMode = 'utility' | 'existence' | 'both';

export type ContentSpace =
  | 'all'
  | 'progress'
  | 'life'
  | 'learning'
  | 'tools'
  | 'works'
  | 'ideas';

export interface ContentItem {
  id: string;
  title: string;
  href: string;
  summary: string;
  date: Date;
  updated?: Date;
  tags: string[];
  type: LogEntry['data']['type'];
  form: ContentForm;
  domain: ContentDomain;
  intent: ContentIntent;
  valueMode: ValueMode;
  status?: LogEntry['data']['status'];
  rating?: number;
  isExternal: boolean;
  aiUseLevel: 'AI-0' | 'AI-1' | 'AI-2' | 'AI-3' | 'AI-4';
  related: string[];
}

export const contentSpaces: Array<{ key: ContentSpace; label: string; hint: string; icon: string }> = [
  { key: 'all', label: '全部', hint: 'All', icon: 'lucide:layout-grid' },
  { key: 'progress', label: '前进系统', hint: 'Progress', icon: 'lucide:compass' },
  { key: 'life', label: '生活切片', hint: 'Life', icon: 'lucide:sparkles' },
  { key: 'learning', label: '学习记录', hint: 'Learning', icon: 'lucide:graduation-cap' },
  { key: 'tools', label: '工具资源', hint: 'Tools', icon: 'lucide:wrench' },
  { key: 'works', label: '作品展示', hint: 'Works', icon: 'lucide:images' },
  { key: 'ideas', label: '点子生命周期', hint: 'Ideas', icon: 'lucide:lightbulb' },
];

export const formLabels: Record<ContentForm, string> = {
  article: '文章',
  note: '笔记',
  diary: '日记',
  rant: '吐槽',
  gallery: '图集',
  video: '视频',
  recipe: '厨艺',
  calligraphy: '书法',
  resource: '资源',
  project: '项目',
  idea: '点子',
  lesson: '教程',
};

export const domainLabels: Record<ContentDomain, string> = {
  ai: 'AI',
  coding: '编程',
  product: '产品',
  philosophy: '哲学',
  life: '生活',
  cooking: '厨艺',
  calligraphy: '书法',
  reading: '阅读',
  travel: '旅行',
  emotion: '情绪',
  community: '社群',
};

export const intentLabels: Record<ContentIntent, string> = {
  think: '思考',
  record: '记录',
  teach: '教学',
  share: '分享',
  verify: '验证',
  showcase: '展示',
  reflect: '复盘',
  connect: '连接',
  vent: '释放',
};

export const valueModeLabels: Record<ValueMode, string> = {
  utility: '工具价值',
  existence: '存在价值',
  both: '二者兼有',
};

function inferForm(entry: LogEntry): ContentForm {
  if (entry.data.form) return entry.data.form;
  if (entry.data.type === 'tool') return 'resource';
  if (entry.data.type === 'idea') return 'idea';
  if (entry.data.type === 'project') return 'project';
  if (entry.data.type === 'learn' || entry.data.type === 'learning') return 'lesson';
  if (entry.data.videos.length > 0) return 'video';
  return 'article';
}

function inferDomain(entry: LogEntry): ContentDomain {
  if (entry.data.domain) return entry.data.domain;
  const text = [entry.data.category, ...entry.data.tags].join(' ').toLowerCase();
  if (/厨|菜|饭|cooking/.test(text)) return 'cooking';
  if (/书法|calligraphy/.test(text)) return 'calligraphy';
  if (/代码|编程|开发|coding|code/.test(text)) return 'coding';
  if (/产品|product/.test(text)) return 'product';
  if (/哲学|马克思|康德|philosophy/.test(text)) return 'philosophy';
  if (/社群|community/.test(text)) return 'community';
  if (/情绪|迷茫|吐槽|emotion/.test(text)) return 'emotion';
  if (/读书|阅读|reading/.test(text)) return 'reading';
  if (/生活|life/.test(text)) return 'life';
  return 'ai';
}

function inferIntent(entry: LogEntry): ContentIntent {
  if (entry.data.intent) return entry.data.intent;
  if (entry.data.type === 'tool') return 'share';
  if (entry.data.type === 'idea') return 'verify';
  if (entry.data.type === 'project') return 'reflect';
  if (entry.data.type === 'learn' || entry.data.type === 'learning') return 'teach';
  if (entry.data.status === 'thinking') return 'think';
  return 'record';
}

function inferValueMode(entry: LogEntry): ValueMode {
  if (entry.data.valueMode) return entry.data.valueMode;
  const domain = inferDomain(entry);
  if (entry.data.type === 'tool' || entry.data.type === 'project' || entry.data.type === 'learn') return 'utility';
  if (domain === 'life' || domain === 'cooking' || domain === 'calligraphy' || domain === 'emotion') return 'existence';
  return 'both';
}

function buildHref(entry: LogEntry): { href: string; isExternal: boolean } {
  if (entry.data.type === 'tool' && entry.data.url) return { href: entry.data.url, isExternal: true };
  if (entry.data.type === 'idea') return { href: IDEAS, isExternal: false };
  if (entry.data.type === 'project') return { href: PROJECTS, isExternal: false };
  if (entry.data.type === 'tool') return { href: TOOLS, isExternal: false };
  return { href: buildPostPath(entry.id), isExternal: false };
}

export function toContentItem(entry: LogEntry): ContentItem {
  const { href, isExternal } = buildHref(entry);
  return {
    id: entry.id,
    title: entry.data.title,
    href,
    summary: entry.data.summary ?? entry.data.description ?? '这条内容还没有摘要。',
    date: entry.data.date,
    updated: entry.data.updated,
    tags: entry.data.tags,
    type: entry.data.type,
    form: inferForm(entry),
    domain: inferDomain(entry),
    intent: inferIntent(entry),
    valueMode: inferValueMode(entry),
    status: entry.data.status,
    rating: entry.data.rating,
    isExternal,
    aiUseLevel: entry.data.aiUsePolicy?.level ?? 'AI-2',
    related: entry.data.related,
  };
}

export function itemBelongsToSpace(item: ContentItem, space: ContentSpace): boolean {
  if (space === 'all') return true;
  if (space === 'progress') return ['knowledge', 'idea', 'project'].includes(item.type) && item.valueMode !== 'existence';
  if (space === 'life') return item.valueMode === 'existence' || ['life', 'cooking', 'calligraphy', 'emotion', 'travel'].includes(item.domain);
  if (space === 'learning') return item.type === 'learn' || item.type === 'learning' || item.intent === 'teach';
  if (space === 'tools') return item.type === 'tool';
  if (space === 'works') return item.form === 'gallery' || item.form === 'video' || item.form === 'calligraphy' || item.intent === 'showcase';
  if (space === 'ideas') return item.type === 'idea' || item.form === 'idea';
  return false;
}
```

- [x] **Step 2: Add collection query helper**

Modify `src/lib/content.ts` to include the adapter while preserving existing exports:

```ts
import { getCollection } from 'astro:content';
import { toContentItem } from './content-model';

export async function getPublishedPosts() {
  return (await getCollection('log', ({ data }) =>
    data.published && ['knowledge', 'idea', 'project'].includes(data.type)
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedResources() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'tool'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedIdeas() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'idea'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedProjects() {
  return (await getCollection('log', ({ data }) =>
    data.published && data.type === 'project'
  )).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getPublishedContentItems() {
  return (await getCollection('log', ({ data }) => data.published))
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
    .map(toContentItem);
}
```

- [x] **Step 3: Run type check**

Run:

```bash
npx astro check
```

Expected: PASS. If TypeScript cannot resolve `./content-model`, switch the import to `@/lib/content-model`.

- [x] **Step 4: Commit content adapter**

```bash
git add src/lib/content-model.ts src/lib/content.ts
git commit -m "feat: add content universe model adapter"
```

---

## Task 3: Add Route Constants

**Files:**
- Modify: `src/lib/routes.ts`

- [x] **Step 1: Add content/about route constants**

Replace `src/lib/routes.ts` with:

```ts
/**
 * Route constants: single source of truth for page paths.
 */

export const HOME = '/' as const;
export const CONTENT = '/content' as const;
export const ABOUT = '/about' as const;
export const POSTS = '/posts' as const;
export const TOOLS = '/tools' as const;
export const IDEAS = '/ideas' as const;
export const PROJECTS = '/projects' as const;

export const buildPostPath = (id: string) => `${POSTS}/${id}` as const;
export const buildContentSpacePath = (space: string) => `${CONTENT}?space=${space}` as const;
```

- [x] **Step 2: Run type check**

Run:

```bash
npx astro check
```

Expected: PASS.

- [x] **Step 3: Commit routes**

```bash
git add src/lib/routes.ts
git commit -m "feat: add content route constants"
```

---

## Task 4: Build Content Universe Components

**Files:**
- Create: `src/components/content-universe/ContentFilterTabs.astro`
- Create: `src/components/content-universe/ContentUniverseCard.astro`

- [x] **Step 1: Create filter tabs component**

Create `src/components/content-universe/ContentFilterTabs.astro`:

```astro
---
import { Icon } from 'astro-icon/components';
import { CONTENT } from '@/lib/routes';
import type { ContentSpace } from '@/lib/content-model';
import { contentSpaces } from '@/lib/content-model';

interface Props {
  activeSpace: ContentSpace;
  counts: Record<ContentSpace, number>;
}

const { activeSpace, counts } = Astro.props;
---

<div class="content-filter-tabs" aria-label="内容空间筛选">
  {contentSpaces.map(space => {
    const isActive = activeSpace === space.key;
    const href = space.key === 'all' ? CONTENT : `${CONTENT}?space=${space.key}`;
    return (
      <a href={href} class:list={["content-filter-tab", isActive && "is-active"]}>
        <Icon name={space.icon} width={14} height={14} />
        <span>{space.label}</span>
        <em>{counts[space.key] ?? 0}</em>
      </a>
    );
  })}
</div>

<style>
  .content-filter-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
  }

  .content-filter-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.62rem 0.82rem;
    border: 1px solid var(--color-nav-border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-panel) 82%, transparent);
    color: var(--color-parchment-dim);
    text-decoration: none;
    font-size: 0.78rem;
    transition: all 0.25s ease;
  }

  .content-filter-tab:hover,
  .content-filter-tab.is-active {
    color: var(--color-parchment);
    border-color: color-mix(in srgb, var(--color-brand) 45%, var(--color-nav-border));
    background: var(--color-brand-glow);
  }

  .content-filter-tab em {
    font-style: normal;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.66rem;
    opacity: 0.72;
  }
</style>
```

- [x] **Step 2: Create content card component**

Create `src/components/content-universe/ContentUniverseCard.astro`:

```astro
---
import { Icon } from 'astro-icon/components';
import { formatDateCompact } from '@/lib/format';
import type { ContentItem } from '@/lib/content-model';
import { domainLabels, formLabels, intentLabels, valueModeLabels } from '@/lib/content-model';

interface Props {
  item: ContentItem;
}

const { item } = Astro.props;
const statusLabel = item.status === 'thinking'
  ? '想法中'
  : item.status === 'practicing'
    ? '实践中'
    : item.status === 'verified'
      ? '已验证'
      : item.status === 'archived'
        ? '已归档'
        : '流动中';
---

<a
  href={item.href}
  target={item.isExternal ? '_blank' : undefined}
  rel={item.isExternal ? 'noopener noreferrer' : undefined}
  class="content-universe-card panel-glass no-underline"
>
  <div class="card-topline">
    <time>{formatDateCompact(item.date)}</time>
    <span>{formLabels[item.form]}</span>
    <span>{domainLabels[item.domain]}</span>
    <span>{intentLabels[item.intent]}</span>
  </div>

  <div class="card-heading-row">
    <h2>{item.title}</h2>
    {item.isExternal && <Icon name="lucide:external-link" width={14} height={14} />}
  </div>

  <p>{item.summary}</p>

  <div class="card-meta-row">
    <span class="value-mode">{valueModeLabels[item.valueMode]}</span>
    <span>{statusLabel}</span>
    <span>{item.aiUseLevel}</span>
  </div>

  {item.tags.length > 0 && (
    <div class="card-tags">
      {item.tags.slice(0, 4).map(tag => <span>#{tag}</span>)}
    </div>
  )}
</a>

<style>
  .content-universe-card {
    display: block;
    padding: 1.15rem;
    border-radius: 22px;
    border: 1px solid var(--color-nav-border);
    transition: transform 0.25s ease, border-color 0.25s ease, background 0.25s ease;
  }

  .content-universe-card:hover {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--color-brand) 40%, var(--color-nav-border));
  }

  .card-topline,
  .card-meta-row,
  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
  }

  .card-topline {
    margin-bottom: 0.7rem;
    color: var(--color-parchment-dim);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
  }

  .card-topline span,
  .card-meta-row span {
    border: 1px solid var(--color-nav-border);
    border-radius: 999px;
    padding: 0.16rem 0.45rem;
    background: rgba(255, 255, 255, 0.03);
  }

  .card-heading-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  h2 {
    margin: 0;
    color: var(--color-parchment);
    font-size: 1rem;
    line-height: 1.35;
  }

  p {
    margin: 0.65rem 0 0;
    color: var(--color-parchment-dim);
    font-size: 0.82rem;
    line-height: 1.75;
  }

  .card-meta-row {
    margin-top: 0.9rem;
    color: var(--color-parchment-dim);
    font-size: 0.68rem;
  }

  .card-meta-row .value-mode {
    color: var(--color-brand);
    border-color: color-mix(in srgb, var(--color-brand) 30%, var(--color-nav-border));
  }

  .card-tags {
    margin-top: 0.8rem;
  }

  .card-tags span {
    color: color-mix(in srgb, var(--color-parchment-dim) 75%, transparent);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
  }
</style>
```

- [x] **Step 3: Run type check**

Run:

```bash
npx astro check
```

Expected: PASS.

- [x] **Step 4: Commit components**

```bash
git add src/components/content-universe/ContentFilterTabs.astro src/components/content-universe/ContentUniverseCard.astro
git commit -m "feat: add content universe components"
```

---

## Task 5: Implement `/content` Route

**Files:**
- Create: `src/pages/content/index.astro`

- [x] **Step 1: Create content universe page**

Create `src/pages/content/index.astro`:

```astro
---
import SidebarLayout from '@/layouts/SidebarLayout.astro';
import ContentFilterTabs from '@/components/content-universe/ContentFilterTabs.astro';
import ContentUniverseCard from '@/components/content-universe/ContentUniverseCard.astro';
import { getPublishedContentItems } from '@/lib/content';
import type { ContentSpace } from '@/lib/content-model';
import { contentSpaces, itemBelongsToSpace } from '@/lib/content-model';

export const prerender = true;

const items = await getPublishedContentItems();
const requestedSpace = Astro.url.searchParams.get('space') as ContentSpace | null;
const validSpaces = new Set(contentSpaces.map(space => space.key));
const activeSpace: ContentSpace = requestedSpace && validSpaces.has(requestedSpace) ? requestedSpace : 'all';

const counts = Object.fromEntries(
  contentSpaces.map(space => [space.key, items.filter(item => itemBelongsToSpace(item, space.key)).length])
) as Record<ContentSpace, number>;

const visibleItems = items.filter(item => itemBelongsToSpace(item, activeSpace));
const activeLabel = contentSpaces.find(space => space.key === activeSpace)?.label ?? '全部';
---

<SidebarLayout
  title="内容宇宙 — Walker"
  description="Walker 的内容宇宙：思考、生活、学习、工具、作品和点子的统一入口。"
  ogDescription="Walker 的内容宇宙：思考、生活、学习、工具、作品和点子的统一入口。"
  pageTitle="内容"
  pageSubtitle="Content Universe"
  pageIcon="layout-grid"
  itemCount={visibleItems.length}
  itemUnit="条"
>
  <section class="content-hero panel-glass">
    <p class="eyebrow">CONTENT UNIVERSE</p>
    <h1>点子是驱动力，生活是土壤。</h1>
    <p>
      这里不按固定栏目切开内容，而用形态、领域、意图和价值模式组织：文章、工具、厨艺、书法、日记、项目、点子都可以在同一个内容内核里生长。
    </p>
  </section>

  <ContentFilterTabs activeSpace={activeSpace} counts={counts} />

  <div class="active-space-note">
    当前视图：<strong>{activeLabel}</strong>
  </div>

  {visibleItems.length > 0 ? (
    <div class="content-grid">
      {visibleItems.map(item => <ContentUniverseCard item={item} />)}
    </div>
  ) : (
    <div class="empty-state panel-glass">
      <p>这个内容空间还在生长中。</p>
    </div>
  )}
</SidebarLayout>

<style>
  .content-hero {
    border-radius: 28px;
    border: 1px solid var(--color-nav-border);
    padding: 1.4rem;
    margin-bottom: 1.4rem;
  }

  .eyebrow {
    margin: 0 0 0.4rem;
    color: var(--color-brand);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
  }

  .content-hero h1 {
    margin: 0;
    color: var(--color-parchment);
    font-size: clamp(1.4rem, 3vw, 2.3rem);
    line-height: 1.2;
  }

  .content-hero p:last-child {
    margin: 0.8rem 0 0;
    max-width: 720px;
    color: var(--color-parchment-dim);
    font-size: 0.92rem;
    line-height: 1.85;
  }

  .active-space-note {
    margin-bottom: 1rem;
    color: var(--color-parchment-dim);
    font-size: 0.82rem;
  }

  .active-space-note strong {
    color: var(--color-parchment);
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }

  .empty-state {
    border-radius: 22px;
    padding: 3rem 1rem;
    text-align: center;
    color: var(--color-parchment-dim);
  }
</style>
```

- [x] **Step 2: Run type check**

Run:

```bash
npx astro check
```

Expected: PASS.

- [x] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: build succeeds and includes `/content/index.html` or prerendered equivalent.

- [x] **Step 4: Commit route**

```bash
git add src/pages/content/index.astro
git commit -m "feat: add content universe page"
```

---

## Task 6: Update Main Navigation to Stable Three Entrances

**Files:**
- Modify: `src/components/Navigation.astro`

- [x] **Step 1: Update imports and nav items**

In `src/components/Navigation.astro`, change the routes import and navGroups block to:

```astro
---
import SearchModal from './SearchModal.astro';
import TopNavBar from './nav/TopNavBar.astro';
import SidebarNav from './nav/SidebarNav.astro';
import MobileMenu from './nav/MobileMenu.astro';
import { ABOUT, CONTENT, HOME } from '@/lib/routes';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  hint?: string;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { label: '首页', href: HOME, icon: 'lucide:home', hint: 'Home' },
      { label: '内容', href: CONTENT, icon: 'lucide:layout-grid', hint: 'Content' },
      { label: '关于', href: ABOUT, icon: 'lucide:user', hint: 'About' },
    ]
  },
];

const currentPath = Astro.url.pathname;
const isHome = currentPath === '/';
const normalizedPath = currentPath.replace(/\/$/, '') || '/';
---
```

Leave the rest of the component unchanged.

- [x] **Step 2: Run type check**

Run:

```bash
npx astro check
```

Expected: PASS.

- [x] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Manually confirm old routes still build; do not delete `/posts`, `/tools`, `/ideas`, or `/projects` in this task.

- [x] **Step 4: Commit navigation**

```bash
git add src/components/Navigation.astro
git commit -m "feat: simplify main navigation"
```

---

## Task 7: Add AI-Readable Static Endpoints

**Files:**
- Create: `src/pages/llms.txt.ts`
- Create: `src/pages/walker-style.md.ts`
- Create: `src/pages/index.json.ts`

- [x] **Step 1: Create `/llms.txt` generator**

Create `src/pages/llms.txt.ts`:

```ts
import type { APIRoute } from 'astro';
import { getPublishedContentItems } from '@/lib/content';

export const prerender = true;

export const GET: APIRoute = async () => {
  const items = await getPublishedContentItems();
  const topItems = items.slice(0, 30);

  const body = [
    '# AdgaiWalker / Walker — AI-readable guide',
    '',
    '> 用点子连接人与 AI，也连接人与人。人决策，AI 执行。',
    '',
    '## 先读',
    '- /walker-style.md — Walker 的世界观、方法论和 AI 使用边界',
    '- /index.json — 结构化内容索引',
    '- /content — 给人看的内容宇宙入口',
    '',
    '## 内容入口',
    '- / — 首页',
    '- /content — 内容宇宙',
    '- /about — 关于 Walker 与这个系统',
    '',
    '## 最近内容',
    ...topItems.map(item => `- ${item.href} — ${item.title}：${item.summary}`),
    '',
    '## 使用规则',
    '- AI 可以读取公开内容作为背景。',
    '- 涉及情绪、日记、迷茫、吐槽的内容，不应直接作为稳定方法论引用。',
    '- 不可逆决策、对外发布、删除数据、资金操作必须由人确认。',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
```

- [x] **Step 2: Create `/walker-style.md` generator**

Create `src/pages/walker-style.md.ts`:

```ts
import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = async () => {
  const body = `# Walker 风格说明

## 北极星

用点子连接人与 AI，也连接人与人。独自前行时，人决策，AI 执行；共同前行时，点子让人成为同行者。用点子驱动 AI，点石成金，最终去到一个没有重复工作的地方。

## 人与 AI 的分工

- 人负责目标、判断、审美、选择、责任、意义、是否公开、是否继续。
- AI 负责读取、检索、整理、生成、拆解、提醒、执行、辅助沉淀。
- AI 不自动发布、不自动精选、不替人做不可逆决策。

## FerrySpec 关系

Ferry 是演化中的协议，iwalk.pro 是个人实践场，NorthStar 是社会实践场；三者通过反馈、阻滞与复盘共同进化。

## 做事方法

1. 混沌显影：把模糊想法、迷茫、吐槽、兴趣显出来。
2. 蓝图成型：明确目标、约束、第一步和验收标准。
3. 执行造物：让 AI 执行可撤回任务，人保留确认权。
4. 偏差修正：让现实反馈修正蓝图或行动。
5. 复盘沉淀：把经验沉淀成内容、方法、工具或新规则。

## 内容原则

- 内容同时拥有工具价值与存在价值。
- 生活内容是点子的土壤，不应被功利化。
- 数据提供现象，不提供目的。
- 公开方向，不公开脆弱。
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
```

- [x] **Step 3: Create `/index.json` generator**

Create `src/pages/index.json.ts`:

```ts
import type { APIRoute } from 'astro';
import { getPublishedContentItems } from '@/lib/content';

export const prerender = true;

export const GET: APIRoute = async () => {
  const items = await getPublishedContentItems();
  const payload = {
    site: 'iwalk.pro',
    title: 'AdgaiWalker / Walker',
    description: 'AI 时代的个人前进系统样板，用点子连接人与 AI，也连接人与人。',
    style: '/walker-style.md',
    contentEntry: '/content',
    generatedAt: 'build-time',
    content: items.map(item => ({
      id: item.id,
      title: item.title,
      url: item.href,
      summary: item.summary,
      date: item.date.toISOString(),
      updated: item.updated?.toISOString() ?? null,
      tags: item.tags,
      type: item.type,
      form: item.form,
      domain: item.domain,
      intent: item.intent,
      valueMode: item.valueMode,
      status: item.status ?? null,
      aiUseLevel: item.aiUseLevel,
      related: item.related,
    })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
```

- [x] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Confirm generated output includes `llms.txt`, `walker-style.md`, and `index.json` in the built client/static output.

- [x] **Step 5: Commit AI endpoints**

```bash
git add src/pages/llms.txt.ts src/pages/walker-style.md.ts src/pages/index.json.ts
git commit -m "feat: add AI-readable site endpoints"
```

---

## Task 8: Add Lightweight About Data Tab

**Files:**
- Modify: `src/pages/about/index.astro`

- [x] **Step 1: Inspect current about page structure**

Open `src/pages/about/index.astro` and identify a safe location near the existing site/roadmap/stat sections to add the data panel. Do not rewrite the whole page.

- [x] **Step 2: Add content counts import and data**

At the top frontmatter of `src/pages/about/index.astro`, add:

```ts
import { getPublishedContentItems } from '@/lib/content';
import { contentSpaces, itemBelongsToSpace } from '@/lib/content-model';

const contentItems = await getPublishedContentItems();
const contentCounts = contentSpaces.map(space => ({
  ...space,
  count: contentItems.filter(item => itemBelongsToSpace(item, space.key)).length,
}));
const totalLikesPlaceholder = 'Supabase 统计中';
```

If the file already has imports/constants, merge these lines into the existing frontmatter instead of creating a second frontmatter block.

- [x] **Step 3: Add data panel markup**

Add this section in the page body where it fits visually, preferably near site stats/roadmap:

```astro
<section class="about-data-panel panel-glass" id="data">
  <p class="about-data-eyebrow">PUBLIC DATA DOCK</p>
  <h2>数据提供现象，不提供目的。</h2>
  <p class="about-data-intro">
    这里先公开系统级轻量数据：内容数量、内容空间分布和反馈入口。它用于观察表达是否被看见、哪些方向值得继续解释，但不替代 Walker 的北极星。
  </p>

  <div class="about-data-grid">
    <div class="about-data-card">
      <span>公开内容</span>
      <strong>{contentItems.length}</strong>
      <em>条</em>
    </div>
    <div class="about-data-card">
      <span>点赞反馈</span>
      <strong>{totalLikesPlaceholder}</strong>
      <em>保持人工判断</em>
    </div>
  </div>

  <div class="about-data-spaces">
    {contentCounts.map(space => (
      <a href={space.key === 'all' ? '/content' : `/content?space=${space.key}`}>
        <span>{space.label}</span>
        <strong>{space.count}</strong>
      </a>
    ))}
  </div>
</section>
```

- [x] **Step 4: Add local styles**

Add this to the existing `<style>` block, or create one if the file does not have a style block:

```css
.about-data-panel {
  border: 1px solid var(--color-nav-border);
  border-radius: 28px;
  padding: 1.5rem;
  margin: 2rem 0;
}

.about-data-eyebrow {
  margin: 0 0 0.45rem;
  color: var(--color-brand);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
}

.about-data-panel h2 {
  margin: 0;
  color: var(--color-parchment);
  font-size: clamp(1.3rem, 2.4vw, 2rem);
}

.about-data-intro {
  max-width: 760px;
  margin: 0.75rem 0 0;
  color: var(--color-parchment-dim);
  line-height: 1.8;
  font-size: 0.9rem;
}

.about-data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.85rem;
  margin-top: 1.2rem;
}

.about-data-card,
.about-data-spaces a {
  border: 1px solid var(--color-nav-border);
  border-radius: 18px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.03);
}

.about-data-card span,
.about-data-card em {
  display: block;
  color: var(--color-parchment-dim);
  font-size: 0.76rem;
}

.about-data-card strong {
  display: block;
  margin: 0.35rem 0;
  color: var(--color-parchment);
  font-size: 1.4rem;
}

.about-data-spaces {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.7rem;
  margin-top: 0.9rem;
}

.about-data-spaces a {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: var(--color-parchment-dim);
  text-decoration: none;
  font-size: 0.8rem;
}

.about-data-spaces a:hover {
  color: var(--color-parchment);
  border-color: color-mix(in srgb, var(--color-brand) 35%, var(--color-nav-border));
}
```

- [x] **Step 5: Run checks**

Run:

```bash
npx astro check
npm run build
```

Expected: both PASS.

- [x] **Step 6: Commit data panel**

```bash
git add src/pages/about/index.astro
git commit -m "feat: add public data dock to about page"
```

---

## Task 9: Final Verification and Documentation Update

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-ai-era-idea-co-creation-architecture-design.md` if implementation discovers necessary clarifications.
- Test/build only otherwise.

- [x] **Step 1: Run full validation**

Run:

```bash
npx astro check
npm run build
```

Expected: both PASS.

- [x] **Step 2: Manually inspect local pages**

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:4321/
http://localhost:4321/content
http://localhost:4321/content?space=life
http://localhost:4321/about#data
http://localhost:4321/llms.txt
http://localhost:4321/walker-style.md
http://localhost:4321/index.json
```

Expected:

- Navigation shows 首页 / 内容 / 关于.
- `/content` renders cards and filters.
- Existing `/posts` and `/tools` still render if opened directly.
- `/about#data` shows the data panel.
- AI-readable endpoints return plain text/markdown/json.

- [x] **Step 3: Stop dev server**

If the dev server was started in the foreground, stop it with `Ctrl+C`. If it was started as a background task, stop that task via the task manager.

- [x] **Step 4: Commit any spec clarification**

Only if you edited the spec:

```bash
git add docs/superpowers/specs/2026-05-30-ai-era-idea-co-creation-architecture-design.md
git commit -m "docs: clarify idea co-creation implementation notes"
```

- [x] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: clean working tree, except for unrelated pre-existing changes the user already had before this plan.

---

## Self-Review

### Spec coverage

- Ferry as evolving protocol: covered in spec and preserved as documentation/AI style endpoint; no code implementation needed in Stage 1.
- iwalk.pro as personal practice field: covered by `/content`, about data dock, AI endpoints.
- NorthStar as social practice field: intentionally out of scope for this implementation plan.
- Content universe: implemented by content schema, adapter, `/content`, filter tabs, cards.
- Human I/O: implemented by `/content` UI and nav simplification.
- AI I/O: implemented by `/llms.txt`, `/walker-style.md`, `/index.json`.
- Feedback data dock: implemented as lightweight `/about#data` panel with existing counts; full analytics out of scope.
- Methodology evolution layer: represented in spec/style endpoint; implementation deferred until real feedback exists.

### Placeholder scan

This plan avoids TBD/TODO/FIXME placeholders in implementation steps. The phrase “out of scope” is used only to define boundaries, not as a missing implementation step.

### Type consistency

The schema fields, `ContentItem` adapter fields, UI labels, `/content` route, and JSON endpoint all use the same names: `form`, `domain`, `intent`, `valueMode`, `aiUsePolicy`, `related`.
