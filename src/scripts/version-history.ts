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
    if (res.status === 401) { window.location.href = '/admin/login'; return; }
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
    if (res.status === 401) { window.location.href = '/admin/login'; return; }
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
  const m = ensureModal();
  if (!m) return;
  currentSlug = slug;
  const editor = document.getElementById('ie-editor') as HTMLTextAreaElement | null;
  if (editor && editor.value) {
    currentContent = editor.value;
    m.hidden = false;
    loadHistory();
  } else {
    m.hidden = false;
    fetch(`/api/admin/content/${encodeURIComponent(slug)}`).then(r => r.json()).then(d => {
      if (!d.error) { currentContent = d.content; loadHistory(); }
    });
  }
}

function closeModal(): void {
  const m = modal;
  if (!m) return;
  m.hidden = true;
  const diff = m.querySelector<HTMLElement>('#vh-diff');
  const revertBtn = m.querySelector<HTMLButtonElement>('#vh-revert-btn');
  if (diff) diff.innerHTML = '';
  if (revertBtn) revertBtn.hidden = true;
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
