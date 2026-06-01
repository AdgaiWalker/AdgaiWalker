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

const PRESET_THEME_COLORS: Record<string, string[]> = {
  nature: ['#fee196', '#ffafc8', '#a0f0ff', '#b4f5cd'],
  aurora: ['#ec4899', '#06b6d4', '#6366f1', '#a855f7'],
  sunset: ['#f97316', '#f43f5e', '#f59e0b', '#fecdd3'],
  mint: ['#10b981', '#14b8a6', '#84cc16', '#06b6d4'],
};

function initControlCenter(signal: AbortSignal) {
  const btnIn = document.getElementById('zoom-in');
  const btnOut = document.getElementById('zoom-out');
  const btnFit = document.getElementById('zoom-fit');
  const themePills = document.querySelectorAll('.theme-pill');
  const customPill = document.getElementById('custom-theme-pill');
  const customPanel = document.getElementById('custom-palette-panel');
  const closePanelBtn = document.getElementById('close-custom-panel');
  const resetBtn = document.getElementById('reset-custom-colors');
  const picker1 = document.getElementById('picker-orb-1') as HTMLInputElement;
  const picker2 = document.getElementById('picker-orb-2') as HTMLInputElement;
  const picker3 = document.getElementById('picker-orb-3') as HTMLInputElement;
  const picker4 = document.getElementById('picker-orb-4') as HTMLInputElement;

  btnIn?.addEventListener('click', () => {
    scale = Math.min(scale + 0.1, 2.0);
    updateCanvasTransform();
  }, { signal });

  btnOut?.addEventListener('click', () => {
    scale = Math.max(scale - 0.1, 0.3);
    updateCanvasTransform();
  }, { signal });

  btnFit?.addEventListener('click', autoFitScale, { signal });

  themePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const theme = pill.getAttribute('data-theme');
      if (theme) applyTheme(theme);
    }, { signal });
  });

  customPill?.addEventListener('click', () => applyTheme('custom'), { signal });
  closePanelBtn?.addEventListener('click', () => customPanel?.classList.add('hidden'), { signal });

  const updateCustomOrbColor = (index: number, val: string) => {
    document.body.style.setProperty(`--orb-color-${index}`, val);

    let savedColors: Record<string, string> = {};
    try {
      savedColors = JSON.parse(localStorage.getItem('walker-custom-colors') || '{}');
    } catch {}

    savedColors[`orb${index}`] = val;
    localStorage.setItem('walker-custom-colors', JSON.stringify(savedColors));
  };

  picker1?.addEventListener('input', (e) => updateCustomOrbColor(1, (e.target as HTMLInputElement).value), { signal });
  picker2?.addEventListener('input', (e) => updateCustomOrbColor(2, (e.target as HTMLInputElement).value), { signal });
  picker3?.addEventListener('input', (e) => updateCustomOrbColor(3, (e.target as HTMLInputElement).value), { signal });
  picker4?.addEventListener('input', (e) => updateCustomOrbColor(4, (e.target as HTMLInputElement).value), { signal });

  resetBtn?.addEventListener('click', () => {
    localStorage.removeItem('walker-custom-colors');
    applyTheme('nature');
    customPanel?.classList.add('hidden');
  }, { signal });

  applyTheme(localStorage.getItem('walker-theme') || 'nature');
}

function applyTheme(themeName: string) {
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
  document.body.classList.add(`theme-${themeName}`);
  localStorage.setItem('walker-theme', themeName);

  document.querySelectorAll('.theme-pill, #custom-theme-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-theme') === themeName);
  });

  const customPanel = document.getElementById('custom-palette-panel');
  const picker1 = document.getElementById('picker-orb-1') as HTMLInputElement;
  const picker2 = document.getElementById('picker-orb-2') as HTMLInputElement;
  const picker3 = document.getElementById('picker-orb-3') as HTMLInputElement;
  const picker4 = document.getElementById('picker-orb-4') as HTMLInputElement;

  if (themeName === 'custom') {
    customPanel?.classList.remove('hidden');

    let localColors: Record<string, string> = {};
    try {
      localColors = JSON.parse(localStorage.getItem('walker-custom-colors') || '{}');
    } catch {}

    const col1 = localColors.orb1 || '#fee196';
    const col2 = localColors.orb2 || '#ffafc8';
    const col3 = localColors.orb3 || '#a0f0ff';
    const col4 = localColors.orb4 || '#b4f5cd';

    document.body.style.setProperty('--orb-color-1', col1);
    document.body.style.setProperty('--orb-color-2', col2);
    document.body.style.setProperty('--orb-color-3', col3);
    document.body.style.setProperty('--orb-color-4', col4);

    if (picker1) picker1.value = col1;
    if (picker2) picker2.value = col2;
    if (picker3) picker3.value = col3;
    if (picker4) picker4.value = col4;
  } else {
    customPanel?.classList.add('hidden');

    const presets = PRESET_THEME_COLORS[themeName] || PRESET_THEME_COLORS.nature;
    if (picker1) picker1.value = presets[0];
    if (picker2) picker2.value = presets[1];
    if (picker3) picker3.value = presets[2];
    if (picker4) picker4.value = presets[3];
  }
}

function initSparkBoxModal(signal: AbortSignal) {
  const modal = document.getElementById('spark-box-modal');
  const card = document.getElementById('spark-box-card');
  const btnClose = document.getElementById('spark-box-close');
  const btnCloseTop = document.getElementById('spark-box-close-top');
  const btnAgain = document.getElementById('spark-box-again');

  function closeModal() {
    if (!modal || !card) return;
    card.classList.remove('scale-100', 'opacity-100');
    card.classList.add('scale-95', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 250);
  }

  btnClose?.addEventListener('click', closeModal, { signal });
  btnCloseTop?.addEventListener('click', closeModal, { signal });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  }, { signal });

  btnAgain?.addEventListener('click', () => {
    closeModal();
    setTimeout(() => document.getElementById('spark-trigger-btn')?.click(), 350);
  }, { signal });
}

function initHomeInteractions() {
  const abort = new AbortController();
  const { signal } = abort;

  autoFitScale();
  window.addEventListener('resize', autoFitScale, { signal });
  initDraggables(signal);
  initControlCenter(signal);
  initSparkBoxModal(signal);

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

registerLifecycle(initHomeInteractions);
