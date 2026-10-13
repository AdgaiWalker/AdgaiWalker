import fs, { type FileHandle } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConversationExportFormat } from '@walker/shared';
import type {
  ConversationExportFile,
  ConversationExportFileStorePort,
} from '../ports/conversation-export-file-store.port';

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

export class FsConversationExportFileStore implements ConversationExportFileStorePort {
  constructor(private readonly configuredRoot: string) {}

  async write(id: string, format: ConversationExportFormat, chunks: AsyncIterable<string>): Promise<void> {
    const root = await this.ensureRoot();
    const target = this.filePath(root, id, format);
    const temporary = path.join(root, `${id}.${randomUUID()}.tmp`);
    let handle: FileHandle | null = null;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      for await (const chunk of chunks) {
        const buffer = Buffer.from(chunk, 'utf8');
        await writeAll(handle, buffer);
      }
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rm(target, { force: true });
      await fs.rename(temporary, target);
      return;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async open(id: string, format: ConversationExportFormat): Promise<ConversationExportFile> {
    const root = await this.ensureRoot();
    const target = this.filePath(root, id, format);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('conversation-export-file-invalid');
    return { stream: createReadStream(target), byteLength: stat.size };
  }

  async remove(id: string): Promise<void> {
    assertId(id);
    const root = path.resolve(this.configuredRoot);
    try {
      const stat = await fs.lstat(root);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('conversation-export-root-invalid');
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    await Promise.all([
      fs.rm(this.filePath(root, id, 'csv'), { force: true }),
      fs.rm(this.filePath(root, id, 'json'), { force: true }),
      this.removeTemporaryFiles(root, id),
    ]);
  }

  async cleanupTemporary(): Promise<void> {
    let root: string;
    try {
      root = await this.ensureRoot();
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.tmp'))
      .map((entry) => fs.rm(path.join(root, entry.name), { force: true })));
  }

  async reconcile(readyArtifacts: Array<{ id: string; format: ConversationExportFormat }>): Promise<void> {
    const root = await this.ensureRoot();
    const retained = new Set(readyArtifacts.map(({ id, format }) => `${id}.${format}`));
    const entries = await fs.readdir(root, { withFileTypes: true });
    const orphans = entries.filter((entry) => entry.isFile() && /^[a-zA-Z0-9_-]{1,100}\.(csv|json)$/.test(entry.name) && !retained.has(entry.name));
    await Promise.all(orphans.map((entry) => fs.rm(path.join(root, entry.name), { force: true })));
  }

  private async ensureRoot(): Promise<string> {
    const root = path.resolve(this.configuredRoot);
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('conversation-export-root-invalid');
    return root;
  }

  private filePath(root: string, id: string, format: ConversationExportFormat): string {
    assertId(id);
    const target = path.resolve(root, `${id}.${format}`);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('conversation-export-path-invalid');
    }
    return target;
  }

  private async removeTemporaryFiles(root: string, id: string): Promise<void> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${id}.`) && entry.name.endsWith('.tmp'))
      .map((entry) => fs.rm(path.join(root, entry.name), { force: true })));
  }
}

async function writeAll(handle: FileHandle, buffer: Buffer): Promise<void> {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.byteLength - offset);
    if (bytesWritten <= 0) throw new Error('conversation-export-write-incomplete');
    offset += bytesWritten;
  }
}

function assertId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error('conversation-export-id-invalid');
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    ((error as { code?: string }).code === 'ENOENT' || (error as { code?: string }).code === 'ENOTDIR');
}
