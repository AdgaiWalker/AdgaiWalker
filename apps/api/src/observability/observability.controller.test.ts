/**
 * ObservabilityController 事件写入 — 协议层校验（先登记再埋点）。
 */
import { describe, expect, it, vi } from 'vitest';
import { ObservabilityController } from './observability.controller';
import type { ObservabilityService } from './observability.service';
import type { AssistantEventRecorderPort } from '../ports/assistant-event-recorder.port';

function controllerWith(
  spy = vi.fn(async () => ({ recorded: true as const })),
) {
  const service = { recordEvent: spy } as unknown as ObservabilityService;
  const eventRecorder = {
    record: vi.fn(async () => ({ recorded: true, duplicate: false, queued: false })),
    replayOnce: vi.fn(async () => ({ replayed: 0, pending: 0 })),
    health: vi.fn(async () => ({ status: 'healthy' as const, queuedCount: 0, queuedBytes: 0, oldestQueuedAt: null, droppedCount: 0 })),
  } as unknown as AssistantEventRecorderPort;
  return { controller: new ObservabilityController(service, eventRecorder), spy, eventRecorder };
}

describe('POST /admin/events 校验', () => {
  it('返回助手事件采集缺口与 spool 健康状态', async () => {
    const { controller, eventRecorder } = controllerWith();
    vi.mocked(eventRecorder.health).mockResolvedValue({
      status: 'loss-unknown', queuedCount: 2, queuedBytes: 512, oldestQueuedAt: '2026-09-25T00:00:00.000Z', droppedCount: null,
    });
    await expect(controller.assistantEventHealth()).resolves.toMatchObject({
      status: 'loss-unknown', queuedCount: 2, droppedCount: null,
    });
  });

  it('合法体透传，actorType 缺省为 owner', async () => {
    const { controller, spy } = controllerWith();

    await controller.recordEvent({
      featureKey: 'agent.mcp',
      event: 'attempt',
      props: { tool: 'list_citable' },
    });

    expect(spy).toHaveBeenCalledWith({
      featureKey: 'agent.mcp',
      event: 'attempt',
      actorType: 'owner',
      failCode: null,
      props: { tool: 'list_citable' },
    });
  });

  it('未登记的 featureKey 被拒（字典门禁）', () => {
    const { controller } = controllerWith();
    expect(() =>
      controller.recordEvent({ featureKey: 'nope.key', event: 'attempt' }),
    ).toThrow(/unknown-feature-key/);
  });

  it('非法事件类型 / 角色 / 超大 props 被拒', () => {
    const { controller } = controllerWith();

    expect(() =>
      controller.recordEvent({ featureKey: 'agent.mcp', event: 'boom' }),
    ).toThrow(/invalid-event-kind/);

    expect(() =>
      controller.recordEvent({
        featureKey: 'agent.mcp',
        event: 'attempt',
        actorType: 'robot',
      }),
    ).toThrow(/invalid-actor-type/);

    expect(() =>
      controller.recordEvent({
        featureKey: 'agent.mcp',
        event: 'attempt',
        props: { blob: 'x'.repeat(3_000) },
      }),
    ).toThrow(/props-too-large/);
  });
});
