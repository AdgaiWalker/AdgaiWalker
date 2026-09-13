/**
 * 内容「创建时间」——知识图谱 Animate 的排序依据（PRD §3.3）。
 *
 * Obsidian 的 Animate 按笔记**创建时间**播放；本站 frontmatter 只有 date（发布时间），
 * 没有创建时间。忠实做法是取该文件在 Git 中**首次出现**的时间，零内容改动、不编造数据。
 * 已知局限（PRD §8-D9）：重命名过的文件拿到的是改名时间而非原始创建时间；非 Git 环境回落 date。
 */
import { execFileSync } from 'node:child_process';
import { repoRoot } from './paths';

/** 返回 <content/log 下的文件名> → ISO 时间；取不到或非 Git 环境返回空表 */
export function loadContentCreatedDates(
  contentRelativeDir = 'content/log',
): Map<string, string> {
  const result = new Map<string, string>();
  try {
    const output = execFileSync(
      'git',
      [
        '-c',
        'core.quotepath=false',
        'log',
        '--reverse',
        '--format=@@%aI',
        '--name-only',
        '--',
        contentRelativeDir,
      ],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );

    let timestamp = '';
    const prefix = `${contentRelativeDir}/`;
    for (const rawLine of output.split('\n')) {
      const line = rawLine.trim().replace(/^"|"$/g, '');
      if (!line) continue;
      if (line.startsWith('@@')) {
        timestamp = line.slice(2).trim();
        continue;
      }
      const name = line.startsWith(prefix) ? line.slice(prefix.length) : line;
      if (!name || !timestamp || result.has(name)) continue;
      // --reverse 保证从最旧开始，首次出现即首次提交
      result.set(name, timestamp);
    }
  } catch {
    /* 非 Git 环境（产物目录、打包机）→ 空表，调用方回落 frontmatter.date */
  }
  return result;
}
