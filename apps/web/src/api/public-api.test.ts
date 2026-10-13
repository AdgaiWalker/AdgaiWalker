import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantStreamEventId, type AssistantStreamEvent } from '@walker/shared';
import { publicApi } from './public-api';

afterEach(() => vi.unstubAllGlobals());

describe('publicApi.assistantStream SSE v2', () => {
  it('只向公开事件路由发送部件白名单事件', async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ recorded: true, duplicate: false }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    const event = {
      schemaVersion: 1 as const,
      eventId: 'event-public-send-0001',
      event: 'send' as const,
      placementKey: 'post-detail',
      scopeSlug: 'post-a',
      messageId: 'message-1234567890abcdef12345678',
      occurredAt: '2026-09-25T00:00:00.000Z',
    };

    await expect(publicApi.assistantInteraction(event)).resolves.toEqual({ recorded: true, duplicate: false });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/assistant/events');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual(event);
  });

  it('停止只提交消息 ID、文章位置，不接受客户端运行 ID', async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(JSON.stringify({ state: 'CANCELLED', confirmed: true }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(publicApi.stopAssistant('post-detail', 'post-a', 'message-1234567890abcdef12345678'))
      .resolves.toEqual({ state: 'CANCELLED', confirmed: true });

    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/assistant/conversations/post-detail/post-a/stop');
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ messageId: 'message-1234567890abcdef12345678' });
  });

  it('消费稳定 delta 帧，并以校验后的 done.result 覆盖片段', async () => {
    const ids = { requestId: 'request-1', messageId: 'message-1', attemptId: 'attempt-1', runId: 'run-1' };
    const result = {
      sessionId: 'sdk-session-1', answer: '最终答案。', citations: [{ slug: 'post-a' }],
      aiUsedFlag: true, elapsedMs: 42, conversationId: null, ...ids,
    };
    const events: AssistantStreamEvent[] = [
      { version: 2, type: 'accepted', eventId: assistantStreamEventId(ids.messageId, 0), ...ids, sequence: 0 },
      { version: 2, type: 'delta', eventId: assistantStreamEventId(ids.messageId, 1), ...ids, sequence: 1, delta: '最终' },
      { version: 2, type: 'done', eventId: assistantStreamEventId(ids.messageId, 2), ...ids, sequence: 2, result },
    ];
    const body = events.map((event) => `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));
    const deltas: string[] = [];

    const done = await publicApi.assistantStream({ body: '问题', sessionId: null, onText: (delta) => deltas.push(delta) });

    expect(deltas).toEqual(['最终']);
    expect(done).toEqual(result);
  });

  it('拒绝无效 v2 帧，不把未经校验的 JSON 当成回答', async () => {
    const invalid = JSON.stringify({ version: 2, type: 'delta', delta: 'raw json' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`event: delta\ndata: ${invalid}\n\n`, { status: 200 })));
    const onText = vi.fn();

    await expect(publicApi.assistantStream({ body: '问题', sessionId: null, onText })).rejects.toThrow('assistant-stream-invalid-frame');
    expect(onText).not.toHaveBeenCalled();
  });

  it('收到带 Conversation 的 done 后提交幂等 ACK', async () => {
    const ids = { requestId: 'request-ack', messageId: 'message-ack', attemptId: 'attempt-ack', runId: 'run-ack' };
    const result = {
      sessionId: 'sdk-session-ack', answer: '完整回答。', citations: [], aiUsedFlag: true,
      elapsedMs: 12, conversationId: 'conversation-ack', ...ids,
    };
    const events: AssistantStreamEvent[] = [
      { version: 2, type: 'accepted', eventId: assistantStreamEventId(ids.messageId, 0), ...ids, sequence: 0 },
      { version: 2, type: 'delta', eventId: assistantStreamEventId(ids.messageId, 1), ...ids, sequence: 1, delta: '完整回答。' },
      { version: 2, type: 'done', eventId: assistantStreamEventId(ids.messageId, 2), ...ids, sequence: 2, result },
    ];
    const source = events.map((event) => `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
    const responses = [
      new Response(source, { status: 200 }),
      new Response(JSON.stringify({ acknowledged: true, duplicate: false }), { status: 201 }),
    ];
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => responses.shift()!);
    vi.stubGlobal('fetch', fetcher);

    const done = await publicApi.assistantStream({ body: '问题', sessionId: null, onText: () => {} });

    expect(done.conversationId).toBe('conversation-ack');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('/assistant/messages/message-ack/ack');
  });

  it('服务端完成写入稍晚时，ACK 遇 409 后重试', async () => {
    const ids = { requestId: 'request-late', messageId: 'message-late', attemptId: 'attempt-late', runId: 'run-late' };
    const result = { sessionId: 'sdk-late', answer: '回答。', citations: [], aiUsedFlag: true, elapsedMs: 1, conversationId: 'conversation-late', ...ids };
    const source = `event: done\ndata: ${JSON.stringify({ version: 2, type: 'done', eventId: assistantStreamEventId(ids.messageId, 1), ...ids, sequence: 1, result })}\n\n`;
    const responses = [
      new Response(source, { status: 200 }),
      new Response(JSON.stringify({ code: 'assistant-message-not-sent' }), { status: 409 }),
      new Response(JSON.stringify({ acknowledged: true, duplicate: false }), { status: 201 }),
    ];
    const fetcher = vi.fn(async () => responses.shift()!);
    vi.stubGlobal('fetch', fetcher);
    await publicApi.assistantStream({ body: '问题', sessionId: null, onText: () => {} });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
