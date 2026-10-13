import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsDeletionManifestStore } from './fs-deletion-manifest.store';

let root = '';

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = '';
});

describe('FsDeletionManifestStore', () => {
  it('persists an idempotent body-free deletion entry across store instances', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-deletion-manifest-'));
    const file = path.join(root, 'deletion-manifest.json');
    const entry = {
      tombstoneId: 'tombstone-1',
      conversationId: 'conversation-1',
      requestedAt: '2026-09-25T00:00:00.000Z',
    };

    await new FsDeletionManifestStore(file).record(entry);
    await new FsDeletionManifestStore(file).record(entry);

    await expect(new FsDeletionManifestStore(file).entries()).resolves.toEqual([entry]);
    await expect(fs.readFile(file, 'utf8')).resolves.not.toContain('message body');
  });

  it('fails closed when the manifest is malformed', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-deletion-manifest-'));
    const file = path.join(root, 'deletion-manifest.json');
    await fs.writeFile(file, '{broken');

    await expect(new FsDeletionManifestStore(file).entries()).rejects.toThrow('deletion-manifest-malformed');
  });

  it('proves primary and replica storage can atomically write without changing deletion data', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-deletion-manifest-'));
    const primary = path.join(root, 'primary', 'deletion-manifest.json');
    const replica = path.join(root, 'replica', 'deletion-manifest.json');
    const before = JSON.stringify({ version: 1, updatedAt: '2026-09-25T00:00:00.000Z', entries: [] });
    await fs.mkdir(path.dirname(primary), { recursive: true });
    await fs.writeFile(primary, before);
    const store = new FsDeletionManifestStore(primary, replica);

    await store.health();

    await expect(fs.readFile(primary, 'utf8')).resolves.toBe(before);
    await expect(fs.readdir(path.dirname(primary))).resolves.toEqual(['deletion-manifest.json']);
    await expect(fs.readdir(path.dirname(replica))).resolves.toEqual([]);
  });

  it('does not acknowledge a deletion when the configured off-host replica cannot be updated', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-deletion-manifest-'));
    const blocker = path.join(root, 'not-a-directory');
    await fs.writeFile(blocker, 'occupied');
    const store = new FsDeletionManifestStore(
      path.join(root, 'deletion-manifest.json'),
      path.join(blocker, 'replica.json'),
    );

    await expect(store.record({
      tombstoneId: 'tombstone-remote', conversationId: 'conversation-remote', requestedAt: '2026-09-25T00:00:00.000Z',
    })).rejects.toThrow();
    await expect(store.health()).rejects.toThrow();
  });
});
