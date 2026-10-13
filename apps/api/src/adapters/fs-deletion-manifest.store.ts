import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { DeletionManifestEntry, DeletionManifestPort } from '../ports/deletion-manifest.port';

const MANIFEST_VERSION = 1;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

type ManifestDocument = {
  version: typeof MANIFEST_VERSION;
  updatedAt: string;
  entries: DeletionManifestEntry[];
};

export class FsDeletionManifestStore implements DeletionManifestPort {
  private operation = Promise.resolve();

  constructor(
    private readonly filePath = resolveDeletionManifestPath(),
    private readonly replicaPath = resolveDeletionManifestReplicaPath(),
  ) {}

  health(): Promise<void> {
    return this.exclusive(async () => {
      await probeWritablePath(this.filePath);
      if (this.replicaPath && this.replicaPath !== this.filePath) await probeWritablePath(this.replicaPath);
    });
  }

  record(entry: DeletionManifestEntry): Promise<void> {
    return this.recordMany([entry]);
  }

  recordMany(entries: DeletionManifestEntry[]): Promise<void> {
    return this.exclusive(async () => {
      const document = await this.readDocument();
      const byConversation = new Map(document.entries.map((item) => [item.conversationId, item]));
      for (const entry of entries) {
        validateEntry(entry);
        const existing = byConversation.get(entry.conversationId);
        if (existing && existing.tombstoneId !== entry.tombstoneId) {
          throw new Error('deletion-manifest-owner-conflict');
        }
        byConversation.set(entry.conversationId, entry);
      }
      await this.writeDocument({
        version: MANIFEST_VERSION,
        updatedAt: new Date().toISOString(),
        entries: [...byConversation.values()].sort((left, right) =>
          left.requestedAt.localeCompare(right.requestedAt) || left.conversationId.localeCompare(right.conversationId)),
      });
    });
  }

  entries(): Promise<DeletionManifestEntry[]> {
    return this.exclusive(async () => (await this.readDocument()).entries);
  }

  private async readDocument(): Promise<ManifestDocument> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (!isMissing(error)) throw error;
      if (!this.replicaPath || this.replicaPath === this.filePath) {
        return { version: MANIFEST_VERSION, updatedAt: new Date(0).toISOString(), entries: [] };
      }
      try {
        raw = await readFile(this.replicaPath, 'utf8');
      } catch (replicaError) {
        if (isMissing(replicaError)) return { version: MANIFEST_VERSION, updatedAt: new Date(0).toISOString(), entries: [] };
        throw replicaError;
      }
    }
    if (Buffer.byteLength(raw, 'utf8') > MAX_MANIFEST_BYTES) throw new Error('deletion-manifest-too-large');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('deletion-manifest-malformed');
    }
    if (!isRecord(parsed) || parsed.version !== MANIFEST_VERSION || !Array.isArray(parsed.entries)) {
      throw new Error('deletion-manifest-malformed');
    }
    const entries = parsed.entries.map(parseEntry);
    const ids = new Set<string>();
    const conversations = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.tombstoneId) || conversations.has(entry.conversationId)) {
        throw new Error('deletion-manifest-duplicate');
      }
      ids.add(entry.tombstoneId);
      conversations.add(entry.conversationId);
    }
    return { version: MANIFEST_VERSION, updatedAt: validTimestamp(parsed.updatedAt), entries };
  }

  private async writeDocument(document: ManifestDocument): Promise<void> {
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    await writeAtomically(this.filePath, serialized);
    if (this.replicaPath && this.replicaPath !== this.filePath) await writeAtomically(this.replicaPath, serialized);
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.operation.then(action, action);
    this.operation = pending.then(() => undefined, () => undefined);
    return pending;
  }
}

export function resolveDeletionManifestPath(
  databaseUrl = process.env.DATABASE_URL,
  configuredPath = process.env.WALKER_DELETION_MANIFEST_PATH,
): string {
  if (configuredPath?.trim()) return path.resolve(configuredPath.trim());
  if (!databaseUrl?.startsWith('file:')) throw new Error('deletion-manifest-path-required');
  const databasePath = databaseUrl.slice('file:'.length);
  if (!path.isAbsolute(databasePath)) throw new Error('deletion-manifest-path-required');
  const boxRoot = path.dirname(path.dirname(databasePath));
  return path.join(boxRoot, 'control', 'deletion-manifest.json');
}

export function resolveDeletionManifestReplicaPath(configuredPath = process.env.WALKER_DELETION_MANIFEST_REPLICA_PATH): string | null {
  return configuredPath?.trim() ? path.resolve(configuredPath.trim()) : null;
}

function parseEntry(value: unknown): DeletionManifestEntry {
  if (!isRecord(value) || typeof value.tombstoneId !== 'string' || typeof value.conversationId !== 'string' || typeof value.requestedAt !== 'string') {
    throw new Error('deletion-manifest-malformed');
  }
  const entry = { tombstoneId: value.tombstoneId, conversationId: value.conversationId, requestedAt: value.requestedAt };
  validateEntry(entry);
  return entry;
}

function validateEntry(entry: DeletionManifestEntry): void {
  if (!entry.tombstoneId.trim() || entry.tombstoneId.length > 200 ||
      !entry.conversationId.trim() || entry.conversationId.length > 200 ||
      validTimestamp(entry.requestedAt) !== entry.requestedAt) {
    throw new Error('deletion-manifest-malformed');
  }
}

function validTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('deletion-manifest-malformed');
  return new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: string }).code === 'ENOENT';
}

async function writeAtomically(filePath: string, serialized: string): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function probeWritablePath(filePath: string): Promise<void> {
  const probePath = `${filePath}.${randomUUID()}.probe`;
  const marker = `readiness-probe-${randomUUID()}`;
  try {
    await writeAtomically(probePath, `${marker}\n`);
    if ((await readFile(probePath, 'utf8')) !== `${marker}\n`) throw new Error('deletion-manifest-health-read-failed');
  } finally {
    await rm(probePath, { force: true });
  }
}
