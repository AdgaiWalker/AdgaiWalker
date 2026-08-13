import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactRepositoryPort, OriginalFileInput, OriginalFileRecord, WorkManifest } from '../ports/artifact.repository';

export class FsArtifactRepository implements ArtifactRepositoryPort {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async createOriginal(workId: string, files: OriginalFileInput[], links: string[] = []): Promise<WorkManifest> {
    this.assertWorkId(workId);
    const workDir = this.resolveWork(workId);
    const manifestPath = path.join(workDir, 'manifest.json');
    try {
      await fs.access(manifestPath);
      throw new Error('original-already-exists');
    } catch (error) {
      if (error instanceof Error && error.message === 'original-already-exists') throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    let created = false;
    try {
      await fs.mkdir(this.root, { recursive: true });
      await fs.mkdir(workDir, { recursive: false });
      created = true;
      const originalDir = path.join(workDir, 'original');
      await fs.mkdir(originalDir, { recursive: false });
      const used = new Set<string>();
      const originalFiles: OriginalFileRecord[] = [];
      for (const file of files) {
        const name = this.uniqueName(this.safeName(file.originalName), used);
        const bytes = Buffer.from(file.bytes);
        const target = path.join(originalDir, name);
        await fs.writeFile(target, bytes, { flag: 'wx' });
        originalFiles.push({
          name,
          mimeType: file.mimeType,
          size: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          role: file.role,
        });
      }
      const manifest: WorkManifest = {
        workId,
        version: 1,
        originalCreatedAt: new Date().toISOString(),
        originalFiles,
        originalLinks: links.map((link) => link.trim()).filter(Boolean),
      };
      const tempPath = `${manifestPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
      await fs.rename(tempPath, manifestPath);
      return manifest;
    } catch (error) {
      if (created) await fs.rm(workDir, { recursive: true, force: true });
      throw error;
    }
  }

  async readManifest(workId: string): Promise<WorkManifest | null> {
    this.assertWorkId(workId);
    try {
      const value = await fs.readFile(path.join(this.resolveWork(workId), 'manifest.json'), 'utf8');
      const parsed = JSON.parse(value) as WorkManifest;
      return { ...parsed, originalLinks: parsed.originalLinks ?? [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async discardWork(workId: string): Promise<void> {
    this.assertWorkId(workId);
    await fs.rm(this.resolveWork(workId), { recursive: true, force: true });
  }

  async readOriginalText(workId: string): Promise<string> {
    const manifest = await this.readManifest(workId);
    const draft = manifest?.originalFiles.find((file) => file.role === 'draft');
    if (!draft) throw new Error('draft-not-found');
    return fs.readFile(path.join(this.resolveWork(workId), 'original', draft.name), 'utf8');
  }

  private safeName(input: string): string {
    const base = path.basename(input).replace(/[\u0000-\u001f\u007f]/g, '_').trim();
    return base || 'upload.bin';
  }

  private uniqueName(name: string, used: Set<string>): string {
    if (!used.has(name)) { used.add(name); return name; }
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    let i = 2;
    while (used.has(`${stem}-${i}${ext}`)) i += 1;
    const result = `${stem}-${i}${ext}`;
    used.add(result);
    return result;
  }

  private resolveWork(workId: string): string {
    const target = path.resolve(this.root, workId);
    const prefix = `${this.root}${path.sep}`;
    if (!target.startsWith(prefix)) throw new Error('invalid-work-id');
    return target;
  }

  private assertWorkId(workId: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(workId)) throw new Error('invalid-work-id');
  }
}
