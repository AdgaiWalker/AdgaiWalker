import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProductionStage, StageArtifact } from '@walker/shared';
import type { StageArtifactRecord, StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';

export class FsStageArtifactRepository implements StageArtifactRepositoryPort {
  private readonly root: string;
  constructor(root: string) { this.root = path.resolve(root); }

  async write(workId: string, artifact: StageArtifact): Promise<StageArtifactRecord> {
    this.assertWorkId(workId);
    const body = Buffer.from(JSON.stringify(artifact, null, 2));
    const hash = createHash('sha256').update(body).digest('hex');
    const stageDir = path.join(this.root, workId, 'stages', artifact.stage);
    await fs.mkdir(stageDir, { recursive: true });
    const name = `${Date.now()}-${hash}.json`;
    const target = path.join(stageDir, name);
    const temp = `${target}.tmp`;
    await fs.writeFile(temp, body, { flag: 'wx' });
    await fs.rename(temp, target);
    return { workId, stage: artifact.stage, hash, path: path.relative(this.root, target), artifact, createdAt: artifact.createdAt ?? new Date().toISOString() };
  }

  async latest(workId: string, stage: ProductionStage): Promise<StageArtifactRecord | null> {
    const all = await this.list(workId);
    return all.filter((item) => item.stage === stage).at(-1) ?? null;
  }

  async list(workId: string): Promise<StageArtifactRecord[]> {
    this.assertWorkId(workId);
    const result: StageArtifactRecord[] = [];
    for (const stage of ['NORMALIZE', 'EDIT', 'QUALITY_CHECK', 'FREEZE_BODY', 'COVER', 'WEB_FORMAT', 'WECHAT_FORMAT', 'REVIEW_READY'] as ProductionStage[]) {
      const dir = path.join(this.root, workId, 'stages', stage);
      let names: string[];
      try { names = await fs.readdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      for (const name of names.filter((item) => item.endsWith('.json')).sort()) {
        const full = path.join(dir, name);
        const body = await fs.readFile(full);
        const artifact = JSON.parse(body.toString('utf8')) as StageArtifact;
        result.push({ workId, stage, hash: createHash('sha256').update(body).digest('hex'), path: path.relative(this.root, full), artifact, createdAt: artifact.createdAt ?? new Date().toISOString() });
      }
    }
    return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private assertWorkId(workId: string) { if (!/^[a-zA-Z0-9_-]+$/.test(workId)) throw new Error('invalid-work-id'); }
}
