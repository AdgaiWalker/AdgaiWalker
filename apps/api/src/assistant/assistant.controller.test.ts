import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { PublicAssistantService, type PublicAssistantAskInput, type PublicAssistantAskResult, type PublicAssistantStreamSink } from './public-assistant.service';

const cookie = '9'.repeat(64);
const messageId = 'message-999999999999999999999999';
let app: INestApplication;
let baseUrl: string;
let finishAsk!: (result: PublicAssistantAskResult) => void;
const publicAssistant = {
  askStream: vi.fn((_input: PublicAssistantAskInput, _sink: PublicAssistantStreamSink) => new Promise<PublicAssistantAskResult>((resolve) => { finishAsk = resolve; })),
  markSent: vi.fn(async () => true),
  markUnknown: vi.fn(async () => true),
};

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [AssistantController],
    providers: [
      { provide: AssistantService, useValue: { listRuns: vi.fn(async () => []) } },
      { provide: PublicAssistantService, useValue: publicAssistant },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

it('断开 SSE 只标记交付未知，不向公共执行服务发送取消信号', async () => {
  const abort = new AbortController();
  const response = await fetch(`${baseUrl}/assistant/stream`, {
    method: 'POST',
    headers: { cookie: `walker-anon=${cookie}`, 'content-type': 'application/json' },
    body: JSON.stringify({ body: '请解释这篇文章', requestKey: 'v14-disconnect-key', placementKey: 'post-detail', scopeSlug: 'post-a' }),
    signal: abort.signal,
  });
  expect(response.status).toBe(200);
  const reading = response.text().catch(() => '');
  await vi.waitFor(() => expect(publicAssistant.askStream).toHaveBeenCalledOnce());

  abort.abort();
  await reading;
  finishAsk({
    sessionId: 'sdk-session', answer: '模型已完成', citations: [], aiUsedFlag: true, elapsedMs: 8,
    requestId: 'v14-disconnect-key', messageId, attemptId: 'attempt-999999999999999999999999',
    runId: 'public-run', conversationId: 'conversation-v14',
  });

  await vi.waitFor(() => expect(publicAssistant.markUnknown).toHaveBeenCalledWith(cookie, messageId));
  expect(publicAssistant.askStream.mock.calls[0]?.[0].signal).toBeUndefined();
  expect(publicAssistant.markSent).not.toHaveBeenCalled();
});
