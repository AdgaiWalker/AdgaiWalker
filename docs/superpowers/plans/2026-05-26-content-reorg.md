# Walker 站点内容重组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 iwalk.pro 的内容组织从"按话题分类"改为"按用途分类"——知识、工具（含点子）、项目。

**Architecture:** 保留现有 Astro 6 + Tailwind v4 + Vercel 技术栈和视觉系统。核心改动是 content.config.ts 的 schema 重定义、内容迁移、路由重组。页面结构从分散的多入口（/ai/*, /explore/*, /idea/*）收为四页：首页、/tools、/posts、/about。

**Tech Stack:** Astro 6, Tailwind CSS v4, TypeScript, Vercel adapter

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `src/content.config.ts` | 重定义 log schema，移除 dockItem 集合 |
| 创建 | `src/content/log/cheap-communities.md` | 迁移自 dock，type: tool |
| 创建 | `src/content/log/dianzi-gongcu.md` | 迁移自 dock，type: tool |
| 修改 | `src/content/log/hello-walker.md` | 更新 frontmatter type |
| 修改 | `src/content/log/code-and-philosophy.md` | 更新 frontmatter type |
| 修改 | `src/content/log/dialogue-on-subtraction.mdx` | 更新 frontmatter type |
| 修改 | `src/content/log/ferry-theory-construction.md` | 更新 frontmatter type |
| 修改 | `src/lib/routes.ts` | 新增 TOOLS 路由常量，移除旧常量 |
| 创建 | `src/pages/tools/index.astro` | 工具+点子列表页 |
| 修改 | `src/pages/posts/index.astro` | 过滤为仅 knowledge 类型 |
| 修改 | `src/pages/posts/[slug].astro` | 移除 category-based 条件逻辑 |
| 修改 | `src/pages/index.astro` | 调整数据源 |
| 修改 | `src/components/Navigation.astro` | 更新导航链接 |
| 修改 | `src/components/RecentTraces.astro` | 数据源改为所有类型 |
| 修改 | `src/components/DockShowcase.astro` | 改为展示 tool 类型内容 |
| 修改 | `astro.config.mjs` | 添加旧路由 301 跳转 |
| 删除 | `src/content/dock/*` | 合并进 log 后删除 |
| 删除 | `src/pages/idea/*` | 旧路由页面，由 301 跳转替代 |

---

### Task 1: 更新 content.config.ts

**Files:**
- 修改: `src/content.config.ts`

- [ ] **Step 1: 重定义 log 集合 schema，移除 dockItem 集合**

将 `src/content.config.ts` 的全部内容替换为：

```typescript
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const log = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/log' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()),
    type: z.enum(['knowledge', 'tool', 'idea', 'project']),
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

- [ ] **Step 2: 验证构建**

运行: `cd C:\Users\26296\Desktop\AdgaiWalker && npx astro check`
预期：报错，因为现有 4 篇 log 的 type 和 category 值不符合新 schema。这是预期的，在 Task 3 修复。

---

### Task 2: 迁移 dock 内容到 log 集合

**Files:**
- 创建: `src/content/log/cheap-communities.md`
- 创建: `src/content/log/dianzi-gongcu.md`

- [ ] **Step 1: 创建 cheap-communities.md**

创建 `src/content/log/cheap-communities.md`，frontmatter 如下：

```markdown
---
title: 极客常用交流群 (QQ群)
date: 2026-05-01
tags: [AI, 编程, 中转, QQ群]
type: tool
published: true
summary: 关于 Antigravity 切号插件官方群、廉价 AI 探索群、Codex API 中转与低价 Gemini 账号售卖交流群。
rating: 5
url: https://lcndccjmtf4f.feishu.cn/wiki/GEZ2wYIwSiE8BNkJON9ccDsHnMg
communities:
  - name: Antigravity 官方群 (1025957317)
    description: Antigravity 切号插件官方交流群
    qrCode: /images/1025957317.png
    badge: 官方
    tag: 插件
  - name: 廉价 AI 探索群 (644241363)
    description: 低价 API 探索与实践
    qrCode: /images/644241363.png
    badge: 交流
    tag: API
  - name: Codex 中转群 (874615899)
    description: Codex API 中转服务交流
    qrCode: /images/874615899.png
    badge: 中转
    tag: Codex
  - name: 廉价 Gemini Pro 群 (921917596)
    description: 低价 Gemini 账号售卖交流
    qrCode: /images/921917596.png
    badge: 账号
    tag: Gemini
---

以下是几个常用的极客交流群，涵盖 AI 工具、API 中转、插件开发等方向。
```

- [ ] **Step 2: 创建 dianzi-gongcu.md**

创建 `src/content/log/dianzi-gongcu.md`，frontmatter 如下：

```markdown
---
title: 点子共促
date: 2026-05-01
tags: [AI, 提效, 落地, 微信]
type: tool
published: true
summary: 点子共促是一个 AI 学以致用与落地实践群，帮助普通人把点子做出来。
qrCode: /images/点子共促.jpg
---

点子共促是一个 AI 学以致用与落地实践群。如果你有一个点子，想要把它做出来，欢迎加入。
```

- [ ] **Step 3: 删除 dock 目录**

删除 `src/content/dock/` 目录及其全部内容（cheap-communities.md 和 dianzi-gongcu.md 已迁移到 log）。

---

### Task 3: 更新现有 log 文件的 frontmatter

**Files:**
- 修改: `src/content/log/hello-walker.md`
- 修改: `src/content/log/code-and-philosophy.md`
- 修改: `src/content/log/dialogue-on-subtraction.mdx`
- 修改: `src/content/log/ferry-theory-construction.md`

- [ ] **Step 1: 更新 hello-walker.md**

将 `src/content/log/hello-walker.md` 的 frontmatter 从：

```yaml
type: thought
category: life
```

改为：

```yaml
type: knowledge
```

（移除 `category: life`，因为 category 现在是可选的且不驱动页面结构）

- [ ] **Step 2: 更新 code-and-philosophy.md**

将 `src/content/log/code-and-philosophy.md` 的 frontmatter 从：

```yaml
type: article
category: ai
```

改为：

```yaml
type: knowledge
```

- [ ] **Step 3: 更新 dialogue-on-subtraction.mdx**

将 `src/content/log/dialogue-on-subtraction.mdx` 的 frontmatter 从：

```yaml
type: article
category: ai
```

改为：

```yaml
type: knowledge
```

- [ ] **Step 4: 更新 ferry-theory-construction.md**

将 `src/content/log/ferry-theory-construction.md` 的 frontmatter 从：

```yaml
type: article
category: utopia
```

改为：

```yaml
type: knowledge
```

- [ ] **Step 5: 验证构建**

运行: `cd C:\Users\26296\Desktop\AdgaiWalker && npx astro check`
预期：PASS，所有 frontmatter 类型检查通过。

---

### Task 4: 更新路由常量

**Files:**
- 修改: `src/lib/routes.ts`

- [ ] **Step 1: 更新 routes.ts**

将 `src/lib/routes.ts` 的全部内容替换为：

```typescript
/**
 * 路由常量 — 所有页面路径的单一来源
 */

// 列表页
export const POSTS = '/posts' as const;
export const TOOLS = '/tools' as const;

// 工具函数
export const postSlug = (id: string) => `${POSTS}/${id}` as const;
```

- [ ] **Step 2: 全局搜索替换旧路由常量引用**

在整个 `src/` 目录中搜索以下旧常量的所有引用，逐一更新：

- `DOCK` → 替换为 `TOOLS`
- `AI_IDEAS` → 替换为 `TOOLS`
- `AI_TOOLKIT` → 替换为 `TOOLS`
- `AI_SOURCES` → 替换为 `TOOLS`
- `dockSlug` → 替换为 `postSlug`

受影响的文件（需要在 import 和使用处更新）：
- `src/components/Navigation.astro`（import 和 navGroups）
- `src/components/DockShowcase.astro`（import 和链接）
- `src/pages/idea/` 下所有文件（将在 Task 9 中删除，此处暂不处理）

---

### Task 5: 更新导航组件

**Files:**
- 修改: `src/components/Navigation.astro`

- [ ] **Step 1: 更新导航链接**

在 `src/components/Navigation.astro` 的 frontmatter 中：

1. 更新 import：将 `import { POSTS, DOCK, AI_IDEAS } from '@/lib/routes';` 改为 `import { POSTS, TOOLS } from '@/lib/routes';`

2. 将 `navGroups` 数组从：

```typescript
const navGroups: NavGroup[] = [
  {
    items: [
      { label: '文章', href: POSTS, icon: 'lucide:pen-line', hint: 'Posts' },
      { label: 'Idea空间', href: '/idea', icon: 'lucide:layout-dashboard', hint: 'Idea Hub' },
      { label: 'AI探索', href: DOCK, icon: 'lucide:package', hint: 'Resources' },
      { label: 'Idea', href: AI_IDEAS, icon: 'lucide:lightbulb' },
    ]
  },
];
```

改为：

```typescript
const navGroups: NavGroup[] = [
  {
    items: [
      { label: '知识', href: POSTS, icon: 'lucide:pen-line', hint: 'Knowledge' },
      { label: '工具', href: TOOLS, icon: 'lucide:wrench', hint: 'Tools & Ideas' },
      { label: '关于', href: '/about', icon: 'lucide:user', hint: 'About' },
    ]
  },
];
```

- [ ] **Step 2: 搜索导航中的首页链接**

确认导航中是否已有首页链接。如果没有，在 navGroups items 数组最前面添加：

```typescript
{ label: '首页', href: '/', icon: 'lucide:home', hint: 'Home' },
```

最终 navGroups 应为：

```typescript
const navGroups: NavGroup[] = [
  {
    items: [
      { label: '首页', href: '/', icon: 'lucide:home', hint: 'Home' },
      { label: '知识', href: POSTS, icon: 'lucide:pen-line', hint: 'Knowledge' },
      { label: '工具', href: TOOLS, icon: 'lucide:wrench', hint: 'Tools & Ideas' },
      { label: '关于', href: '/about', icon: 'lucide:user', hint: 'About' },
    ]
  },
];
```

---

### Task 6: 创建 /tools 页面

**Files:**
- 创建: `src/pages/tools/index.astro`

- [ ] **Step 1: 创建工具列表页**

创建 `src/pages/tools/index.astro`：

```astro
---
import SidebarLayout from '../../layouts/SidebarLayout.astro';
import { getCollection } from 'astro:content';
import { Icon } from 'astro-icon/components';

export const prerender = true;

const allTools = await getCollection('log', ({ data }) =>
  data.published && (data.type === 'tool' || data.type === 'idea')
);
const tools = allTools.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
const toolItems = tools.filter(t => t.data.type === 'tool');
const ideaItems = tools.filter(t => t.data.type === 'idea');
---

<SidebarLayout
  title="工具与点子"
  description="前行路上用到的工具、冒出的点子"
  icon="lucide:wrench"
  count={tools.length}
>
  <div class="space-y-10">
    <!-- 筛选标签 -->
    <div class="flex gap-2 flex-wrap">
      <button class="filter-btn active px-3 py-1 rounded-full text-xs font-medium border transition-all" data-filter="all">
        全部 ({tools.length})
      </button>
      <button class="filter-btn px-3 py-1 rounded-full text-xs font-medium border border-[var(--color-nav-border)] text-parchment-dim hover:border-brand/40 transition-all" data-filter="tool">
        工具 ({toolItems.length})
      </button>
      <button class="filter-btn px-3 py-1 rounded-full text-xs font-medium border border-[var(--color-nav-border)] text-parchment-dim hover:border-brand/40 transition-all" data-filter="idea">
        点子 ({ideaItems.length})
      </button>
    </div>

    <!-- 工具列表 -->
    <div class="space-y-4" id="tools-list">
      {tools.map(entry => (
        <a
          href={`/posts/${entry.id}`}
          class:list={[
            'tool-item block panel-glass p-5 rounded-2xl transition-all duration-300 hover:border-brand/30 hover:-translate-y-0.5',
            `type-${entry.data.type}`,
          ]}
          data-type={entry.data.type}
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <Icon
                  name={entry.data.type === 'idea' ? 'lucide:lightbulb' : 'lucide:wrench'}
                  width={14}
                  height={14}
                  class="text-brand shrink-0"
                />
                <h3 class="text-sm font-bold truncate">{entry.data.title}</h3>
                {entry.data.status && (
                  <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                    {entry.data.status}
                  </span>
                )}
              </div>
              {entry.data.summary && (
                <p class="text-xs text-parchment-dim leading-relaxed line-clamp-2">
                  {entry.data.summary}
                </p>
              )}
              <div class="flex items-center gap-2 mt-2">
                {entry.data.tags.slice(0, 3).map(tag => (
                  <span class="text-[10px] text-parchment-dim/60 font-mono">#{tag}</span>
                ))}
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              {entry.data.rating && (
                <div class="flex items-center gap-0.5">
                  {Array.from({ length: entry.data.rating }).map(() => (
                    <Icon name="lucide:star" width={10} height={10} class="text-amber-400" />
                  ))}
                </div>
              )}
              {entry.data.url && (
                <Icon name="lucide:external-link" width={12} height={12} class="text-parchment-dim/40" />
              )}
            </div>
          </div>
        </a>
      ))}
    </div>

    {tools.length === 0 && (
      <div class="text-center py-20 text-parchment-dim">
        <Icon name="lucide:package-open" width={40} height={40} class="mx-auto mb-4 opacity-30" />
        <p class="text-sm">还没有工具或点子</p>
      </div>
    )}
  </div>
</SidebarLayout>

<script>
  function initFilter() {
    const btns = document.querySelectorAll('.filter-btn');
    const items = document.querySelectorAll('.tool-item');

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');

        // 更新按钮样式
        btns.forEach(b => {
          b.classList.remove('active');
          b.classList.add('border-[var(--color-nav-border)]', 'text-parchment-dim');
        });
        btn.classList.add('active');
        btn.classList.remove('border-[var(--color-nav-border)]', 'text-parchment-dim');

        // 筛选条目
        items.forEach(item => {
          const type = item.getAttribute('data-type');
          if (filter === 'all' || type === filter) {
            (item as HTMLElement).style.display = '';
          } else {
            (item as HTMLElement).style.display = 'none';
          }
        });
      });
    });
  }

  initFilter();
  document.addEventListener('astro:page-load', initFilter);
</script>

<style>
  .filter-btn.active {
    background: var(--color-brand);
    color: white;
    border-color: var(--color-brand);
  }
</style>
```

- [ ] **Step 2: 验证页面可访问**

运行: `cd C:\Users\26296\Desktop\AdgaiWalker && npm run build`
预期：构建成功，/tools/index.html 生成。

---

### Task 7: 更新 /posts 页面过滤逻辑

**Files:**
- 修改: `src/pages/posts/index.astro`
- 修改: `src/pages/posts/[slug].astro`

- [ ] **Step 1: 更新 /posts/index.astro 过滤条件**

在 `src/pages/posts/index.astro` 的 frontmatter 中，找到：

```typescript
const allLogs = await getCollection('log', ({ data }) => data.published);
```

改为：

```typescript
const allLogs = await getCollection('log', ({ data }) =>
  data.published && data.type === 'knowledge'
);
```

其他逻辑保持不变（按年份分组、时间线渲染）。

- [ ] **Step 2: 更新 /posts/[slug].astro 移除 category 条件**

在 `src/pages/posts/[slug].astro` 中：

1. 找到 `isAi` 相关逻辑，移除所有基于 `category === 'ai'` 的条件分支。

2. 将 `getStaticPaths` 中的过滤改为仅 knowledge 类型：

```typescript
export async function getStaticPaths() {
  const entries = await getCollection('log', ({ data }) =>
    data.published && data.type === 'knowledge'
  );
  return entries.map(entry => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}
```

3. 移除 `const isAi = entry.data.category === 'ai';` 及其所有条件分支。

4. 视频和资源区块改为基于 frontmatter 是否有数据来渲染（不依赖 category）：

```astro
{entry.data.videos && entry.data.videos.length > 0 && (
  <!-- 视频区块 -->
)}
{entry.data.resources && entry.data.resources.length > 0 && (
  <!-- 资源区块 -->
)}
```

5. MDX 组件（DialogueBubble、PromptBlock、BilibiliVideo）始终 import，它们只在 MDX 内容中使用时才渲染。

- [ ] **Step 3: 验证构建**

运行: `cd C:\Users\26296\Desktop\AdgaiWalker && npm run build`
预期：/posts 页面仅显示 knowledge 类型文章。文章详情页正常渲染。

---

### Task 8: 更新首页数据源

**Files:**
- 修改: `src/pages/index.astro`
- 修改: `src/components/RecentTraces.astro`
- 修改: `src/components/DockShowcase.astro`

- [ ] **Step 1: 更新 index.astro 数据获取**

在 `src/pages/index.astro` 的 frontmatter 中：

1. 将 `const aiLogs = allLogs.filter(log => log.data.category === 'ai')` 改为获取所有类型最新条目：

```typescript
const recentLogs = allLogs
  .filter(log => log.data.type === 'knowledge')
  .sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
```

2. 将传递给 RecentTraces 的 prop 从 `logs={aiLogs}` 改为 `logs={recentLogs}`。

3. 将 DockShowcase 组件的引用改为使用 log 集合：

```typescript
const toolEntries = await getCollection('log', ({ data }) =>
  data.published && (data.type === 'tool' || data.type === 'idea')
);
```

传递给 DockShowcase：`entries={toolEntries}`。

- [ ] **Step 2: 更新 RecentTraces.astro**

在 `src/components/RecentTraces.astro` 中：

- 组件逻辑不需要改动，它已经接受 `logs` prop 并展示最近文章。
- 确认链接指向 `/posts`（不是 `/idea` 或其他旧路径）。

- [ ] **Step 3: 更新 DockShowcase.astro**

将 `src/components/DockShowcase.astro` 改为接受 log 集合的 tool/idea 条目：

1. 移除顶层的 `await getCollection('dockItem')` 调用。

2. 添加 `entries` prop：

```astro
---
interface Props {
  entries: CollectionEntry<'log'>[];
}
const { entries } = Astro.props;

const featured = entries
  .filter(e => e.data.type === 'tool' && e.data.rating)
  .sort((a, b) => (b.data.rating ?? 0) - (a.data.rating ?? 0))
  .slice(0, 3);
---
```

3. 更新渲染逻辑：`entry.data.name` → `entry.data.title`，`entry.data.description` → `entry.data.summary`。

4. 更新链接：从 `/idea/explore/${entry.id}` 改为 `/posts/${entry.id}`。

5. 底部"浏览全部"链接从 `/idea/explore` 改为 `/tools`。

6. 类别图标映射更新：
   - tool → lucide:wrench
   - idea → lucide:lightbulb

- [ ] **Step 4: 验证首页渲染**

运行: `cd C:\Users\26296\Desktop\AdgaiWalker && npm run dev`
在浏览器中打开 `http://localhost:4321`，确认：
- 左栏显示最新 knowledge 文章
- 右栏显示 tool/idea 条目（带评分）
- 中栏 GreetingCard 和 BrandCard 正常

---

### Task 9: 删除旧页面，添加 301 跳转

**Files:**
- 删除: `src/pages/idea/` 整个目录（index.astro, explore/, ideas.astro, toolkit.astro, sources.astro, [slug].astro）
- 删除: `src/pages/life/` 目录（如果存在旧的重定向文件）
- 修改: `astro.config.mjs`

- [ ] **Step 1: 删除旧页面文件**

删除以下文件和目录：
- `src/pages/idea/index.astro`
- `src/pages/idea/explore/` 整个目录
- `src/pages/idea/ideas.astro`
- `src/pages/idea/toolkit.astro`
- `src/pages/idea/sources.astro`
- `src/pages/idea/[slug].astro`
- `src/pages/idea/rss.xml.ts`（如果不需要 RSS，删除；如需要可后续迁移）

- [ ] **Step 2: 更新 astro.config.mjs redirects**

在 `astro.config.mjs` 的 `redirects` 对象中，将现有重定向更新为：

```javascript
redirects: {
  '/ai': '/tools',
  '/ai/learn': '/posts',
  '/ai/sources': '/tools',
  '/ai/toolkit': '/tools',
  '/ai/ideas': '/tools',
  '/ai/:slug': '/posts/:slug',
  '/idea': '/tools',
  '/idea/explore': '/tools',
  '/idea/explore/:slug': '/tools',
  '/idea/ideas': '/tools',
  '/idea/toolkit': '/tools',
  '/idea/sources': '/tools',
  '/idea/:slug': '/posts/:slug',
  '/life': '/posts',
  '/life/:slug': '/posts/:slug',
},
```

- [ ] **Step 3: 验证所有旧路由跳转正确**

运行: `cd C:\Users\26296\Desktop\AdgaiWalker && npm run build && npm run preview`

用 curl 测试以下路由返回 301：
- `/ai` → `/tools`
- `/idea` → `/tools`
- `/idea/explore` → `/tools`
- `/life` → `/posts`

---

### Task 10: 全局清理和最终验证

**Files:**
- 全局搜索

- [ ] **Step 1: 搜索残留引用**

在 `src/` 目录中搜索以下关键词，确保没有残留引用：
- `dockItem` — 应该无结果（除了可能被移除的类型定义）
- `DOCK` — 应该无结果
- `AI_IDEAS` — 应该无结果
- `AI_TOOLKIT` — 应该无结果
- `AI_SOURCES` — 应该无结果
- `dockSlug` — 应该无结果
- `category: 'ai'` 或 `category: ai` — 检查是否还有基于 category 的逻辑
- `/idea/` — 确认没有硬编码的旧路由

- [ ] **Step 2: 运行类型检查和构建**

```bash
cd C:\Users\26296\Desktop\AdgaiWalker
npx astro check
npm run build
```

预期：类型检查通过，构建成功。

- [ ] **Step 3: 本地预览全面测试**

```bash
npm run preview
```

在浏览器中验证：
1. `/` — 首页正常，左栏最新知识文章，右栏工具展示
2. `/posts` — 仅显示 knowledge 类型文章
3. `/posts/hello-walker` — 文章详情正常渲染
4. `/tools` — 显示工具和点子，筛选功能正常
5. `/about` — 关于页不受影响
6. 左侧导航显示：首页 | 知识 | 工具 | 关于
7. 搜索功能正常
8. 旧路由 `/ai`、`/idea` 跳转到 `/tools`

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: reorganize content by purpose (knowledge/tool/idea/project)

- Redefine log collection type enum: knowledge, tool, idea, project
- Merge dockItem collection into log
- Create /tools page with filter
- Update /posts to show knowledge only
- Update navigation: Home, Knowledge, Tools, About
- Add 301 redirects for old routes (/ai/*, /idea/*)
- Remove old /idea/ page files"
```
