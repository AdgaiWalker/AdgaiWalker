import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * registerLifecycle 在模块加载时立即调用 document.addEventListener，
 * 必须在 import 前用 hoisted mock 装好一个最小 document，并捕获两个事件回调。
 */
const listeners = vi.hoisted(() => new Map<string, EventListener>());

vi.stubGlobal('document', {
  addEventListener: vi.fn((type: string, handler: EventListener) => {
    listeners.set(type, handler);
  }),
  removeEventListener: vi.fn(),
});

import { registerLifecycle } from './with-lifecycle';

function emit(type: string) {
  listeners.get(type)?.(new Event(type));
}

describe('registerLifecycle', () => {
  beforeEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it('runs cleanup at most once per lifecycle phase', () => {
    const cleanup = vi.fn();
    // init 返回同一个 cleanup 引用；用来检测它是否被重复触发。
    registerLifecycle(() => cleanup);

    // 序列：page-load（首次，无 cleanup 可跑）→ before-swap → page-load（旧 cleanup 应只跑一次）→ before-swap
    emit('astro:page-load');
    expect(cleanup).not.toHaveBeenCalled();

    emit('astro:before-swap');
    expect(cleanup).toHaveBeenCalledTimes(1);

    emit('astro:page-load');
    // 修复前：这里会再次触发同一个 cleanup，导致重复。修复后：cleanup 已置空，不再触发。
    expect(cleanup).toHaveBeenCalledTimes(1);

    emit('astro:before-swap');
    // 第二次 page-load 重新装回了 cleanup，所以这个 before-swap 应触发一次。
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('tolerates init returning void', () => {
    registerLifecycle(() => undefined);
    // 多次触发不应抛错（cleanup 为 undefined 时 runCleanup 必须安全跳过）。
    expect(() => {
      emit('astro:page-load');
      emit('astro:page-load');
      emit('astro:before-swap');
      emit('astro:page-load');
    }).not.toThrow();
  });
});
