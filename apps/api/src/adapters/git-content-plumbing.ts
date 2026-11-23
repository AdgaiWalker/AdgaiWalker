/**
 * 无工作树 Git 内容通道（Gate 1）：单篇原子发布 + 3-way 安全拉取 + drafts 草稿备份。
 * 全程 execFile/spawn 无 shell；不碰工作区 .git/index；推送失败零磁盘污染。
 */
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  appendArticleVersion,
  isArticleVersionIndex,
  requireVersionNote,
  type ArticleVersionIndex,
  type ContentDraftBackupResult,
  type ContentSyncConflictDetail,
  type ContentSyncPullResult,
} from '@walker/shared';

const execFileAsync = promisify(execFile);
const TEXT_RE = /\.(md|mdx|json|txt|yml|yaml)$/i;
const normalizeLf = (s: string) => s.replace(/\r\n?/g, '\n');
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const gitBlobSha1 = (b: Buffer) => createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const textBytes = (relPath: string, raw: Buffer) =>
  TEXT_RE.test(relPath) ? Buffer.from(normalizeLf(raw.toString('utf8')), 'utf8') : raw;

export interface PublishSingleArticleInput {
  repoRoot: string;
  slug: string;
  ext: '.md' | '.mdx';
  rawContent: string;
  versionNote: string;
  releaseId: string;
  publishedAt?: string;
  remote?: string;
  branch?: string;
}

export interface PublishSingleArticleResult {
  ok: boolean;
  commit?: string;
  conflict?: boolean;
  remoteContent?: string;
  error?: string;
  noop?: boolean;
}

async function gitExec(cwd: string, args: string[], opts?: { env?: NodeJS.ProcessEnv; timeout?: number }): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: opts?.env ?? process.env,
    timeout: opts?.timeout ?? 30_000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

async function gitTry(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await gitExec(cwd, args)).trim();
  } catch {
    return null;
  }
}

function gitSpawnBuf(cwd: string, args: string[], stdin?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks: Buffer[] = [];
    let err = '';
    child.stdout!.on('data', (c: Buffer) => chunks.push(c));
    child.stderr!.on('data', (c: Buffer) => { err += c.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err.trim() || `git ${args[0]} failed (${code})`))));
    if (stdin) child.stdin!.end(stdin);
  });
}

async function atomicWrite(absPath: string, data: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, absPath);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

async function localBlobSha(absPath: string, relPath: string): Promise<string | null> {
  try {
    return gitBlobSha1(textBytes(relPath, await fs.readFile(absPath)));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function commitFilesOntoTree(
  repoRoot: string,
  baseCommit: string | null,
  files: Array<{ relPath: string; content: Buffer }>,
  message: string,
): Promise<{ commit: string; noop: boolean }> {
  const tmpIndex = path.join(os.tmpdir(), `walker-git-idx-${randomUUID()}`);
  const name = (await gitTry(repoRoot, ['config', 'user.name'])) || 'Walker Publisher';
  const email = (await gitTry(repoRoot, ['config', 'user.email'])) || 'walker@iwalk.pro';
  const env = { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_INDEX_FILE: tmpIndex };
  try {
    if (baseCommit) await gitExec(repoRoot, ['read-tree', baseCommit], { env });
    for (const f of files) {
      const blob = (await gitSpawnBuf(repoRoot, ['hash-object', '-w', '--stdin'], f.content)).toString('utf8').trim();
      await gitExec(repoRoot, ['update-index', '--add', '--cacheinfo', `100644,${blob},${f.relPath}`], { env });
    }
    const tree = (await gitExec(repoRoot, ['write-tree'], { env })).trim();
    if (baseCommit && (await gitTry(repoRoot, ['rev-parse', `${baseCommit}^{tree}`])) === tree) {
      return { commit: baseCommit, noop: true };
    }
    const args = baseCommit ? ['commit-tree', tree, '-p', baseCommit, '-m', message] : ['commit-tree', tree, '-m', message];
    return { commit: (await gitExec(repoRoot, args, { env })).trim(), noop: false };
  } finally {
    await fs.rm(tmpIndex, { force: true }).catch(() => undefined);
  }
}

async function applyThreeWayContentSync(
  repoRoot: string,
  baseCommit: string,
  targetCommit: string,
  skip?: ReadonlySet<string>,
): Promise<{ updatedFiles: string[]; conflicts: ContentSyncConflictDetail[] }> {
  const tokens = (await gitExec(repoRoot, ['diff', '--name-status', '-z', `${baseCommit}..${targetCommit}`, '--', 'content'])).split('\0').filter(Boolean);
  const updatedFiles: string[] = [];
  const conflicts: ContentSyncConflictDetail[] = [];

  for (let i = 0; i < tokens.length; i += 2) {
    const st = tokens[i] ?? '';
    let rel = tokens[i + 1] ?? '';
    if (st.startsWith('R') || st.startsWith('C')) { rel = tokens[i + 2] ?? rel; i += 1; }
    if (!rel || skip?.has(rel)) continue;

    const abs = path.join(repoRoot, rel);
    const baseBlob = await gitTry(repoRoot, ['rev-parse', `${baseCommit}:${rel}`]);
    const remoteBlob = await gitTry(repoRoot, ['rev-parse', `${targetCommit}:${rel}`]);
    const localBlob = await localBlobSha(abs, rel);
    if (localBlob === remoteBlob) continue;

    if (localBlob === baseBlob) {
      if (remoteBlob === null) await fs.rm(abs, { force: true });
      else await atomicWrite(abs, textBytes(rel, await gitSpawnBuf(repoRoot, ['cat-file', 'blob', remoteBlob])));
      updatedFiles.push(path.basename(rel));
    } else {
      conflicts.push({ slug: path.basename(rel).replace(/\.(md|mdx)$/i, ''), path: rel, localHash: localBlob ?? '', remoteHash: remoteBlob ?? '' });
    }
  }
  return { updatedFiles, conflicts };
}

export async function publishSingleArticle(input: PublishSingleArticleInput): Promise<PublishSingleArticleResult> {
  const remote = input.remote ?? 'origin';
  const branch = input.branch ?? 'main';
  const targetRel = `content/log/${input.slug}${input.ext}`;
  const normRaw = normalizeLf(input.rawContent);
  const targetBytes = Buffer.from(normRaw, 'utf8');
  const localTargetBlob = gitBlobSha1(targetBytes);
  const note = requireVersionNote(input.versionNote);
  const publishedAt = input.publishedAt ?? new Date().toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await gitExec(input.repoRoot, ['fetch', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`], { timeout: 20_000 });
    } catch (e) {
      return { ok: false, error: `fetch 失败：${e instanceof Error ? e.message : String(e)}` };
    }
    const remoteTip = await gitTry(input.repoRoot, ['rev-parse', `${remote}/${branch}`]);
    if (!remoteTip) return { ok: false, error: `找不到远端分支 ${remote}/${branch}` };
    const localHead = await gitTry(input.repoRoot, ['rev-parse', 'HEAD']);

    const baseBlob = localHead ? await gitTry(input.repoRoot, ['rev-parse', `${localHead}:${targetRel}`]) : null;
    const remoteBlob = await gitTry(input.repoRoot, ['rev-parse', `${remoteTip}:${targetRel}`]);
    if (remoteBlob !== null && remoteBlob !== baseBlob && remoteBlob !== localTargetBlob) {
      const remoteContent = normalizeLf((await gitSpawnBuf(input.repoRoot, ['cat-file', 'blob', remoteBlob])).toString('utf8'));
      return { ok: false, conflict: true, remoteContent, error: `远端已修改 ${targetRel}，请先同步核对后再发布（未覆盖远端版本）` };
    }

    const idxRel = `content/versions/${input.slug}/index.json`;
    let existingIdx: ArticleVersionIndex = { slug: input.slug, versions: [] };
    const remoteIdxBlob = await gitTry(input.repoRoot, ['rev-parse', `${remoteTip}:${idxRel}`]);
    if (remoteIdxBlob) {
      try {
        const parsed = JSON.parse((await gitSpawnBuf(input.repoRoot, ['cat-file', 'blob', remoteIdxBlob])).toString('utf8')) as unknown;
        if (isArticleVersionIndex(parsed)) existingIdx = parsed;
      } catch { /* fallback empty */ }
    }

    const contentHash = sha256(normRaw);
    const nextIdx = appendArticleVersion(existingIdx, { contentHash, note, publishedAt, releaseId: input.releaseId });
    const staged: Array<{ relPath: string; content: Buffer }> = [{ relPath: targetRel, content: targetBytes }];
    const blobRel = nextIdx ? `content/versions/blobs/${contentHash}.md` : null;
    const idxBytes = nextIdx ? Buffer.from(`${JSON.stringify(nextIdx, null, 2)}\n`, 'utf8') : null;
    if (blobRel && idxBytes) staged.push({ relPath: idxRel, content: idxBytes }, { relPath: blobRel, content: targetBytes });

    let built: { commit: string; noop: boolean };
    try {
      built = await commitFilesOntoTree(input.repoRoot, remoteTip, staged, `content: 发布 ${input.slug} (${note})`);
    } catch (e) {
      return { ok: false, error: `构造提交失败：${e instanceof Error ? e.message : String(e)}` };
    }

    if (!built.noop) {
      try {
        await gitExec(input.repoRoot, ['push', remote, `${built.commit}:refs/heads/${branch}`], { timeout: 30_000 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt === 0 && /non-fast-forward|fetch first|rejected/i.test(msg)) continue;
        return { ok: false, error: `推送失败：${msg}` };
      }
    }

    await gitExec(input.repoRoot, ['update-ref', `refs/remotes/${remote}/${branch}`, built.commit]);
    if (localHead && localHead !== remoteTip) {
      await applyThreeWayContentSync(input.repoRoot, localHead, remoteTip, new Set(staged.map((f) => f.relPath)));
    }
    await atomicWrite(path.join(input.repoRoot, targetRel), targetBytes);
    if (blobRel && idxBytes) {
      await atomicWrite(path.join(input.repoRoot, idxRel), idxBytes);
      await atomicWrite(path.join(input.repoRoot, blobRel), targetBytes);
    }
    await gitExec(input.repoRoot, ['reset', '--mixed', built.commit]);
    return { ok: true, commit: built.commit, noop: built.noop };
  }
  return { ok: false, error: '推送并发重试耗尽，请重试' };
}

export async function syncFromRemote(input: { repoRoot: string; remote?: string; branch?: string }): Promise<ContentSyncPullResult> {
  const remote = input.remote ?? 'origin';
  const branch = input.branch ?? 'main';
  try {
    await gitExec(input.repoRoot, ['fetch', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`], { timeout: 20_000 });
  } catch (e) {
    return { ok: false, pulledCommits: 0, incomingFiles: [], message: `无法连接 GitHub 拉取更新：${e instanceof Error ? e.message : String(e)}` };
  }
  const localHead = await gitTry(input.repoRoot, ['rev-parse', 'HEAD']);
  const remoteTip = await gitTry(input.repoRoot, ['rev-parse', `${remote}/${branch}`]);
  if (!localHead || !remoteTip) return { ok: false, pulledCommits: 0, incomingFiles: [], message: 'Git 分支引用不完整，无法同步' };
  if (localHead === remoteTip) return { ok: true, pulledCommits: 0, incomingFiles: [], message: '当前已是最新，无待拉取提交' };

  const ahead = parseInt((await gitTry(input.repoRoot, ['rev-list', '--count', `${remoteTip}..${localHead}`])) || '0', 10) || 0;
  if (ahead > 0) return { ok: false, pulledCommits: 0, incomingFiles: [], message: `本地存在 ${ahead} 个未推送提交，与远端分叉，拒绝自动覆盖` };

  const behind = parseInt((await gitTry(input.repoRoot, ['rev-list', '--count', `${localHead}..${remoteTip}`])) || '0', 10) || 0;
  const { updatedFiles, conflicts } = await applyThreeWayContentSync(input.repoRoot, localHead, remoteTip);
  await gitExec(input.repoRoot, ['reset', '--mixed', remoteTip]);

  if (conflicts.length > 0) {
    return {
      ok: false, pulledCommits: behind, incomingFiles: updatedFiles, conflicts,
      message: `已同步 ${updatedFiles.length} 篇无冲突更新；检测到 ${conflicts.length} 篇同篇冲突（${conflicts.map((c) => c.slug).join('、')}），已保留本地草稿`,
    };
  }
  const preview = updatedFiles.slice(0, 3).join('、') + (updatedFiles.length > 3 ? ` 等共 ${updatedFiles.length} 篇` : '');
  return {
    ok: true, pulledCommits: behind, incomingFiles: updatedFiles,
    message: updatedFiles.length > 0 ? `已成功从 GitHub 同步 ${behind} 个提交，更新：${preview}` : `已成功从 GitHub 同步 ${behind} 个提交`,
  };
}

export async function backupDraftsToBranch(input: {
  repoRoot: string;
  remote?: string;
  draftBranch?: string;
  mainBranch?: string;
}): Promise<ContentDraftBackupResult> {
  const remote = input.remote ?? 'origin';
  const draftBranch = input.draftBranch ?? 'drafts';
  const mainBranch = input.mainBranch ?? 'main';
  const records = (await gitExec(input.repoRoot, ['status', '--porcelain', '-z', '--', 'content/log'])).split('\0').filter(Boolean);
  const dirtyPaths: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const code = records[i]!.slice(0, 2);
    const rel = records[i]!.slice(3);
    if (code.startsWith('R') || code.startsWith('C')) i += 1;
    if (rel && !code.includes('D')) dirtyPaths.push(rel);
  }
  if (dirtyPaths.length === 0) {
    return { ok: true, branch: draftBranch, commit: null, backedUpFiles: [], message: '当前没有未发布的草稿需要备份' };
  }

  await gitTry(input.repoRoot, ['fetch', remote, `+refs/heads/${draftBranch}:refs/remotes/${remote}/${draftBranch}`]);
  const parent = (await gitTry(input.repoRoot, ['rev-parse', `${remote}/${draftBranch}`]))
    ?? (await gitTry(input.repoRoot, ['rev-parse', `${remote}/${mainBranch}`]))
    ?? (await gitTry(input.repoRoot, ['rev-parse', 'HEAD']));

  const files = await Promise.all(
    dirtyPaths.map(async (relPath) => ({ relPath, content: textBytes(relPath, await fs.readFile(path.join(input.repoRoot, relPath))) })),
  );
  try {
    const { commit, noop } = await commitFilesOntoTree(
      input.repoRoot, parent, files, `drafts: 备份 ${dirtyPaths.length} 篇草稿 (${new Date().toISOString().slice(0, 16)}Z)`,
    );
    if (!noop) {
      await gitExec(input.repoRoot, ['push', remote, `${commit}:refs/heads/${draftBranch}`], { timeout: 25_000 });
      await gitExec(input.repoRoot, ['update-ref', `refs/remotes/${remote}/${draftBranch}`, commit]);
    }
    return {
      ok: true, branch: draftBranch, commit, backedUpFiles: dirtyPaths,
      message: noop ? `草稿已在 ${draftBranch} 分支为最新备份` : `已将 ${dirtyPaths.length} 篇草稿备份到 GitHub ${draftBranch} 分支`,
    };
  } catch (e) {
    return { ok: false, branch: draftBranch, commit: null, backedUpFiles: [], message: `草稿备份失败：${e instanceof Error ? e.message : String(e)}` };
  }
}
