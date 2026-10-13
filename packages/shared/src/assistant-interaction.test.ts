import { describe, expect, it } from 'vitest';
import { parseAssistantInteraction } from './assistant-interaction.js';

describe('assistant interaction event contract', () => {
  it('accepts only versioned panel events and validated identifiers', () => {
    expect(parseAssistantInteraction({
      schemaVersion: 1,
      eventId: 'event-key-0001',
      event: 'member-switch',
      placementKey: 'post-detail',
      scopeSlug: 'post-a',
      memberKey: 'public-member-2',
      occurredAt: '2026-09-25T00:00:00.000Z',
    })).toEqual({
      schemaVersion: 1,
      eventId: 'event-key-0001',
      event: 'member-switch',
      placementKey: 'post-detail',
      scopeSlug: 'post-a',
      memberKey: 'public-member-2',
      occurredAt: '2026-09-25T00:00:00.000Z',
    });
  });

  it('rejects unknown keys, arbitrary URLs, malformed IDs and missing event-specific fields', () => {
    const base = {
      schemaVersion: 1, eventId: 'event-key-0001', event: 'expose',
      placementKey: 'post-detail', scopeSlug: 'post-a',
    };
    expect(parseAssistantInteraction({ ...base, url: 'https://attacker.example' })).toBeNull();
    expect(parseAssistantInteraction({ ...base, props: { targetUrl: 'https://attacker.example' } })).toBeNull();
    expect(parseAssistantInteraction({ ...base, eventId: '!invalid!' })).toBeNull();
    expect(parseAssistantInteraction({ ...base, occurredAt: 'x'.repeat(1000) })).toBeNull();
    expect(parseAssistantInteraction({ ...base, event: 'citation-click' })).toBeNull();
    expect(parseAssistantInteraction({ ...base, event: 'feedback', messageId: 'message-1234567890abcdef12345678' })).toBeNull();
  });
});
