/**
 * Shared column-resize utility.
 * Wired via `data-resize` attributes on handle elements.
 */
interface ResizeConfig {
  cssVar: string;
  storageKey: string;
  min: number;
  max: number;
}

const configs: Record<string, ResizeConfig> = {};
const wiredHandles = new Set<string>();

// Clear stale state on View Transitions
document.addEventListener('astro:before-swap', () => {
  wiredHandles.clear();
  for (const key of Object.keys(configs)) {
    delete configs[key];
  }
});

export function initColumnResize(
  kind: string,
  cfg: ResizeConfig,
) {
  configs[kind] = cfg;
}

export function bootColumnResize() {
  const root = document.documentElement;

  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const read = (name: string, fb: number) => {
    const v = parseInt(getComputedStyle(root).getPropertyValue(name), 10);
    return Number.isFinite(v) ? v : fb;
  };
  const apply = (name: string, w: number) => root.style.setProperty(name, `${w}px`);

  // Restore persisted widths
  for (const [, cfg] of Object.entries(configs)) {
    const saved = Number(localStorage.getItem(cfg.storageKey));
    if (Number.isFinite(saved) && saved > 0) {
      apply(cfg.cssVar, clamp(saved, cfg.min, cfg.max));
    }
  }

  const startResize = (kind: string, event: PointerEvent, handle: HTMLElement) => {
    if (window.innerWidth < 1024) return;
    const cfg = configs[kind];
    if (!cfg) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add('is-resizing-columns');
    handle.classList.add('is-active');

    const startX = event.clientX;
    const startW = read(cfg.cssVar, (cfg.min + cfg.max) / 2);
    let latest = startW;

    const onMove = (e: PointerEvent) => {
      latest = clamp(startW + (e.clientX - startX), cfg.min, cfg.max);
      apply(cfg.cssVar, latest);
    };

    const onUp = () => {
      handle.releasePointerCapture?.(event.pointerId);
      handle.classList.remove('is-active');
      document.body.classList.remove('is-resizing-columns');
      localStorage.setItem(cfg.storageKey, String(latest));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  for (const kind of Object.keys(configs)) {
    if (wiredHandles.has(kind)) continue;
    const handle = document.querySelector<HTMLElement>(`[data-resize="${kind}"]`);
    if (!handle) continue;
    wiredHandles.add(kind);
    handle.addEventListener('pointerdown', (event) =>
      startResize(kind, event as PointerEvent, handle),
    );
  }
}
