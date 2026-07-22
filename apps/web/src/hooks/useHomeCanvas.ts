/**
 * 首页画布交互（规则+编排）
 * 职责：卡片拖拽（1:1 + 惯性）、Ctrl/⌘+滚轮缩放；不写 localStorage，
 * 离开再进靠组件 remount 回到默认布局。
 *
 * 依赖：DOM（#desktop-canvas / .draggable-card）
 * 调用：HomePage 挂载
 * 触发：pointer / wheel / resize
 * 实现：transform + rAF；无 GSAP
 */
import { useEffect, useRef } from 'react';

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 640;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.35;
const DRAG_LIMIT = 420;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function project(v: number, decelerationRate = 0.998) {
  return ((v / 1000) * decelerationRate) / (1 - decelerationRate);
}

export function useHomeCanvas(enabled: boolean) {
  const scaleRef = useRef(1);

  useEffect(() => {
    if (!enabled) return;
    const canvas = document.getElementById('desktop-canvas');
    const container = document.getElementById('canvas-container');
    if (!canvas || !container) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const applyCanvasScale = () => {
      canvas.style.transform = `translate3d(0,0,0) scale(${scaleRef.current})`;
      canvas.style.transformOrigin = 'center center';
    };

    const autoFit = () => {
      const sx = window.innerWidth / CANVAS_WIDTH;
      const sy = window.innerHeight / CANVAS_HEIGHT;
      scaleRef.current = clamp(Math.min(sx, sy, 1.05), MIN_SCALE, MAX_SCALE);
      applyCanvasScale();
    };

    autoFit();

    // —— 拖拽 ——
    type DragState = {
      el: HTMLElement;
      pointerId: number;
      grabX: number;
      grabY: number;
      baseX: number;
      baseY: number;
      lastT: number;
      lastX: number;
      lastY: number;
      vx: number;
      vy: number;
      raf: number;
      pendingX: number;
      pendingY: number;
    };
    let drag: DragState | null = null;

    const setCardPos = (el: HTMLElement, x: number, y: number, skew = 0, rot = 0) => {
      el.dataset.x = String(x);
      el.dataset.y = String(y);
      el.style.transform = `translate3d(${x}px, ${y}px, 0) skewX(${skew}deg) rotate(${rot}deg)`;
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a,button,input,textarea')) return;
      const el = target.closest('.draggable-card') as HTMLElement | null;
      if (!el || !container.contains(el)) return;

      const baseX = parseFloat(el.dataset.x || '0');
      const baseY = parseFloat(el.dataset.y || '0');
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
      el.style.zIndex = '100';

      drag = {
        el,
        pointerId: e.pointerId,
        grabX: e.clientX,
        grabY: e.clientY,
        baseX,
        baseY,
        lastT: performance.now(),
        lastX: e.clientX,
        lastY: e.clientY,
        vx: 0,
        vy: 0,
        raf: 0,
        pendingX: baseX,
        pendingY: baseY,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.grabX;
      const dy = e.clientY - drag.grabY;
      drag.pendingX = drag.baseX + dx;
      drag.pendingY = drag.baseY + dy;

      const now = performance.now();
      const dt = Math.max(1, now - drag.lastT);
      drag.vx = (e.clientX - drag.lastX) / dt;
      drag.vy = (e.clientY - drag.lastY) / dt;
      drag.lastT = now;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      if (drag.raf) return;
      const d = drag;
      d.raf = requestAnimationFrame(() => {
        d.raf = 0;
        if (!drag) return;
        const skew = clamp(d.vx * 10, -10, 10);
        const rot = clamp(d.vx * 5, -5, 5);
        setCardPos(d.el, d.pendingX, d.pendingY, skew, rot);
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const d = drag;
      drag = null;
      if (d.raf) cancelAnimationFrame(d.raf);

      const curX = d.pendingX;
      const curY = d.pendingY;
      // px/ms → 投影终点
      const endX = clamp(curX + project(d.vx * 1000) * 0.35, -DRAG_LIMIT, DRAG_LIMIT);
      const endY = clamp(curY + project(d.vy * 1000) * 0.35, -DRAG_LIMIT, DRAG_LIMIT);

      d.el.classList.remove('is-dragging');
      d.el.style.zIndex = '';
      d.el.style.transition = reduced
        ? 'transform 120ms ease'
        : 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s ease';
      setCardPos(d.el, endX, endY, 0, 0);

      window.setTimeout(() => {
        d.el.style.transition = '';
      }, 600);
    };

    // —— Ctrl/⌘ + 滚轮缩放（会话内有效，进页 autoFit 重置）——
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.0012;
      scaleRef.current = clamp(scaleRef.current + delta, MIN_SCALE, MAX_SCALE);
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
    };
  }, [enabled]);
}
