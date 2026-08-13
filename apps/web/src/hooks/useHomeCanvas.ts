/**
 * 首页画布交互（规则+编排）
 * 职责：卡片 1:1 拖拽、速度投影、可中断弹簧；Ctrl/⌘+滚轮缩放。
 * 离开再进靠组件 remount 回到默认布局。
 */
import { useEffect, useRef } from 'react';

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 640;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.35;
const DRAG_LIMIT = 420;
const MAX_RELEASE_VELOCITY = 3000;
const COMPACT_CANVAS_QUERY = '(max-width: 760px)';
const SPRING_RESPONSE_SECONDS = 0.4;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function project(velocity: number, decelerationRate = 0.99) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

function rubberband(value: number) {
  const distance = Math.abs(value);
  if (distance <= DRAG_LIMIT) return value;
  const overshoot = distance - DRAG_LIMIT;
  const dimension = 240;
  const resisted = (overshoot * dimension * 0.55) / (dimension + 0.55 * overshoot);
  return Math.sign(value) * (DRAG_LIMIT + resisted);
}

type MotionState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  raf: number;
  lastTime: number;
};

type PointSample = { x: number; y: number; time: number };

export function useHomeCanvas(enabled: boolean) {
  const scaleRef = useRef(1);

  useEffect(() => {
    if (!enabled) return;
    const canvas = document.getElementById('desktop-canvas');
    const container = document.getElementById('canvas-container');
    if (!canvas || !container) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motionStates = new Map<HTMLElement, MotionState>();

    const getMotionState = (el: HTMLElement): MotionState => {
      const existing = motionStates.get(el);
      if (existing) return existing;
      const state = {
        x: Number(el.dataset.x || 0),
        y: Number(el.dataset.y || 0),
        vx: 0,
        vy: 0,
        raf: 0,
        lastTime: 0,
      };
      motionStates.set(el, state);
      return state;
    };

    const renderCard = (
      el: HTMLElement,
      state: MotionState,
      skew = 0,
      rotation = 0,
    ) => {
      el.dataset.x = String(state.x);
      el.dataset.y = String(state.y);
      el.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) skewX(${skew}deg) rotate(${rotation}deg)`;
    };

    const stopSpring = (state: MotionState) => {
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
    };

    const springTo = (
      el: HTMLElement,
      state: MotionState,
      targetX: number,
      targetY: number,
      velocityX: number,
      velocityY: number,
    ) => {
      stopSpring(state);
      el.style.transition = 'none';

      if (reduced) {
        state.x = targetX;
        state.y = targetY;
        state.vx = 0;
        state.vy = 0;
        renderCard(el, state);
        return;
      }

      const omega = (2 * Math.PI) / SPRING_RESPONSE_SECONDS;
      state.vx = velocityX;
      state.vy = velocityY;
      state.lastTime = performance.now();

      const frame = (now: number) => {
        const dt = Math.min((now - state.lastTime) / 1000, 1 / 30);
        state.lastTime = now;

        const ax = -omega * omega * (state.x - targetX) - 2 * omega * state.vx;
        const ay = -omega * omega * (state.y - targetY) - 2 * omega * state.vy;
        state.vx += ax * dt;
        state.vy += ay * dt;
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        renderCard(el, state);

        const settled =
          Math.hypot(state.x - targetX, state.y - targetY) < 0.45 &&
          Math.hypot(state.vx, state.vy) < 6;
        if (settled) {
          state.x = targetX;
          state.y = targetY;
          state.vx = 0;
          state.vy = 0;
          state.raf = 0;
          renderCard(el, state);
          return;
        }
        state.raf = requestAnimationFrame(frame);
      };

      state.raf = requestAnimationFrame(frame);
    };

    const applyCanvasScale = () => {
      if (window.matchMedia(COMPACT_CANVAS_QUERY).matches) {
        canvas.style.transform = 'none';
        canvas.style.transformOrigin = 'top center';
        return;
      }
      canvas.style.transform = `translate3d(0,0,0) scale(${scaleRef.current})`;
      canvas.style.transformOrigin = 'center center';
    };

    const autoFit = () => {
      if (window.matchMedia(COMPACT_CANVAS_QUERY).matches) {
        scaleRef.current = 1;
        applyCanvasScale();
        return;
      }
      const sx = window.innerWidth / CANVAS_WIDTH;
      const sy = window.innerHeight / CANVAS_HEIGHT;
      scaleRef.current = clamp(Math.min(sx, sy, 1.05), MIN_SCALE, MAX_SCALE);
      applyCanvasScale();
    };

    autoFit();

    type DragState = {
      el: HTMLElement;
      motion: MotionState;
      pointerId: number;
      grabX: number;
      grabY: number;
      baseX: number;
      baseY: number;
      pendingX: number;
      pendingY: number;
      raf: number;
      history: PointSample[];
    };
    let drag: DragState | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (window.matchMedia(COMPACT_CANVAS_QUERY).matches) return;
      const target = event.target as HTMLElement;
      if (target.closest('a,button,input,textarea')) return;
      const el = target.closest('.draggable-card') as HTMLElement | null;
      if (!el || !container.contains(el)) return;

      const motion = getMotionState(el);
      stopSpring(motion);
      el.style.transition = 'none';
      el.setPointerCapture(event.pointerId);
      el.classList.add('is-dragging');
      el.style.zIndex = '100';

      const now = performance.now();
      drag = {
        el,
        motion,
        pointerId: event.pointerId,
        grabX: event.clientX,
        grabY: event.clientY,
        baseX: motion.x,
        baseY: motion.y,
        pendingX: motion.x,
        pendingY: motion.y,
        raf: 0,
        history: [{ x: motion.x, y: motion.y, time: now }],
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const canvasScale = Math.max(scaleRef.current, 0.01);
      drag.pendingX = rubberband(
        drag.baseX + (event.clientX - drag.grabX) / canvasScale,
      );
      drag.pendingY = rubberband(
        drag.baseY + (event.clientY - drag.grabY) / canvasScale,
      );

      const now = performance.now();
      drag.history.push({ x: drag.pendingX, y: drag.pendingY, time: now });
      drag.history = drag.history.filter((sample) => now - sample.time <= 100);

      if (drag.raf) return;
      const currentDrag = drag;
      currentDrag.raf = requestAnimationFrame(() => {
        currentDrag.raf = 0;
        if (!drag) return;
        const samples = currentDrag.history;
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = Math.max((last.time - first.time) / 1000, 0.001);
        const visualVx = clamp(
          (last.x - first.x) / dt,
          -MAX_RELEASE_VELOCITY,
          MAX_RELEASE_VELOCITY,
        );
        const visualVy = clamp(
          (last.y - first.y) / dt,
          -MAX_RELEASE_VELOCITY,
          MAX_RELEASE_VELOCITY,
        );
        currentDrag.motion.x = currentDrag.pendingX;
        currentDrag.motion.y = currentDrag.pendingY;
        currentDrag.motion.vx = visualVx;
        currentDrag.motion.vy = visualVy;
        renderCard(
          currentDrag.el,
          currentDrag.motion,
          clamp(visualVx / 180, -8, 8),
          clamp(visualVx / 360, -4, 4),
        );
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const completed = drag;
      drag = null;
      if (completed.raf) cancelAnimationFrame(completed.raf);

      completed.motion.x = completed.pendingX;
      completed.motion.y = completed.pendingY;
      const first = completed.history[0];
      const last = completed.history[completed.history.length - 1];
      const dt = Math.max((last.time - first.time) / 1000, 0.001);
      const velocityX = clamp(
        (last.x - first.x) / dt,
        -MAX_RELEASE_VELOCITY,
        MAX_RELEASE_VELOCITY,
      );
      const velocityY = clamp(
        (last.y - first.y) / dt,
        -MAX_RELEASE_VELOCITY,
        MAX_RELEASE_VELOCITY,
      );
      const targetX = clamp(
        completed.motion.x + project(velocityX),
        -DRAG_LIMIT,
        DRAG_LIMIT,
      );
      const targetY = clamp(
        completed.motion.y + project(velocityY),
        -DRAG_LIMIT,
        DRAG_LIMIT,
      );

      completed.el.classList.remove('is-dragging');
      completed.el.style.zIndex = '';
      springTo(
        completed.el,
        completed.motion,
        targetX,
        targetY,
        velocityX,
        velocityY,
      );
    };

    const onWheel = (event: WheelEvent) => {
      if (window.matchMedia(COMPACT_CANVAS_QUERY).matches) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      scaleRef.current = clamp(
        scaleRef.current - event.deltaY * 0.0012,
        MIN_SCALE,
        MAX_SCALE,
      );
      applyCanvasScale();
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', autoFit);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', autoFit);
      if (drag?.raf) cancelAnimationFrame(drag.raf);
      for (const state of motionStates.values()) stopSpring(state);
    };
  }, [enabled]);
}
