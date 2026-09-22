import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publicManifest } from '@walker/shared';
import { afterAll, expect, it } from 'vitest';
import { FsPublicSnapshotRepository } from './fs-public-snapshot.repository';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-snapshot-'));
const repo = new FsPublicSnapshotRepository(root);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const source = (body: string) => ({ slug: 'post', title: '标题', updated: '2026-09-22', summary: '摘要', body, tags: ['a'], type: 'knowledge', visibility: 'public', published: true, aiUsePolicy: { readable: true, citable: true } });

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

it('坏快照不切换指针，未发布编辑不会被读成公开版本', async () => {
  await expect(repo.readActive()).rejects.toThrow('snapshot-unavailable');
  const first = publicManifest([source('已核验正文')], hash);
  await repo.publish(first);
  await expect(repo.publish({ ...first, collectionHash: 'a'.repeat(64) })).rejects.toThrow('snapshot-hash-mismatch');
  expect((await repo.readActive()).items[0]?.body).toBe('已核验正文');
  fs.writeFileSync(path.join(root, 'snapshots', `${first.collectionHash}.json`), '半截');
  await expect(repo.readActive()).rejects.toThrow('snapshot-unavailable');
  fs.writeFileSync(path.join(root, 'workspace-edit.md'), '未发布编辑');
  fs.writeFileSync(path.join(root, 'snapshots', `${first.collectionHash}.json`), JSON.stringify(first));
  expect((await repo.readActive()).items[0]?.body).toBe('已核验正文');
  expect(JSON.stringify(await repo.readActive())).not.toContain('未发布编辑');
});
