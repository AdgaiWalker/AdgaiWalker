import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FsAssistantEventSpool } from './fs-assistant-event-spool';

const roots: string[] = [];

async function createSpool(options: { maxBytes?: number; ttlMs?: number; now?: () => Date } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'walker-assistant-spool-'));
  roots.push(root);
  return new FsAssistantEventSpool(pathToFileURL(path.join(root, 'walker.test.db')).href, options);
}

const event = {
  id: 'spool-event-1',
  eventId: 'v16-event-0001',
  featureKey: 'assistant.interaction',
  event: 'open',
  actorType: 'visitor',
  conversationId: null,
  props: { placementKey: 'post-detail', scopeSlug: 'post-a' },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('FsAssistantEventSpool', () => {
  it('persists a bounded record once, returns it for replay, and removes it idempotently', async () => {
    const spool = await createSpool();
    expect(await spool.enqueue(event)).toBe('queued');
    expect(await spool.enqueue({ ...event, id: 'spool-event-duplicate' })).toBe('duplicate');
    expect(await spool.readBatch(10)).toMatchObject([{ event: { eventId: event.eventId } }]);
    expect(await spool.health()).toMatchObject({ status: 'backlog', queuedCount: 1, droppedCount: 0 });

    await spool.remove([event.eventId]);
    await spool.remove([event.eventId]);
    expect(await spool.health()).toMatchObject({ status: 'healthy', queuedCount: 0, droppedCount: 0 });
  });

  it('marks exact loss as unknown on byte-limit overflow and removes expired records', async () => {
    let nowMs = Date.parse('2026-09-25T00:00:00.000Z');
    const spool = await createSpool({ maxBytes: 100, ttlMs: 1_000, now: () => new Date(nowMs) });
    expect(await spool.enqueue({ ...event, eventId: 'v16-overflow-0001' })).toBe('dropped');
    expect(await spool.health()).toMatchObject({ status: 'loss-unknown', queuedCount: 0, droppedCount: null });

    const larger = await createSpool({ maxBytes: 10_000, ttlMs: 1_000, now: () => new Date(nowMs) });
    expect(await larger.enqueue(event)).toBe('queued');
    nowMs += 1_001;
    expect(await larger.readBatch(10)).toEqual([]);
    expect(await larger.health()).toMatchObject({ status: 'loss-unknown', queuedCount: 0, droppedCount: null });
  });

  it('returns a loss-unknown health state when no durable SQLite directory can be derived', async () => {
    const spool = new FsAssistantEventSpool(undefined);
    expect(await spool.enqueue(event)).toBe('dropped');
    expect(await spool.health()).toMatchObject({ status: 'loss-unknown', queuedCount: null, queuedBytes: null, droppedCount: null });
  });

  it('reports unknown loss when the spool directory cannot be created', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'walker-assistant-spool-blocked-'));
    roots.push(root);
    await writeFile(path.join(root, 'assistant-event-spool'), 'disk unavailable');
    const spool = new FsAssistantEventSpool(pathToFileURL(path.join(root, 'walker.test.db')).href);

    expect(await spool.enqueue(event)).toBe('dropped');
    await expect(spool.health()).resolves.toMatchObject({
      status: 'loss-unknown', queuedCount: null, queuedBytes: null, droppedCount: null,
    });
  });
});
