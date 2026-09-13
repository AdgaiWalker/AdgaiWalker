/**
 * ObservabilityController 事件写入 — 协议层校验（先登记再埋点）。
 */
import { describe, expect, it, vi } from 'vitest';
import { ObservabilityController } from './observability.controller';
import type { ObservabilityService } from './observability.service';

function controllerWith(
  spy = vi.fn(async () => ({ recorded: true as const })),
) {
  const service = { recordEvent: spy } as unknown as ObservabilityService;
  return { controller: new ObservabilityController(service), spy };
}

describe('POST /admin/events 校验', () => {
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
