/**
 * 文件「创建时间」——知识图谱 Animate 的排序依据（PRD §3.3）。
 *
 * Obsidian 的 Animate 按笔记**创建时间**播放；本站 frontmatter 只有 date（发布时间），
 * 没有创建时间。忠实做法是取该文件在 Git 中**首次出现**的时间，零内容改动、不编造数据。
 * 已知局限（PRD §8-D9）：重命名过的文件拿到的是改名时间而非原始创建时间；非 Git 环境回落 date。
 *
 * 代码图谱（PRD-CODE-GRAPH）用的是同一份事实，只是键是**仓库根相对路径**、
 * 覆盖多个目录 —— 见 `loadRepoCreatedDates`。
 */
import { execFileSync } from 'node:child_process';
import { repoRoot } from './paths';

/**
 * 跑一次 `git log --reverse --name-only`，返回原始输出；非 Git 环境返回 null。
 * `--reverse` 保证从最旧开始，于是「首次出现」就是首次提交。
 */
function gitLogNames(dirs: readonly string[]): string | null {
  if (dirs.length === 0) return null;
  try {
    return execFileSync(
      'git',
      [
        '-c',
        'core.quotepath=false',
        'log',
        '--reverse',
        '--format=@@%aI',
        '--name-only',
        '--',
        ...dirs,
      ],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch {
    /* 非 Git 环境（产物目录、打包机）→ 调用方回落 */
    return null;
  }
}

/** 解析上面的输出：`@@<ISO>` 开头的行是时间戳，其余行是文件名 */
function firstSeenDates(output: string, stripPrefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  let timestamp = '';
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim().replace(/^"|"$/g, '');
    if (!line) continue;
    if (line.startsWith('@@')) {
      timestamp = line.slice(2).trim();
      continue;
    }
    const name =
      stripPrefix && line.startsWith(stripPrefix) ? line.slice(stripPrefix.length) : line;
    if (!name || !timestamp || result.has(name)) continue;
    result.set(name, timestamp);
  }
  return result;
}

/** 返回 <content/log 下的文件名> → ISO 时间；取不到或非 Git 环境返回空表 */
export function loadContentCreatedDates(
  contentRelativeDir = 'content/log',
): Map<string, string> {
  const output = gitLogNames([contentRelativeDir]);
  return output === null ? new Map() : firstSeenDates(output, `${contentRelativeDir}/`);
}

/**
 * 返回 <仓库根相对路径> → ISO 时间（如 `apps/web/src/App.tsx`）。
 * 代码图谱的扫描根有多个（apps/* / packages/* / scripts），故一次 git log 全取，
 * 而不是每个根跑一次再拼路径。
 */
export function loadRepoCreatedDates(dirs: readonly string[]): Map<string, string> {
  const output = gitLogNames(dirs);
  return output === null ? new Map() : firstSeenDates(output);
}
