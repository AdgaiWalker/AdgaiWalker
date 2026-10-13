/**
 * useAssistant 单测 — 提交/错误/多轮 sessionId 透传（mock publicApi）
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { extractStreamedAnswer } from '@walker/shared';
import { useAssistant } from './useAssistant';
import { publicApi } from '../api/public-api';

vi.mock('../api/public-api', () => ({
  publicApi: {
    assistantStream: vi.fn(),
    stopAssistant: vi.fn(),
    assistantInteraction: vi.fn(async () => ({ recorded: true, duplicate: false })),
  },
}));

const mocked = vi.mocked(publicApi.assistantStream);
const mockedStop = vi.mocked(publicApi.stopAssistant);
const mockedInteraction = vi.mocked(publicApi.assistantInteraction);

/** 模拟 SSE 流：两段增量 + done 终值 */
function streamOnce(sessionId: string, answer: string, deltas: string[]) {
  mocked.mockImplementationOnce(async ({ onText }) => {
    for (const d of deltas) onText(d);
    return {
      sessionId,
      answer,
      citations: [{ slug: 'cc-intro' }],
      aiUsedFlag: true,
      elapsedMs: 100,
      requestId: 'request-1',
      messageId: 'message-1',
      attemptId: 'attempt-1',
      runId: null,
      conversationId: null,
    };
  });
}

describe('useAssistant', () => {
  beforeEach(() => {
    mocked.mockReset();
    mockedStop.mockReset();
    mockedInteraction.mockReset().mockResolvedValue({ recorded: true, duplicate: false });
  });

  it('流式提交：增量拼接出完整回答，透传 sessionId 并记住新会话', async () => {
    streamOnce('s-1', 'duola 是艺术生。', ['duola ', '是艺术生。']);
    const { result } = renderHook(() => useAssistant());
    await act(async () => {
      await result.current.send('duola 是谁');
    });
    expect(mocked).toHaveBeenCalledWith(expect.objectContaining({
      body: 'duola 是谁', sessionId: null, onText: expect.any(Function),
      signal: expect.any(AbortSignal), source: 'assistant-stream',
      context: expect.objectContaining({ conversationId: null, requestKey: expect.any(String) }),
      onAccepted: expect.any(Function),
    }));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual({
      role: 'user',
      text: 'duola 是谁',
    });
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      text: 'duola 是艺术生。',
      aiUsedFlag: true,
      citations: ['cc-intro'],
    });

    // 第二轮带上一轮 sessionId
    streamOnce('s-1', '第二答。', ['第二答。']);
    await act(async () => {
      await result.current.send('追问一下细节');
    });
    expect(mocked).toHaveBeenLastCalledWith(expect.objectContaining({
      body: '追问一下细节', sessionId: 's-1', onText: expect.any(Function),
      signal: expect.any(AbortSignal), source: 'assistant-stream',
      context: expect.objectContaining({ conversationId: null, requestKey: expect.any(String) }),
      onAccepted: expect.any(Function),
    }));
  });

  it('网关已裁剪的纯文本增量直接上屏，不等 JSON 外壳', async () => {
    let onText: ((delta: string) => void) | undefined;
    let finish: ((value: {
      sessionId: string;
      answer: string;
      citations: { slug: string }[];
      aiUsedFlag: boolean;
      elapsedMs: number;
      requestId: string;
      messageId: string;
      attemptId: string;
      runId: string | null;
      conversationId: string | null;
    }) => void) | undefined;
    mocked.mockImplementationOnce(({ onText: cb }) => {
      onText = cb;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { result } = renderHook(() => useAssistant());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.send('Dora 是谁');
    });
    await act(async () => {
      onText?.('Dora 是');
    });
    expect(result.current.streaming).toBe(true);
    expect(result.current.messages[1]).toMatchObject({
      role: 'assistant',
      text: 'Dora 是',
    });
    await act(async () => {
      onText?.('站主。');
      finish?.({
        sessionId: 's-dora',
        answer: 'Dora 是站主。',
        citations: [],
        aiUsedFlag: true,
        elapsedMs: 20,
        requestId: 'request-dora',
        messageId: 'message-dora',
        attemptId: 'attempt-dora',
        runId: 'run-dora',
        conversationId: null,
      });
      await pending;
    });
    expect(result.current.messages[1]).toMatchObject({ text: 'Dora 是站主。' });
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

  it('只在停止接口确认后标记已停止，并在确认前轮询 pending 状态', async () => {
    mockedStop
      .mockResolvedValueOnce({ state: 'PENDING', confirmed: false })
      .mockResolvedValueOnce({ state: 'CANCELLED', confirmed: true });
    const messageId = 'message-v14-0000000000000000';
    mocked.mockImplementationOnce(async ({ onText, signal, onAccepted }) => {
      onAccepted?.({
        version: 2, type: 'accepted', eventId: `${messageId}:0`, requestId: 'request-v14',
        messageId, attemptId: 'attempt-v14', runId: null, sequence: 0,
      });
      onText('已生成一部分');
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('stream-aborted')), { once: true });
      });
    });
    const { result } = renderHook(() => useAssistant({ placementKey: 'post-detail', scopeSlug: 'post-a' }));
    let sending!: Promise<void>;
    act(() => { sending = result.current.send('请解释一下'); });
    await waitFor(() => expect(result.current.activeMessageId).toBe(messageId));

    await act(async () => { await result.current.stop(); });
    await act(async () => { await sending; });

    expect(mockedStop).toHaveBeenCalledTimes(2);
    expect(mockedStop).toHaveBeenNthCalledWith(1, 'post-detail', 'post-a', messageId);
    expect(result.current.messages[1]).toMatchObject({ text: '已生成一部分', stopped: true });
    expect(result.current.error).toBeNull();
  });

  it('只在服务端接受消息后记录 send/follow-up 面板事件', async () => {
    const makeAcceptedTurn = (messageId: string, answer: string) => {
      mocked.mockImplementationOnce(async ({ onText, onAccepted }) => {
        const requestId = `request-${messageId}`;
        onAccepted?.({
          version: 2, type: 'accepted', eventId: `${messageId}:0`, requestId,
          messageId, attemptId: `attempt-${messageId}`, runId: 'run-public', sequence: 0,
        });
        onText(answer);
        return {
          sessionId: 'sdk-session', answer, citations: [], aiUsedFlag: true, elapsedMs: 10,
          requestId, messageId, attemptId: `attempt-${messageId}`, runId: 'run-public', conversationId: 'conversation-public',
        };
      });
    };
    makeAcceptedTurn('message-555555555555555555555555', '第一答。');
    makeAcceptedTurn('message-666666666666666666666666', '追问答。');
    const { result } = renderHook(() => useAssistant({
      placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-a', deploymentGeneration: 4,
    }));

    await act(async () => { await result.current.send('第一个问题'); });
    await act(async () => { await result.current.send('继续追问'); });

    expect(mockedInteraction.mock.calls.map(([event]) => event.event)).toEqual(['send', 'follow-up']);
    expect(mockedInteraction.mock.calls[0]?.[0]).toMatchObject({
      schemaVersion: 1, placementKey: 'post-detail', scopeSlug: 'post-a', memberKey: 'public-member-a',
      messageId: 'message-555555555555555555555555',
    });
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

describe('extractStreamedAnswer（流式 JSON 增量提取，shared 合同）', () => {
  it('从部分 JSON 缓冲中提取已闭合的 answer 文本', () => {
    expect(extractStreamedAnswer('{"ans')).toBe('');
    expect(extractStreamedAnswer('{\"answer\":\"你好')).toBe('你好');
    expect(extractStreamedAnswer('{\"answer\":\"你好呀，欢迎')).toBe('你好呀，欢迎');
    expect(extractStreamedAnswer('{\"answer\":\"两行\\n文本\",\"citations\":[]')).toBe('两行\n文本');
  });

  it('容忍冒号与引号间的空白变体；citations 尾巴不外发', () => {
    expect(extractStreamedAnswer('{ "answer" : "白名单变体" , "citations": ["x"] }')).toBe('白名单变体');
    expect(extractStreamedAnswer('{"answer":"收尾","citations":["a","b"]}')).toBe('收尾');
  });
});
