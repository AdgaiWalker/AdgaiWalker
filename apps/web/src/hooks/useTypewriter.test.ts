import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTypewriter } from './useTypewriter';

function stubMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useTypewriter', () => {
  it('空文本不产生任何可见内容', () => {
    stubMotion(false);
    const { result } = renderHook(() => useTypewriter(''));
    expect(result.current.visible).toBe('');
    expect(result.current.done).toBe(false);
  });

  it('减少动态效果时一次性直出（不逐字）', () => {
    stubMotion(true);
    const { result } = renderHook(() => useTypewriter('先写五条大纲再扩正文'));
    expect(result.current.visible).toBe('先写五条大纲再扩正文');
    expect(result.current.done).toBe(true);
  });

  it('enabled=false 时直出，供刷新还原场景使用', () => {
    stubMotion(false);
    const { result } = renderHook(() =>
      useTypewriter('先写五条大纲', { enabled: false }),
    );
    expect(result.current.visible).toBe('先写五条大纲');
    expect(result.current.done).toBe(true);
  });

  it('rAF 推进：先部分可见，最终完整且 done', () => {
    stubMotion(false);
    // 只接管定时器，不 fake rAF/performance，避免覆盖下面的受控时钟
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      clock += 50;
      return setTimeout(() => cb(clock), 16) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      clearTimeout(handle);
    });

    const text = '一二三四五六七八九十';
    const { result } = renderHook(() => useTypewriter(text));

    expect(result.current.visible.length).toBeLessThan(text.length);

    // 只推进一帧（16ms 到期 + 1 层嵌套定时器），避免 0ms 级联把整段一次冲完
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const partial = result.current.visible;
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(text.length);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.visible).toBe(text);
    expect(result.current.done).toBe(true);
  });

  it('真实 rAF 下最终也会走完（冒烟）', async () => {
    stubMotion(false);
    const text = '先写五条大纲';
    const { result } = renderHook(() => useTypewriter(text));

    await waitFor(() => {
      expect(result.current.done).toBe(true);
    });
    expect(result.current.visible).toBe(text);
  });
});
