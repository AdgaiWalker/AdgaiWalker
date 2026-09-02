/**
 * useAssistant 单测 — 提交/错误/多轮 sessionId 透传（mock publicApi）
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAssistant } from './useAssistant';
import { publicApi } from '../api/public-api';

vi.mock('../api/public-api', () => ({
  publicApi: {
    assistant: vi.fn(),
  },
}));

const mocked = vi.mocked(publicApi.assistant);

describe('useAssistant', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('提交：追加 user/assistant 两条消息，透传 sessionId 并记住新会话', async () => {
    mocked.mockResolvedValueOnce({
      sessionId: 's-1',
      answer: 'duola 是艺术生。',
      citations: [{ slug: 'cc-intro' }],
      aiUsedFlag: true,
      elapsedMs: 100,
    });
    const { result } = renderHook(() => useAssistant());
    await act(async () => {
      await result.current.send('duola 是谁');
    });
    expect(mocked).toHaveBeenCalledWith('duola 是谁', null);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual({
      role: 'user',
      text: 'duola 是谁',
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      aiUsedFlag: true,
      citations: ['cc-intro'],
    });

    // 第二轮带上一轮 sessionId
    mocked.mockResolvedValueOnce({
      sessionId: 's-1',
      answer: '第二答。',
      citations: [],
      aiUsedFlag: true,
      elapsedMs: 50,
    });
    await act(async () => {
      await result.current.send('追问一下细节');
    });
    expect(mocked).toHaveBeenLastCalledWith('追问一下细节', 's-1');
  });

  it('失败：记录错误，不加 assistant 消息', async () => {
    mocked.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useAssistant());
    await act(async () => {
      await result.current.send('会失败的问题');
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.error).toBeTruthy();
  });

  it('过短问题不发请求；reset 清空会话', async () => {
    const { result } = renderHook(() => useAssistant());
    await act(async () => {
      await result.current.send('短');
    });
    expect(mocked).not.toHaveBeenCalled();

    mocked.mockResolvedValueOnce({
      sessionId: 's-2',
      answer: '回答。',
      citations: [],
      aiUsedFlag: false,
      elapsedMs: 0,
    });
    await act(async () => {
      await result.current.send('正常长度的问题');
    });
    expect(result.current.messages).toHaveLength(2);
    act(() => {
      result.current.reset();
    });
    expect(result.current.messages).toHaveLength(0);
  });
});
