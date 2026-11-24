import { describe, expect, it, vi } from 'vitest';
import {
  completedStreamFrames,
  createAnswerDelivery,
  emitAcceptedFrame,
  type PublicAssistantAskResult,
  type PublicAssistantGate,
  type PublicAssistantStreamSink,
} from './public-assistant-stream';

function sampleGate(): PublicAssistantGate {
  return {
    actorType: 'guest',
    anonHash: 'anon-hash',
    requestKey: 'req-key',
    requestId: 'req-1',
    messageId: 'message-0123456789abcdef01234567',
    attemptId: 'attempt-1',
    redactedText: '问题',
    duplicate: null,
  };
}

function sampleResult(answer = '完整回答'): PublicAssistantAskResult {
  return {
    sessionId: 'sess-1',
    answer,
    citations: [{ slug: 'post-1' }],
    aiUsedFlag: true,
    elapsedMs: 120,
    requestId: 'req-1',
    messageId: 'message-0123456789abcdef01234567',
    attemptId: 'attempt-1',
    runId: 'run-1',
    conversationId: 'conv-1',
  };
}

describe('public-assistant-stream', () => {
  it('completedStreamFrames 按序生成 accepted -> delta -> done 且 eventId 连续', () => {
    const frames = completedStreamFrames(sampleResult('hello'), 'run-accepted');
    expect(frames.accepted.sequence).toBe(0);
    expect(frames.accepted.runId).toBe('run-accepted');
    expect(frames.delta.sequence).toBe(1);
    expect(frames.delta.delta).toBe('hello');
    expect(frames.done.sequence).toBe(2);
    expect(frames.done.result.answer).toBe('hello');
    expect(new Set([frames.accepted.eventId, frames.delta.eventId, frames.done.eventId]).size).toBe(3);
  });

  it('createAnswerDelivery 递增序号并增量落库 partial 正文，写入异常时不崩溃', async () => {
    const accepted = vi.fn();
    const delta = vi.fn();
    const done = vi.fn();
    const error = vi.fn();
    const setAssistantMessage = vi.fn().mockRejectedValue(new Error('db busy'));
    const sink: PublicAssistantStreamSink = { accepted, delta, done, error };
    const gate = sampleGate();

    emitAcceptedFrame(gate, sink);
    const delivery = createAnswerDelivery(
      { conversations: { setAssistantMessage } },
      gate,
      sink,
      { id: 'conv-1', turnId: 'turn-1', attemptId: 'attempt-1' },
    );
    delivery.state.runId = 'run-9';
    delivery.emitDelta('第一段');
    delivery.emitDelta('');
    delivery.emitDelta('第二段');
    delivery.emitDone(sampleResult('第一段第二段'));
    await delivery.waitWrites();

    expect(accepted).toHaveBeenCalledTimes(1);
    expect(delta.mock.calls.map(([frame]) => [frame.sequence, frame.delta, frame.runId])).toEqual([
      [1, '第一段', 'run-9'],
      [2, '第二段', 'run-9'],
    ]);
    expect(done.mock.calls[0]?.[0].sequence).toBe(3);
    expect(setAssistantMessage).toHaveBeenCalledTimes(2);
    expect(setAssistantMessage).toHaveBeenLastCalledWith({
      id: gate.messageId,
      body: '第一段第二段',
      delivery: 'partial',
      attemptId: 'attempt-1',
    });
  });

  it('emitError 吞掉断连写入异常并正确映射停止原因', () => {
    const sink: PublicAssistantStreamSink = {
      accepted: vi.fn(),
      delta: vi.fn(),
      done: vi.fn(),
      error: vi.fn(() => { throw new Error('socket closed'); }),
    };
    const delivery = createAnswerDelivery(
      { conversations: { setAssistantMessage: vi.fn() } },
      sampleGate(),
      sink,
      null,
    );
    expect(() => delivery.emitError('user-stopped')).not.toThrow();
    expect(sink.error).toHaveBeenCalledWith(expect.objectContaining({
      code: 'user-stopped',
      message: '回答已停止。',
      sequence: 1,
    }));
  });
});
