import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { publicManifest, type PublicSnapshotSource } from '@walker/shared';
import { KnowledgeService } from './plugins/knowledge.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function sources(): PublicSnapshotSource[] {
  return [
    {
      slug: 'keep-me',
      title: '保留',
      updated: '2026-09-01',
      summary: '保留摘要',
      body: '保留正文',
      tags: ['t'],
      type: 'log',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: true, citable: true },
    },
    {
      slug: 'revoke-me',
      title: '撤销',
      updated: '2026-09-02',
      summary: '撤销摘要',
      body: '撤销正文',
      tags: [],
      type: 'log',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: true, citable: true },
    },
    {
      slug: 'not-readable',
      title: '不可读',
      updated: '2026-09-03',
      summary: '不可读摘要',
      body: '不可读正文',
      tags: [],
      type: 'log',
      visibility: 'public',
      published: true,
      aiUsePolicy: { readable: false, citable: false },
    },
  ];
}

/** 按 V02 仓储磁盘布局写一个已核验快照基线。 */
function snapshotRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'walker-agent-snap-'));
  const manifest = publicManifest(sources(), sha);
  mkdirSync(path.join(root, 'snapshots'), { recursive: true });
  writeFileSync(path.join(root, 'snapshots', `${manifest.collectionHash}.json`), JSON.stringify(manifest));
  writeFileSync(path.join(root, 'active.json'), JSON.stringify({ collectionHash: manifest.collectionHash }));
  return root;
}

function loadSnapshot(root: string): KnowledgeService {
  return new KnowledgeService(new Context(), { snapshotDir: root });
}

describe('knowledge 快照模式（与 API 同源的公开上下文）', () => {
  it('读取已核验基线；无基线或指针损坏 fail-closed 拒绝启动', () => {
    const root = snapshotRoot();
    const svc = loadSnapshot(root);
    expect(svc.citableList().map((e) => e.slug).sort()).toEqual(['keep-me', 'revoke-me']);
    expect(svc.get('not-readable')).toBeNull();
    rmSync(root, { recursive: true, force: true });

    const empty = mkdtempSync(path.join(tmpdir(), 'walker-agent-nobase-'));
    expect(() => loadSnapshot(empty)).toThrow('snapshot-unavailable');
    writeFileSync(path.join(empty, 'active.json'), '{ broken');
    expect(() => loadSnapshot(empty)).toThrow();
    rmSync(empty, { recursive: true, force: true });
  });

  it('撤销下一问即生效：不重启进程，deny.json 写入后下一问即收窄', () => {
    const root = snapshotRoot();
    const svc = loadSnapshot(root);
    expect(svc.search('撤销').length).toBe(1);
    expect(svc.get('revoke-me')?.slug).toBe('revoke-me');

    writeFileSync(path.join(root, 'deny.json'), JSON.stringify({ slugs: ['revoke-me'] }));
    expect(svc.search('撤销')).toEqual([]);
    expect(svc.get('revoke-me')).toBeNull();
    expect(svc.citableList().map((e) => e.slug)).toEqual(['keep-me']);
    expect(svc.neighbors('revoke-me')).toBeNull();
    expect(svc.get('keep-me')?.slug).toBe('keep-me');
    rmSync(root, { recursive: true, force: true });
  });

  it('deny.json 损坏 fail-closed：全部视为撤销；删除文件即恢复', () => {
    const root = snapshotRoot();
    const svc = loadSnapshot(root);
    writeFileSync(path.join(root, 'deny.json'), '{ nope');
    expect(svc.search('保留')).toEqual([]);
    expect(svc.get('keep-me')).toBeNull();
    expect(svc.citableList()).toEqual([]);

    rmSync(path.join(root, 'deny.json'));
    expect(svc.citableList().length).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it('私有开发读取显式分开：contentPath 模式不应用公开撤销集合', () => {
    const root = snapshotRoot();
    writeFileSync(path.join(root, 'deny.json'), JSON.stringify({ slugs: ['keep-me'] }));
    const dir = mkdtempSync(path.join(tmpdir(), 'walker-agent-dev-'));
    const file = path.join(dir, 'content.json');
    writeFileSync(
      file,
      JSON.stringify({
        items: [
          { slug: 'keep-me', title: '保留', summary: 's', tags: [], body: 'b', aiUsePolicy: { readable: true, citable: true } },
        ],
      }),
    );
    // 开发模式不读 snapshotDir，deny.json 与它无关
    const svc = new KnowledgeService(new Context(), { contentPath: file });
    expect(svc.get('keep-me')?.slug).toBe('keep-me');
    expect(existsSync(path.join(root, 'deny.json'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });
});
