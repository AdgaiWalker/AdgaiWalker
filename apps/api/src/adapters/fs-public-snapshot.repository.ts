import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { stableJson, type PublicSnapshotItem } from '@walker/shared';
import type { PublicSnapshotRepositoryPort, VerifiedPublicSnapshot } from '../ports/public-snapshot.repository';

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function itemHash(item: PublicSnapshotItem): string {
  return sha(stableJson(item));
}

function collectionHash(items: VerifiedPublicSnapshot['items']): string {
  return sha(stableJson(items.map((item) => ({ hash: item.hash, slug: item.slug }))));
}

function verified(snapshot: VerifiedPublicSnapshot): boolean {
  return snapshot.items.every((item) => item.hash === itemHash({
    slug: item.slug, title: item.title, updated: item.updated, summary: item.summary, body: item.body,
    tags: item.tags, type: item.type, readable: item.readable, citable: item.citable,
  })) && snapshot.collectionHash === collectionHash(snapshot.items) && snapshot.buildId === snapshot.collectionHash;
}

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
}
