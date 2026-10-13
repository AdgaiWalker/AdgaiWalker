import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { FsDeletionManifestStore, resolveDeletionManifestPath } from '../adapters/fs-deletion-manifest.store';
import { loadApiEnvFile } from '../config/load-api-env';
import { toDeletionManifestEntry } from './deletion-manifest-replay.service';

const BACKUP_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1_000;
function requiredAbsolutePath(value: string | undefined, label: string): string {
  if (!value?.trim() || !path.isAbsolute(value.trim())) throw new Error(`${label}-must-be-absolute`);
  return path.resolve(value.trim());
}

function databaseFile(databaseUrl = process.env.DATABASE_URL): string {
  const url = databaseUrl?.trim();
  if (!url?.startsWith('file:')) throw new Error('DATABASE_URL-must-be-an-absolute-SQLite-file');
  return requiredAbsolutePath(url.slice('file:'.length), 'DATABASE_URL');
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function writeJsonExclusive(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

async function mergeManifest(sourcePath: string): Promise<void> {
  const incoming = new FsDeletionManifestStore(requiredAbsolutePath(sourcePath, 'manifest path'));
  const entries = await incoming.entries();
  const target = new FsDeletionManifestStore(resolveDeletionManifestPath());
  await target.recordMany(entries);
  process.stdout.write(`${JSON.stringify({ merged: entries.length })}\n`);
}

async function verifyDatabase(databasePath: string): Promise<void> {
  const absolutePath = requiredAbsolutePath(databasePath, 'database path');
  const db = new PrismaClient({ datasources: { db: { url: `file:${absolutePath}` } } });
  try {
    const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('sqlite-integrity-check-failed');
    const foreignKeys = await db.$queryRawUnsafe('PRAGMA foreign_key_check') as unknown[];
    if (foreignKeys.length > 0) throw new Error('sqlite-foreign-key-check-failed');
    process.stdout.write(`${JSON.stringify({ integrity: 'ok', foreignKeyErrors: 0 })}\n`);
  } finally {
    await db.$disconnect();
  }
}

export async function createSnapshot(
  databaseUrl: string,
  localManifestPath: string,
  databaseOutput: string,
  manifestOutput: string,
): Promise<void> {
  const sourcePath = databaseFile(databaseUrl);
  const backupPath = requiredAbsolutePath(databaseOutput, 'backup path');
  const recoveryManifestPath = requiredAbsolutePath(manifestOutput, 'manifest path');
  const sidecarPath = requiredAbsolutePath(localManifestPath, 'local manifest path');
  const metadataPath = `${backupPath}.manifest.json`;
  if (backupPath === sourcePath || recoveryManifestPath === sourcePath || recoveryManifestPath === sidecarPath ||
      backupPath === recoveryManifestPath || metadataPath === recoveryManifestPath || metadataPath === sidecarPath) {
    throw new Error('backup-output-path-conflict');
  }
  let snapshotCreated = false;
  let recoveryManifestCreated = false;
  let metadataCreated = false;
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check') as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('sqlite-integrity-check-failed');
    const foreignKeys = await db.$queryRawUnsafe('PRAGMA foreign_key_check') as unknown[];
    if (foreignKeys.length > 0) throw new Error('sqlite-foreign-key-check-failed');

    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await db.$executeRawUnsafe(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    snapshotCreated = true;
    const backupDb = new PrismaClient({ datasources: { db: { url: `file:${backupPath}` } } });
    try {
      const backupIntegrity = await backupDb.$queryRawUnsafe('PRAGMA integrity_check') as Array<{ integrity_check: string }>;
      if (backupIntegrity.length !== 1 || backupIntegrity[0]?.integrity_check !== 'ok') throw new Error('sqlite-backup-integrity-check-failed');
    } finally {
      await backupDb.$disconnect();
    }

    const tombstones = await db.deletionTombstone.findMany({
      select: { id: true, conversationId: true, requestedAt: true },
    });
    const recoveryManifest = new FsDeletionManifestStore(sidecarPath);
    await recoveryManifest.recordMany(tombstones.map(toDeletionManifestEntry));
    await fs.mkdir(path.dirname(recoveryManifestPath), { recursive: true });
    await fs.copyFile(sidecarPath, recoveryManifestPath, constants.COPYFILE_EXCL);
    recoveryManifestCreated = true;

    const createdAt = new Date();
    const metadata = {
      version: 1,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + BACKUP_RETENTION_DAYS * DAY_MS).toISOString(),
      databaseFile: path.basename(backupPath),
      databaseSha256: await sha256(backupPath),
      deletionManifestFile: path.basename(recoveryManifestPath),
      deletionManifestSha256: await sha256(recoveryManifestPath),
    };
    await writeJsonExclusive(metadataPath, metadata);
    metadataCreated = true;
    process.stdout.write(`${JSON.stringify({ ...metadata, tombstones: tombstones.length })}\n`);
  } catch (error) {
    if (snapshotCreated) await fs.rm(backupPath, { force: true }).catch(() => {});
    if (recoveryManifestCreated) await fs.rm(recoveryManifestPath, { force: true }).catch(() => {});
    if (metadataCreated) await fs.rm(metadataPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await db.$disconnect();
  }
}

async function main(): Promise<void> {
  loadApiEnvFile();
  const cliArgs = process.argv.slice(2);
  if (cliArgs[0] === '--') cliArgs.shift();
  const [command, ...args] = cliArgs;
  if (command === 'merge' && args[0]) return mergeManifest(args[0]);
  if (command === 'verify-db' && args[0]) return verifyDatabase(args[0]);
  if (command === 'snapshot' && args[0] && args[1]) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL-required');
    return createSnapshot(databaseUrl, resolveDeletionManifestPath(), args[0], args[1]);
  }
  throw new Error('usage: log:maintenance merge <absolute-manifest> | verify-db <absolute-db> | snapshot <absolute-db-output> <absolute-manifest-output>');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
