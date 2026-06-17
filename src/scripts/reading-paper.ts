// 阅读层：读字页面手动选纸色（白 / 米黄），与活体天空解耦。
// reading-mode 页面才会出现切换按钮；纸色存 localStorage，跨页跨会话记住。
const PAPER_KEY = 'walker-reading-paper';
const PAPERS: Record<'white' | 'cream', string> = { white: '#f7f2e6', cream: '#ece1c8' };
type Paper = keyof typeof PAPERS;

let toggleBtn: HTMLButtonElement | null = null;

function currentPaper(): Paper {
  return localStorage.getItem(PAPER_KEY) === 'cream' ? 'cream' : 'white';
}

function applyPaper(p: Paper): void {
  document.body.style.setProperty('--reading-bg', PAPERS[p]);
  if (toggleBtn) toggleBtn.textContent = p === 'white' ? '米黄纸' : '白纸';
}

function ensureToggle(): void {
  if (toggleBtn) return;
  toggleBtn = document.createElement('button');
  toggleBtn.id = 'reading-paper-toggle';
  toggleBtn.title = '切换阅读纸色（白 / 米黄）';
  toggleBtn.setAttribute('aria-label', '切换阅读纸色');
  toggleBtn.style.cssText =
    'position:fixed;bottom:5.5rem;right:1.5rem;z-index:60;padding:0.5rem 0.9rem;' +
    'border-radius:999px;border:1px solid rgba(0,0,0,0.12);background:rgba(255,255,255,0.9);' +
    'color:#555;font-size:0.78rem;font-weight:600;cursor:pointer;backdrop-filter:blur(8px);' +
    'box-shadow:0 2px 10px rgba(0,0,0,0.08);';
  toggleBtn.addEventListener('click', () => {
    const next: Paper = currentPaper() === 'white' ? 'cream' : 'white';
    localStorage.setItem(PAPER_KEY, next);
    applyPaper(next);
  });
  document.body.appendChild(toggleBtn);
}

/** 阅读层入口：仅 reading-mode 页面启用纸色切换 */
export function initReadingPaper(): void {
  const isReading = document.body.classList.contains('reading-mode');
  if (!isReading) {
    toggleBtn?.remove();
    toggleBtn = null;
    return;
  }
  ensureToggle();
  applyPaper(currentPaper());
}
