import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicApi } from '../api/public-api';
import { shouldRecordSearchMiss, useContentSearch } from './useContentSearch';

vi.mock('../api/public-api', () => ({
  publicApi: {
    searchMiss: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('../shared/search-backend', () => ({
  resolveSearchBackend: vi.fn().mockResolvedValue({
    search: vi.fn().mockResolvedValue([]),
  }),
}));

describe('useContentSearch IME 组词防御', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('过滤单字与拼音引号残片，避免污染 SearchMiss', () => {
    expect(shouldRecordSearchMiss('a')).toBe(false);
    expect(shouldRecordSearchMiss("ni'hao")).toBe(false);
    expect(shouldRecordSearchMiss('nihao')).toBe(true);
    expect(shouldRecordSearchMiss('你好')).toBe(true);
  });

  it('IME 组词期间不触发检索也不上报漏搜，提交中文后才正常检索', async () => {
    const { result, rerender } = renderHook(
      ({ open, composing }) => useContentSearch(open, composing),
      { initialProps: { open: true, composing: true } },
    );

    act(() => {
      result.current.onQueryChange("ni'hao");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(publicApi.searchMiss).not.toHaveBeenCalled();

    rerender({ open: true, composing: false });
    act(() => {
      result.current.onQueryChange('一个绝对搜不到的奇特词xyz');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(publicApi.searchMiss).toHaveBeenCalledWith('一个绝对搜不到的奇特词xyz');
  });
});
