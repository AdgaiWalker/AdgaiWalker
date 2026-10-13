import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parsePublicDenyList, stableJson, verifyPublicSnapshot } from '@walker/shared';
import type { PublicSnapshotRepositoryPort, VerifiedPublicSnapshot } from '../ports/public-snapshot.repository';

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function verified(snapshot: VerifiedPublicSnapshot): boolean {
  return verifyPublicSnapshot(snapshot, sha);
}

/** 撤销集合状态：无文件=空集合；文件损坏/形状不符=全部撤销（fail-closed）。 */
export type PublicDenyState = ReadonlySet<string> | 'deny-all';

export class FsPublicSnapshotRepository implements PublicSnapshotRepositoryPort {
  constructor(private readonly root = process.env.WALKER_PUBLIC_SNAPSHOT_DIR || path.resolve(process.cwd(), 'data/public-snapshots')) {}

  async publish(snapshot: VerifiedPublicSnapshot): Promise<void> {
    if (!verified(snapshot)) throw new Error('snapshot-hash-mismatch');
    const dir = path.join(this.root, 'snapshots');
    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, `${snapshot.collectionHash}.json`);
    const partial = `${finalPath}.partial`;
    fs.writeFileSync(partial, stableJson(snapshot));
    const written = JSON.parse(fs.readFileSync(partial, 'utf8')) as VerifiedPublicSnapshot;
    if (!verified(written)) {
      fs.rmSync(partial, { force: true });
      throw new Error('snapshot-hash-mismatch');
    }
    fs.renameSync(partial, finalPath);
    const pointer = path.join(this.root, 'active.json');
    const pointerPartial = `${pointer}.partial`;
    fs.writeFileSync(pointerPartial, JSON.stringify({ collectionHash: snapshot.collectionHash }));
    fs.renameSync(pointerPartial, pointer);
  }

  async readActive(): Promise<VerifiedPublicSnapshot> {
    const pointerPath = path.join(this.root, 'active.json');
    if (!fs.existsSync(pointerPath)) throw new Error('snapshot-unavailable');
    const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as { collectionHash?: string };
    if (!pointer.collectionHash) throw new Error('snapshot-unavailable');
    const file = path.join(this.root, 'snapshots', `${pointer.collectionHash}.json`);
    if (!fs.existsSync(file)) throw new Error('snapshot-unavailable');
    let snapshot: VerifiedPublicSnapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(file, 'utf8')) as VerifiedPublicSnapshot;
    } catch {
      throw new Error('snapshot-unavailable');
    }
    if (!verified(snapshot) || snapshot.collectionHash !== pointer.collectionHash) throw new Error('snapshot-unavailable');
    return snapshot;
  }

  /**
   * 读取快照根目录的 deny.json（公开内容撤销集合）。每次调用重新读盘，
   * 撤销下一问即生效；旧快照同样受收窄约束，不能绕过。
   */
  readDeniedSlugs(): PublicDenyState {
    const file = path.join(this.root, 'deny.json');
    if (!fs.existsSync(file)) return new Set();
    try {
      const parsed = parsePublicDenyList(JSON.parse(fs.readFileSync(file, 'utf8')));
      return parsed ? new Set(parsed.slugs) : 'deny-all';
    } catch {
      return 'deny-all';
    }
  }
}
