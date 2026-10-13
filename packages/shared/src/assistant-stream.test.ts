import { describe, expect, it } from 'vitest';
import { assistantStreamEventId, parseAssistantStreamEvent } from './assistant-stream';

describe('助手 SSE v2 合同', () => {
  it('用 messageId 与序号组成稳定 eventId，并校验增量帧', () => {
    const event = {
      version: 2,
      type: 'delta',
      eventId: assistantStreamEventId('message-1', 2),
      requestId: 'request-1',
      messageId: 'message-1',
      attemptId: 'attempt-1',
      runId: 'run-1',
      sequence: 2,
      delta: '回答片段',
    };
    expect(parseAssistantStreamEvent(event)).toEqual(event);
    expect(parseAssistantStreamEvent({ ...event, sequence: 3 })).toBeNull();
  });

  it('拒绝缺少稳定身份、空 delta 与无效终值', () => {
    const event = {
      version: 2,
      type: 'delta',
      eventId: 'message-1:1',
      requestId: 'request-1',
      messageId: 'message-1',
      attemptId: 'attempt-1',
      runId: null,
      sequence: 1,
      delta: '',
    };
    expect(parseAssistantStreamEvent({ ...event, delta: 'x', requestId: undefined })).toBeNull();
    expect(parseAssistantStreamEvent(event)).toBeNull();
    expect(parseAssistantStreamEvent({ ...event, type: 'done', delta: undefined, result: {} })).toBeNull();
    const done = {
      version: 2,
      type: 'done',
      eventId: 'message-1:2',
      requestId: 'request-1',
      messageId: 'message-1',
      attemptId: 'attempt-1',
      runId: null,
      sequence: 2,
      result: {
        sessionId: 'rule-session', answer: '规则回答。', citations: [], aiUsedFlag: false,
        elapsedMs: 0, requestId: 'request-1', messageId: 'message-1', attemptId: 'attempt-1', runId: null, conversationId: null,
      },
    };
    expect(parseAssistantStreamEvent(done)).not.toBeNull();
    expect(parseAssistantStreamEvent({ ...done, result: { ...done.result, attemptId: 'other' } })).toBeNull();
  });
});
