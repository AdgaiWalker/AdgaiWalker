/**
 * useTypewriter — 呈现层逐字动画（不是服务端流式）。
 *
 * nextStep 由一次性 POST 返回完整文本，这里只在展示层逐字吐出，
 * 让「正在认真回答」可感知；因此绝不对外宣称流式。
 * 尊重 prefers-reduced-motion：开启减少动态效果时一次性直出。
 */
import { useEffect, useState } from 'react';

/** 整段约 1.2s 走完：长文本自动加速，短文本不至于一闪而过 */
const TARGET_DURATION_SECONDS = 1.2;
const MIN_CHARS_PER_SECOND = 45;
const MAX_CHARS_PER_SECOND = 180;

function speedFor(length: number): number {
  return Math.min(
    MAX_CHARS_PER_SECOND,
    Math.max(MIN_CHARS_PER_SECOND, length / TARGET_DURATION_SECONDS),
  );
}

function nowMs(): number {
  return typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useTypewriter(
  fullText: string,
  options: { enabled?: boolean } = {},
): { visible: string; done: boolean } {
  const { enabled = true } = options;
  const [visible, setVisible] = useState('');

  useEffect(() => {
    if (!fullText) {
      setVisible('');
      return;
    }
    if (!enabled || prefersReducedMotion()) {
      setVisible(fullText);
      return;
    }

    // 宿主没有 rAF（测试环境/老浏览器）时退化为定时器，避免动画把渲染打崩
    const requestFrame =
      typeof requestAnimationFrame === 'function'
        ? (cb: FrameRequestCallback) => requestAnimationFrame(cb)
        : (cb: FrameRequestCallback) =>
            setTimeout(() => cb(nowMs()), 16) as unknown as number;
    const cancelFrame =
      typeof cancelAnimationFrame === 'function'
        ? (handle: number) => cancelAnimationFrame(handle)
        : (handle: number) => clearTimeout(handle);

    let cancelled = false;
    let frame: number | null = null;
    const startedAt = nowMs();
    const charsPerSecond = speedFor(fullText.length);

    const tick = (timestamp: number) => {
      if (cancelled) return;
      const elapsedSeconds = (timestamp - startedAt) / 1000;
      const count = Math.min(
        fullText.length,
        Math.ceil(elapsedSeconds * charsPerSecond),
      );
      setVisible(fullText.slice(0, count));
      frame = count < fullText.length ? requestFrame(tick) : null;
    };

    setVisible('');
    frame = requestFrame(tick);

    return () => {
      cancelled = true;
      if (frame !== null) cancelFrame(frame);
    };
  }, [fullText, enabled]);

  return {
    visible,
    done: fullText.length > 0 && visible.length >= fullText.length,
  };
}
