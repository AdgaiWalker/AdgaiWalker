# 选题投票系统实施计划

日期：2026-05-03

## 目标

在 Walker 站点实现选题投票系统。访客可以提建议、投票，Walker 在 Obsidian 中管理选题。

## 系统架构

```
访客提交建议 ──→ Vercel API Route ──→ GitHub (topics/suggestions/*.md)
                                         ↓
访客投票 ──────→ Vercel API Route ──→ Vercel KV
                       ↓
              公开话题页面 ──→ 读取 topics/public/*.md + KV 票数
```

## 数据结构

### GitHub 存储

`/topics/suggestions/` — 访客建议（未审核）
`/topics/public/` — 已公开话题（已采纳）

建议文件 `2026-05-03-ai-learning.md`：
```md
---
title: 怎么用 AI 学英语
submitter: 匿名
date: 2026-05-03
---
来自网站的建议
```

公开话题文件 `ai-learning.md`：
```md
---
title: 怎么用 AI 学英语
slug: ai-learning
votes: 0
status: planned
created: 2026-05-03
---
```

### Vercel KV 存储

| key | value |
|-----|-------|
| `vote:{slug}` | 票数 (number) |
| `voted:{ip}` | 已投票的 slug 列表 (JSON array) |

## 技术实现

### Task 1: GitHub Repo 准备

**Files:**
- Create: `topics/.gitkeep`
- Create: `topics/suggestions/.gitkeep`
- Create: `topics/public/.gitkeep`

- [ ] **Step 1: 在 GitHub 创建 `walker-topics` 仓库**

在 GitHub 创建新仓库 `walker-topics`（或现有仓库的 `topics/` 目录）。

- [ ] **Step 2: 创建目录结构**

```
topics/
  suggestions/
    .gitkeep
  public/
    .gitkeep
```

- [ ] **Step 3: 提交并同步到 Obsidian**

```bash
git init
git add topics/
git commit -m "chore: 初始化选题目录"
git remote add origin https://github.com/AdgaiWalker/walker-topics.git
git push -u origin main
```

- [ ] **Step 4: Obsidian 配置**

在 Obsidian 中打开 `walker-topics` vault，安装 `obsidian-git` 插件，配置自动 pull/push。

---

### Task 2: Vercel KV 配置

**Files:**
- Modify: `vercel.json` 或环境配置

- [ ] **Step 1: 安装 Vercel KV**

```bash
npm install @vercel/kv
```

- [ ] **Step 2: 配置环境变量**

在 Vercel 项目设置中添加：
- `KV_REST_API_URL` — from Vercel KV dashboard
- `KV_REST_API_TOKEN` — from Vercel KV dashboard

---

### Task 3: API Route — 提建议

**Files:**
- Create: `src/pages/api/suggestion.ts`

- [ ] **Step 1: 创建 API Route**

```typescript
import type { APIRoute } from 'astro';
import { kv } from '@vercel/kv';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { title, submitter = '匿名' } = body;

  if (!title || title.trim().length < 3) {
    return new Response(JSON.stringify({ error: '标题太短' }), { status: 400 });
  }

  // 简单 spam 过滤：3分钟内同一 IP 只能提交 1 次
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const lastSubmit = await kv.get(`lastsubmit:${ip}`);
  if (lastSubmit) {
    const diff = Date.now() - Number(lastSubmit);
    if (diff < 180000) {
      return new Response(JSON.stringify({ error: '提交太频繁' }), { status: 429 });
    }
  }

  await kv.set(`lastsubmit:${ip}`, Date.now());

  // 生成文件名
  const date = new Date().toISOString().split('T')[0];
  const id = Math.random().toString(36).slice(2, 8);
  const filename = `${date}-${id}.md`;

  const content = `---
title: ${title.trim()}
submitter: ${submitter}
date: ${date}
---

来自网站的建议
`;

  // 通过 GitHub API 写入文件
  const githubToken = import.meta.env.GITHUB_TOKEN;
  const repo = 'AdgaiWalker/walker-topics';
  const path = `topics/suggestions/${filename}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `feat: 新增建议 — ${title}`,
      content: btoa(unescape(encodeURIComponent(content))),
    }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: '提交失败' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true, filename }));
};
```

- [ ] **Step 2: 添加环境变量到 .env.local**

```bash
GITHUB_TOKEN=ghp_xxxxx
```

- [ ] **Step 3: 测试**

```bash
curl -X POST http://localhost:4321/api/suggestion \
  -H "Content-Type: application/json" \
  -d '{"title": "怎么用 AI 学英语"}'
```

预期：GitHub 仓库新增 md 文件

---

### Task 4: API Route — 投票

**Files:**
- Create: `src/pages/api/vote.ts`

- [ ] **Step 1: 创建投票 API**

```typescript
import type { APIRoute } from 'astro';
import { kv } from '@vercel/kv';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { slug, action = 'add' } = body;

  if (!slug) {
    return new Response(JSON.stringify({ error: '缺少 slug' }), { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const votedKey = `voted:${ip}`;
  const votedList = (await kv.get<string[]>(votedKey)) ?? [];

  if (action === 'check') {
    return new Response(JSON.stringify({ voted: votedList.includes(slug) }));
  }

  if (action === 'add') {
    if (votedList.includes(slug)) {
      return new Response(JSON.stringify({ error: '已投过票' }), { status: 400 });
    }
    await kv.incr(`vote:${slug}`);
    votedList.push(slug);
    await kv.set(votedKey, votedList);
    return new Response(JSON.stringify({ success: true }));
  }

  if (action === 'remove') {
    if (!votedList.includes(slug)) {
      return new Response(JSON.stringify({ error: '未投票' }), { status: 400 });
    }
    await kv.decr(`vote:${slug}`);
    await kv.set(votedKey, votedList.filter(s => s !== slug));
    return new Response(JSON.stringify({ success: true }));
  }

  return new Response(JSON.stringify({ error: '未知操作' }), { status: 400 });
};
```

- [ ] **Step 2: 获取票数 API**

```typescript
export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');

  if (slug) {
    const votes = await kv.get<number>(`vote:${slug}`) ?? 0;
    return new Response(JSON.stringify({ slug, votes }));
  }

  // 返回所有话题票数
  const slugs = ['ai-learning', 'ai-ppt', 'ai-save-money']; // TODO: 从 GitHub 读取
  const votes = await Promise.all(
    slugs.map(async s => ({ slug: s, votes: await kv.get<number>(`vote:${s}`) ?? 0 }))
  );
  return new Response(JSON.stringify(votes));
};
```

---

### Task 5: 公开话题页面

**Files:**
- Create: `src/pages/topics.astro`

- [ ] **Step 1: 创建话题页面**

```astro
---
import Base from '../layouts/Base.astro';
import { Vote, MessageSquare } from 'lucide-astro';

// TODO: 从 GitHub API 读取 topics/public/ 内容
// 目前硬编码示例数据
const topics = [
  { slug: 'ai-learning', title: '怎么用 AI 学英语', votes: 23 },
  { slug: 'ai-ppt', title: '用 AI 做 PPT 的最佳实践', votes: 18 },
  { slug: 'ai-save-money', title: 'AI 怎么帮我省钱', votes: 12 },
];
---

<Base title="话题 — Walker">
  <div class="max-w-3xl mx-auto px-6 pt-20 pb-16">
    <div class="mb-12">
      <h1 class="font-heading text-2xl font-semibold text-text mb-2">话题</h1>
      <p class="text-text-muted">投票选出你最想看的内容，或者提出你的建议</p>
    </div>

    <!-- 话题列表 -->
    <div class="space-y-4 mb-16">
      {topics.map(topic => (
        <div class="flex items-center gap-4 p-4 rounded-xl border border-border" data-topic={topic.slug}>
          <div class="flex-1">
            <h3 class="text-text font-heading">{topic.title}</h3>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-gold font-heading text-lg" data-votes>{topic.votes}</span>
            <button
              class="vote-btn px-3 py-1.5 rounded-full border border-border text-text-muted hover:text-gold hover:border-gold transition-colors text-sm"
              data-slug={topic.slug}
            >
              <Vote class="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      ))}
    </div>

    <!-- 提建议 -->
    <div class="border-t border-border pt-8">
      <h2 class="font-heading text-lg text-text mb-4 flex items-center gap-2">
        <MessageSquare class="w-5 h-5" strokeWidth={1.8} />
        提出建议
      </h2>
      <form id="suggestion-form" class="flex gap-3">
        <input
          type="text"
          name="title"
          placeholder="比如：怎么用 AI 做 PPT"
          required
          minlength="3"
          class="flex-1 px-4 py-2 rounded-lg border border-border bg-bg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-gold/50"
        />
        <input
          type="text"
          name="submitter"
          placeholder="昵称（选填）"
          class="w-32 px-4 py-2 rounded-lg border border-border bg-bg text-text text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-gold/50"
        />
        <button
          type="submit"
          class="px-4 py-2 rounded-lg bg-gold text-bg text-sm font-heading hover:bg-gold-glow transition-colors"
        >
          提交
        </button>
      </form>
      <p id="form-message" class="mt-3 text-sm hidden"></p>
    </div>
  </div>

  <script>
    // 投票逻辑
    document.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const slug = btn.getAttribute('data-slug');
        const res = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, action: 'add' }),
        });
        const data = await res.json();
        if (data.success) {
          const votesEl = btn.closest('[data-topic]')?.querySelector('[data-votes]');
          if (votesEl) votesEl.textContent = String(Number(votesEl.textContent) + 1);
          btn.disabled = true;
          btn.classList.add('text-gold', 'border-gold');
        } else if (data.error) {
          alert(data.error);
        }
      });
    });

    // 提交建议逻辑
    document.getElementById('suggestion-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const formData = new FormData(form);
      const title = formData.get('title') as string;
      const submitter = formData.get('submitter') as string || '匿名';
      const messageEl = document.getElementById('form-message');

      const res = await fetch('/api/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, submitter }),
      });
      const data = await res.json();

      if (messageEl) {
        messageEl.classList.remove('hidden');
        messageEl.textContent = data.success ? '已收到，谢谢！' : data.error;
      }
      if (data.success) form.reset();
    });
  </script>
</Base>
```

---

### Task 6: 首页集成

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: 添加话题入口**

在首页底部建议箱旁边添加"查看话题 →"链接：

```astro
<div class="mt-12 flex items-center justify-between">
  <a href="#suggestion" class="...">建议箱</a>
  <a href="/topics" class="...">查看话题 →</a>
  <a href="#" id="random-btn" class="...">随便看看</a>
</div>
```

---

### Task 7: Obsidian 工作流配置

**Files:**
- Create: `topics/Templates/suggestion.md` (Obsidian template)
- Create: `topics/Templates/topic.md` (Obsidian template)

- [ ] **Step 1: 建议模板**

```md
---
title: {{title}}
submitter: {{submitter}}
date: {{date}}
status: pending
---

来自网站的建议

## 我的判断
- [ ] 采纳
- [ ] 归档

## 备注

```

- [ ] **Step 2: 话题模板**

```md
---
title: {{title}}
slug: {{slug}}
votes: 0
status: {{status}}
created: {{date}}
---

## 写作计划


## 相关资料


## 文章链接

```

---

### Task 8: GitHub Actions 自动同步

**Files:**
- Create: `.github/workflows/sync.yml`

- [ ] **Step 1: 创建 CI 工作流**

```yaml
name: Sync to Topics

on:
  push:
    branches:
      - main
    paths:
      - 'topics/**'

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: 触发 Vercel 重建
        run: |
          curl -X POST https://api.vercel.com/v13/deployments/${{ secrets.VERCEL_DEPLOYMENT_HOOK_URL }}
```

---

## 环境变量清单

| 变量名 | 说明 | 来源 |
|--------|------|------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | GitHub Settings → Developer settings |
| `KV_REST_API_URL` | Vercel KV REST API URL | Vercel KV Dashboard |
| `KV_REST_API_TOKEN` | Vercel KV REST API Token | Vercel KV Dashboard |
| `VERCEL_DEPLOYMENT_HOOK_URL` | 重建触发 URL | Vercel Project Settings |

## 实施顺序

1. GitHub Repo 准备（Task 1）
2. Vercel KV 配置（Task 2）
3. API Route — 提建议（Task 3）
4. API Route — 投票（Task 4）
5. 公开话题页面（Task 5）
6. 首页集成（Task 6）
7. Obsidian 工作流配置（Task 7）
8. GitHub Actions 自动同步（Task 8）

## 待确认

1. GitHub token 权限：需要 `repo` 权限才能写入文件
2. topics 仓库和主站仓库是否分开？
3. `topics` 是单独的仓库还是放在 `walker-blog` 仓库里？
