import { describe, expect, it, vi } from 'vitest';
import { AssistantChatProvider, assistantChatProvider } from './assistant-provider';
import { publicApi, type AssistantResult } from './public-api';

describe('AssistantChatProvider (Ant Design X Chat Provider 架构对齐)', () => {
  it('transformLocalMessage 正确转换本地用户消息', () => {
    const provider = new AssistantChatProvider();
    const msg = provider.transformLocalMessage({ body: '  你好小影  ' });
    expect(msg).toEqual({
      role: 'user',
      text: '你好小影',
    });
  });

  it('transformMessage 累加增量并支持 JSON 流式 answer 提取', () => {
    const provider = new AssistantChatProvider();
    const prev = {
      role: 'assistant' as const,
      text: '你好',
      citations: [],
      aiUsedFlag: true,
    };
    // 纯文本累加
    const next = provider.transformMessage(prev, '你好，我是小影');
    expect(next.text).toBe('你好，我是小影');
    expect(next.aiUsedFlag).toBe(true);

    // JSON 格式流式 answer 字段提取
    const jsonStream = '{"answer":"你好，这里是站点助手小影';
    const extracted = provider.transformMessage(prev, jsonStream);
    expect(extracted.text).toBe('你好，这里是站点助手小影');
  });

  it('transformCompletedMessage 正确注入终态结果与引用元数据', () => {
    const provider = new AssistantChatProvider();
    const doneResult: AssistantResult = {
      requestId: 'req-1',
      messageId: 'msg-1',
      attemptId: 'att-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      answer: '这里是终态回答',
      citations: [{ slug: 'post-intro' }, { slug: 'post-guide' }],
      aiUsedFlag: true,
      elapsedMs: 250,
      conversationId: 'conv-1',
      nextStep: {
        bucketLabel: '新手入门',
        nextStep: '阅读导览',
        suggestedSlug: 'post-intro',
      },
      quickReplies: ['推荐下一篇'],
    };

    const finalMsg = provider.transformCompletedMessage(
      undefined,
      doneResult,
      { name: '小影', revision: 3 },
    );

    expect(finalMsg.role).toBe('assistant');
    expect(finalMsg.text).toBe('这里是终态回答');
    expect(finalMsg.citations).toEqual(['post-intro', 'post-guide']);
    expect(finalMsg.member).toEqual({ name: '小影', revision: 3 });
    expect(finalMsg.nextStep?.suggestedSlug).toBe('post-intro');
    expect(finalMsg.quickReplies).toEqual(['推荐下一篇']);
    expect(finalMsg.delivery).toBe('sent');
  });

  it('requestStream 转发至 publicApi.assistantStream', async () => {
    const streamSpy = vi.spyOn(publicApi, 'assistantStream').mockResolvedValue({
      requestId: 'req-2',
      messageId: 'msg-2',
      attemptId: 'att-2',
      runId: 'run-2',
      sessionId: 'sess-2',
      answer: 'mock answer',
      citations: [],
      aiUsedFlag: false,
      elapsedMs: 100,
      conversationId: null,
    });

    const onDelta = vi.fn();
    const result = await assistantChatProvider.requestStream(
      { body: '测试提问', sessionId: 'sess-prev' },
      { onDelta },
    );

    expect(result.answer).toBe('mock answer');
    expect(streamSpy).toHaveBeenCalledWith(expect.objectContaining({
      body: '测试提问',
      sessionId: 'sess-prev',
      source: 'assistant-stream',
    }));
  });
});
