import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSnapshot } from './log-maintenance.cli';

let root = '';
let backupPath = '';
let recoveryManifestPath = '';
let sidecarPath = '';

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-backup-snapshot-'));
  backupPath = path.join(root, 'walker.db');
  recoveryManifestPath = path.join(root, 'deletion-manifest.json');
  sidecarPath = path.join(root, 'control', 'deletion-manifest.json');
}, 30_000);

afterAll(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe('log-maintenance snapshot', () => {
  it('creates a consistent SQLite snapshot with a hashed 30-day expiry manifest', async () => {
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error('isolated API test database URL missing');
    const sourceDb = new PrismaClient();
    const tombstones = await sourceDb.deletionTombstone.findMany({ select: { id: true, conversationId: true, requestedAt: true } });

    try {
      await createSnapshot(sourceUrl, sidecarPath, backupPath, recoveryManifestPath);
    } finally {
      await sourceDb.$disconnect();
    }

    const backupMeta = JSON.parse(await fs.readFile(`${backupPath}.manifest.json`, 'utf8')) as {
      createdAt: string;
      expiresAt: string;
      databaseSha256: string;
      deletionManifestSha256: string;
    };
    const backupHash = createHash('sha256').update(await fs.readFile(backupPath)).digest('hex');
    const recoveryManifest = await fs.readFile(recoveryManifestPath, 'utf8');
    const backupDb = new PrismaClient({ datasources: { db: { url: `file:${backupPath}` } } });
    try {
      await expect(backupDb.$queryRawUnsafe('PRAGMA integrity_check')).resolves.toEqual([{ integrity_check: 'ok' }]);
    } finally {
      await backupDb.$disconnect();
    }

    expect(backupMeta.expiresAt).toBe(new Date(Date.parse(backupMeta.createdAt) + 30 * 24 * 60 * 60 * 1_000).toISOString());
    expect(backupMeta.databaseSha256).toBe(backupHash);
    expect(backupMeta.deletionManifestSha256).toHaveLength(64);
    const manifest = JSON.parse(recoveryManifest) as { version: number; entries: Array<{ tombstoneId: string; conversationId: string }> };
    expect(manifest.version).toBe(1);
    expect(manifest.entries).toHaveLength(tombstones.length);
    expect(manifest.entries).toEqual(expect.arrayContaining(tombstones.map((entry) => ({
      tombstoneId: entry.id, conversationId: entry.conversationId,
    }))));
  });
});
