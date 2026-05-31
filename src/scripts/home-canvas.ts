import { registerLifecycle } from './with-lifecycle';

let dragFrame = 0;
let scale = 1.0;

function autoFitScale() {
  const CANVAS_WIDTH = 1060;
  const CANVAS_HEIGHT = 560;
  const scaleX = window.innerWidth / CANVAS_WIDTH;
  const scaleY = window.innerHeight / CANVAS_HEIGHT;

  scale = Math.min(Math.min(scaleX, scaleY), 1.05);
  updateCanvasTransform();
}

function updateCanvasTransform() {
  const canvas = document.getElementById('desktop-canvas');
  if (!canvas) return;
  canvas.style.transform = `translate3d(0, 0, 0) scale(${scale})`;

  const zoomText = document.getElementById('zoom-text');
  if (zoomText) {
    zoomText.textContent = `${Math.round(scale * 100)}%`;
  }
}

function initDraggables(signal: AbortSignal) {
  const draggables = document.querySelectorAll<HTMLElement>('.draggable-card');
  let activeItem: HTMLElement | null = null;
  let initialX = 0;
  let initialY = 0;
  let pendingX = 0;
  let pendingY = 0;

  draggables.forEach(item => {
    if (!item.dataset.x) item.dataset.x = '0';
    if (!item.dataset.y) item.dataset.y = '0';

    const onDragStart = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a') || target.closest('button') || target.closest('input')) return;

      activeItem = item;
      activeItem.classList.remove('cursor-grab');
      activeItem.classList.add('cursor-grabbing');
      activeItem.style.zIndex = '100';

      const clientX = e.type.includes('mouse') ? (e as MouseEvent).clientX : (e as TouchEvent).touches[0].clientX;
      const clientY = e.type.includes('mouse') ? (e as MouseEvent).clientY : (e as TouchEvent).touches[0].clientY;

      initialX = clientX - parseFloat(activeItem.dataset.x || '0');
      initialY = clientY - parseFloat(activeItem.dataset.y || '0');
    };

    item.addEventListener('mousedown', onDragStart, { signal });
    item.addEventListener('touchstart', onDragStart, { passive: true, signal });
  });

  const onDragMove = (e: MouseEvent | TouchEvent) => {
    if (!activeItem) return;

    const clientX = e.type.includes('mouse') ? (e as MouseEvent).clientX : (e as TouchEvent).touches[0].clientX;
    const clientY = e.type.includes('mouse') ? (e as MouseEvent).clientY : (e as TouchEvent).touches[0].clientY;

    pendingX = clientX - initialX;
    pendingY = clientY - initialY;

    if (dragFrame) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (!activeItem) return;
      activeItem.dataset.x = pendingX.toString();
      activeItem.dataset.y = pendingY.toString();
      activeItem.style.transform = `translate3d(${pendingX}px, ${pendingY}px, 0) scale(1.02) rotate(0.5deg)`;
    });
  };

  const onDragEnd = () => {
    if (!activeItem) return;
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    activeItem.classList.remove('cursor-grabbing');
    activeItem.classList.add('cursor-grab');
    activeItem.style.zIndex = '10';
    activeItem.style.transform = `translate3d(${activeItem.dataset.x}px, ${activeItem.dataset.y}px, 0)`;
    activeItem = null;
  };

  document.addEventListener('mousemove', onDragMove, { signal });
  document.addEventListener('touchmove', onDragMove, { passive: true, signal });
  document.addEventListener('mouseup', onDragEnd, { signal });
  document.addEventListener('touchend', onDragEnd, { signal });
}

function initThemeToggle(signal: AbortSignal) {
  // Apply saved theme on load
  const savedTheme = localStorage.getItem('walker-theme') || 'nature';
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
  document.body.classList.add(`theme-${savedTheme}`);

  // Listen for theme changes from Navigation's home-theme-toggle button
  document.addEventListener('walker-theme-change', ((e: CustomEvent) => {
    const themeName = e.detail;
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
    document.body.classList.add(`theme-${themeName}`);
  }) as EventListener, { signal });
}

function initHomeInteractions() {
  const abort = new AbortController();
  const { signal } = abort;

  autoFitScale();
  window.addEventListener('resize', autoFitScale, { signal });
  initDraggables(signal);
  initThemeToggle(signal);
  initStatusReactions(signal);
  initClickRipple(signal);

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('search-modal')?.classList.toggle('hidden');
    }
  }, { signal });

  return () => {
    abort.abort();
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
  };
}

// =========================================
// 状态栏上下文反应 + idle 鼓励语
// =========================================
function initStatusReactions(signal: AbortSignal) {
  const statusText = document.getElementById('status-text');
  if (!statusText) return;

  const defaultText = '行过万里水路';
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let idleIndex = 0;

  const IDLE_MESSAGES = [
    '试试拖拽卡片，重新排列你的画布 ✨',
    '按 ⌘K 可以搜索任何内容 🔍',
    '右下角可以切换主题和缩放 🎨',
    '每个卡片都可以拖动哦 🖱️',
    '点 Spark! 抽一个创意脑洞 💡',
    '悬停卡片试试看，会有惊喜 👀',
  ];

  function show(text: string) {
    if (!statusText) return;
    statusText.style.opacity = '0';
    setTimeout(() => {
      if (statusText) {
        statusText.textContent = text;
        statusText.style.opacity = '1';
      }
    }, 200);
  }

  function resetToDefault() {
    show(defaultText);
  }

  function startIdle() {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      idleIndex = (idleIndex + 1) % IDLE_MESSAGES.length;
      show(IDLE_MESSAGES[idleIndex]);
      // 显示 4 秒后恢复默认
      setTimeout(() => {
        if (!document.querySelector('.draggable-card:hover')) {
          resetToDefault();
        }
      }, 4000);
    }, 8000);
  }

  // 根据悬停区域切换文案
  const CONTEXT_MAP: Record<string, string> = {
    'greeting-card': '这是秋知 — 悬停看看会发生什么 🐾',
    'brand-card': '有点子？试试 Spark! 抽个创意盲盒 🎲',
  };

  const cardElements = document.querySelectorAll('.draggable-card');
  cardElements.forEach(card => {
    // 找到卡片内部具有 id 的元素或卡片本身
    card.addEventListener('mouseenter', () => {
      if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }

      // 检查是否是问候卡片
      const greeting = card.querySelector('#greeting-card');
      if (greeting) { show(CONTEXT_MAP['greeting-card']); return; }

      const brand = card.querySelector('#brand-card');
      if (brand) { show(CONTEXT_MAP['brand-card']); return; }

      // 检查内部文本线索
      const text = card.textContent || '';
      if (text.includes('最新文章')) { show('最新的思考都在这里 — 点进去看看 📖'); return; }
      if (text.includes('资源') || text.includes('RESOURCES')) { show('精选工具和资源 — 每一个都经过试用 🔧'); return; }
      if (text.includes('项目')) { show('正在做的项目 — 从点子到现实 🚀'); return; }
      if (text.includes('点子')) { show('灵感收集箱 — 随时记录 💡'); return; }
    }, { signal });

    card.addEventListener('mouseleave', () => {
      resetToDefault();
      startIdle();
    }, { signal });

    // 搜索框
    const searchBtn = document.getElementById('search-trigger');
    if (searchBtn) {
      searchBtn.addEventListener('mouseenter', () => {
        show('⌘K 快速搜索任何文章、工具或点子');
      }, { signal });
      searchBtn.addEventListener('mouseleave', () => {
        resetToDefault();
      }, { signal });
    }
  });

  // 社交链接 hover
  document.querySelectorAll('a[href*="bilibili"], a[href*="xiaohongshu"]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const href = (el as HTMLAnchorElement).href;
      if (href.includes('bilibili')) show('B站 — 秋知的视频都在这里 📺');
      else show('小红书 — 日常分享 📕');
    }, { signal });
    el.addEventListener('mouseleave', () => resetToDefault(), { signal });
  });

  // 5 秒无交互开始 idle 播报
  startIdle();
}

// =========================================
// 点击涟漪反馈
// =========================================
function initClickRipple(signal: AbortSignal) {
  const canvas = document.getElementById('canvas-container');
  if (!canvas) return;

  canvas.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // 不在链接、按钮、输入框上产生涟漪
    if (target.closest('a') || target.closest('button') || target.closest('input')) return;

    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = e.clientX + 'px';
    ripple.style.top = e.clientY + 'px';
    canvas.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }, { signal });
}

registerLifecycle(initHomeInteractions);
