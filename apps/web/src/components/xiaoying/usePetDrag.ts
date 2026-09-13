import { useEffect, type RefObject } from 'react';

const STORAGE_KEY = 'walker:xiaoying-layer-v3';
const DRAG_THRESHOLD = 10;
const PAD = 16;
const MAX_VELOCITY = 2800;
const SPRING_RESPONSE = 0.4;

type Sample = { x: number; y: number; time: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rubberband(value: number, min: number, max: number) {
  if (value < min) {
    const overshoot = min - value;
    return min - (overshoot * 120 * 0.55) / (120 + 0.55 * overshoot);
  }
  if (value > max) {
    const overshoot = value - max;
    return max + (overshoot * 120 * 0.55) / (120 + 0.55 * overshoot);
  }
  return value;
}

function project(velocity: number, decelerationRate = 0.99) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function bounds(el: HTMLElement) {
  const width = el.offsetWidth || 184;
  const height = el.offsetHeight || 148;
  const dock = document.querySelector('.xiaoying-dock');
  const dockTop =
    dock instanceof HTMLElement ? Math.round(dock.getBoundingClientRect().top) : PAD;
  return {
    minX: PAD,
    minY: Math.max(PAD, dock instanceof HTMLElement ? dockTop + 4 : PAD),
    maxX: Math.max(PAD, window.innerWidth - width - PAD),
    maxY: Math.max(PAD, window.innerHeight - height - PAD),
  };
}

function defaultPos(el: HTMLElement) {
  const box = bounds(el);
  return { x: box.maxX, y: box.maxY };
}

function readStored(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: number; y?: number; vw?: number; vh?: number };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    if (Math.abs((parsed.vw ?? 0) - window.innerWidth) > 80) return null;
    if (Math.abs((parsed.vh ?? 0) - window.innerHeight) > 80) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function writeStored(x: number, y: number) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      x,
      y,
      vw: window.innerWidth,
      vh: window.innerHeight,
    }));
  } catch {
    /* private mode */
  }
}

function interactiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('a,input,textarea,.xiaoying-panel'));
}

export function usePetDrag(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let raf = 0;
    let dragging = false;
    let moved = false;
    let pointerId: number | null = null;
    let grabX = 0;
    let grabY = 0;
    let baseX = 0;
    let baseY = 0;
    let history: Sample[] = [];
    let swallowClick = false;

    const paint = () => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const stopSpring = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const place = (nextX: number, nextY: number, persist = false) => {
      const box = bounds(el);
      x = clamp(nextX, box.minX, box.maxX);
      y = clamp(nextY, box.minY, box.maxY);
      paint();
      if (persist) writeStored(x, y);
    };

    const springTo = (targetX: number, targetY: number, startVx: number, startVy: number) => {
      stopSpring();
      if (reduced) {
        place(targetX, targetY, true);
        vx = 0;
        vy = 0;
        return;
      }
      const omega = (2 * Math.PI) / SPRING_RESPONSE;
      vx = startVx;
      vy = startVy;
      let last = performance.now();
      const frame = (now: number) => {
        const dt = Math.min((now - last) / 1000, 1 / 30);
        last = now;
        vx += (-omega * omega * (x - targetX) - 2 * omega * vx) * dt;
        vy += (-omega * omega * (y - targetY) - 2 * omega * vy) * dt;
        x += vx * dt;
        y += vy * dt;
        paint();
        const settled = Math.hypot(x - targetX, y - targetY) < 0.45 && Math.hypot(vx, vy) < 6;
        if (settled) {
          raf = 0;
          place(targetX, targetY, true);
          vx = 0;
          vy = 0;
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    const stored = readStored();
    const start = stored ?? defaultPos(el);
    place(start.x, start.y, false);

    const onDown = (event: PointerEvent) => {
      if ((event.button ?? 0) !== 0 || interactiveTarget(event.target)) return;
      stopSpring();
      dragging = true;
      moved = false;
      pointerId = event.pointerId;
      grabX = event.clientX;
      grabY = event.clientY;
      baseX = x;
      baseY = y;
      history = [{ x, y, time: performance.now() }];
      el.dataset.dragging = 'false';
    };

    const onMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - grabX;
      const dy = event.clientY - grabY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!moved) {
        moved = true;
        el.setPointerCapture(event.pointerId);
        el.dataset.dragging = 'true';
      }
      const box = bounds(el);
      x = rubberband(baseX + dx, box.minX, box.maxX);
      y = rubberband(baseY + dy, box.minY, box.maxY);
      const now = performance.now();
      history.push({ x, y, time: now });
      history = history.filter(sample => now - sample.time <= 100);
      paint();
    };

    const onUp = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      el.dataset.dragging = 'false';
      if (!moved) return;
      swallowClick = true;
      const now = performance.now();
      const first = history[0];
      const last = history[history.length - 1] ?? first;
      const dt = Math.max((last.time - first.time) / 1000, 0.001);
      const releaseVx = clamp((last.x - first.x) / dt, -MAX_VELOCITY, MAX_VELOCITY);
      const releaseVy = clamp((last.y - first.y) / dt, -MAX_VELOCITY, MAX_VELOCITY);
      const box = bounds(el);
      const targetX = clamp(x + project(releaseVx), box.minX, box.maxX);
      const targetY = clamp(y + project(releaseVy), box.minY, box.maxY);
      springTo(targetX, targetY, releaseVx, releaseVy);
    };

    const onClick = (event: MouseEvent) => {
      if (!swallowClick) return;
      event.preventDefault();
      event.stopPropagation();
      swallowClick = false;
    };

    const onResize = () => place(x, y, true);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick, true);
    window.addEventListener('resize', onResize);
    return () => {
      stopSpring();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClick, true);
      window.removeEventListener('resize', onResize);
    };
  }, [ref]);
}
