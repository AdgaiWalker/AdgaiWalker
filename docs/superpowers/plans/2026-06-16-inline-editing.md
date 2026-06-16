# 客户端就地编辑 + 版本历史 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员在文章详情页就地编辑正文与 frontmatter（不跳离文章页），每次保存自动 git commit 留痕，可查修改日期 / 切换版本 / 看 diff / 回退。

**Architecture:** git 为 single source of truth——编辑 = 一次 `PUT /api/admin/content/[slug]`（已是 git commit），版本历史 = git log。新增 `ContentFileStore.listHistory` / `read(path,{ref})` 读 git 历史；新增 `history` / `version` 两个 API；前端 `InlineEditor` 组件以「正文 textarea + 客户端 marked 预览 + 元数据表单」三 tab 原地接管 `/posts/[slug]` 正文区；`frontmatter-editor.ts` 纯函数统一 frontmatter ↔ YAML 双向同步。

**Tech Stack:** Astro 6（server output, Vercel）、TypeScript（strict）、Vitest、marked（客户端 md 渲染）、js-yaml（fm 序列化）、diff（jsdiff 版本 diff）、GitHub Contents/Commits API + 本地 git。

**Spec:** `docs/superpowers/specs/2026-06-16-inline-editing-design.md`

**权限约定（贯穿全 plan）：** 所有编辑 / 历史 API 走 `isAdmin(request)`；前端编辑器组件预渲染但 `hidden`，客户端 `GET /api/admin/auth` 自检 admin 后激活。读者侧无感。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/lib/frontmatter-editor.ts` | 纯函数：frontmatter ↔ YAML 解析/序列化 + 枚举常量 | 新增 |
| `src/lib/frontmatter-editor.test.ts` | 上述纯函数单测 | 新增 |
| `src/lib/content-draft.ts` | 纯函数：localStorage 草稿读写 | 新增 |
| `src/lib/content-draft.test.ts` | 草稿单测 | 新增 |
| `src/lib/admin-content-helpers.ts` | 提取共享：`validateSlug` / `getPath` / `getContentStore` / `jsonResponse` | 新增 |
| `src/lib/admin-content-store.ts` | `ContentFileStore` 扩展 `listHistory` + `read` 加 `ref` | 修改 |
| `src/pages/api/admin/content/[slug].ts` | 改用 helpers（去重） | 修改 |
| `src/pages/api/admin/content/[slug]/history.ts` | 历史 commit 列表 | 新增 |
| `src/pages/api/admin/content/[slug]/version.ts` | 某历史版本内容 | 新增 |
| `src/components/admin/InlineEditor.astro` | 编辑器骨架（三 tab + 工具栏 + 状态） | 新增 |
| `src/scripts/inline-editor.ts` | 编辑态逻辑（GET/保存/草稿/冲突/marked 预览/tab/sync） | 新增 |
| `src/components/admin/MetadataForm.astro` | frontmatter 表单 + raw YAML 兜底 | 新增 |
| `src/pages/posts/[slug].astro` | 注入 InlineEditor，正文区可被接管 | 修改 |
| `src/components/admin/AdminEditBar.astro` | 「编辑」触发就地态 + 「历史」入口 | 修改 |
| `src/scripts/version-history.ts` | 历史拉取 / diff / 回退 | 新增 |
| `src/components/admin/VersionHistory.astro` | 版本时间线 modal | 新增 |
| `src/pages/admin/content/edit.astro` | 替换为 InlineEditor 独立模式 | 修改 |

**约定：** admin 编辑器组件样式沿用现有 `AdminEditBar` / `edit.astro` 的硬编码色板（`#1c1917` / `#78716c` / `#c4704a` / `#fafaf9`），不依赖未定义的语义 CSS 变量。

---

## Task 1: 安装依赖

**Files:** `package.json`

- [ ] **Step 1: 安装运行时依赖**

Run:
```bash
npm install marked js-yaml diff
```
Expected: 三个包写入 `dependencies`。

- [ ] **Step 2: 安装类型（diff 无内置类型；marked/js-yaml 有）**

Run:
```bash
npm install -D @types/js-yaml @types/diff
```
Expected: 类型包写入 `devDependencies`。

- [ ] **Step 3: 验证类型可用**

Run:
```bash
npx astro check
```
Expected: 无新增错误（仅可能有无依赖未用的提示，可忽略；本步只确认环境健康）。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(content): 引入 marked/js-yaml/diff（就地编辑+版本历史）"
```

---

## Task 2: frontmatter-editor 纯函数（TDD）

**Files:**
- Create: `src/lib/frontmatter-editor.ts`
- Test: `src/lib/frontmatter-editor.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/frontmatter-editor.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseDoc, serializeDoc, FORM_ENUMS } from '@/lib/frontmatter-editor';

describe('parseDoc', () => {
  it('解析 frontmatter + body', () => {
    const raw = '---\ntitle: 测试\ntype: knowledge\ntags:\n  - ai\n---\n\n正文段落\n';
    const doc = parseDoc(raw);
    expect(doc.frontmatter.title).toBe('测试');
    expect(doc.frontmatter.type).toBe('knowledge');
    expect(doc.frontmatter.tags).toEqual(['ai']);
    expect(doc.body.trim()).toBe('正文段落');
  });

  it('无 frontmatter 时整体作为 body', () => {
    const doc = parseDoc('纯正文，没有 fm');
    expect(doc.frontmatter).toEqual({});
    expect(doc.body).toBe('纯正文，没有 fm');
  });

  it('frontmatter 语法损坏时不抛错，返回空 fm', () => {
    const doc = parseDoc('---\n: : bad yaml\n---\n正文');
    expect(doc.body.trim()).toBe('正文');
  });
});

describe('serializeDoc', () => {
  it('序列化为合法 frontmatter + body', () => {
    const raw = serializeDoc({
      frontmatter: { title: '标题', type: 'knowledge', tags: ['a', 'b'] },
      body: '正文',
    });
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).toContain('title: 标题');
    expect(raw).toContain('- a');
    expect(raw.trimEnd().endsWith('正文')).toBe(true);
  });
});

describe('往返一致性', () => {
  it('parse(serialize(parse(x))) 稳定', () => {
    const original = '---\ntitle: 往返\ntype: idea\nvisibility: draft\n---\n\n## 标题\n\n内容段落\n';
    const doc = parseDoc(original);
    const roundtrip = parseDoc(serializeDoc(doc));
    expect(roundtrip.frontmatter).toEqual(doc.frontmatter);
    expect(roundtrip.body.trim()).toBe(doc.body.trim());
  });
});

describe('FORM_ENUMS', () => {
  it('visibility 含 public/draft/private', () => {
    expect(FORM_ENUMS.visibility).toEqual(['public', 'draft', 'private']);
  });
  it('aiLevel 含 AI-0 ~ AI-4', () => {
    expect(FORM_ENUMS.aiLevel).toEqual(['AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/frontmatter-editor.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现**

`src/lib/frontmatter-editor.ts`:
```ts
import yaml from 'js-yaml';

export interface ParsedDoc {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** 解析 markdown 源为 frontmatter 对象 + body。frontmatter 损坏时降级为空对象。 */
export function parseDoc(raw: string): ParsedDoc {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: {}, body: raw };
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === 'object') {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch {
    frontmatter = {};
  }
  return { frontmatter, body: raw.slice(m[0].length) };
}

/** 序列化 frontmatter + body 为合法 markdown 源。 */
export function serializeDoc(doc: ParsedDoc): string {
  const fmText = Object.keys(doc.frontmatter).length > 0
    ? yaml.dump(doc.frontmatter, { quotingType: '"', lineWidth: 0 }).trimEnd()
    : '';
  const body = doc.body.replace(/^\n+/, '');
  if (!fmText) return body;
  return `---\n${fmText}\n---\n\n${body}`;
}

/** MetadataForm select 选项，与 content.config.ts 枚举一致。 */
export const FORM_ENUMS = {
  type: ['knowledge', 'tool', 'idea', 'project', 'community', 'learn', 'learning'],
  form: ['article', 'note', 'diary', 'rant', 'gallery', 'video', 'recipe', 'calligraphy', 'resource', 'project', 'idea', 'lesson'],
  domain: ['ai', 'coding', 'product', 'philosophy', 'life', 'cooking', 'calligraphy', 'reading', 'travel', 'emotion', 'community'],
  intent: ['think', 'record', 'teach', 'share', 'verify', 'showcase', 'reflect', 'connect', 'vent'],
  valueMode: ['utility', 'existence', 'both'],
  visibility: ['public', 'draft', 'private'],
  status: ['thinking', 'validating', 'building', 'verified', 'archived'],
  aiLevel: ['AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4'],
} as const;

/** 表单管理的字段 key（其余留在 raw YAML 兜底框）。 */
export const FORM_MANAGED_KEYS = [
  'title', 'summary', 'date', 'tags', 'visibility',
  'type', 'form', 'domain', 'intent', 'valueMode', 'status',
] as const;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/frontmatter-editor.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/frontmatter-editor.ts src/lib/frontmatter-editor.test.ts
git commit -m "feat(content): frontmatter-editor 纯函数（解析/序列化/枚举）"
```

---

## Task 3: content-draft 草稿纯函数（TDD）

**Files:**
- Create: `src/lib/content-draft.ts`
- Test: `src/lib/content-draft.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/content-draft.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDraft, saveDraft, clearDraft } from '@/lib/content-draft';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage());
});

describe('content-draft', () => {
  it('save/load 往返', () => {
    saveDraft('my-slug', '草稿内容');
    const d = loadDraft('my-slug');
    expect(d).not.toBeNull();
    expect(d?.content).toBe('草稿内容');
    expect(d?.ts).toBeGreaterThan(0);
  });

  it('load 不存在返回 null', () => {
    expect(loadDraft('none')).toBeNull();
  });

  it('clear 后 load 返回 null', () => {
    saveDraft('s', 'x');
    clearDraft('s');
    expect(loadDraft('s')).toBeNull();
  });

  it('损坏数据降级为 null，不抛错', () => {
    localStorage.setItem('walker:draft:bad', '{not json');
    expect(loadDraft('bad')).toBeNull();
  });

  it('localStorage 不可用时 save/load 不抛错', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => saveDraft('s', 'x')).not.toThrow();
    expect(loadDraft('s')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/content-draft.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写实现**

`src/lib/content-draft.ts`:
```ts
const PREFIX = 'walker:draft:';

export interface Draft {
  content: string;
  ts: number;
}

/** 读取未保存草稿。localStorage 不可用或损坏时返回 null。 */
export function loadDraft(slug: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed?.content !== 'string') return null;
    return { content: parsed.content, ts: Number(parsed.ts) || 0 };
  } catch {
    return null;
  }
}

/** 暂存未保存草稿。 */
export function saveDraft(slug: string, content: string): void {
  try {
    localStorage.setItem(PREFIX + slug, JSON.stringify({ content, ts: Date.now() }));
  } catch {
    /* localStorage 不可用（隐私模式/满），静默降级 */
  }
}

/** 保存成功后清除草稿。 */
export function clearDraft(slug: string): void {
  try {
    localStorage.removeItem(PREFIX + slug);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/content-draft.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/content-draft.ts src/lib/content-draft.test.ts
git commit -m "feat(content): content-draft localStorage 草稿纯函数"
```

---

## Task 4: 提取 admin-content-helpers（去重）

**Files:**
- Create: `src/lib/admin-content-helpers.ts`
- Modify: `src/pages/api/admin/content/[slug].ts`

- [ ] **Step 1: 创建 helpers 模块**

`src/lib/admin-content-helpers.ts`:
```ts
import {
  createGitHubContentFileStore,
  createLocalContentFileStore,
  type ContentFileStore,
} from '@/lib/admin-content-store';

const GITHUB_OWNER = 'AdgaiWalker';
const GITHUB_REPO = 'AdgaiWalker';
export const CONTENT_PATH_PREFIX = 'src/content/log/';

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function getToken(): string | null {
  return import.meta.env.GITHUB_TOKEN || null;
}

export function getContentStore(): ContentFileStore {
  const token = getToken();
  if (import.meta.env.DEV && !token) {
    return createLocalContentFileStore();
  }
  return createGitHubContentFileStore({ owner: GITHUB_OWNER, repo: GITHUB_REPO, token });
}

export function validateSlug(slug: string): boolean {
  return /^[\p{Script=Han}\w\s.-]+$/u.test(slug)
    && !slug.includes('..')
    && !slug.includes('/')
    && !slug.includes('\\');
}

export function getPath(slug: string): string {
  const hasKnownExt = slug.endsWith('.md') || slug.endsWith('.mdx');
  return `${CONTENT_PATH_PREFIX}${hasKnownExt ? slug : `${slug}.md`}`;
}

export function getContentId(slug: string): string {
  return slug.replace(/\.(md|mdx)$/i, '');
}
```

- [ ] **Step 2: 重构 `[slug].ts` 引用 helpers**

在 `src/pages/api/admin/content/[slug].ts` 顶部，删除已搬走的局部定义（`GITHUB_OWNER`/`GITHUB_REPO`/`CONTENT_PATH_PREFIX`/`jsonResponse`/`getToken`/`getContentStore`/`validateSlug`/`getPath`/`getContentId`/`storeErrorResponse` 保留——它引用 `ContentStoreError`），改为 import：

替换文件第 1–57 行的局部常量与函数定义为：
```ts
import type { APIRoute } from 'astro';
import matter from 'gray-matter';
import { ContentStoreError, type ContentFileStore } from '@/lib/admin-content-store';
import { isAdmin } from '@/lib/admin-auth';
import { getTopicCandidateById, updateTopicCandidateStatus } from '@/conversation/store';
import { resolveContentVisibility } from '@/knowledge/visibility';
import {
  jsonResponse,
  getContentStore,
  validateSlug,
  getPath,
  getContentId,
} from '@/lib/admin-content-helpers';

const MAX_CONTENT_BYTES = 100_000;
const VALID_VISIBILITIES = new Set(['public', 'draft', 'private']);

function storeErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof ContentStoreError) {
    return jsonResponse({ error: error.message || fallback }, error.status);
  }
  return jsonResponse({ error: fallback }, 500);
}
```
保留 GET/PUT/PATCH/DELETE 四个 handler 不变（它们引用的 `validateSlug`/`getPath`/`getContentStore`/`jsonResponse`/`getContentId` 现在来自 import）。

- [ ] **Step 3: 类型检查**

Run: `npx astro check`
Expected: PASS（无未定义引用）。

- [ ] **Step 4: 回归测试**

Run: `npm run test`
Expected: 现有测试全过（未受影响）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-content-helpers.ts src/pages/api/admin/content/[slug].ts
git commit -m "refactor(content): 提取 admin-content-helpers 共享（去重）"
```

---

## Task 5: 扩展 ContentFileStore（listHistory + read ref）

**Files:**
- Modify: `src/lib/admin-content-store.ts`

- [ ] **Step 1: 扩展接口与类型**

在 `src/lib/admin-content-store.ts` 接口区（`ContentFileStore` 定义处），替换为：
```ts
export interface ContentHistoryEntry {
  sha: string;
  date: string;
  message: string;
  author: string;
}

export interface ContentReadOptions {
  ref?: string;
}

export interface ContentFileStore {
  read(path: string, opts?: ContentReadOptions): Promise<ContentFile>;
  write(input: ContentWriteInput): Promise<{ sha?: string }>;
  delete(path: string, sha: string, message: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listHistory(path: string, opts?: { perPage?: number }): Promise<ContentHistoryEntry[]>;
}
```

- [ ] **Step 2: GitHub 实现 — read 支持 ref + 新增 listHistory**

在 `createGitHubContentFileStore` 内，替换 `read` 函数并在 `return` 块内加 `listHistory`：

`read` 函数改为：
```ts
  async function read(path: string, opts?: ContentReadOptions): Promise<ContentFile> {
    const query = opts?.ref ? `?ref=${encodeURIComponent(opts.ref)}` : '';
    const response = await request(`${contentApiPath(owner, repo, path)}${query}`, { method: 'GET' });
    if (!response.ok) throw await parseGitHubError(response, '文件不存在。');

    const data = await response.json() as { content: string; sha: string; name?: string };
    return {
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
      name: data.name,
    };
  }
```

在返回对象内（`exists` 之后）追加：
```ts
    async listHistory(path, opts) {
      const perPage = Math.min(Math.max(opts?.perPage ?? 30, 1), 100);
      const query = new URLSearchParams({ path, per_page: String(perPage) });
      const response = await request(
        `/repos/${owner}/${repo}/commits?${query.toString()}`,
        { method: 'GET' },
      );
      if (!response.ok) throw await parseGitHubError(response, '历史读取失败。');
      const data = await response.json() as Array<{
        sha: string;
        commit: { message: string; author?: { name?: string; date?: string } };
      }>;
      return data.map(c => ({
        sha: c.sha,
        date: c.commit.author?.date ?? '',
        message: c.commit.message ?? '',
        author: c.commit.author?.name ?? '',
      }));
    },
```

- [ ] **Step 3: Local 实现 — read 支持 ref + 新增 listHistory（git log / git show）**

在 `createLocalContentFileStore` 顶部加 import 与 helper：
```ts
import { execFileSync } from 'node:child_process';
```
（放在文件顶部其它 `node:` import 旁。）

`createLocalContentFileStore` 的 `read` 改为：
```ts
    async read(path, opts) {
      const filePath = resolveWorkspacePath(rootDir, path);
      if (opts?.ref) {
        try {
          const relPath = path.replace(/\\/g, '/');
          const content = execFileSync('git', ['-C', rootDir, 'show', `${opts.ref}:${relPath}`], { encoding: 'utf-8' });
          return { content, sha: opts.ref, name: filePath.split(/[\\/]/).at(-1) };
        } catch {
          throw new ContentStoreError('版本不存在。', 404);
        }
      }
      try {
        const content = await readFile(filePath, 'utf-8');
        return { content, sha: fileSha(content), name: filePath.split(/[\\/]/).at(-1) };
      } catch {
        throw new ContentStoreError('文件不存在。', 404);
      }
    },
```

返回对象内追加 `listHistory`：
```ts
    async listHistory(path, opts) {
      const perPage = Math.min(Math.max(opts?.perPage ?? 30, 1), 100);
      const relPath = path.replace(/\\/g, '/');
      try {
        const out = execFileSync(
          'git',
          ['-C', rootDir, 'log', `-n`, String(perPage), `--format=%H|%cI|%an|%s`, '--', relPath],
          { encoding: 'utf-8' },
        );
        return out.trim().split('\n').filter(Boolean).map(line => {
          const [sha, date, author, ...msgParts] = line.split('|');
          return { sha, date, author, message: msgParts.join('|') };
        });
      } catch {
        return [];
      }
    },
```

- [ ] **Step 4: 类型检查**

Run: `npx astro check`
Expected: PASS（`[slug].ts` 的 `read`/`exists` 调用签名兼容，因为 opts 可选）。

- [ ] **Step 5: 回归测试**

Run: `npm run test`
Expected: 全过。

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-content-store.ts
git commit -m "feat(content): ContentFileStore 扩展 listHistory + read(ref)（GitHub/Local）"
```

---

## Task 6: history API 路由

**Files:**
- Create: `src/pages/api/admin/content/[slug]/history.ts`

- [ ] **Step 1: 写路由**

`src/pages/api/admin/content/[slug]/history.ts`:
```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import {
  jsonResponse,
  getContentStore,
  validateSlug,
  getPath,
} from '@/lib/admin-content-helpers';
import { ContentStoreError } from '@/lib/admin-content-store';

export const GET: APIRoute = async ({ params, request, url }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  const perPage = Math.min(Math.max(Number(url.searchParams.get('perPage')) || 30, 1), 100);
  try {
    const commits = await getContentStore().listHistory(getPath(slug), { perPage });
    return jsonResponse({ slug, commits });
  } catch (error) {
    const status = error instanceof ContentStoreError ? error.status : 500;
    const message = error instanceof ContentStoreError ? error.message : '历史读取失败。';
    return jsonResponse({ error: message }, status);
  }
};
```

- [ ] **Step 2: 类型检查**

Run: `npx astro check`
Expected: PASS。

- [ ] **Step 3: 手测（开发态）**

启动 `npm run dev`，带 admin cookie 访问：
```
GET /api/admin/content/<某已存在 slug>/history?perPage=5
```
Expected: `{ slug, commits: [{sha, date, message, author}, ...] }`（开发态走本地 git log，至少返回该文件最近提交）。
无 admin cookie 时 Expected: `{ "error": "未授权。" }` 401。

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/content/[slug]/history.ts
git commit -m "feat(content): /api/admin/content/[slug]/history 历史 commit 列表"
```

---

## Task 7: version API 路由

**Files:**
- Create: `src/pages/api/admin/content/[slug]/version.ts`

- [ ] **Step 1: 写路由**

`src/pages/api/admin/content/[slug]/version.ts`:
```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import {
  jsonResponse,
  getContentStore,
  validateSlug,
  getPath,
} from '@/lib/admin-content-helpers';
import { ContentStoreError } from '@/lib/admin-content-store';

export const GET: APIRoute = async ({ params, request, url }) => {
  if (!isAdmin(request)) return jsonResponse({ error: '未授权。' }, 401);

  const slug = params.slug;
  if (!slug || !validateSlug(slug)) return jsonResponse({ error: '无效的 slug。' }, 400);

  const ref = url.searchParams.get('ref');
  if (!ref) return jsonResponse({ error: '缺少 ref 参数。' }, 400);

  try {
    const file = await getContentStore().read(getPath(slug), { ref });
    return jsonResponse({ slug, content: file.content, sha: file.sha, name: file.name });
  } catch (error) {
    const status = error instanceof ContentStoreError ? error.status : 500;
    const message = error instanceof ContentStoreError ? error.message : '版本读取失败。';
    return jsonResponse({ error: message }, status);
  }
};
```

- [ ] **Step 2: 类型检查**

Run: `npx astro check`
Expected: PASS。

- [ ] **Step 3: 手测（开发态）**

从 Task 6 拿到一个历史 `sha`，访问：
```
GET /api/admin/content/<slug>/version?ref=<sha>
```
Expected: `{ slug, content, sha, name }`（该历史版本的完整 markdown）。

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/content/[slug]/version.ts
git commit -m "feat(content): /api/admin/content/[slug]/version 历史版本内容"
```

---

## Task 8: InlineEditor.astro 骨架

**Files:**
- Create: `src/components/admin/InlineEditor.astro`

- [ ] **Step 1: 写组件**

`src/components/admin/InlineEditor.astro`:
```astro
---
// InlineEditor — 就地编辑器骨架（预渲染隐藏，客户端激活）
// Props: slug（就地模式必填；独立模式/新建可为空）
import MetadataForm from './MetadataForm.astro';

interface Props {
  slug?: string;
  mode?: 'inline' | 'standalone';
}

const { slug = '', mode = 'inline' } = Astro.props;
---

<div
  class={`inline-editor ${mode === 'standalone' ? 'ie-standalone' : ''}`}
  id="inline-editor"
  data-slug={slug}
  data-mode={mode}
  hidden
>
  <div class="ie-toolbar">
    <div class="ie-tabs">
      <button class="ie-tab is-active" data-tab="body" type="button">正文</button>
      <button class="ie-tab" data-tab="preview" type="button">预览</button>
      <button class="ie-tab" data-tab="meta" type="button">元数据</button>
    </div>
    <div class="ie-actions">
      <button class="ie-btn ie-btn-history" id="ie-history-btn" type="button" hidden>历史</button>
      <button class="ie-btn ie-btn-cancel" id="ie-cancel-btn" type="button">取消</button>
      <button class="ie-btn ie-btn-primary" id="ie-save-btn" type="button" disabled>保存</button>
    </div>
  </div>

  <div class="ie-pane ie-pane-body is-active" data-pane="body">
    <textarea class="ie-textarea" id="ie-editor" placeholder="加载中..." disabled></textarea>
  </div>

  <div class="ie-pane ie-pane-preview" data-pane="preview">
    <div class="ie-preview" id="ie-preview"><div class="ie-loading">预览区</div></div>
  </div>

  <div class="ie-pane ie-pane-meta" data-pane="meta">
    <MetadataForm />
  </div>

  <div class="ie-status" id="ie-status">就绪</div>
</div>

<style>
  .inline-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #1c1917;
  }
  .ie-standalone { min-height: calc(100vh - 8rem); }
  .ie-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 10px;
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .ie-tabs { display: flex; gap: 0.25rem; }
  .ie-tab {
    padding: 0.35rem 0.75rem;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: #78716c;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ie-tab.is-active { background: #f5f5f4; color: #1c1917; }
  .ie-actions { display: flex; gap: 0.4rem; }
  .ie-btn {
    padding: 0.35rem 0.85rem;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    background: transparent;
    color: #78716c;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
  }
  .ie-btn:hover { background: #f5f5f4; }
  .ie-btn-primary { background: #c4704a; color: #fff; border-color: #c4704a; }
  .ie-btn-primary:hover { background: #b5633f; }
  .ie-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ie-btn-history { color: #78716c; }

  .ie-pane { display: none; }
  .ie-pane.is-active { display: flex; flex-direction: column; }
  .ie-pane-body, .ie-pane-preview { border: 1px solid rgba(0,0,0,0.06); border-radius: 12px; background: #fff; overflow: hidden; min-height: 60vh; }
  .ie-textarea {
    flex: 1;
    width: 100%;
    min-height: 60vh;
    padding: 1rem;
    border: 0;
    background: transparent;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.85rem;
    line-height: 1.65;
    color: #1c1917;
    resize: vertical;
    outline: none;
    tab-size: 2;
  }
  .ie-preview { padding: 1rem 1.25rem; overflow-y: auto; }
  .ie-preview :global(h1) { font-size: 1.5rem; font-weight: 800; margin: 0 0 0.75rem; }
  .ie-preview :global(h2) { font-size: 1.15rem; font-weight: 800; margin: 1.25rem 0 0.5rem; }
  .ie-preview :global(h3) { font-size: 1rem; font-weight: 700; margin: 1rem 0 0.4rem; }
  .ie-preview :global(p) { font-size: 0.9rem; line-height: 1.7; margin: 0 0 0.65rem; }
  .ie-preview :global(code) { font-family: monospace; padding: 0.15rem 0.35rem; background: rgba(0,0,0,0.05); border-radius: 4px; }
  .ie-preview :global(pre) { background: #1c1917; color: #e7e5e4; padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 0 0 0.75rem; }
  .ie-preview :global(blockquote) { border-left: 3px solid #c4704a; padding-left: 0.85rem; color: #78716c; margin: 0 0 0.65rem; }
  .ie-preview :global(.mdx-placeholder) { display: inline-block; padding: 0.2rem 0.5rem; border: 1px dashed #c4704a; border-radius: 6px; color: #c4704a; font-size: 0.75rem; font-family: monospace; }
  .ie-loading { color: #a8a29e; font-size: 0.9rem; }
  .ie-status { padding: 0.4rem 0.75rem; font-size: 0.75rem; color: #78716c; text-align: center; }
  .ie-status.error { color: #dc2626; }
  .ie-status.success { color: #16a34a; }

  .ie-pane-meta { background: #fff; border: 1px solid rgba(0,0,0,0.06); border-radius: 12px; padding: 1rem 1.25rem; }
</style>
```

- [ ] **Step 2: 类型检查**

Run: `npx astro check`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/InlineEditor.astro
git commit -m "feat(content): InlineEditor 组件骨架（三 tab + 工具栏）"
```

（注：本 task 暂不接入页面，下一 task 写脚本逻辑后整体接入。）

---

## Task 9: inline-editor.ts 客户端脚本

**Files:**
- Create: `src/scripts/inline-editor.ts`

- [ ] **Step 1: 写脚本**

`src/scripts/inline-editor.ts`:
```ts
import { marked } from 'marked';
import { parseDoc, serializeDoc, FORM_ENUMS, FORM_MANAGED_KEYS } from '@/lib/frontmatter-editor';
import { loadDraft, saveDraft, clearDraft } from '@/lib/content-draft';

marked.setOptions({ breaks: true, gfm: true });

interface EditorState {
  slug: string;
  mode: 'inline' | 'standalone';
  sha: string;
  doc: ReturnType<typeof parseDoc> | null;
  dirty: boolean;
  root: HTMLElement;
  editor: HTMLTextAreaElement;
  preview: HTMLElement;
  status: HTMLElement;
  saveBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  historyBtn: HTMLButtonElement;
  rawYaml: HTMLTextAreaElement | null;
}

let state: EditorState | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

const SELECTORS = {
  title: '[data-field="title"]',
  summary: '[data-field="summary"]',
  date: '[data-field="date"]',
  tags: '[data-field="tags"]',
  visibility: '[data-field="visibility"]',
  type: '[data-field="type"]',
  form: '[data-field="form"]',
  domain: '[data-field="domain"]',
  intent: '[data-field="intent"]',
  valueMode: '[data-field="valueMode"]',
  status: '[data-field="status"]',
  aiLevel: '[data-field="aiUsePolicy.level"]',
};

function $(sel: string, root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(sel);
}

/** 将 markdown body 渲染为预览 HTML，MDX 组件标签降级为占位。 */
function renderPreviewHtml(body: string): string {
  const mdxReplaced = body.replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>/g, '<span class="mdx-placeholder">[$1 组件 · 部署后可见]</span>');
  return marked.parse(mdxReplaced) as string;
}

function refreshPreview(): void {
  if (!state || !state.doc) return;
  state.preview.innerHTML = renderPreviewHtml(state.doc.body);
}

function renderPreviewDebounced(): void {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 300);
}

/** 把 frontmatter 当前值回填到表单控件（来自 GET 或 raw YAML 编辑后）。 */
function fillFormFromDoc(): void {
  if (!state?.doc) return;
  const fm = state.doc.frontmatter;
  const root = state.root;
  const setVal = (sel: string, val: unknown) => {
    const el = $(sel, root) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = String(val ?? '');
  };
  setVal(SELECTORS.title, fm.title);
  setVal(SELECTORS.summary, fm.summary);
  const d = fm.date ? new Date(fm.date as string) : null;
  setVal(SELECTORS.date, d ? d.toISOString().slice(0, 10) : '');
  setVal(SELECTORS.tags, Array.isArray(fm.tags) ? (fm.tags as string[]).join(', ') : '');
  setVal(SELECTORS.visibility, fm.visibility ?? '');
  setVal(SELECTORS.type, fm.type ?? '');
  setVal(SELECTORS.form, fm.form ?? '');
  setVal(SELECTORS.domain, fm.domain ?? '');
  setVal(SELECTORS.intent, fm.intent ?? '');
  setVal(SELECTORS.valueMode, fm.valueMode ?? '');
  setVal(SELECTORS.status, fm.status ?? '');
  const aiLevel = (fm.aiUsePolicy as { level?: string } | undefined)?.level;
  setVal(SELECTORS.aiLevel, aiLevel ?? '');
  syncRawYaml();
}

/** raw YAML 兜底框显示整个 frontmatter（dump）。 */
function syncRawYaml(): void {
  if (!state?.doc || !state.rawYaml) return;
  state.rawYaml.value = Object.keys(state.doc.frontmatter).length > 0
    ? serializeDoc({ frontmatter: state.doc.frontmatter, body: '' }).replace(/^---\n/, '').replace(/\n---\n?$/, '')
    : '';
}

/** 表单控件值 → 写入 frontmatter 对应字段。 */
function applyFormToDoc(): void {
  if (!state?.doc) return;
  const root = state.root;
  const getVal = (sel: string) => ($(sel, root) as HTMLInputElement | null)?.value ?? '';
  const fm = state.doc.frontmatter;
  const title = getVal(SELECTORS.title).trim();
  if (title) fm.title = title;
  const summary = getVal(SELECTORS.summary).trim();
  if (summary) fm.summary = summary; else delete fm.summary;
  const date = getVal(SELECTORS.date).trim();
  if (date) fm.date = new Date(date + 'T00:00:00').toISOString();
  const tags = getVal(SELECTORS.tags).split(',').map(t => t.trim()).filter(Boolean);
  fm.tags = tags;
  for (const key of ['visibility', 'type', 'form', 'domain', 'intent', 'valueMode', 'status'] as const) {
    const v = getVal(SELECTORS[key]);
    if (v) fm[key] = v; else delete fm[key];
  }
  const aiLevel = getVal(SELECTORS.aiLevel);
  if (aiLevel) {
    fm.aiUsePolicy = { ...(fm.aiUsePolicy as object | undefined ?? {}), level: aiLevel };
  }
}

/** raw YAML 编辑 → 解析回填 frontmatter + 表单（双向）。 */
function applyRawYamlToDoc(): void {
  if (!state?.doc || !state.rawYaml) return;
  try {
    const parsed = parseDoc(`---\n${state.rawYaml.value}\n---\n`);
    state.doc.frontmatter = parsed.frontmatter;
    fillFormFromDoc();
  } catch {
    /* 损坏 YAML 静默 */
  }
}

function markDirty(): void {
  if (!state) return;
  state.dirty = true;
  state.saveBtn.textContent = '保存 *';
  if (state.slug) saveDraft(state.slug, serializeDoc(state.doc!));
}

function switchTab(tab: 'body' | 'preview' | 'meta'): void {
  if (!state) return;
  state.root.querySelectorAll('.ie-tab').forEach(b => {
    b.classList.toggle('is-active', (b as HTMLElement).dataset.tab === tab);
  });
  state.root.querySelectorAll('.ie-pane').forEach(p => {
    p.classList.toggle('is-active', (p as HTMLElement).dataset.pane === tab);
  });
  if (tab === 'preview') refreshPreview();
  if (tab === 'meta') fillFormFromDoc();
}

function setStatus(text: string, kind: '' | 'error' | 'success' = ''): void {
  if (!state) return;
  state.status.textContent = text;
  state.status.className = `ie-status ${kind}`.trim();
}

async function loadContent(): Promise<void> {
  if (!state) return;
  if (state.slug) {
    const res = await fetch(`/api/admin/content/${encodeURIComponent(state.slug)}`);
    const data = await res.json();
    if (data.error) { setStatus(`加载失败: ${data.error}`, 'error'); return; }
    state.editor.value = data.content;
    state.sha = data.sha;
    const draft = loadDraft(state.slug);
    if (draft && draft.content !== data.content) {
      if (confirm('检测到未保存的草稿，是否恢复？')) {
        state.editor.value = draft.content;
        setStatus('已恢复草稿');
      } else {
        clearDraft(state.slug);
      }
    }
  } else {
    state.editor.value = window.__ieDraftTemplate ?? '';
  }
  state.doc = parseDoc(state.editor.value);
  state.editor.disabled = false;
  state.saveBtn.disabled = false;
  fillFormFromDoc();
  refreshPreview();
  setStatus(state.slug ? '已加载 · Ctrl+S 保存' : '新建模式 · 默认 draft');
}

async function save(): Promise<void> {
  if (!state?.doc) return;
  applyFormToDoc();
  const content = serializeDoc(state.doc);
  if (!state.slug) {
    const newSlug = (window.prompt('请输入 slug（如 新文章 或 my-post）') || '').trim();
    if (!newSlug) { setStatus('请先填写 slug。', 'error'); return; }
    const ext = newSlug.endsWith('.md') || newSlug.endsWith('.mdx') ? '' : '.md';
    state.slug = newSlug + ext;
    state.root.dataset.slug = state.slug;
  }
  state.saveBtn.disabled = true;
  setStatus('保存中...');
  const isCreate = !state.sha;
  try {
    const res = await fetch(`/api/admin/content/${encodeURIComponent(state.slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, sha: state.sha || undefined, create: isCreate }),
    });
    const data = await res.json();
    if (res.status === 409) {
      setStatus('内容已被改动，需重新拉取。', 'error');
      if (confirm('服务端内容已变更，丢弃本地改动重新加载？')) await loadContent();
      return;
    }
    if (res.ok && data.ok) {
      state.dirty = false;
      state.sha = data.sha || state.sha;
      state.saveBtn.textContent = '保存';
      clearDraft(state.slug);
      setStatus(data.message || '已保存。', 'success');
      if (isCreate && state.mode === 'standalone') {
        window.history.replaceState(null, '', `/admin/content/edit?slug=${encodeURIComponent(state.slug)}`);
      }
      if (state.mode === 'inline') {
        // 提示刷新以见部署后渲染
        setStatus('已提交，约 60s 后线上生效。刷新页面可见更新。', 'success');
      }
    } else {
      setStatus(`保存失败: ${data.error || '未知错误'}`, 'error');
    }
  } catch {
    setStatus('网络错误', 'error');
  } finally {
    state.saveBtn.disabled = false;
  }
}

function cancel(): void {
  if (!state) return;
  if (state.dirty && !confirm('有未保存的改动，确定丢弃？')) return;
  if (state.slug) clearDraft(state.slug);
  if (state.mode === 'inline') {
    exitInlineMode();
  } else {
    window.location.href = '/admin/content';
  }
}

function exitInlineMode(): void {
  if (!state) return;
  state.root.hidden = true;
  const articleBody = document.getElementById('article-body');
  if (articleBody) (articleBody as HTMLElement).hidden = false;
  document.dispatchEvent(new CustomEvent('inline-edit:exit'));
  state = null;
}

function bindEvents(): void {
  if (!state) return;
  const { root, editor } = state;
  root.querySelectorAll('.ie-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab((btn as HTMLElement).dataset.tab as 'body' | 'preview' | 'meta'));
  });
  editor.addEventListener('input', () => {
    if (!state) return;
    // 正文框含 frontmatter + body 整体源；每次 input 重新解析，保 fm 编辑一致性
    state.doc = parseDoc(editor.value);
    fillFormFromDoc();
    renderPreviewDebounced();
    markDirty();
  });
  // 表单控件 → doc
  Object.values(SELECTORS).forEach(sel => {
    const el = $(sel, root);
    el?.addEventListener('input', () => { applyFormToDoc(); syncRawYaml(); markDirty(); });
  });
  // raw YAML → doc
  state.rawYaml?.addEventListener('input', () => { applyRawYamlToDoc(); markDirty(); });
  // 按钮
  state.saveBtn.addEventListener('click', save);
  state.cancelBtn.addEventListener('click', cancel);
  state.historyBtn.addEventListener('click', () => {
    if (state?.slug) document.dispatchEvent(new CustomEvent('version-history:open', { detail: { slug: state.slug } }));
  });
  // 快捷键
  document.addEventListener('keydown', (e) => {
    if (!state) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  });
}

export function enterInlineEditor(slug: string): void {
  const root = document.getElementById('inline-editor') as HTMLElement | null;
  if (!root) return;
  const articleBody = document.getElementById('article-body');
  if (articleBody) (articleBody as HTMLElement).hidden = true;
  root.hidden = false;
  root.dataset.slug = slug;
  root.dataset.mode = 'inline';
  initEditor(root, slug, 'inline');
}

export function initStandaloneEditor(slug: string, draftTemplate: string): void {
  const root = document.getElementById('inline-editor') as HTMLElement | null;
  if (!root) return;
  window.__ieDraftTemplate = draftTemplate;
  root.hidden = false;
  initEditor(root, slug, 'standalone');
}

function initEditor(root: HTMLElement, slug: string, mode: 'inline' | 'standalone'): void {
  const editor = root.querySelector<HTMLTextAreaElement>('#ie-editor')!;
  const preview = root.querySelector<HTMLElement>('#ie-preview')!;
  const status = root.querySelector<HTMLElement>('#ie-status')!;
  const saveBtn = root.querySelector<HTMLButtonElement>('#ie-save-btn')!;
  const cancelBtn = root.querySelector<HTMLButtonElement>('#ie-cancel-btn')!;
  const historyBtn = root.querySelector<HTMLButtonElement>('#ie-history-btn')!;
  const rawYaml = root.querySelector<HTMLTextAreaElement>('#mf-raw-yaml');
  if (slug) historyBtn.hidden = false;
  state = {
    slug, mode, sha: '', doc: null, dirty: false,
    root, editor, preview, status, saveBtn, cancelBtn, historyBtn, rawYaml,
  };
  switchTab('body');
  bindEvents();
  loadContent();
}
```

- [ ] **Step 2: 类型检查**

Run: `npx astro check`
Expected: PASS（`window.__ieDraftTemplate` 是自定义全局，需声明。若报错，在文件顶部加 `declare global { interface Window { __ieDraftTemplate?: string } }`）。

如报 `__ieDraftTemplate` 错误，在 `import` 之后加：
```ts
declare global {
  interface Window { __ieDraftTemplate?: string }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/inline-editor.ts
git commit -m "feat(content): inline-editor 客户端脚本（编辑/预览/保存/草稿/冲突）"
```

---

## Task 10: MetadataForm.astro

**Files:**
- Create: `src/components/admin/MetadataForm.astro`

- [ ] **Step 1: 写组件**

`src/components/admin/MetadataForm.astro`:
```astro
---
// MetadataForm — frontmatter 结构化表单 + raw YAML 兜底
// 控件 data-field 对应 frontmatter key；inline-editor.ts 遍历读写。
import { FORM_ENUMS } from '@/lib/frontmatter-editor';
---

<div class="mf-grid">
  <label class="mf-field mf-full">
    <span class="mf-label">标题 title</span>
    <input data-field="title" type="text" placeholder="文章标题" />
  </label>

  <label class="mf-field mf-full">
    <span class="mf-label">摘要 summary</span>
    <input data-field="summary" type="text" placeholder="一句话摘要" />
  </label>

  <label class="mf-field">
    <span class="mf-label">日期 date</span>
    <input data-field="date" type="date" />
  </label>

  <label class="mf-field">
    <span class="mf-label">可见性 visibility</span>
    <select data-field="visibility"><option value="">— 未选 —</option>{FORM_ENUMS.visibility.map(o => <option value={o}>{o}</option>)}</select>
  </label>

  <label class="mf-field mf-full">
    <span class="mf-label">标签 tags（逗号分隔）</span>
    <input data-field="tags" type="text" placeholder="ai, 实践" />
  </label>

  <label class="mf-field">
    <span class="mf-label">type</span>
    <select data-field="type"><option value="">— 未选 —</option>{FORM_ENUMS.type.map(o => <option value={o}>{o}</option>)}</select>
  </label>
  <label class="mf-field">
    <span class="mf-label">form</span>
    <select data-field="form"><option value="">— 未选 —</option>{FORM_ENUMS.form.map(o => <option value={o}>{o}</option>)}</select>
  </label>
  <label class="mf-field">
    <span class="mf-label">domain</span>
    <select data-field="domain"><option value="">— 未选 —</option>{FORM_ENUMS.domain.map(o => <option value={o}>{o}</option>)}</select>
  </label>
  <label class="mf-field">
    <span class="mf-label">intent</span>
    <select data-field="intent"><option value="">— 未选 —</option>{FORM_ENUMS.intent.map(o => <option value={o}>{o}</option>)}</select>
  </label>
  <label class="mf-field">
    <span class="mf-label">valueMode</span>
    <select data-field="valueMode"><option value="">— 未选 —</option>{FORM_ENUMS.valueMode.map(o => <option value={o}>{o}</option>)}</select>
  </label>
  <label class="mf-field">
    <span class="mf-label">status</span>
    <select data-field="status"><option value="">— 未选 —</option>{FORM_ENUMS.status.map(o => <option value={o}>{o}</option>)}</select>
  </label>
  <label class="mf-field">
    <span class="mf-label">AI 策略 aiUsePolicy.level</span>
    <select data-field="aiUsePolicy.level">{FORM_ENUMS.aiLevel.map(o => <option value={o}>{o}</option>)}</select>
  </label>
</div>

<details class="mf-raw">
  <summary>raw YAML 兜底（高级字段：series / sourceTopicId / cover / resources / version …）</summary>
  <textarea id="mf-raw-yaml" rows="10" placeholder="直接编辑 frontmatter YAML，所有字段都会保留"></textarea>
</details>

<style>
  .mf-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .mf-field { display: flex; flex-direction: column; gap: 0.25rem; }
  .mf-full { grid-column: 1 / -1; }
  .mf-label { font-size: 0.72rem; font-weight: 700; color: #78716c; text-transform: uppercase; letter-spacing: 0.03em; }
  .mf-field :global(input), .mf-field :global(select) {
    width: 100%; padding: 0.4rem 0.6rem; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
    background: #fff; color: #1c1917; font-size: 0.84rem;
  }
  .mf-raw { margin-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.06); padding-top: 0.75rem; }
  .mf-raw summary { font-size: 0.75rem; font-weight: 600; color: #78716c; cursor: pointer; }
  #mf-raw-yaml {
    width: 100%; margin-top: 0.5rem; padding: 0.75rem; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
    background: #fafaf9; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; line-height: 1.6; color: #1c1917;
  }
</style>
```

- [ ] **Step 2: 类型检查**

Run: `npx astro check`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/MetadataForm.astro
git commit -m "feat(content): MetadataForm 结构化表单 + raw YAML 兜底"
```

---

## Task 11: posts/[slug].astro 注入 InlineEditor

**Files:**
- Modify: `src/pages/posts/[slug].astro`

- [ ] **Step 1: 加 import**

在 `src/pages/posts/[slug].astro` 第 11 行 `import AdminEditBar ...` 之后加：
```ts
import InlineEditor from '../../components/admin/InlineEditor.astro';
```

- [ ] **Step 2: 给正文容器加 id，并在其后注入编辑器**

定位第 159–161 行的正文容器，改为加 `id="article-body"`：
```astro
    {/* 正文 — 内容即主角 */}
    <div class="prose prose-walker max-w-none break-words" id="article-body">
      <Content components={components} />
    </div>

    {/* 就地编辑器（预渲染隐藏，admin 进入编辑态时激活） */}
    <InlineEditor slug={entry.id} mode="inline" />
```

- [ ] **Step 3: 引入客户端脚本（仅本页加载 inline-editor.ts）**

在 frontmatter（`---` 之前无关，放组件 import 区后）确保脚本被打包。在文件末尾 `</ArticleLayout>` 之后不合适（布局外）。改为在 frontmatter 后用 Astro 脚本注入。在 `<ArticleLayout ...>` 开标签之前（第 103 行 `<ArticleLayout` 之前）加：
```astro
<script>
  import '@/scripts/inline-editor';
</script>
```

（注：Astro `<script>` 默认打包并去重，仅在本页加载。`inline-editor.ts` 导出的 `enterInlineEditor` 通过后续 Task 12 的 AdminEditBar 触发；这里先确保脚本在页面就绪。）

- [ ] **Step 4: 类型检查 + 构建**

Run: `npx astro check` 然后 `npm run build`
Expected: 两者 PASS（InlineEditor hidden 不影响渲染）。

- [ ] **Step 5: Commit**

```bash
git add src/pages/posts/[slug].astro
git commit -m "feat(content): posts/[slug] 注入 InlineEditor + 正文容器 id"
```

---

## Task 12: AdminEditBar 改造（编辑触发就地态 + 历史入口）

**Files:**
- Modify: `src/components/admin/AdminEditBar.astro`

- [ ] **Step 1: 改「编辑」为按钮 + 加「历史」按钮**

替换 `src/components/admin/AdminEditBar.astro` 第 12–26 行的 `{slug && (...)}` 块为：
```astro
{slug && (
  <div class="admin-edit-bar" id="admin-edit-bar" data-slug={slug} style="display:none">
    <div class="aeb-inner">
      <button class="aeb-btn" id="admin-edit-btn" type="button" title="就地编辑此文">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        <span>编辑</span>
      </button>
      <button class="aeb-btn" id="admin-history-btn" type="button" title="版本历史">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
        <span>历史</span>
      </button>
      <button class="aeb-btn aeb-btn-danger" id="admin-delete-btn" type="button" title="删除此文">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        <span>删除</span>
      </button>
    </div>
    <div class="aeb-status" id="admin-status"></div>
  </div>
)}
```

- [ ] **Step 2: 加脚本（编辑/历史触发事件）+ 版本历史脚本 import**

在文件末尾 `<script>` 块内（现有 `initAdminEditBar` 之后、`document.addEventListener('astro:page-load'...)` 之前）追加按钮绑定，并改造 `initAdminEditBar`。

将现有 `<script>` 块替换为：
```ts
  import { enterInlineEditor } from '@/scripts/inline-editor';
  import '@/scripts/version-history';

  let adminAbort: AbortController | null = null;
  let redirectTimer: ReturnType<typeof setTimeout> | null = null;

  function cleanupAdminEditBar() {
    adminAbort?.abort();
    adminAbort = null;
    if (redirectTimer) { clearTimeout(redirectTimer); redirectTimer = null; }
  }

  async function showBarIfAdmin(bar: HTMLElement, signal: AbortSignal) {
    try {
      const res = await fetch('/api/admin/auth', { signal });
      const data = await res.json();
      if (!signal.aborted && data.admin) bar.style.display = 'flex';
    } catch { /* ignore */ }
  }

  function initAdminEditBar() {
    cleanupAdminEditBar();
    const bar = document.getElementById('admin-edit-bar');
    if (!bar) return;

    adminAbort = new AbortController();
    const { signal } = adminAbort;
    showBarIfAdmin(bar, signal);

    const slug = bar.dataset.slug;
    const editBtn = document.getElementById('admin-edit-btn');
    const historyBtn = document.getElementById('admin-history-btn');
    const deleteBtn = document.getElementById('admin-delete-btn') as HTMLButtonElement | null;
    const status = document.getElementById('admin-status');
    if (!slug) return;

    editBtn?.addEventListener('click', () => enterInlineEditor(slug), { signal });
    historyBtn?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('version-history:open', { detail: { slug } }));
    }, { signal });

    if (!deleteBtn || !status) return;
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('确定要删除这篇文章吗？此操作不可撤销。')) return;
      deleteBtn.disabled = true;
      try {
        const res = await fetch(`/api/admin/content/${encodeURIComponent(slug)}`, { method: 'DELETE', signal });
        const data = await res.json();
        if (signal.aborted) return;
        if (res.ok && data.ok) {
          status.textContent = '已删除，正在跳转...';
          status.className = 'aeb-status visible success';
          redirectTimer = setTimeout(() => { window.location.href = '/posts'; }, 1000);
        } else {
          status.textContent = data.error || '删除失败';
          status.className = 'aeb-status visible error';
        }
      } catch {
        if (signal.aborted) return;
        status.textContent = '网络错误';
        status.className = 'aeb-status visible error';
      } finally {
        if (!signal.aborted) deleteBtn.disabled = false;
      }
    }, { signal });
  }

  document.addEventListener('astro:page-load', initAdminEditBar);
  document.addEventListener('astro:before-swap', cleanupAdminEditBar);
```

（注：Astro `<script>` 中 TS import 会被打包。`enterInlineEditor` 与 `version-history` 在本组件加载即引入；因 AdminEditBar 只在 `/posts/[slug]` 渲染，作用域正确。）

- [ ] **Step 3: 类型检查**

Run: `npx astro check`
Expected: PASS。

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdminEditBar.astro
git commit -m "feat(content): AdminEditBar 编辑改为就地态 + 历史入口"
```

---

## Task 13: version-history.ts 客户端脚本

**Files:**
- Create: `src/scripts/version-history.ts`

- [ ] **Step 1: 写脚本**

`src/scripts/version-history.ts`:
```ts
import { diffLines } from 'diff';
import { parseDoc } from '@/lib/frontmatter-editor';

let modal: HTMLElement | null = null;
let currentSlug = '';
let currentContent = '';

function escapeHtml(text: string): string {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

function ensureModal(): HTMLElement | null {
  modal = document.getElementById('version-history-modal');
  if (!modal) return null;
  return modal;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

async function loadHistory(): Promise<void> {
  if (!modal || !currentSlug) return;
  const list = modal.querySelector<HTMLElement>('#vh-list');
  if (!list) return;
  list.innerHTML = '<div class="vh-loading">加载历史...</div>';
  try {
    const res = await fetch(`/api/admin/content/${encodeURIComponent(currentSlug)}/history?perPage=30`);
    const data = await res.json();
    if (data.error) { list.innerHTML = `<div class="vh-error">${escapeHtml(data.error)}</div>`; return; }
    const commits = data.commits as Array<{ sha: string; date: string; message: string; author: string }>;
    if (commits.length === 0) { list.innerHTML = '<div class="vh-empty">无历史记录</div>'; return; }
    list.innerHTML = commits.map((c, i) => `
      <button class="vh-item ${i === 0 ? 'is-current' : ''}" data-sha="${c.sha}">
        <div class="vh-item-time">${escapeHtml(fmtDate(c.date))}</div>
        <div class="vh-item-msg">${escapeHtml(c.message.split('\n')[0] || '(无消息)')}</div>
        <div class="vh-item-author">${escapeHtml(c.author)} · ${c.sha.slice(0, 7)}</div>
      </button>
    `).join('');
    list.querySelectorAll('.vh-item').forEach(el => {
      el.addEventListener('click', () => showVersion((el as HTMLElement).dataset.sha || ''));
    });
  } catch {
    list.innerHTML = '<div class="vh-error">网络错误</div>';
  }
}

async function showVersion(sha: string): Promise<void> {
  if (!modal || !currentSlug) return;
  const diffPane = modal.querySelector<HTMLElement>('#vh-diff');
  if (!diffPane) return;
  diffPane.innerHTML = '<div class="vh-loading">加载版本...</div>';
  try {
    const res = await fetch(`/api/admin/content/${encodeURIComponent(currentSlug)}/version?ref=${encodeURIComponent(sha)}`);
    const data = await res.json();
    if (data.error) { diffPane.innerHTML = `<div class="vh-error">${escapeHtml(data.error)}</div>`; return; }
    const oldBody = parseDoc(data.content as string).body;
    const newBody = parseDoc(currentContent).body;
    const parts = diffLines(oldBody, newBody);
    diffPane.innerHTML = parts.map(p => {
      const cls = p.added ? 'add' : p.removed ? 'del' : 'ctx';
      return `<pre class="vh-diff-line vh-${cls}">${escapeHtml(p.value)}</pre>`;
    }).join('') || '<div class="vh-empty">无差异</div>';
    const revertBtn = modal.querySelector<HTMLButtonElement>('#vh-revert-btn');
    if (revertBtn) {
      revertBtn.hidden = false;
      revertBtn.dataset.sha = sha;
    }
  } catch {
    diffPane.innerHTML = '<div class="vh-error">网络错误</div>';
  }
}

async function revert(sha: string): Promise<void> {
  if (!currentSlug) return;
  if (!confirm(`回退到 ${sha.slice(0, 7)}？将以此版本内容创建一次新提交。`)) return;
  try {
    const verRes = await fetch(`/api/admin/content/${encodeURIComponent(currentSlug)}/version?ref=${encodeURIComponent(sha)}`);
    const verData = await verRes.json();
    if (verData.error) { alert(`读取版本失败: ${verData.error}`); return; }
    const curRes = await fetch(`/api/admin/content/${encodeURIComponent(currentSlug)}`);
    const curData = await curRes.json();
    const putRes = await fetch(`/api/admin/content/${encodeURIComponent(currentSlug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: verData.content, sha: curData.sha, message: `revert to ${sha.slice(0, 7)}` }),
    });
    const putData = await putRes.json();
    if (putRes.ok && putData.ok) {
      alert('已回退，约 60s 后线上生效。建议刷新页面重新进入编辑态。');
      closeModal();
      window.location.reload();
    } else {
      alert(`回退失败: ${putData.error || '未知错误'}`);
    }
  } catch {
    alert('网络错误');
  }
}

function openModal(slug: string): void {
  if (!ensureModal()) return;
  currentSlug = slug;
  // 取当前编辑器内容作为 diff 基准（若编辑态打开）；否则需先拉取
  const editor = document.getElementById('ie-editor') as HTMLTextAreaElement | null;
  if (editor && editor.value) {
    currentContent = editor.value;
  } else {
    // 非编辑态：拉取当前版本
    fetch(`/api/admin/content/${encodeURIComponent(slug)}`).then(r => r.json()).then(d => {
      if (!d.error) { currentContent = d.content; loadHistory(); }
    });
    modal.hidden = false;
    loadHistory();
    return;
  }
  modal.hidden = false;
  loadHistory();
}

function closeModal(): void {
  if (modal) {
    modal.hidden = true;
    const diff = modal.querySelector<HTMLElement>('#vh-diff');
    const revertBtn = modal.querySelector<HTMLButtonElement>('#vh-revert-btn');
    if (diff) diff.innerHTML = '';
    if (revertBtn) revertBtn.hidden = true;
  }
}

function bindModal(): void {
  if (!modal) return;
  modal.querySelector('#vh-close-btn')?.addEventListener('click', closeModal);
  modal.querySelector('#vh-revert-btn')?.addEventListener('click', (e) => {
    const sha = (e.currentTarget as HTMLElement).dataset.sha || '';
    if (sha) revert(sha);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

export function initVersionHistory(): void {
  if (!ensureModal()) return;
  bindModal();
  document.addEventListener('version-history:open', (e: Event) => {
    const detail = (e as CustomEvent).detail as { slug: string } | undefined;
    if (detail?.slug) openModal(detail.slug);
  });
}
```

- [ ] **Step 2: 类型检查**

Run: `npx astro check`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/scripts/version-history.ts
git commit -m "feat(content): version-history 客户端脚本（历史/diff/回退）"
```

---

## Task 14: VersionHistory.astro + 接入

**Files:**
- Create: `src/components/admin/VersionHistory.astro`
- Modify: `src/pages/posts/[slug].astro`

- [ ] **Step 1: 写 modal 组件**

`src/components/admin/VersionHistory.astro`:
```astro
---
// VersionHistory — 版本时间线 modal（预渲染隐藏，admin 触发）
---

<div class="vh-modal" id="version-history-modal" hidden>
  <div class="vh-dialog">
    <div class="vh-header">
      <span class="vh-title">版本历史</span>
      <button class="vh-close" id="vh-close-btn" type="button">×</button>
    </div>
    <div class="vh-body">
      <div class="vh-list" id="vh-list"></div>
      <div class="vh-diff" id="vh-diff"><div class="vh-empty">选择左侧某版本查看差异</div></div>
    </div>
    <div class="vh-footer">
      <button class="vh-btn vh-btn-danger" id="vh-revert-btn" type="button" hidden>回退到此版本</button>
    </div>
  </div>
</div>

<style>
  .vh-modal {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  .vh-dialog {
    width: min(900px, 92vw); height: min(80vh, 700px);
    display: flex; flex-direction: column;
    background: #fff; border-radius: 14px; overflow: hidden;
    color: #1c1917;
  }
  .vh-header { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.25rem; border-bottom: 1px solid rgba(0,0,0,0.08); }
  .vh-title { font-size: 1rem; font-weight: 800; }
  .vh-close { background: none; border: 0; font-size: 1.5rem; color: #78716c; cursor: pointer; line-height: 1; }
  .vh-body { flex: 1; display: grid; grid-template-columns: 280px 1fr; overflow: hidden; }
  .vh-list { overflow-y: auto; border-right: 1px solid rgba(0,0,0,0.06); padding: 0.5rem; }
  .vh-item { display: block; width: 100%; text-align: left; padding: 0.6rem 0.75rem; border: 0; border-radius: 8px; background: transparent; cursor: pointer; margin-bottom: 0.25rem; }
  .vh-item:hover { background: #f5f5f4; }
  .vh-item.is-current { background: rgba(196,112,74,0.1); }
  .vh-item-time { font-size: 0.72rem; font-weight: 700; color: #1c1917; font-family: monospace; }
  .vh-item-msg { font-size: 0.78rem; color: #57534e; margin: 0.15rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vh-item-author { font-size: 0.68rem; color: #a8a29e; }
  .vh-diff { overflow-y: auto; padding: 0.75rem 1rem; background: #fafaf9; }
  .vh-diff-line { margin: 0 0 0.15rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.74rem; font-family: 'JetBrains Mono', monospace; white-space: pre-wrap; word-break: break-word; }
  .vh-add { background: rgba(22,163,74,0.12); color: #166534; }
  .vh-del { background: rgba(220,38,38,0.12); color: #991b1b; }
  .vh-ctx { color: #78716c; }
  .vh-footer { padding: 0.6rem 1.25rem; border-top: 1px solid rgba(0,0,0,0.08); display: flex; justify-content: flex-end; }
  .vh-btn-danger { padding: 0.4rem 0.85rem; border: 0; border-radius: 8px; background: #dc2626; color: #fff; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
  .vh-empty, .vh-loading, .vh-error { padding: 1rem; color: #a8a29e; font-size: 0.85rem; }
  .vh-error { color: #dc2626; }
</style>
```

- [ ] **Step 2: 在 posts/[slug].astro 注入 modal + 初始化脚本**

在 Task 11 已加的 `<InlineEditor ... />` 之后（`</article>` 内或其后均可，放 `<AdminEditBar />` 旁）加：
```astro
  <VersionHistory />
```
并在 frontmatter import 区加：
```ts
import VersionHistory from '../../components/admin/VersionHistory.astro';
```

在 Task 11 已有的 `<script>import '@/scripts/inline-editor';</script>` 旁，确保 version-history 初始化。将 posts/[slug].astro 末尾的 `<script>` 改为：
```astro
<script>
  import '@/scripts/inline-editor';
  import { initVersionHistory } from '@/scripts/version-history';
  initVersionHistory();
</script>
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx astro check` 然后 `npm run build`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/VersionHistory.astro src/pages/posts/[slug].astro
git commit -m "feat(content): VersionHistory modal + 历史入口接入"
```

---

## Task 15: edit.astro 复用 InlineEditor（独立模式）

**Files:**
- Modify: `src/pages/admin/content/edit.astro`

- [ ] **Step 1: 替换简陋编辑器为 InlineEditor**

`src/pages/admin/content/edit.astro` 保留 frontmatter（权限、slug/topicId/prefill、brief、draftTemplate、yamlString、today），但把 `<body>` 内的 `.editor-main`（旧 textarea + 正则预览）整段替换。

把第 146–168 行的 `<div class="editor-main">...</div>` 替换为：
```astro
  <div class="editor-main">
    <div class="create-panel" id="create-panel" hidden={Boolean(slug)}>
      <input id="slug-input" placeholder="slug，例如 my-new-post 或 新文章" />
      <select id="ext-input">
        <option value=".md">.md</option>
        <option value=".mdx">.mdx</option>
      </select>
    </div>
    <InlineEditor mode="standalone" />
  </div>
```

在 frontmatter import 区加：
```ts
import InlineEditor from '../../../components/admin/InlineEditor.astro';
```

- [ ] **Step 2: 替换旧 `<script define:vars>` 为独立模式初始化**

删除原第 170–347 行整段 `<script define:vars={{ originalSlug: slug, draftTemplate, sourceTopicId: topicId ?? '' }}>`。

替换为：
```astro
<script is:inline define:vars={{ originalSlug: slug, draftTemplate, sourceTopicId: topicId ?? '' }}>
  window.__ieStandalone = { originalSlug, draftTemplate, sourceTopicId };
</script>
<script>
  import { initStandaloneEditor } from '@/scripts/inline-editor';
  const cfg = (window as any).__ieStandalone;
  if (cfg) initStandaloneEditor(cfg.originalSlug || '', cfg.draftTemplate);
</script>
```

- [ ] **Step 3: v1 新建 slug 用 prompt（create-panel 仅作视觉提示）**

Task 9 的 `save()` 在无 slug 时已用 `window.prompt` 取 slug，create-panel 的输入框 v1 不强制联动（避免 `initStandaloneEditor` 签名膨胀）。create-panel 保留渲染但无需额外脚本。如未来要用输入框替代 prompt，可扩展 `initStandaloneEditor(slug, draftTemplate, slugSource?)`。

- [ ] **Step 4: 类型检查 + 构建**

Run: `npx astro check` 然后 `npm run build`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/content/edit.astro
git commit -m "feat(content): edit.astro 复用 InlineEditor（独立模式，替换简陋编辑器）"
```

---

## Task 16: 验证三件套 + 手测

**Files:** 无（验证）

- [ ] **Step 1: 类型检查**

Run: `npx astro check`
Expected: PASS（0 errors）。

- [ ] **Step 2: 单元测试**

Run: `npm run test`
Expected: 全部 PASS（含新增 frontmatter-editor / content-draft 测试）。

- [ ] **Step 3: 生产构建**

Run: `npm run build`
Expected: 构建成功，无 SSR 渲染错误。

- [ ] **Step 4: 手测清单（启动 `npm run dev`，带 admin cookie）**

就地编辑：
- [ ] `/posts/<某 slug>` 右下角出现 AdminEditBar（编辑/历史/删除）
- [ ] 点「编辑」→ 正文区切换为 InlineEditor，页面不跳转
- [ ] 三 tab（正文/预览/元数据）切换正常
- [ ] 改正文 → 预览 tab 实时渲染（debounce）
- [ ] 改元数据表单（如 visibility）→ raw YAML 同步更新
- [ ] 改 raw YAML → 表单回填
- [ ] Ctrl+S 保存 → 状态显示「已提交，约 60s 后线上生效」
- [ ] 刷新页面 → 未保存草稿提示恢复
- [ ] 「取消」→ 有改动时二次确认 → 退出回到正文渲染

版本历史：
- [ ] 点「历史」→ 弹出时间线，列出最近提交
- [ ] 点某版本 → 右侧 diff（增删高亮）
- [ ] 「回退到此版本」→ 二次确认 → 提交成功 → 页面刷新

独立模式（新建）：
- [ ] `/admin/content/edit`（无 slug）→ InlineEditor 独立模式
- [ ] `/admin/content/edit?prefill=brief&topicId=<某选题>` → 简报模板预填
- [ ] 保存 → prompt slug → 创建成功 → URL 更新为 `?slug=...`

权限：
- [ ] 无 admin cookie 时 `/posts/<slug>` 不见 AdminEditBar
- [ ] 无 admin cookie 时 `/api/admin/content/<slug>/history` 返回 401

- [ ] **Step 5: 收尾 commit（如有验证中的小修）**

```bash
git add -A
git commit -m "test(content): 就地编辑+版本历史手测通过"
```

---

## 完成定义（Definition of Done）

- 管理员在 `/posts/[slug]` 点「编辑」即可就地改正文 + frontmatter，不跳离页面（A/B/D）。
- 新建/起草在升级后的 `/admin/content/edit` 用同一编辑器（C）。
- 「历史」可查修改日期、看 diff、回退（E）。
- `npx astro check` / `npm run test` / `npm run build` 全过。
- 读者侧完全无感（admin-only）。
