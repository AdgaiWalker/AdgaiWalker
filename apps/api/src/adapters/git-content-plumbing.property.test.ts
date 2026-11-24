import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteSingleArticle,
  discardLocalDraft,
  isTrackedInHead,
  publishSingleArticle,
  syncFromRemote,
} from './git-content-plumbing';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

function makeDoc(slug: string, seq: number, author: 'mac' | 'admin'): string {
  return `---\ntitle: "${slug}-${seq}-${author}"\ndate: 2026-11-24\nupdated: 2026-11-24\ntype: wise\nsummary: "${slug} summary ${seq} by ${author}"\nvisibility: public\n---\n\nbody ${seq} from ${author}\n`;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('GitContentPlumbing（Bare-Repo 随机状态机属性测试与对称删除不变量 I2/I3/I4/I6）', () => {
  let tmpRoot: string;
  let bareDir: string;
  let macClone: string;
  let serverClone: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-plumbing-prop-'));
    bareDir = path.join(tmpRoot, 'origin.git');
    macClone = path.join(tmpRoot, 'mac');
    serverClone = path.join(tmpRoot, 'server');

    await fs.mkdir(bareDir, { recursive: true });
    await git(bareDir, ['init', '--bare', '--initial-branch=main']);

    await git(tmpRoot, ['clone', bareDir, macClone]);
    await git(macClone, ['config', 'user.name', 'Mac']);
    await git(macClone, ['config', 'user.email', 'mac@example.com']);
    await git(macClone, ['config', 'core.autocrlf', 'false']);
    await fs.mkdir(path.join(macClone, 'content/log'), { recursive: true });
    await fs.writeFile(path.join(macClone, 'content/log/slug-0.md'), makeDoc('slug-0', 1, 'mac'), 'utf8');
    await git(macClone, ['add', '.']);
    await git(macClone, ['commit', '-m', 'init']);
    await git(macClone, ['push', '-u', 'origin', 'main']);

    await git(tmpRoot, ['clone', '--no-checkout', bareDir, serverClone]);
    await git(serverClone, ['sparse-checkout', 'init', '--no-cone']);
    await git(serverClone, ['sparse-checkout', 'set', '/content/']);
    await git(serverClone, ['checkout', 'main']);
    await git(serverClone, ['config', 'user.name', 'Walker Publisher']);
    await git(serverClone, ['config', 'user.email', 'walker@iwalk.pro']);
    await git(serverClone, ['config', 'core.autocrlf', 'false']);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('并发推送导致 non-fast-forward 时 deleteSingleArticle 自动重试成功且保留双方提交', async () => {
    // 1. 先让 server 发布 slug-1，建立 content/versions/slug-1 历史
    const doc1 = makeDoc('slug-1', 1, 'admin');
    await fs.writeFile(path.join(serverClone, 'content/log/slug-1.md'), doc1, 'utf8');
    const pub1 = await publishSingleArticle({
      repoRoot: serverClone,
      slug: 'slug-1',
      ext: '.md',
      rawContent: doc1,
      versionNote: '首发 v1',
      releaseId: 'rel_prop_pub1',
      publishedAt: '2026-11-24T00:00:00.000Z',
    });
    expect(pub1.ok).toBe(true);
    expect(await isTrackedInHead(serverClone, 'slug-1', '.md')).toBe(true);

    // 2. Mac 拉取最新后修改 unrelated 文章 slug-0 并推送（使远端领先 serverClone）
    await git(macClone, ['pull', '--ff-only', 'origin', 'main']);
    await fs.writeFile(path.join(macClone, 'content/log/slug-0.md'), makeDoc('slug-0', 2, 'mac'), 'utf8');
    await git(macClone, ['add', '.']);
    await git(macClone, ['commit', '-m', 'mac: update slug-0']);
    await git(macClone, ['push', 'origin', 'main']);

    // 3. 删除本地存在的另一篇未跟踪草稿 → scope=local-draft 且不产生 commit
    await fs.writeFile(path.join(serverClone, 'content/log/local-only.md'), makeDoc('local-only', 1, 'admin'), 'utf8');
    const delDraft = await deleteSingleArticle({ repoRoot: serverClone, slug: 'local-only', ext: '.md' });
    expect(delDraft).toEqual({ ok: true, scope: 'local-draft' });

    // 4. Server 对齐删除 slug-1（远端 slug-0 先行前进，slug-1 无同篇冲突）→ 成功并保留 content/versions/slug-1（I4）
    const delRemote = await deleteSingleArticle({ repoRoot: serverClone, slug: 'slug-1', ext: '.md' });
    expect(delRemote.ok).toBe(true);
    expect(delRemote.scope).toBe('remote');
    expect(delRemote.commit).toMatch(/^[0-9a-f]{40}$/);

    const mainFiles = (await git(bareDir, ['ls-tree', '-r', '--name-only', 'refs/heads/main'])).split('\n');
    expect(mainFiles).not.toContain('content/log/slug-1.md');
    expect(mainFiles).toContain('content/versions/slug-1/index.json');
    expect(mainFiles).toContain('content/log/slug-0.md');
    expect(await git(bareDir, ['show', 'refs/heads/main:content/log/slug-0.md'])).toContain('mac');

    // 5. 再次 syncFromRemote 绝不复活 slug-1（I3）
    const syncRes = await syncFromRemote({ repoRoot: serverClone });
    expect(syncRes.ok).toBe(true);
    await expect(fs.access(path.join(serverClone, 'content/log/slug-1.md'))).rejects.toThrow();
  });

  it('远端先行修改同篇时 deleteSingleArticle 拒绝覆盖（I2）且保持工作区索引干净（I6），discardLocalDraft 可还原', async () => {
    // 1. Server 本地先改写 slug-0（但未发布）
    await fs.writeFile(path.join(serverClone, 'content/log/slug-0.md'), makeDoc('slug-0', 99, 'admin'), 'utf8');

    // 2. 测试 discardLocalDraft 能把未发布草稿还原成 HEAD 基线
    const disc = await discardLocalDraft({ repoRoot: serverClone, slug: 'slug-0', ext: '.md' });
    expect(disc.ok).toBe(true);
    expect(disc.restoredRaw).toContain('slug-0-1-mac');
    expect(await fs.readFile(path.join(serverClone, 'content/log/slug-0.md'), 'utf8')).toContain('slug-0-1-mac');

    // 3. Mac 修改并推送 slug-0，此时 Server 若未经拉取直接删除 slug-0 必须冲突拒绝
    await fs.writeFile(path.join(macClone, 'content/log/slug-0.md'), makeDoc('slug-0', 3, 'mac'), 'utf8');
    await git(macClone, ['add', '.']);
    await git(macClone, ['commit', '-m', 'mac edit slug-0']);
    await git(macClone, ['push', 'origin', 'main']);

    const delConflict = await deleteSingleArticle({ repoRoot: serverClone, slug: 'slug-0', ext: '.md' });
    expect(delConflict.ok).toBe(false);
    expect(delConflict.conflict).toBe(true);
    expect(delConflict.remoteContent).toContain('slug-0-3-mac');

    // 远端未被误删，且 server 暂存区无脏指数（I6）
    expect(await git(bareDir, ['show', 'refs/heads/main:content/log/slug-0.md'])).toContain('slug-0-3-mac');
    expect(await git(serverClone, ['diff', '--cached', '--name-only'])).toBe('');
  });

  it('确定性伪随机 84 步双端交错演练：不丢版本历史(I4)、不复活已删(I3)、不静默覆盖(I2)、索引恒净(I6)', async () => {
    const rand = lcg(20261124);
    const slugs = ['slug-0', 'slug-1', 'slug-2', 'slug-3', 'slug-4', 'slug-5'];
    const everPublished = new Set<string>();
    let seq = 10;

    for (let step = 0; step < 84; step++) {
      seq += 1;
      const slug = slugs[Math.floor(rand() * slugs.length)]!;
      const op = Math.floor(rand() * 6);
      const macFile = path.join(macClone, 'content/log', `${slug}.md`);
      const srvFile = path.join(serverClone, 'content/log', `${slug}.md`);

      if (op === 0) {
        // Mac 侧同步后编辑或新增某篇并推远端
        await git(macClone, ['pull', '--ff-only', 'origin', 'main']);
        await fs.mkdir(path.dirname(macFile), { recursive: true });
        await fs.writeFile(macFile, makeDoc(slug, seq, 'mac'), 'utf8');
        await git(macClone, ['add', '.']);
        const diff = await git(macClone, ['status', '--porcelain']);
        if (diff) {
          await git(macClone, ['commit', '-m', `mac step ${step} ${slug}`]);
          await git(macClone, ['push', 'origin', 'main']);
        }
      } else if (op === 1) {
        // Mac 侧删除某篇并推远端
        await git(macClone, ['pull', '--ff-only', 'origin', 'main']);
        const exists = await fs.access(macFile).then(() => true, () => false);
        if (exists) {
          await fs.rm(macFile, { force: true });
          await git(macClone, ['add', '-A']);
          await git(macClone, ['commit', '-m', `mac rm ${slug}`]);
          await git(macClone, ['push', 'origin', 'main']);
        }
      } else if (op === 2) {
        // Admin 保存本地草稿并单篇发布
        const raw = makeDoc(slug, seq, 'admin');
        await fs.mkdir(path.dirname(srvFile), { recursive: true });
        await fs.writeFile(srvFile, raw, 'utf8');
        const beforeRemoteBlob = await git(bareDir, ['rev-parse', `refs/heads/main:content/log/${slug}.md`]).catch(() => null);
        const res = await publishSingleArticle({
          repoRoot: serverClone,
          slug,
          ext: '.md',
          rawContent: raw,
          versionNote: `step-${step}`,
          releaseId: `rel_fuzz_${step}`,
          publishedAt: `2026-11-24T01:${String(step % 60).padStart(2, '0')}:00.000Z`,
        });
        if (res.ok) {
          everPublished.add(slug);
          expect(await git(serverClone, ['diff', '--cached', '--name-only'])).toBe('');
        } else {
          // 若拒绝必因同篇冲突，且远端文章字节不被静默改写 (I2)
          expect(res.conflict).toBe(true);
          const afterRemoteBlob = await git(bareDir, ['rev-parse', `refs/heads/main:content/log/${slug}.md`]).catch(() => null);
          expect(afterRemoteBlob).toBe(beforeRemoteBlob);
        }
      } else if (op === 3) {
        // Admin 删除文章（可能仅删本地草稿，也可能推远端下架）
        const beforeRemoteBlob = await git(bareDir, ['rev-parse', `refs/heads/main:content/log/${slug}.md`]).catch(() => null);
        const del = await deleteSingleArticle({ repoRoot: serverClone, slug, ext: '.md' });
        if (del.ok) {
          await expect(fs.access(srvFile)).rejects.toThrow();
        } else {
          expect(del.conflict).toBe(true);
          const afterRemoteBlob = await git(bareDir, ['rev-parse', `refs/heads/main:content/log/${slug}.md`]).catch(() => null);
          expect(afterRemoteBlob).toBe(beforeRemoteBlob);
        }
      } else if (op === 4) {
        // Admin 放弃本地修改恢复 HEAD（若在 HEAD 中存在）
        const tracked = await isTrackedInHead(serverClone, slug, '.md');
        const disc = await discardLocalDraft({ repoRoot: serverClone, slug, ext: '.md' });
        expect(disc.ok).toBe(tracked);
      } else {
        // Admin 从远端安全 3-way 拉取
        const pull = await syncFromRemote({ repoRoot: serverClone });
        if (!pull.ok) {
          expect(pull.conflicts && pull.conflicts.length > 0).toBe(true);
        }
      }

      // 每步全局不变量 I4 + I6：所有曾通过 publishSingleArticle 发布的文章版本索引恒在远端 main 上；暂存区恒净
      const bareFiles = new Set((await git(bareDir, ['ls-tree', '-r', '--name-only', 'refs/heads/main'])).split('\n'));
      for (const pubSlug of everPublished) {
        expect(bareFiles.has(`content/versions/${pubSlug}/index.json`)).toBe(true);
      }
      expect(await git(serverClone, ['diff', '--cached', '--name-only'])).toBe('');
      expect(await git(serverClone, ['stash', 'list'])).toBe('');
    }
  }, 60_000);
});
