import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { useIntakeSubmit, type IntakeSubmitOutcome } from './useIntakeSubmit';

vi.mock('../api/public-api', () => ({
  publicApi: { intake: vi.fn() },
}));

import { publicApi } from '../api/public-api';

const intake = vi.mocked(publicApi.intake);

const OK_RESULT = {
  clueId: 'c1',
  nextStep: '先写五条大纲',
  bucketId: 'learn-ai',
  aiUsedFlag: false,
  poolStatus: 'candidate',
};

describe('useIntakeSubmit', () => {
  beforeEach(() => {
    intake.mockReset();
  });

  it('成功回传结果并复位 loading', async () => {
    intake.mockResolvedValue(OK_RESULT);
    const { result } = renderHook(() => useIntakeSubmit());
    let outcome: IntakeSubmitOutcome | undefined;

    await act(async () => {
      outcome = await result.current.submit('想学 AI 写周报，每天只有半小时');
    });

    expect(outcome).toEqual({ result: OK_RESULT, error: null });
    expect(intake).toHaveBeenCalledWith('想学 AI 写周报，每天只有半小时');
    expect(result.current.loading).toBe(false);
  });

  it('失败回传可读错误而不是抛异常', async () => {
    intake.mockRejectedValue(new ApiError('guest-quota-exceeded', 'quota'));
    const { result } = renderHook(() => useIntakeSubmit());
    let outcome: IntakeSubmitOutcome | undefined;

    await act(async () => {
      outcome = await result.current.submit('足够长度的场景描述文字');
    });

    expect(outcome?.result).toBeNull();
    expect(outcome?.error).toMatch(/游客|配额|用完/);
    expect(result.current.loading).toBe(false);
  });

  it('透传 options 中的 history 与 sessionId', async () => {
    intake.mockResolvedValue({ ...OK_RESULT, sessionId: 'session-xyz' });
    const { result } = renderHook(() => useIntakeSubmit());
    let outcome: IntakeSubmitOutcome | undefined;

    await act(async () => {
      outcome = await result.current.submit('我说过什么', {
        history: [{ role: 'user', text: '前序提问' }],
        sessionId: 'session-prev',
      });
    });

    expect(outcome?.result?.sessionId).toBe('session-xyz');
    expect(intake).toHaveBeenCalledWith('我说过什么', {
      source: 'tools-visitor',
      history: [{ role: 'user', text: '前序提问' }],
      sessionId: 'session-prev',
    });
  });

  it('被 signal 打断时如实返回打断提示并不抛异常', async () => {
    const controller = new AbortController();
    controller.abort();
    intake.mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
    const { result } = renderHook(() => useIntakeSubmit());
    let outcome: IntakeSubmitOutcome | undefined;

    await act(async () => {
      outcome = await result.current.submit('这句被用户打断了', {
        signal: controller.signal,
      });
    });

    expect(outcome?.result).toBeNull();
    expect(outcome?.error).toBe('已打断生成。');
    expect(result.current.loading).toBe(false);
  });
});
