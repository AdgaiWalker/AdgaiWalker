import { registerLifecycle } from './with-lifecycle';
import { applyTheme, cycleTheme } from '../lib/theme';
import { gsap } from 'gsap';

let dragFrame = 0;
let scale = 1.0;
let homeCanvasTimers: ReturnType<typeof setTimeout>[] = [];

interface StatusController {
  resetToDefault: () => void;
  startIdle: () => void;
  stopIdle: () => void;
}

const statusControllers = new WeakMap<HTMLElement, StatusController>();

function scheduleHomeCanvasTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
  let timer: ReturnType<typeof setTimeout>;
  timer = setTimeout(() => {
    homeCanvasTimers = homeCanvasTimers.filter((item) => item !== timer);
    callback();
  }, delay);
  homeCanvasTimers.push(timer);
  return timer;
}

function clearHomeCanvasTimers() {
  homeCanvasTimers.forEach((timer) => clearTimeout(timer));
  homeCanvasTimers = [];
}

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

  // Velocity tracking variables
  let lastTime = 0;
  let lastX = 0;
  let lastY = 0;
  let vx = 0;
  let vy = 0;

  draggables.forEach(item => {
    if (!item.dataset.x) item.dataset.x = '0';
    if (!item.dataset.y) item.dataset.y = '0';

    // Set initial position using GSAP to keep transform matrix cleaner
    gsap.set(item, {
      x: parseFloat(item.dataset.x),
      y: parseFloat(item.dataset.y)
    });

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

      lastTime = performance.now();
      lastX = clientX;
      lastY = clientY;
      vx = 0;
      vy = 0;

      // Stop any running inertia tween
      gsap.killTweensOf(activeItem);
      
      gsap.to(activeItem, {
        scale: 1.045,
        boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.35), 0 10px 22px -8px rgba(0, 0, 0, 0.2), 0 0 20px var(--color-brand-glow)',
        duration: 0.3,
        ease: 'power2.out'
      });
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

    // Track instantaneous velocity
    const now = performance.now();
    const dt = Math.max(1, now - lastTime); // prevent division by zero
    vx = (clientX - lastX) / dt;
    vy = (clientY - lastY) / dt;

    lastTime = now;
    lastX = clientX;
    lastY = clientY;

    if (dragFrame) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (!activeItem) return;
      
      activeItem.dataset.x = pendingX.toString();
      activeItem.dataset.y = pendingY.toString();

      // Dynamic Skew: skew card on X-axis and apply subtle tilt rotation based on drag velocity
      const skewVal = Math.max(-12, Math.min(12, vx * 12));
      const rotVal = Math.max(-6, Math.min(6, vx * 6));

      gsap.set(activeItem, {
        x: pendingX,
        y: pendingY,
        skewX: skewVal,
        rotate: rotVal
      });
    });
  };

  const onDragEnd = () => {
    if (!activeItem) return;
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;

    activeItem.classList.remove('cursor-grabbing');
    activeItem.classList.add('cursor-grab');
    activeItem.style.zIndex = '10';

    // Calculate target position based on velocity-induced inertia (px/ms to px multiplier)
    const inertiaFactor = 160; // Damping scale multiplier
    const finalX = parseFloat(activeItem.dataset.x || '0') + vx * inertiaFactor;
    const finalY = parseFloat(activeItem.dataset.y || '0') + vy * inertiaFactor;

    // Limit cards from sliding too far off-screen
    const limitX = Math.max(-450, Math.min(450, finalX));
    const limitY = Math.max(-300, Math.min(300, finalY));

    // Smooth inertia slide, boundary snap and shape restore using GSAP
    gsap.killTweensOf(activeItem);
    const targetItem = activeItem;
    gsap.to(targetItem, {
      x: limitX,
      y: limitY,
      skewX: 0,
      rotate: 0,
      scale: 1.0,
      boxShadow: '0 8px 32px var(--color-brand-glow), 0 2px 12px rgba(0, 0, 0, 0.04)',
      duration: 0.85,
      ease: 'power3.out', // beautiful decaying damping easing
      onComplete: () => {
        gsap.set(targetItem, { clearProps: 'boxShadow,scale' });
      },
      onUpdate: () => {
        if (!targetItem) return;
        targetItem.dataset.x = gsap.getProperty(targetItem, 'x').toString();
        targetItem.dataset.y = gsap.getProperty(targetItem, 'y').toString();
      }
    });

    activeItem = null;
  };

  document.addEventListener('mousemove', onDragMove, { signal });
  document.addEventListener('touchmove', onDragMove, { passive: true, signal });
  document.addEventListener('mouseup', onDragEnd, { signal });
  document.addEventListener('touchend', onDragEnd, { signal });
}

function initThemeToggle(signal: AbortSignal) {
  // 应用已保存的主题
  applyTheme();

  // 目录卡主题切换按钮
  const canvasToggle = document.getElementById('canvas-theme-toggle');
  if (canvasToggle) {
    canvasToggle.addEventListener('click', () => cycleTheme(), { signal });
  }

  // 监听其他来源的主题变更
  document.addEventListener('walker-theme-change', ((e: CustomEvent) => {
    applyTheme(e.detail);
  }) as EventListener, { signal });
}

// =========================================
// Spark! 抽点子盲盒 — 已迁移至 GreetingCard
// =========================================

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
    clearHomeCanvasTimers();
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
  };
}

// =========================================
// 状态栏上下文反应 + idle 鼓励语
// =========================================

const STATUS_DEFAULT_TEXT = '行过万里水路';

const IDLE_MESSAGES = [
  '试试拖拽卡片，重新排列你的画布 ✨',
  '按 ⌘K 可以搜索任何内容 🔍',
  '右下角可以切换主题和缩放 🎨',
  '每个卡片都可以拖动哦 🖱️',
  '点 Spark! 抽一个创意脑洞 💡',
  '悬停卡片试试看，会有惊喜 👀',
];

const CONTEXT_MAP: Record<string, string> = {
  'greeting-card': '这是秋知 — 悬停看看会发生什么 🐾',
  'brand-card': '有点子？试试 Spark! 抽个创意盲盒 🎲',
};

function showStatusText(statusEl: HTMLElement | null, text: string) {
  if (!statusEl) return;
  statusEl.style.opacity = '0';
  scheduleHomeCanvasTimer(() => {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.opacity = '1';
    }
  }, 200);
}

function initIdleMessages(statusEl: HTMLElement, signal: AbortSignal) {
  let idleTimer: ReturnType<typeof setInterval> | null = null;
  let idleIndex = 0;

  function resetToDefault() {
    showStatusText(statusEl, STATUS_DEFAULT_TEXT);
  }

  function startIdle() {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      idleIndex = (idleIndex + 1) % IDLE_MESSAGES.length;
      showStatusText(statusEl, IDLE_MESSAGES[idleIndex]);
      scheduleHomeCanvasTimer(() => {
        if (!document.querySelector('.draggable-card:hover')) {
          resetToDefault();
        }
      }, 4000);
    }, 8000);
  }

  function stopIdle() {
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
  }

  // abort 时清理 interval
  signal.addEventListener('abort', stopIdle);

  statusControllers.set(statusEl, {
    resetToDefault,
    startIdle,
    stopIdle,
  });

  startIdle();
}

function initCardHoverReactions(statusEl: HTMLElement, signal: AbortSignal) {
  const controller = statusControllers.get(statusEl);
  if (!controller) return;
  const { resetToDefault, startIdle, stopIdle } = controller;

  const cardElements = document.querySelectorAll('.draggable-card');
  cardElements.forEach(card => {
    card.addEventListener('mouseenter', () => {
      stopIdle();

      const greeting = card.querySelector('#greeting-card');
      if (greeting) { showStatusText(statusEl, CONTEXT_MAP['greeting-card']); return; }

      const brand = card.querySelector('#brand-card');
      if (brand) { showStatusText(statusEl, CONTEXT_MAP['brand-card']); return; }

      const text = card.textContent || '';
      if (text.includes('最新文章')) { showStatusText(statusEl, '最新的思考都在这里 — 点进去看看 📖'); return; }
      if (text.includes('资源') || text.includes('RESOURCES')) { showStatusText(statusEl, '精选工具和资源 — 每一个都经过试用 🔧'); return; }
      if (text.includes('项目')) { showStatusText(statusEl, '正在做的项目 — 从点子到现实 🚀'); return; }
      if (text.includes('点子')) { showStatusText(statusEl, '灵感收集箱 — 随时记录 💡'); return; }
    }, { signal });

    card.addEventListener('mouseleave', () => {
      resetToDefault();
      startIdle();
    }, { signal });
  });

  // 搜索框
  const searchBtn = document.getElementById('search-trigger');
  if (searchBtn) {
    searchBtn.addEventListener('mouseenter', () => {
      showStatusText(statusEl, '⌘K 快速搜索任何文章、工具或点子');
    }, { signal });
    searchBtn.addEventListener('mouseleave', () => {
      resetToDefault();
    }, { signal });
  }
}

function initSocialLinkReactions(statusEl: HTMLElement, signal: AbortSignal) {
  const controller = statusControllers.get(statusEl);
  if (!controller) return;
  const { resetToDefault } = controller;

  document.querySelectorAll('a[href*="bilibili"], a[href*="xiaohongshu"]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const href = (el as HTMLAnchorElement).href;
      if (href.includes('bilibili')) showStatusText(statusEl, 'B站 — 秋知的视频都在这里 📺');
      else showStatusText(statusEl, '小红书 — 日常分享 📕');
    }, { signal });
    el.addEventListener('mouseleave', () => resetToDefault(), { signal });
  });
}

function initStatusReactions(signal: AbortSignal) {
  const statusEl = document.getElementById('status-text');
  if (!statusEl) return;

  initIdleMessages(statusEl, signal);
  initCardHoverReactions(statusEl, signal);
  initSocialLinkReactions(statusEl, signal);
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
    scheduleHomeCanvasTimer(() => ripple.remove(), 600);
  }, { signal });
}

registerLifecycle(initHomeInteractions);
