/**
 * sidebar-state.ts — 侧边栏折叠状态管理
 * 支持按钮点击切换 + 快捷键 [ + localStorage 持久化
 */

const STORAGE_KEY = 'walker-sidebar-collapsed';
const COLLAPSED_ATTR = 'data-sidebar-collapsed';

let isInitialized = false;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function initSidebarState(): void {
  const toggleBtn = document.getElementById('sidebar-collapse-btn');

  if (!toggleBtn) return;

  const root = document.documentElement;
  const savedState = localStorage.getItem(STORAGE_KEY);
  if (savedState === 'true') {
    collapse(root);
    updateIcon(toggleBtn, true);
  } else {
    expand(root);
    updateIcon(toggleBtn, false);
  }

  if (!toggleBtn.dataset.sidebarInit) {
    toggleBtn.dataset.sidebarInit = 'true';
    toggleBtn.addEventListener('click', () => {
      const isCollapsed = root.hasAttribute(COLLAPSED_ATTR);
      if (isCollapsed) {
        expand(root);
        updateIcon(toggleBtn, false);
        localStorage.setItem(STORAGE_KEY, 'false');
      } else {
        collapse(root);
        updateIcon(toggleBtn, true);
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    });
  }

  if (!isInitialized) {
    keydownHandler = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        document.getElementById('sidebar-collapse-btn')?.click();
      }
    };
    document.addEventListener('keydown', keydownHandler);
    isInitialized = true;
  }
}

function cleanup() {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  isInitialized = false;
}

document.addEventListener('astro:before-swap', cleanup);

function collapse(root: HTMLElement): void {
  root.setAttribute(COLLAPSED_ATTR, '');
}

function expand(root: HTMLElement): void {
  root.removeAttribute(COLLAPSED_ATTR);
}

function updateIcon(btn: HTMLElement, collapsed: boolean): void {
  btn.setAttribute('aria-label', collapsed ? '展开侧边栏' : '折叠侧边栏');
}

document.addEventListener('astro:page-load', initSidebarState);

export {};
