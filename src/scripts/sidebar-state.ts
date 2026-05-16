/**
 * sidebar-state.ts — 侧边栏折叠状态管理
 * 支持按钮点击切换 + 快捷键 [ + localStorage 持久化
 */

const STORAGE_KEY = 'walker-sidebar-collapsed';

// 记录当前是否已绑定事件，防止重复绑定
let isInitialized = false;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function initSidebarState(): void {
  const nav = document.getElementById('main-nav');
  const toggleBtn = document.getElementById('sidebar-collapse-btn');
  const layout = document.getElementById('article-layout');

  if (!nav || !toggleBtn) return;

  // 从 localStorage 恢复状态
  const savedState = localStorage.getItem(STORAGE_KEY);
  if (savedState === 'true') {
    collapse(nav, layout);
    updateIcon(toggleBtn, true);
  } else {
    expand(nav, layout);
    updateIcon(toggleBtn, false);
  }

  // 确保每次 DOM 更新后都能正确绑定，但由于 toggleBtn 可能被重新渲染，
  // 我们需要给 toggleBtn 加上点击事件。为了防止多次绑定，可以判断一个自定义属性
  if (!toggleBtn.dataset.sidebarInit) {
    toggleBtn.dataset.sidebarInit = 'true';
    toggleBtn.addEventListener('click', () => {
      const isCollapsed = nav.classList.contains('sidebar-collapsed-nav');
      if (isCollapsed) {
        expand(nav, layout);
        updateIcon(toggleBtn, false);
        localStorage.setItem(STORAGE_KEY, 'false');
      } else {
        collapse(nav, layout);
        updateIcon(toggleBtn, true);
        localStorage.setItem(STORAGE_KEY, 'true');
      }
    });
  }

  // document 级别的事件只需要绑定一次
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

function collapse(nav: HTMLElement, layout: HTMLElement | null): void {
  nav.classList.add('sidebar-collapsed-nav');
  layout?.classList.add('sidebar-collapsed');
  document.body.classList.add('sidebar-collapsed');
}

function expand(nav: HTMLElement, layout: HTMLElement | null): void {
  nav.classList.remove('sidebar-collapsed-nav');
  layout?.classList.remove('sidebar-collapsed');
  document.body.classList.remove('sidebar-collapsed');
}

function updateIcon(btn: HTMLElement, collapsed: boolean): void {
  const icon = btn.querySelector('iconify-icon');
  if (icon) {
    icon.setAttribute('icon', collapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close');
  }
}

document.addEventListener('astro:page-load', initSidebarState);
