import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AssistantEventRecordInput,
  AssistantEventSpoolEntry,
  AssistantEventSpoolHealth,
  AssistantEventSpoolPort,
  AssistantEventSpoolResult,
} from '../ports/assistant-event-spool.port';

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const LOSS_MARKER = '.loss-unknown';

type SpoolFile = AssistantEventSpoolEntry & { event: AssistantEventRecordInput };
type CachedSpoolFile = { name: string; path: string; bytes: number; entry: AssistantEventSpoolEntry };

export type FsAssistantEventSpoolOptions = {
  maxBytes?: number;
  ttlMs?: number;
  now?: () => Date;
};

/**
 * 以 SQLite 文件所在目录为锚点的受控事件暂存区。
 * 正文不会进入 spool；只保存 FeatureEvent 的白名单字段。
 */
export class FsAssistantEventSpool implements AssistantEventSpoolPort {
  private readonly directory: string | null;
  private readonly maxBytes: number;
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private operation = Promise.resolve();
  private lossUnknown = false;
  private lossWarned = false;
  private loaded = false;
  private files = new Map<string, CachedSpoolFile>();
  private queuedBytes = 0;

  constructor(databaseUrl?: string, options: FsAssistantEventSpoolOptions = {}) {
    this.directory = resolveSpoolDirectory(databaseUrl);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => new Date());
  }

  enqueue(event: AssistantEventRecordInput): Promise<AssistantEventSpoolResult> {
    return this.exclusive(async () => {
      const directory = await this.ensureDirectory();
      if (!directory || !event.eventId) return this.drop();

      try {
        await this.loadFiles(directory);
        await this.pruneExpired(directory);
        const fileName = this.fileName(event.eventId);
        const destination = path.join(directory, fileName);
        const existing = this.files.get(fileName);
        if (existing) {
          if (existing.entry.event.eventId === event.eventId) return 'duplicate';
          await this.markLossUnknown(directory);
          return 'dropped';
        }

        const entry: SpoolFile = { event, queuedAt: this.now().toISOString() };
        const serialized = JSON.stringify(entry);
        const bytes = Buffer.byteLength(serialized, 'utf8');
        if (bytes > this.maxBytes || this.queuedBytes + bytes > this.maxBytes) {
          await this.markLossUnknown(directory);
          return 'dropped';
        }

        const temporary = path.join(directory, `.${fileName}.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
          await rename(temporary, destination);
          this.files.set(fileName, { name: fileName, path: destination, bytes, entry });
          this.queuedBytes += bytes;
        } finally {
          await rm(temporary, { force: true }).catch(() => {});
        }
        return 'queued';
      } catch {
        await this.markLossUnknown(directory);
        return 'dropped';
      }
    });
  }

  readBatch(limit: number): Promise<AssistantEventSpoolEntry[]> {
    return this.exclusive(async () => {
      const directory = await this.ensureDirectory();
      if (!directory || !Number.isFinite(limit) || limit <= 0) return [];
      try {
        await this.loadFiles(directory);
        await this.pruneExpired(directory);
        return [...this.files.values()]
          .sort((left, right) => left.entry.queuedAt.localeCompare(right.entry.queuedAt))
          .slice(0, Math.floor(limit))
          .map((file) => file.entry);
      } catch {
        await this.markLossUnknown(directory);
        return [];
      }
    });
  }

  listResources(): Promise<Array<{ eventId: string; conversationId: string | null; queuedAt: string }>> {
    return this.exclusive(async () => {
      const directory = await this.ensureDirectory();
      if (!directory) throw new Error('assistant-event-spool-unavailable');
      try {
        await this.loadFiles(directory);
        return [...this.files.values()].map(({ entry }) => ({
          eventId: entry.event.eventId,
          conversationId: entry.event.conversationId ?? null,
          queuedAt: entry.queuedAt,
        }));
      } catch {
        await this.markLossUnknown(directory);
        throw new Error('assistant-event-spool-unavailable');
      }
    });
  }

  remove(eventIds: string[]): Promise<void> {
    return this.exclusive(async () => {
      const directory = await this.ensureDirectory();
      if (!directory) return;
      try {
        await this.loadFiles(directory);
        for (const eventId of eventIds) {
          const fileName = this.fileName(eventId);
          const file = this.files.get(fileName);
          if (!file) continue;
          await rm(file.path, { force: true });
          this.files.delete(fileName);
          this.queuedBytes -= file.bytes;
        }
      } catch {
        await this.markLossUnknown(directory);
      }
    });
  }

  health(): Promise<AssistantEventSpoolHealth> {
    return this.exclusive(async () => {
      const directory = await this.ensureDirectory();
      if (!directory) return unknownHealth();
      try {
        await this.loadFiles(directory);
        await this.pruneExpired(directory);
        const queued = [...this.files.values()];
        const oldestQueuedAt = queued
          .map((file) => file.entry.queuedAt)
          .sort()[0] ?? null;
        const hasLoss = this.lossUnknown || await this.hasLossMarker(directory);
        return {
          status: hasLoss ? 'loss-unknown' : queued.length > 0 ? 'backlog' : 'healthy',
          queuedCount: queued.length,
          queuedBytes: this.queuedBytes,
          oldestQueuedAt,
          droppedCount: hasLoss ? null : 0,
        };
      } catch {
        await this.markLossUnknown(directory);
        return unknownHealth();
      }
    });
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    const pending = this.operation.then(action, action);
    this.operation = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private async ensureDirectory(): Promise<string | null> {
    if (!this.directory) {
      this.lossUnknown = true;
      return null;
    }
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      return this.directory;
    } catch {
      this.lossUnknown = true;
      return null;
    }
  }

  private async loadFiles(directory: string): Promise<void> {
    if (this.loaded) return;
    const names = (await readdir(directory)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort();
    const loaded = new Map<string, CachedSpoolFile>();
    for (const name of names) {
      const fullPath = path.join(directory, name);
      const serialized = await readFile(fullPath, 'utf8');
      const entry = this.parseFileEntry(serialized);
      if (!entry) {
        await this.markLossUnknown(directory);
        await rm(fullPath, { force: true }).catch(() => {});
        continue;
      }
      if (name !== this.fileName(entry.event.eventId)) {
        await this.markLossUnknown(directory);
        await rm(fullPath, { force: true }).catch(() => {});
        continue;
      }
      loaded.set(name, { name, path: fullPath, bytes: Buffer.byteLength(serialized, 'utf8'), entry });
    }
    this.files = loaded;
    this.queuedBytes = [...loaded.values()].reduce((sum, file) => sum + file.bytes, 0);
    this.loaded = true;
  }

  private parseFileEntry(serialized: string): AssistantEventSpoolEntry | null {
    try {
      const parsed = JSON.parse(serialized) as Partial<AssistantEventSpoolEntry>;
      if (!parsed || typeof parsed.queuedAt !== 'string' || !Number.isFinite(Date.parse(parsed.queuedAt)) ||
          !parsed.event || typeof parsed.event !== 'object' || typeof parsed.event.eventId !== 'string') return null;
      return parsed as AssistantEventSpoolEntry;
    } catch {
      return null;
    }
  }

  private async pruneExpired(directory: string): Promise<void> {
    const expired = [...this.files.values()].filter((file) =>
      this.now().getTime() - Date.parse(file.entry.queuedAt) >= this.ttlMs,
    );
    if (expired.length === 0) return;
    await Promise.all(expired.map((file) => rm(file.path, { force: true })));
    for (const file of expired) {
      this.files.delete(file.name);
      this.queuedBytes -= file.bytes;
    }
    await this.markLossUnknown(directory);
  }

  private async markLossUnknown(directory: string): Promise<void> {
    this.lossUnknown = true;
    this.warnLoss('assistant_event_spool_loss_unknown');
    await writeFile(path.join(directory, LOSS_MARKER), 'loss-unknown\n', { encoding: 'utf8', mode: 0o600 }).catch(() => {});
  }

  private async hasLossMarker(directory: string): Promise<boolean> {
    try {
      await stat(path.join(directory, LOSS_MARKER));
      return true;
    } catch {
      return false;
    }
  }

  private fileName(eventId: string): string {
    return `${createHash('sha256').update(eventId).digest('hex')}.json`;
  }

  private async drop(): Promise<AssistantEventSpoolResult> {
    this.lossUnknown = true;
    this.warnLoss('assistant_event_spool_unavailable');
    return 'dropped';
  }

  private warnLoss(msg: string): void {
    if (this.lossWarned) return;
    this.lossWarned = true;
    console.warn(JSON.stringify({ level: 'warn', msg }));
  }
}

function resolveSpoolDirectory(databaseUrl?: string): string | null {
  if (!databaseUrl?.startsWith('file:')) return null;
  try {
    const databasePath = fileURLToPath(databaseUrl);
    if (!path.isAbsolute(databasePath) || path.extname(databasePath) === '') return null;
    return path.join(path.dirname(databasePath), 'assistant-event-spool');
  } catch {
    return null;
  }
}

function unknownHealth(): AssistantEventSpoolHealth {
  return {
    status: 'loss-unknown',
    queuedCount: null,
    queuedBytes: null,
    oldestQueuedAt: null,
    droppedCount: null,
  };
}
