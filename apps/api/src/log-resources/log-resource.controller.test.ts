import { describe, expect, it, vi } from 'vitest';
import { LogResourceController } from './log-resource.controller';

describe('LogResourceController', () => {
  it('enumerates logical resource types without returning stored keys or paths', async () => {
    const resourcesForConversation = vi.fn(async () => [{
      id: 'resource-1', conversationId: 'conversation-1', resourceType: 'native-session',
      resourceKey: 'sdk-session-secret', parentKey: 'revision-1',
      resourceCreatedAt: new Date('2026-01-01T00:00:00.000Z'), registeredAt: new Date('2026-09-25T00:00:00.000Z'),
      expiresAt: '2026-04-01T00:00:00.000Z', expired: true,
    }]);
    const logs = { resourcesForConversation };
    const controller = new LogResourceController(logs as never);

    const result = await controller.conversationResources('conversation-1');
    expect(result.resources).toEqual([expect.objectContaining({ resourceType: 'native-session', expired: true })]);
    expect(JSON.stringify(result)).not.toContain('sdk-session-secret');
    expect(JSON.stringify(result)).not.toContain('path');
  });

  it('accepts only retention values and rejects a client-supplied path', async () => {
    const updateRetentionPolicy = vi.fn(async (value) => value);
    const controller = new LogResourceController({ updatePolicy: updateRetentionPolicy, getPolicy: vi.fn() } as never);
    await expect(controller.updateRetentionPolicy({ detailRetentionDays: 30, aggregateRetentionDays: 180 })).resolves.toEqual({
      detailRetentionDays: 30, aggregateRetentionDays: 180,
    });
    expect(() => controller.updateRetentionPolicy({ detailRetentionDays: 30, aggregateRetentionDays: 180, path: '/tmp/body' }))
      .toThrow(/log-retention-invalid/);
  });
});
