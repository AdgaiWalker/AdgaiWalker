import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '../api/http';
import { useIntake } from './useIntake';

vi.mock('../api/public-api', () => ({
  publicApi: {
    intake: vi.fn(),
  },
}));

import { publicApi } from '../api/public-api';

const intake = vi.mocked(publicApi.intake);

describe('useIntake', () => {
  beforeEach(() => {
    intake.mockReset();
  });

  it('body 不足时 bodyOk 为 false', () => {
    const { result } = renderHook(() => useIntake());
    act(() => {
      result.current.onBodyChange('短');
    });
    expect(result.current.bodyOk).toBe(false);
  });

  it('submit 成功写入 result', async () => {
    intake.mockResolvedValue({
      clueId: 'c1',
      nextStep: '先写五条大纲',
      bucketId: 'learn-ai',
      aiUsedFlag: false,
      poolStatus: 'candidate',
    });
    const { result } = renderHook(() => useIntake());
    act(() => {
      result.current.onBodyChange('想学 AI 写周报每天半小时');
    });
    expect(result.current.bodyOk).toBe(true);
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() =>
      expect(result.current.result?.nextStep).toBe('先写五条大纲'),
    );
    expect(result.current.error).toBeNull();
  });

  it('submit 失败写入 error 人话', async () => {
    intake.mockRejectedValue(
      new ApiError('guest-quota-exceeded', 'quota'),
    );
    const { result } = renderHook(() => useIntake());
    act(() => {
      result.current.onBodyChange('足够长度的场景描述文字');
    });
    await act(async () => {
      result.current.onSubmit();
    });
    await waitFor(() =>
      expect(result.current.error).toMatch(/游客|配额|用完/),
    );
    expect(result.current.result).toBeNull();
  });
});
