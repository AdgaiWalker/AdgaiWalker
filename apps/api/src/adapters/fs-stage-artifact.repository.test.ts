import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsStageArtifactRepository } from './fs-stage-artifact.repository';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('FsStageArtifactRepository', () => {
  it('writes a hashed stage artifact atomically and can read the latest version', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-stage-'));
    roots.push(root);
    const repo = new FsStageArtifactRepository(root);
    const saved = await repo.write('work-1', { recipeVersion: 1, stage: 'EDIT', output: { body: 'edited' } });
    expect(saved.hash).toMatch(/^[a-f0-9]{64}$/);
    await expect(repo.latest('work-1', 'EDIT')).resolves.toMatchObject({ hash: saved.hash, artifact: { stage: 'EDIT' } });
  });
});
