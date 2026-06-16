import { marked } from 'marked';
import { parseDoc, serializeDoc } from '@/lib/frontmatter-editor';
import { loadDraft, saveDraft, clearDraft } from '@/lib/content-draft';

declare global {
  interface Window { __ieDraftTemplate?: string }
}

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
  } else if (fm.aiUsePolicy && typeof fm.aiUsePolicy === 'object') {
    delete (fm.aiUsePolicy as { level?: unknown }).level;
  }
  // 同步回正文 textarea，避免后续正文输入 parseDoc 旧值覆盖元数据改动
  state.editor.value = serializeDoc(state.doc);
}

/** raw YAML 编辑 → 解析回填 frontmatter + 表单（双向）。 */
function applyRawYamlToDoc(): void {
  if (!state?.doc || !state.rawYaml) return;
  try {
    const parsed = parseDoc(`---\n${state.rawYaml.value}\n---\n`);
    state.doc.frontmatter = parsed.frontmatter;
    fillFormFromDoc();
    state.editor.value = serializeDoc(state.doc);
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
    if (res.status === 401) { window.location.href = '/admin/login'; return; }
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
  delete document.documentElement.dataset.inlineEditing;
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
  document.documentElement.dataset.inlineEditing = 'true';
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
