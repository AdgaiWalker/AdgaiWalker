import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsArtifactRepository } from './fs-artifact.repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('FsArtifactRepository', () => {
  it('writes immutable originals and hashes every file', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-artifact-'));
    roots.push(tempRoot);
    const repo = new FsArtifactRepository(tempRoot);
    const manifest = await repo.createOriginal('work-1', [{
      originalName: 'draft.md', mimeType: 'text/markdown', size: 12,
      bytes: new TextEncoder().encode('# first draft\n'), role: 'draft',
    }]);
    expect(manifest.originalFiles[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(repo.createOriginal('work-1', [{
      originalName: 'draft.md', mimeType: 'text/plain', size: 3,
      bytes: new TextEncoder().encode('new'), role: 'draft',
    }])).rejects.toThrow('original-already-exists');
  });

  it('sanitizes file names without allowing traversal', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-artifact-'));
    roots.push(tempRoot);
    const repo = new FsArtifactRepository(tempRoot);
    const manifest = await repo.createOriginal('work-2', [{
      originalName: '../private.txt', mimeType: 'text/plain', size: 4,
      bytes: new TextEncoder().encode('safe'), role: 'draft',
    }]);
    expect(manifest.originalFiles[0].name).toBe('private.txt');
  });

  it('keeps submitted reference links in the immutable manifest', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-artifact-'));
    roots.push(tempRoot);
    const repo = new FsArtifactRepository(tempRoot);
    const manifest = await repo.createOriginal('work-links', [{
      originalName: 'draft.md', mimeType: 'text/markdown', size: 8,
      bytes: new TextEncoder().encode('draft'), role: 'draft',
    }], ['https://example.com/source']);
    expect(manifest.originalLinks).toEqual(['https://example.com/source']);
  });
});
