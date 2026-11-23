import { createHash } from 'node:crypto';
import fs, { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { publicManifest, type PublicSnapshotSource } from '@walker/shared';
import { KnowledgeService } from './plugins/knowledge.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function writeSnapshot(root: string, items: PublicSnapshotSource[]): string {
  const manifest = publicManifest(items, sha);
  mkdirSync(path.join(root, 'snapshots'), { recursive: true });
  writeFileSync(path.join(root, 'snapshots', `${manifest.collectionHash}.json`), JSON.stringify(manifest));
  const tmpPointer = path.join(root, `active.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  writeFileSync(tmpPointer, JSON.stringify({ collectionHash: manifest.collectionHash }));
  renameSync(tmpPointer, path.join(root, 'active.json'));
  return manifest.collectionHash;
}

function makeSource(slug: string, title: string, body = '正文'): PublicSnapshotSource {
  return {
    slug,
    title,
    updated: '2026-11-23',
    summary: `${title}摘要`,
    body,
    tags: ['cordis'],
    type: 'log',
    visibility: 'public',
    published: true,
    aiUsePolicy: { readable: true, citable: true },
  };
}

async function waitFor<T>(fn: () => T | undefined | false, timeoutMs = 3000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = fn();
    if (val) return val;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('Gate 2A: KnowledgeService 响应式协效应与 Cordis 生命周期隔离', () => {
  it('快照 active.json 原子切换后无需重启进程，自动刷新索引、图谱并广播 knowledge/updated', async () => {
    const root = makeTempDir('walker-agent-reactive-');
    const hashV1 = writeSnapshot(root, [makeSource('alpha', '初始文章', '第一版正文')]);

    const ctx = new Context();
    const updates: Array<{ collectionHash: string | null; count: number; revision: number }> = [];
    ctx.on('knowledge/updated', (ev) => updates.push(ev));

    const fiber = await ctx.plugin(KnowledgeService, { snapshotDir: root, watchDebounceMs: 20 });
    try {
      expect(ctx.knowledge.version).toEqual({ collectionHash: hashV1, revision: 1, count: 1 });
      expect(ctx.knowledge.get('beta')).toBeNull();

      // 模拟发布新文章并原子切换 active.json，带互引 [[alpha]]
      const hashV2 = writeSnapshot(root, [
        makeSource('alpha', '初始文章', '第一版正文'),
        makeSource('beta', '增量新文章', '引用 [[alpha]] 的新正文'),
      ]);

      const ev = await waitFor(() => updates.find((u) => u.collectionHash === hashV2));
      expect(ev).toEqual({ collectionHash: hashV2, count: 2, revision: 2 });
      expect(ctx.knowledge.get('beta')?.title).toBe('增量新文章');
      expect(ctx.knowledge.search('增量新文章').map((h) => h.slug)).toEqual(['beta']);
      expect(ctx.knowledge.neighbors('beta')?.nodes.some((n) => n.slug === 'alpha')).toBe(true);
    } finally {
      await fiber.dispose();
    }
  });

  it('运行期 active.json 损坏时保留上一份已核验快照并广播 reload-failed，修复后自动恢复', async () => {
    const root = makeTempDir('walker-agent-corrupt-');
    const hashV1 = writeSnapshot(root, [makeSource('alpha', '稳健基线')]);

    const ctx = new Context();
    const failures: string[] = [];
    const updates: string[] = [];
    ctx.on('knowledge/reload-failed', (ev) => failures.push(ev.reason));
    ctx.on('knowledge/updated', (ev) => updates.push(ev.collectionHash ?? ''));

    const fiber = await ctx.plugin(KnowledgeService, { snapshotDir: root, watchDebounceMs: 20 });
    try {
      writeFileSync(path.join(root, 'active.json'), '{ corrupted-json');
      await waitFor(() => failures.length > 0);

      // 旧基线不受污染，继续服务查询
      expect(ctx.knowledge.version.collectionHash).toBe(hashV1);
      expect(ctx.knowledge.get('alpha')?.title).toBe('稳健基线');

      // 恢复有效新快照后自动切过去
      const hashV2 = writeSnapshot(root, [makeSource('alpha', '稳健基线'), makeSource('gamma', '恢复后新文')]);
      await waitFor(() => updates.includes(hashV2));
      expect(ctx.knowledge.get('gamma')?.title).toBe('恢复后新文');
    } finally {
      await fiber.dispose();
    }
  });

  it('上游 KnowledgeService 撤离与重挂时，下游 inject 插件自动卸载与恢复、零异常、消费者零改代码', async () => {
    const root = makeTempDir('walker-agent-dep-');
    writeSnapshot(root, [makeSource('alpha', '初始文章')]);

    const ctx = new Context();
    let mounted = 0;
    let disposed = 0;
    let observedUpdates = 0;

    // 模拟消费者插件：只依赖 knowledge，不关心其内部刷新实现
    const consumerFiber = await ctx.plugin((c) => {
      c.inject(['knowledge'], (ictx) => {
        mounted += 1;
        ictx.on('knowledge/updated', () => {
          observedUpdates += 1;
        });
        ictx.effect(() => () => {
          disposed += 1;
        });
      });
    });

    expect(mounted).toBe(0);
    const k1 = await ctx.plugin(KnowledgeService, { snapshotDir: root, watchDebounceMs: 20 });
    await waitFor(() => mounted === 1);
    expect(disposed).toBe(0);

    // 撤离上游 → 下游自动清理，事件监听器归零
    await k1.dispose();
    await waitFor(() => disposed === 1);
    expect(ctx.events._hooks['knowledge/updated']?.length ?? 0).toBe(0);

    // 重新挂载上游 → 下游自动恢复并重新接通事件
    const k2 = await ctx.plugin(KnowledgeService, { snapshotDir: root, watchDebounceMs: 20 });
    await waitFor(() => mounted === 2);
    writeSnapshot(root, [makeSource('alpha', '初始文章'), makeSource('delta', '重挂后新文')]);
    await waitFor(() => observedUpdates === 1);

    await k2.dispose();
    await consumerFiber.dispose();
    expect(disposed).toBe(2);
    expect(ctx.events._hooks['knowledge/updated']?.length ?? 0).toBe(0);
  });

  it('P6 属性验收：挂载/卸载 20 轮后，fs.watch 句柄与事件监听器全部归零无泄漏', async () => {
    const root = makeTempDir('walker-agent-leak-');
    writeSnapshot(root, [makeSource('alpha', '零泄漏基线')]);

    let openedWatchers = 0;
    let closedWatchers = 0;
    const realWatch = fs.watch;
    vi.spyOn(fs, 'watch').mockImplementation(((...args: Parameters<typeof fs.watch>) => {
      openedWatchers += 1;
      const watcher = realWatch(...args);
      const origClose = watcher.close.bind(watcher);
      watcher.close = () => {
        closedWatchers += 1;
        return origClose();
      };
      return watcher;
    }) as typeof fs.watch);

    const ctx = new Context();
    const baselineHooks = Object.values(ctx.events._hooks).reduce((n, list) => n + list.length, 0);

    for (let i = 0; i < 20; i++) {
      const kFiber = await ctx.plugin(KnowledgeService, { snapshotDir: root, watchDebounceMs: 20 });
      const subFiber = await ctx.plugin((c) => {
        c.inject(['knowledge'], (ictx) => {
          ictx.on('knowledge/updated', () => {});
        });
      });
      await subFiber.dispose();
      await kFiber.dispose();
    }

    const finalHooks = Object.values(ctx.events._hooks).reduce((n, list) => n + list.length, 0);
    expect(openedWatchers).toBe(20);
    expect(closedWatchers).toBe(20);
    expect(ctx.events._hooks['knowledge/updated']?.length ?? 0).toBe(0);
    expect(finalHooks).toBe(baselineHooks);
  });
});
