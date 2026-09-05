/**
 * useAssistant 单测 — 提交/错误/多轮 sessionId 透传（mock publicApi）
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { extractAnswerText, useAssistant } from './useAssistant';
import { publicApi } from '../api/public-api';

vi.mock('../api/public-api', () => ({
  publicApi: {
    assistantStream: vi.fn(),
  },
}));

const mocked = vi.mocked(publicApi.assistantStream);

/** 模拟 SSE 流：两段增量 + done 终值 */
function streamOnce(sessionId: string, answer: string, deltas: string[]) {
  mocked.mockImplementationOnce(async (_q, _sid, onText) => {
    for (const d of deltas) onText(d);
    return {
      sessionId,
      answer,
      citations: [{ slug: 'cc-intro' }],
      aiUsedFlag: true,
      elapsedMs: 100,
    };
  });
}

describe('useAssistant', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('流式提交：增量拼接出完整回答，透传 sessionId 并记住新会话', async () => {
    streamOnce('s-1', 'duola 是艺术生。', ['duola ', '是艺术生。']);
    const { result } = renderHook(() => useAssistant());
    await act(async () => {
      await result.current.send('duola 是谁');
    });
    expect(mocked).toHaveBeenCalledWith('duola 是谁', null, expect.any(Function), expect.any(AbortSignal));
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
    streamOnce('s-1', '第二答。', ['第二答。']);
    await act(async () => {
      await result.current.send('追问一下细节');
    });
    expect(mocked).toHaveBeenLastCalledWith(
      '追问一下细节',
      's-1',
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it('失败：记录错误，不留空气泡', async () => {
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

    streamOnce('s-2', '回答。', ['回答。']);
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

describe('extractAnswerText（流式 JSON 增量提取）', () => {
  it('从部分 JSON 缓冲中提取已闭合的 answer 文本', () => {
    expect(extractAnswerText('{"ans')).toBe('');
    expect(extractAnswerText('{\"answer\":\"你好')).toBe('你好');
    expect(extractAnswerText('{\"answer\":\"你好呀，欢迎')).toBe('你好呀，欢迎');
    expect(extractAnswerText('{\"answer\":\"两行\\n文本\",\"citations\":[]')).toBe('两行\n文本');
  });
});
