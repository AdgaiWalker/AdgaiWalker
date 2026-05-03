# Walker 2.0 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Walker 站点从深海暗色知识空间重构为明亮简洁的 AI 实践者内容站。

**Architecture:** 保留 Astro 6 + Content Collections 数据层不变。重构视觉层（色彩、布局、导航）和页面层（首页、关于页、内容详情页）。删除不再需要的页面和组件。

**Tech Stack:** Astro 6, Tailwind CSS v4, lucide-astro, React islands (Preact)

---

## 文件结构

### 修改的文件

| 文件 | 职责 |
|------|------|
| `src/styles/global.css` | 色彩系统从暗色切换到明亮 |
| `src/layouts/Base.astro` | 适配明亮主题，调整字体和链接颜色 |
| `src/components/Navigation.astro` | 极简导航：Walker + 搜索 + 关于 |
| `src/components/Footer.astro` | 适配明亮主题 |
| `src/pages/index.astro` | 新首页：内容列表 + 主题筛选 + 建议箱 + 随机推荐 |
| `src/pages/log/[...slug].astro` | 简化：添加返回按钮和关联主题 |
| `src/components/TraceCard.astro` | 简化为纯文字行，用 Lucide 图标区分类型 |
| `src/components/react/LogFilterIsland.tsx` | 重写为主题标签筛选（去掉概念筛选） |
| `src/components/react/SearchModalIsland.tsx` | 视觉适配明亮主题 |
| `src/components/TagFilter.astro` | 重写为主题筛选容器 |

### 新建的文件

| 文件 | 职责 |
|------|------|
| `src/pages/about.astro` | 关于页：视频 + 介绍 + 五层逻辑 + 概念 |
| `src/components/SuggestionBox.astro` | 建议箱模态框 |
| `src/pages/api/random.ts` | 随机推荐跳转端点（SSR 模式） |

### 删除的文件

| 文件 | 原因 |
|------|------|
| `src/pages/concept/index.astro` | 概念移入关于页 |
| `src/pages/concept/[id].astro` | 概念移入关于页 |
| `src/pages/framework.astro` | 框架移入关于页 |
| `src/pages/compass.astro` | 重定向不再需要 |
| `src/pages/prompts.astro` | 如不需要则删除 |
| `src/pages/tools.astro` | 如不需要则删除 |
| `src/pages/log/index.astro` | 日志列表合并到首页 |
| `src/components/ConceptCard.astro` | 概念在关于页以标签云展示 |
| `src/components/KnowledgeGraph.astro` | 暂不使用 |
| `src/components/HeroVideo.astro` | 视频移入关于页 |
| `src/components/FiveLayerFlow.astro` | 框架移入关于页 |
| `src/components/FrameworkLayer.astro` | 框架移入关于页 |
| `src/components/RecentTraces.astro` | 首页直接渲染内容列表 |
| `src/components/HarborAbout.astro` | 关于信息移入关于页 |

---

## Task 1: 色彩系统迁移

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: 替换色彩 token**

将 `src/styles/global.css` 的 `@theme` 块中的暗色 token 替换为明亮系 oklch 色彩：

```css
@import "tailwindcss";

@theme {
  /* 明亮基础色 */
  --color-bg: oklch(98% 0.005 80);
  --color-bg-subtle: oklch(96% 0.005 80);
  --color-text: oklch(15% 0.02 60);
  --color-text-muted: oklch(55% 0.01 60);
  --color-border: oklch(92% 0.005 80);

  /* Walker 金（保留，微调亮度） */
  --color-gold: oklch(78% 0.12 85);
  --color-gold-dim: oklch(65% 0.10 85);
  --color-gold-glow: oklch(85% 0.14 85);

  /* 向后兼容别名（其他组件还在用） */
  --color-sea-deep: oklch(98% 0.005 80);
  --color-sea-mid: oklch(96% 0.005 80);
  --color-sea-light: oklch(94% 0.005 80);
  --color-parchment: oklch(15% 0.02 60);
  --color-parchment-dim: oklch(40% 0.01 60);
  --color-mist: oklch(55% 0.01 60);
  --color-mist-light: oklch(70% 0.01 60);

  /* 字体 */
  --font-heading: Sora, system-ui, sans-serif;
  --font-body: "Noto Sans SC", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}

@layer base {
  html {
    scroll-behavior: smooth;
  }

  body {
    @apply bg-sea-deep text-parchment font-body antialiased;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-heading;
  }

  a {
    @apply text-gold hover:text-gold-glow transition-colors duration-200;
  }

  ::selection {
    @apply bg-gold/30 text-sea-deep;
  }
}

/* View Transitions */
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fade-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-8px); }
}

::view-transition-old(root) {
  animation: fade-out 0.2s ease-in;
}

::view-transition-new(root) {
  animation: fade-in 0.3s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: 构建验证**

运行: `npm run build`
预期: 构建成功，无错误。页面背景变为暖白，文字变为深棕黑。

- [ ] **Step 3: 提交**

```bash
git add src/styles/global.css
git commit -m "feat: 色彩系统从深海暗色迁移到明亮暖白"
```

---

## Task 2: 布局与导航

**Files:**
- Modify: `src/layouts/Base.astro`
- Modify: `src/components/Navigation.astro`
- Modify: `src/components/Footer.astro`

- [ ] **Step 1: 重写 Navigation.astro**

极简导航：左侧 Walker logo，右侧搜索图标 + 关于链接。移动端汉堡菜单。

```astro
---
import { Menu, Search } from 'lucide-astro';
import SearchModal from './SearchModal.astro';

const navItems = [
  { label: '关于', href: '/about' },
];
---

<nav class="fixed top-0 left-0 right-0 z-50 bg-bg/80 backdrop-blur-md border-b border-border">
  <div class="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
    <a href="/" class="font-heading text-lg text-text hover:text-gold transition-colors no-underline">
      Walker
    </a>

    <div class="flex items-center gap-4">
      <button
        id="nav-search-btn"
        class="text-text-muted hover:text-text transition-colors"
        aria-label="搜索"
      >
        <Search class="w-4 h-4" strokeWidth={1.8} />
      </button>

      <div class="hidden md:flex items-center gap-4">
        {navItems.map(item => (
          <a
            href={item.href}
            class:list={[
              'font-heading text-sm no-underline transition-colors',
              Astro.url.pathname === item.href
                ? 'text-gold'
                : 'text-text-muted hover:text-text',
            ]}
          >
            {item.label}
          </a>
        ))}
      </div>

      <button
        id="mobile-menu-btn"
        class="md:hidden text-text-muted hover:text-text transition-colors"
        aria-label="菜单"
      >
        <Menu class="w-5 h-5" strokeWidth={1.8} />
      </button>
    </div>
  </div>

  <div id="mobile-menu" class="hidden md:hidden border-t border-border bg-bg">
    <div class="px-6 py-3 flex flex-col gap-3">
      {navItems.map(item => (
        <a
          href={item.href}
          class="font-heading text-sm text-text-muted hover:text-text transition-colors no-underline py-1"
        >
          {item.label}
        </a>
      ))}
    </div>
  </div>

  <SearchModal />
</nav>

<script>
  document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('mobile-menu')?.classList.toggle('hidden');
  });
</script>
```

- [ ] **Step 2: 更新 Base.astro**

移除暗色背景相关的 class，确保布局适配明亮主题。主要改动：body 的 class 不变（通过 CSS 变量已切换），确认 `<ClientRouter />` 保留。

```astro
---
import Navigation from '../components/Navigation.astro';
import Footer from '../components/Footer.astro';

interface Props {
  title?: string;
  description?: string;
  jsonLd?: { type: string; data: Record<string, unknown> } | null;
}

const {
  title = 'Walker',
  description = '用 AI 做更少但更好的事',
  jsonLd = null,
} = Astro.props;
---

<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@300;400;500;700&family=Sora:wght@300;400;600;700&display=swap"
      rel="stylesheet"
    />
    <ClientRouter />
    <title>{title}</title>
    {jsonLd && (
      <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
    )}
  </head>
  <body class="min-h-screen flex flex-col">
    <Navigation />
    <main class="flex-1 pt-14">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

- [ ] **Step 3: 更新 Footer.astro**

```astro
---
---
<footer class="border-t border-border py-8 px-6">
  <div class="max-w-3xl mx-auto flex flex-col items-center gap-2">
    <p class="text-text-muted text-sm font-heading">
      用 AI 做更少但更好的事
    </p>
    <p class="text-text-muted/60 text-xs">
      &copy; {new Date().getFullYear()} Walker
    </p>
  </div>
</footer>
```

- [ ] **Step 4: 构建验证**

运行: `npm run build`
预期: 构建成功。导航栏白底，文字深色，Walker logo 在左，搜索+关于在右。

- [ ] **Step 5: 提交**

```bash
git add src/components/Navigation.astro src/layouts/Base.astro src/components/Footer.astro
git commit -m "feat: 极简导航栏 + 明亮布局"
```

---

## Task 3: 首页重写

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/components/TraceCard.astro`

- [ ] **Step 1: 简化 TraceCard.astro 为纯文字行**

所有内容类型统一为一行：Lucide 图标 + 标题 + 日期。外部链接用 ExternalLink 图标标记。

```astro
---
import { FileText, ExternalLink, MessagesSquare, Sparkles, Video, ChefHat, Lightbulb } from 'lucide-astro';

interface Props {
  title: string;
  date: Date;
  tags: string[];
  type: 'article' | 'photo' | 'thought' | 'project' | 'dialogue' | 'recipe' | 'video' | 'audio' | 'gallery' | 'prompt';
  slug: string;
  cover?: string;
  excerpt?: string;
  link?: string;
}

const { title, date, tags, type, slug, link } = Astro.props;

const formatDate = (d: Date) =>
  d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

const isExternal = type === 'video' || type === 'audio' || type === 'gallery' || !!link;
const href = isExternal && link ? link : `/log/${slug}`;

const typeIcon: Record<string, any> = {
  article: FileText,
  dialogue: MessagesSquare,
  thought: Sparkles,
  recipe: ChefHat,
  video: Video,
  audio: Video,
  gallery: Video,
  prompt: Lightbulb,
  photo: FileText,
  project: FileText,
};
const Icon = typeIcon[type] || FileText;
---

<a
  href={href}
  class:list={[
    'flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-bg-subtle transition-colors no-underline group',
  ]}
  {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
>
  <Icon class="w-4 h-4 text-text-muted shrink-0" strokeWidth={1.8} />
  <span class="flex-1 text-text text-sm group-hover:text-gold transition-colors truncate">
    {title}
  </span>
  {isExternal && (
    <ExternalLink class="w-3 h-3 text-text-muted/50 shrink-0" strokeWidth={1.8} />
  )}
  <time class="text-text-muted text-xs font-mono shrink-0">{formatDate(date)}</time>
</a>
```

- [ ] **Step 2: 重写 index.astro**

首页：标题 + 定位语 + 最新内容列表 + 主题标签筛选 + 建议箱 + 随机推荐。

```astro
---
import Base from '../layouts/Base.astro';
import TraceCard from '../components/TraceCard.astro';
import { Lightbulb, Shuffle } from 'lucide-astro';
import { extractExcerpt } from '../utils/excerpt';
import { getPublishedLogEntries } from '../utils/knowledge';

const allLogs = await getPublishedLogEntries();
const recentLogs = allLogs.slice(0, 8);

const tagCount = new Map<string, number>();
allLogs.forEach(entry => {
  entry.data.tags.forEach(tag => {
    tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
  });
});
const allTags = [...tagCount.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([tag]) => tag);
---

<Base title="Walker — 用 AI 做更少但更好的事">
  <div class="max-w-3xl mx-auto px-6 pt-20 pb-16">
    <!-- 标题区 -->
    <div class="mb-12">
      <h1 class="font-heading text-2xl font-semibold text-text mb-2">Walker</h1>
      <p class="text-text-muted text-base">用 AI 做更少但更好的事</p>
    </div>

    <!-- 主题标签 -->
    <div class="flex flex-wrap gap-2 mb-8" id="topic-filter">
      <button
        data-topic="all"
        class="topic-pill active font-heading text-sm px-3 py-1 rounded-full border border-border text-text-muted hover:text-text hover:border-gold/30 transition-all no-underline"
      >
        全部
      </button>
      {allTags.map(tag => (
        <button
          data-topic={tag}
          class="topic-pill font-heading text-sm px-3 py-1 rounded-full border border-border text-text-muted hover:text-text hover:border-gold/30 transition-all no-underline"
        >
          {tag}
        </button>
      ))}
    </div>

    <!-- 内容列表 -->
    <div id="content-list" class="divide-y divide-border">
      {recentLogs.map(entry => (
        <div data-log-entry data-tags={JSON.stringify(entry.data.tags)}>
          <TraceCard
            title={entry.data.title}
            date={entry.data.date}
            tags={entry.data.tags}
            type={entry.data.type}
            slug={entry.id}
            cover={entry.data.cover}
            excerpt={extractExcerpt(entry.body)}
            link={entry.data.link}
          />
        </div>
      ))}
    </div>

    {recentLogs.length === 0 && (
      <p class="text-text-muted text-center py-12">还没有内容，敬请期待。</p>
    )}

    <!-- 底部操作 -->
    <div class="mt-12 flex items-center justify-between">
      <a
        href="#suggestion"
        class="inline-flex items-center gap-2 text-text-muted text-sm hover:text-gold transition-colors no-underline"
      >
        <Lightbulb class="w-4 h-4" strokeWidth={1.8} />
        建议箱
      </a>
      <a
        href="/api/random"
        class="inline-flex items-center gap-2 text-text-muted text-sm hover:text-gold transition-colors no-underline"
      >
        <Shuffle class="w-4 h-4" strokeWidth={1.8} />
        随便看看
      </a>
    </div>

    <!-- 建议箱 -->
    <div id="suggestion" class="mt-16 pt-8 border-t border-border">
      <h2 class="font-heading text-lg text-text mb-4">想看什么话题？</h2>
      <form class="flex gap-3" action="https://formspree.io/f/xxx" method="POST">
        <input
          type="text"
          name="suggestion"
          placeholder="比如：怎么用 AI 做 PPT"
          class="flex-1 px-4 py-2 rounded-lg border border-border bg-bg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-gold/50"
        />
        <button
          type="submit"
          class="px-4 py-2 rounded-lg bg-gold text-sea-deep text-sm font-heading hover:bg-gold-glow transition-colors"
        >
          提交
        </button>
      </form>
    </div>
  </div>

  <style>
    .topic-pill.active {
      background: oklch(78% 0.12 85);
      color: oklch(15% 0.02 60);
      border-color: oklch(78% 0.12 85);
    }
  </style>

  <script>
    const filter = document.getElementById('topic-filter');
    const entries = document.querySelectorAll('[data-log-entry]');

    filter?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-topic]');
      if (!btn) return;

      const topic = btn.getAttribute('data-topic');

      document.querySelectorAll('.topic-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      entries.forEach(entry => {
        const el = entry as HTMLElement;
        if (topic === 'all') {
          el.hidden = false;
          return;
        }
        const tags = JSON.parse(el.dataset.tags || '[]');
        el.hidden = !tags.includes(topic);
      });
    });
  </script>
</Base>
```

- [ ] **Step 3: 构建验证**

运行: `npm run build`
预期: 构建成功。首页白底，标题"Walker"，内容列表为纯文字行，主题标签可点击筛选。

- [ ] **Step 4: 提交**

```bash
git add src/pages/index.astro src/components/TraceCard.astro
git commit -m "feat: 新首页 — 内容列表 + 主题筛选 + 建议箱"
```

---

## Task 4: 关于页

**Files:**
- Create: `src/pages/about.astro`

- [ ] **Step 1: 创建 about.astro**

关于页包含：视频（从 HeroVideo 移过来）+ 自我介绍 + 社交链接 + 五层逻辑 + 概念标签云。

```astro
---
import Base from '../layouts/Base.astro';
import { Github, Twitter, Mail, ExternalLink } from 'lucide-astro';
import { getActiveConcepts, getLayerConcepts, buildConceptCounts, getPublishedLogEntries } from '../utils/knowledge';

const allConcepts = await getActiveConcepts();
const allLog = await getPublishedLogEntries();
const conceptCounts = buildConceptCounts(allLog);
const layerConcepts = getLayerConcepts(allConcepts);
---

<Base title="关于 — Walker">
  <div class="max-w-3xl mx-auto px-6 pt-20 pb-16">
    <!-- 视频 -->
    <div class="relative rounded-xl overflow-hidden mb-12 aspect-video bg-bg-subtle">
      <video
        autoplay
        muted
        loop
        playsinline
        class="w-full h-full object-cover"
      >
        <source src="/video/hero.mp4" type="video/mp4" />
      </video>
      <noscript>
        <img src="/images/hero-bg.png" alt="Walker" class="w-full h-full object-cover" />
      </noscript>
    </div>

    <!-- 自我介绍 -->
    <div class="mb-12">
      <h1 class="font-heading text-2xl font-semibold text-text mb-3">嗯，我是 Walker</h1>
      <p class="text-text-muted text-base leading-relaxed mb-6">
        在 AI 时代做更少但更好的事。写代码、做饭、拍照、思考哲学、在路上。
      </p>

      <!-- 社交链接 -->
      <div class="flex items-center gap-4">
        <a href="https://github.com/AdgaiWalker" target="_blank" rel="noopener noreferrer" class="text-text-muted hover:text-gold transition-colors no-underline">
          <Github class="w-5 h-5" strokeWidth={1.8} />
        </a>
        <a href="mailto:walker@example.com" class="text-text-muted hover:text-gold transition-colors no-underline">
          <Mail class="w-5 h-5" strokeWidth={1.8} />
        </a>
      </div>
    </div>

    <!-- 五层逻辑 -->
    <div class="mb-12">
      <h2 class="font-heading text-lg text-text mb-6">我怎么思考</h2>
      <div class="space-y-0">
        {layerConcepts.map((concept, i) => (
          <div class="flex items-stretch gap-4">
            <div class="flex flex-col items-center">
              <div class="w-8 h-8 rounded-full border border-gold/40 flex items-center justify-center text-gold/70 text-xs font-heading">
                {concept.data.symbol}
              </div>
              {i < layerConcepts.length - 1 && (
                <div class="flex-1 w-px bg-border my-1"></div>
              )}
            </div>
            <div class="flex-1 py-2">
              <h3 class="font-heading text-sm text-text">{concept.data.title}</h3>
              <p class="text-text-muted text-xs mt-0.5">
                {conceptCounts.get(concept.id) ?? 0} 篇相关内容
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>

    <!-- 概念 -->
    <div>
      <h2 class="font-heading text-lg text-text mb-4">概念</h2>
      <div class="flex flex-wrap gap-2">
        {allConcepts.filter(c => !c.data.layer).map(concept => (
          <span class="text-sm px-3 py-1 rounded-full border border-border text-text-muted">
            {concept.data.title}
          </span>
        ))}
      </div>
    </div>
  </div>
</Base>

<script>
  const video = document.querySelector('video');
  if (video) {
    video.addEventListener('error', () => {
      const img = document.createElement('img');
      img.src = '/images/hero-bg.png';
      img.alt = 'Walker';
      img.className = 'w-full h-full object-cover';
      video.parentElement?.replaceChild(img, video);
    });
  }
</script>
```

- [ ] **Step 2: 构建验证**

运行: `npm run build`
预期: 构建成功。关于页包含视频、自我介绍、五层逻辑纵列、概念标签云。

- [ ] **Step 3: 提交**

```bash
git add src/pages/about.astro
git commit -m "feat: 关于页 — 视频 + 介绍 + 五层逻辑 + 概念"
```

---

## Task 5: 内容详情页简化

**Files:**
- Modify: `src/pages/log/[...slug].astro`
- Modify: `src/components/templates/ArticleTemplate.astro`

- [ ] **Step 1: 读取 ArticleTemplate.astro 当前内容**

读取文件，了解现有结构。

- [ ] **Step 2: 简化 log/[...slug].astro**

在内容详情页添加"← 返回"按钮和底部关联主题。使用 `transition:persist` 保持导航不变。

```astro
---
import Base from '../../layouts/Base.astro';
import PromptBlock from '../../components/PromptBlock.astro';
import DialogueBubble from '../../components/DialogueBubble.astro';
import ArticleTemplate from '../../components/templates/ArticleTemplate.astro';
import DialogueTemplate from '../../components/templates/DialogueTemplate.astro';
import RecipeTemplate from '../../components/templates/RecipeTemplate.astro';
import ThoughtTemplate from '../../components/templates/ThoughtTemplate.astro';
import ProjectTemplate from '../../components/templates/ProjectTemplate.astro';
import { ArrowLeft } from 'lucide-astro';
import { getCollection, render } from 'astro:content';
import { extractExcerpt } from '../../utils/excerpt';

export async function getStaticPaths() {
  const entries = await getCollection('log', ({ data }) => data.published);
  return entries.map(entry => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}

const { entry } = Astro.props;

if (!entry) {
  return Astro.redirect('/404');
}

const { Content } = await render(entry);
const components = { PromptBlock, DialogueBubble };

const rawBody = entry.body || '';
const description = (extractExcerpt(rawBody, 160) || '').replace(/\.\.\.$/, '');

const templates: Record<string, any> = {
  article: ArticleTemplate,
  dialogue: DialogueTemplate,
  recipe: RecipeTemplate,
  thought: ThoughtTemplate,
  project: ProjectTemplate,
  photo: ArticleTemplate,
  video: ArticleTemplate,
  audio: ArticleTemplate,
  gallery: ArticleTemplate,
  prompt: ArticleTemplate,
};

const Template = templates[entry.data.type] || ArticleTemplate;
---

<Base title={`${entry.data.title} — Walker`} description={description}>
  <div class="max-w-3xl mx-auto px-6 pt-20 pb-16">
    <!-- 返回按钮 -->
    <a
      href="/"
      class="inline-flex items-center gap-1.5 text-text-muted text-sm hover:text-gold transition-colors no-underline mb-8"
    >
      <ArrowLeft class="w-4 h-4" strokeWidth={1.8} />
      返回
    </a>

    <!-- 内容模板 -->
    <Template entry={entry} Content={Content} components={components} />

    <!-- 关联主题 -->
    {entry.data.tags && entry.data.tags.length > 0 && (
      <div class="mt-12 pt-8 border-t border-border">
        <p class="text-text-muted text-xs font-heading mb-3">关联主题</p>
        <div class="flex flex-wrap gap-2">
          {entry.data.tags.map((tag: string) => (
            <span class="text-sm px-3 py-1 rounded-full border border-border text-text-muted">
              {tag}
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
</Base>
```

- [ ] **Step 3: 适配内容模板的明亮主题**

读取 `src/components/templates/ArticleTemplate.astro`，将暗色 class（`text-parchment`、`bg-sea-mid` 等）替换为明亮主题 class。具体改动取决于模板内容，核心替换规则：
- `text-parchment` → `text-text`
- `text-parchment/XX` → `text-text/XX` 或 `text-text-muted`
- `text-mist` / `text-mist-light` → `text-text-muted`
- `bg-sea-mid` → `bg-bg-subtle`
- `border-mist/XX` → `border-border`
- `bg-gold/XX text-sea-deep` → 保持不变（金色按钮在明亮主题下也用深色文字）

对其他模板文件做同样处理：`DialogueTemplate.astro`、`ThoughtTemplate.astro`、`RecipeTemplate.astro`、`ProjectTemplate.astro`。

- [ ] **Step 4: 构建验证**

运行: `npm run build`
预期: 构建成功。内容页白底，顶部有返回按钮，底部有关联主题标签。

- [ ] **Step 5: 提交**

```bash
git add src/pages/log/[...slug].astro src/components/templates/
git commit -m "feat: 内容详情页 — 返回按钮 + 关联主题 + 明亮适配"
```

---

## Task 6: 搜索与随机推荐

**Files:**
- Modify: `src/components/react/SearchModalIsland.tsx` — 视觉适配明亮主题
- Create: `src/pages/api/random.ts` — 随机推荐跳转

- [ ] **Step 1: 读取 SearchModalIsland.tsx**

读取当前内容，了解结构。

- [ ] **Step 2: 适配 SearchModal 的明亮主题**

将搜索模态框的暗色样式替换为明亮样式：
- 模态框背景：`bg-white` / `bg-bg`
- 输入框：白底，深色文字
- 搜索结果：浅灰 hover
- 覆盖层：`bg-black/30`

- [ ] **Step 3: 创建随机推荐端点**

创建 `src/pages/api/random.ts`：

```typescript
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const entries = await getCollection('log', ({ data }) => data.published);
  const random = entries[Math.floor(Math.random() * entries.length)];

  if (!random) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/' },
    });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: `/log/${random.id}` },
  });
};
```

注意：此端点需要 SSR 模式。如果当前是 static 模式，需要改用客户端方案——在首页 script 中用 JSON 数据随机选取并 `window.location.href` 跳转。在这种情况下，首页 index.astro 的随机推荐链接改为：

```astro
<a
  href="#"
  id="random-btn"
  class="inline-flex items-center gap-2 text-text-muted text-sm hover:text-gold transition-colors no-underline"
>
  <Shuffle class="w-4 h-4" strokeWidth={1.8} />
  随便看看
</a>
```

```javascript
// 在首页 script 中添加
document.getElementById('random-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  const entries = document.querySelectorAll('[data-log-entry]');
  const visible = [...entries].filter(el => !(el as HTMLElement).hidden);
  if (visible.length === 0) return;
  const pick = visible[Math.floor(Math.random() * visible.length)];
  const link = pick.querySelector('a');
  if (link) link.click();
});
```

- [ ] **Step 4: 构建验证**

运行: `npm run build`
预期: 构建成功。Cmd+K 搜索框明亮样式。随机推荐点击可跳转。

- [ ] **Step 5: 提交**

```bash
git add src/components/react/SearchModalIsland.tsx src/components/SearchModal.astro src/pages/index.astro
git commit -m "feat: 搜索适配明亮主题 + 随机推荐"
```

---

## Task 7: 清理

**Files:**
- Delete: `src/pages/concept/index.astro`
- Delete: `src/pages/concept/[id].astro`
- Delete: `src/pages/framework.astro`
- Delete: `src/pages/compass.astro`
- Delete: `src/pages/log/index.astro`
- Delete: `src/components/ConceptCard.astro`
- Delete: `src/components/KnowledgeGraph.astro`
- Delete: `src/components/HeroVideo.astro`
- Delete: `src/components/FiveLayerFlow.astro`
- Delete: `src/components/FrameworkLayer.astro`
- Delete: `src/components/RecentTraces.astro`
- Delete: `src/components/HarborAbout.astro`
- Delete: `src/components/TagFilter.astro`
- Delete: `src/components/react/LogFilterIsland.tsx`

- [ ] **Step 1: 删除不再使用的页面**

```bash
rm src/pages/concept/index.astro
rm src/pages/concept/[id].astro
rm src/pages/framework.astro
rm src/pages/compass.astro
rm src/pages/log/index.astro
```

- [ ] **Step 2: 删除不再使用的组件**

```bash
rm src/components/ConceptCard.astro
rm src/components/KnowledgeGraph.astro
rm src/components/HeroVideo.astro
rm src/components/FiveLayerFlow.astro
rm src/components/FrameworkLayer.astro
rm src/components/RecentTraces.astro
rm src/components/HarborAbout.astro
rm src/components/TagFilter.astro
rm src/components/react/LogFilterIsland.tsx
```

- [ ] **Step 3: 检查 prompts.astro 和 tools.astro**

读取 `src/pages/prompts.astro` 和 `src/pages/tools.astro`，判断是否还需要保留。如果不需要则删除。如果保留，需要适配明亮主题。

- [ ] **Step 4: 构建验证**

运行: `npm run build`
预期: 构建成功。确认无 404 引用错误。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore: 清理不再使用的页面和组件"
```

---

## Task 8: 最终验证与 404 适配

**Files:**
- Modify: `src/pages/404.astro`

- [ ] **Step 1: 更新 404 页面适配明亮主题**

将 404 页面的暗色背景替换为明亮样式。去掉 `fixed inset-0` 的深蓝渐变，使用和 Base layout 一致的明亮风格。

- [ ] **Step 2: 全站构建 + 视觉验证**

运行: `npm run build`
预期: 所有页面构建成功，无错误。

启动开发服务器 `npm run dev`，逐页检查：
- `/` — 首页内容列表 + 主题筛选
- `/about` — 关于页视频 + 五层逻辑
- 任意 `/log/xxx` — 内容详情 + 返回按钮
- Cmd+K — 搜索模态框
- 随便看看 — 随机跳转
- 建议箱 — 表单可提交
- 404 页面 — 明亮主题

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: Walker 2.0 — 明亮 AI 实践者内容站"
```
