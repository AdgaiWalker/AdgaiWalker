import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupDraftsToBranch,
  publishSingleArticle,
  syncFromRemote,
} from './git-content-plumbing';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true });
  return stdout.trim();
}

function postMd(title: string, body: string, slug = 'post'): string {
  return `---\ntitle: "${title}"\ndate: 2026-11-23\nupdated: 2026-11-23\ntype: knowledge\nsummary: "${slug} summary"\npublished: true\n---\n\n${body}\n`;
}

describe('GitContentPlumbing（真实 bare repo + 双克隆 5 类对抗场景）', () => {
  let tmpRoot: string;
  let bareDir: string;
  let macClone: string;
  let serverClone: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-dual-clone-'));
    bareDir = path.join(tmpRoot, 'origin.git');
    macClone = path.join(tmpRoot, 'mac-local');
    serverClone = path.join(tmpRoot, 'server-content-repo');

    await fs.mkdir(bareDir, { recursive: true });
    await git(bareDir, ['init', '--bare', '--initial-branch=main']);

    // 初始化 Mac 本地克隆并推送基线提交
    await git(tmpRoot, ['clone', bareDir, macClone]);
    await git(macClone, ['config', 'user.name', 'Mac Author']);
    await git(macClone, ['config', 'user.email', 'mac@example.com']);
    await git(macClone, ['config', 'core.autocrlf', 'false']);
    await fs.mkdir(path.join(macClone, 'content/log'), { recursive: true });
    await fs.mkdir(path.join(macClone, 'apps/api'), { recursive: true });
    await fs.writeFile(path.join(macClone, 'content/log/post-a.md'), postMd('A v1', 'Alpha v1', 'post-a'), 'utf8');
    await fs.writeFile(path.join(macClone, 'content/log/post-b.md'), postMd('B v1', 'Beta v1', 'post-b'), 'utf8');
    await fs.writeFile(path.join(macClone, 'apps/api/code.ts'), 'export const v = 1;\n', 'utf8');
    await fs.writeFile(path.join(macClone, 'README.md'), '# root v1\n', 'utf8');
    await git(macClone, ['add', '.']);
    await git(macClone, ['commit', '-m', 'init baseline']);
    await git(macClone, ['push', '-u', 'origin', 'main']);

    // 初始化服务器独立内容仓（模拟 Windows 盒子 sparse-checkout --no-cone 仅检出 /content/，不含根目录文件）
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

  it('场景 1 & 3：本地推了代码/根目录文档 + 改了 post-a 后，网页单篇发布 post-b 零冲突且原子写入版本历史', async () => {
    // Mac 本地推送代码 + 根目录文件 + post-a 改动
    await fs.writeFile(path.join(macClone, 'apps/api/code.ts'), 'export const v = 2;\n', 'utf8');
    await fs.writeFile(path.join(macClone, 'README.md'), '# root v2\n', 'utf8');
    await fs.writeFile(path.join(macClone, 'content/log/post-a.md'), postMd('A v2', 'Alpha from Mac', 'post-a'), 'utf8');
    await git(macClone, ['add', '.']);
    await git(macClone, ['commit', '-m', 'mac: code + post-a']);
    await git(macClone, ['push', 'origin', 'main']);

    // 服务器尚未拉取（behind=1），网页端修改 post-b（带 Windows CRLF）并直接发布
    const crlfBody = postMd('B v2', 'Beta from Web\nLine 2', 'post-b').replace(/\n/g, '\r\n');
    await fs.writeFile(path.join(serverClone, 'content/log/post-b.md'), crlfBody, 'utf8');

    const res = await publishSingleArticle({
      repoRoot: serverClone,
      slug: 'post-b',
      ext: '.md',
      rawContent: crlfBody,
      versionNote: '网页更新 B',
      releaseId: 'rel_test_1',
      publishedAt: '2026-11-23T06:00:00.000Z',
    });

    expect(res.ok).toBe(true);
    expect(res.commit).toMatch(/^[0-9a-f]{40}$/);

    // 校验 GitHub 远端提交严格只含 post-b 与 content/versions/post-b/*，绝不夹带代码、绝无 CRLF
    const changed = (await git(bareDir, ['diff-tree', '--no-commit-id', '--name-only', '-r', res.commit!]))
      .split('\n')
      .sort();
    expect(changed.some((p) => p === 'content/log/post-b.md')).toBe(true);
    expect(changed.some((p) => p === 'content/versions/post-b/index.json')).toBe(true);
    expect(changed.some((p) => p.startsWith('content/versions/blobs/'))).toBe(true);
    expect(changed.every((p) => p.startsWith('content/'))).toBe(true);

    const pushedBody = await git(bareDir, ['show', `${res.commit}:content/log/post-b.md`]);
    expect(pushedBody).not.toContain('\r');
    expect(pushedBody).toContain('Beta from Web');

    // 服务器工作区在发布后必须完全干净，且无 stash/rebase 残渣
    expect(await git(serverClone, ['status', '--porcelain'])).toBe('');
    expect(await git(serverClone, ['stash', 'list'])).toBe('');

    // Mac 侧拉取后同时拥有 Mac 的代码、post-a v2 与网页的 post-b v2 + version index
    await git(macClone, ['pull', '--ff-only', 'origin', 'main']);
    expect(await fs.readFile(path.join(macClone, 'content/log/post-a.md'), 'utf8')).toContain('Alpha from Mac');
    expect(await fs.readFile(path.join(macClone, 'content/log/post-b.md'), 'utf8')).toContain('Beta from Web');
    expect(await fs.readFile(path.join(macClone, 'content/versions/post-b/index.json'), 'utf8')).toContain('网页更新 B');
  });

  it('场景 4：网页存在多篇未完成草稿时，单篇发布只推目标篇，其余草稿完好保留且不泄露到 GitHub', async () => {
    await fs.writeFile(path.join(serverClone, 'content/log/draft-1.md'), postMd('Draft 1', 'WIP 1', 'draft-1'), 'utf8');
    await fs.writeFile(path.join(serverClone, 'content/log/draft-2.md'), postMd('Draft 2', 'WIP 2', 'draft-2'), 'utf8');
    const ready = postMd('Ready Post', 'Ready content', 'ready-post');
    await fs.writeFile(path.join(serverClone, 'content/log/ready-post.md'), ready, 'utf8');

    const res = await publishSingleArticle({
      repoRoot: serverClone,
      slug: 'ready-post',
      ext: '.md',
      rawContent: ready,
      versionNote: '首版发布',
      releaseId: 'rel_multi_draft',
      publishedAt: '2026-11-23T06:10:00.000Z',
    });

    expect(res.ok).toBe(true);
    const committedFiles = (await git(bareDir, ['ls-tree', '-r', '--name-only', res.commit!])).split('\n');
    expect(committedFiles).toContain('content/log/ready-post.md');
    expect(committedFiles).not.toContain('content/log/draft-1.md');
    expect(committedFiles).not.toContain('content/log/draft-2.md');

    // 本地未完成草稿必须原封不动留在磁盘
    expect(await fs.readFile(path.join(serverClone, 'content/log/draft-1.md'), 'utf8')).toContain('WIP 1');
    expect(await fs.readFile(path.join(serverClone, 'content/log/draft-2.md'), 'utf8')).toContain('WIP 2');

    // 且草稿可以独立备份到 drafts 分支，不污染 main
    const backup = await backupDraftsToBranch({ repoRoot: serverClone });
    expect(backup.ok).toBe(true);
    expect(backup.branch).toBe('drafts');
    expect(backup.backedUpFiles.sort()).toEqual(['content/log/draft-1.md', 'content/log/draft-2.md']);
    const draftTree = (await git(bareDir, ['ls-tree', '-r', '--name-only', 'refs/heads/drafts'])).split('\n');
    expect(draftTree).toContain('content/log/draft-1.md');
    expect(draftTree).toContain('content/log/draft-2.md');
    const mainTree = (await git(bareDir, ['ls-tree', '-r', '--name-only', 'refs/heads/main'])).split('\n');
    expect(mainTree).not.toContain('content/log/draft-1.md');
  });

  it('场景 2：双端同时修改同一篇文章时，发布与拉取都显式报同篇冲突、绝不静默覆盖或留 stash', async () => {
    // Mac 修改 post-a 并推送
    await fs.writeFile(path.join(macClone, 'content/log/post-a.md'), postMd('A Mac', 'Mac edit', 'post-a'), 'utf8');
    await fs.writeFile(path.join(macClone, 'content/log/post-c.md'), postMd('C Mac', 'New post C', 'post-c'), 'utf8');
    await git(macClone, ['add', '.']);
    await git(macClone, ['commit', '-m', 'mac: edit post-a + add post-c']);
    await git(macClone, ['push', 'origin', 'main']);

    // 网页端未拉取也改了同一篇 post-a
    const webEdit = postMd('A Web', 'Web edit', 'post-a');
    await fs.writeFile(path.join(serverClone, 'content/log/post-a.md'), webEdit, 'utf8');

    // 1) 尝试直接发布 post-a 必须拒绝并标明冲突（不覆盖 Mac 版本）
    const pub = await publishSingleArticle({
      repoRoot: serverClone,
      slug: 'post-a',
      ext: '.md',
      rawContent: webEdit,
      versionNote: '尝试冲突发布',
      releaseId: 'rel_conflict',
      publishedAt: '2026-11-23T06:20:00.000Z',
    });
    expect(pub.ok).toBe(false);
    expect(pub.conflict).toBe(true);
    expect(await git(bareDir, ['show', 'refs/heads/main:content/log/post-a.md'])).toContain('Mac edit');

    // 2) 3-way 拉取：无冲突的 post-c 必须正常同步落盘，冲突的 post-a 保留本地草稿并显式返回 conflicts
    const pull = await syncFromRemote({ repoRoot: serverClone });
    expect(pull.ok).toBe(false);
    expect(pull.conflicts?.map((c) => c.slug)).toEqual(['post-a']);
    expect(await fs.readFile(path.join(serverClone, 'content/log/post-a.md'), 'utf8')).toContain('Web edit');
    expect(await fs.readFile(path.join(serverClone, 'content/log/post-c.md'), 'utf8')).toContain('New post C');
    expect(await git(serverClone, ['stash', 'list'])).toBe('');
  });

  it('场景 5：远端不可达/推送失败时，不污染工作区与版本库，恢复后幂等重试成功', async () => {
    const ready = postMd('Offline Post', 'Retry me', 'offline-post');
    await fs.writeFile(path.join(serverClone, 'content/log/offline-post.md'), ready, 'utf8');

    // 指向不存在的远端模拟断网
    const fail = await publishSingleArticle({
      repoRoot: serverClone,
      remote: 'missing-remote',
      slug: 'offline-post',
      ext: '.md',
      rawContent: ready,
      versionNote: '断网演练',
      releaseId: 'rel_offline',
      publishedAt: '2026-11-23T06:30:00.000Z',
    });
    expect(fail.ok).toBe(false);
    expect(fail.conflict).not.toBe(true);
    // content/versions 绝不被提前写入脏文件
    await expect(fs.access(path.join(serverClone, 'content/versions/offline-post/index.json'))).rejects.toThrow();

    // 网络恢复后重试：幂等成功
    const ok = await publishSingleArticle({
      repoRoot: serverClone,
      slug: 'offline-post',
      ext: '.md',
      rawContent: ready,
      versionNote: '断网恢复后发布',
      releaseId: 'rel_offline_retry',
      publishedAt: '2026-11-23T06:31:00.000Z',
    });
    expect(ok.ok).toBe(true);
    expect(await git(serverClone, ['status', '--porcelain'])).toBe('');
  });
});
