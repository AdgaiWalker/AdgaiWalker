import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../api/http';
import { useLike } from './useLike';

vi.mock('../api/public-api', () => ({
  publicApi: {
    getLikeCount: vi.fn(),
    like: vi.fn(),
  },
}));

import { publicApi } from '../api/public-api';

const getLikeCount = vi.mocked(publicApi.getLikeCount);
const like = vi.mocked(publicApi.like);

describe('useLike', () => {
  beforeEach(() => {
    getLikeCount.mockReset();
    like.mockReset();
  });

  it('加载成功后暴露 count', async () => {
    getLikeCount.mockResolvedValue({ path: '/posts/a', count: 7 });
    const { result } = renderHook(() => useLike('/posts/a'));
    await waitFor(() => expect(result.current.count).toBe(7));
    expect(result.current.error).toBeNull();
  });

  it('加载失败时静默：count 保持 null、不刷 error', async () => {
    getLikeCount.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useLike('/posts/a'));
    await waitFor(() => expect(getLikeCount).toHaveBeenCalled());
    expect(result.current.count).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('onLike 成功更新 count', async () => {
    getLikeCount.mockResolvedValue({ path: '/posts/a', count: 1 });
    like.mockResolvedValue({ path: '/posts/a', count: 2 });
    const { result } = renderHook(() => useLike('/posts/a'));
    await waitFor(() => expect(result.current.count).toBe(1));
    await act(async () => {
      result.current.onLike();
    });
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it('onLike 失败写入人话 error', async () => {
    getLikeCount.mockResolvedValue({ path: '/posts/a', count: 0 });
    like.mockRejectedValue(new ApiError('rate-limited', 'too fast'));
    const { result } = renderHook(() => useLike('/posts/a'));
    await waitFor(() => expect(result.current.count).toBe(0));
    await act(async () => {
      result.current.onLike();
    });
    await waitFor(() =>
      expect(result.current.error).toMatch(/频繁|限流|稍后再试/),
    );
  });
});
