/**
 * git 状态适配器（Node 实现）— content/log 定向、O(1)（PRD A3 / TECH-DESIGN §6.3）
 *
 * 只跑两条固定命令、参数全为常量、无 shell：
 *   1) git status --porcelain -z -- content/log   （一次拿到脏文件集合，-z 免引号歧义）
 *   2) git log -1 --format=%H                     （一次拿到 HEAD）
 * 禁止逐文件 git log（content/log 上百篇时会线性 spawn 进程）。
 * git 不可用（未安装 / 非仓库 / 命令失败）一律如实置 available=false，不编造脏/干净。
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  ContentLogGitStatus,
  GitStatusPort,
} from '../ports/git-status.repository';

const execFileAsync = promisify(execFile);

/** pathspec 常量：只问内容目录，避免整仓 status 随代码树规模变慢 */
const CONTENT_LOG_PATH = 'content/log';
/** 输出缓冲上限：脏文件多时也不截断 */
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

/** 仓库根：从 cwd 向上找 pnpm-workspace.yaml（与 content-admin.service 同一约定） */
function resolveRepoRoot(): string | null {
  let dir: string | undefined = process.cwd();
  while (dir) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** 解析 porcelain -z 输出为文件名集合（重命名/复制记录会多带一项原路径，需跳过） */
function parseDirtyFiles(raw: string): string[] {
  const records = raw.split('\0').filter(Boolean);
  const files: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const status = record.slice(0, 2);
    const file = record.slice(3);
    if (status.startsWith('R') || status.startsWith('C')) i += 1;
    if (file) files.push(path.basename(file));
  }
  return files;
}

export class NodeGitStatusRepository implements GitStatusPort {
  async snapshot(): Promise<ContentLogGitStatus> {
    const cwd = resolveRepoRoot();
    if (!cwd) return { available: false, dirtyFiles: [], headCommit: null };
    try {
      const [status, head] = await Promise.all([
        execFileAsync('git', ['status', '--porcelain', '-z', '--', CONTENT_LOG_PATH], {
          cwd,
          maxBuffer: MAX_BUFFER_BYTES,
          windowsHide: true,
        }),
        execFileAsync('git', ['log', '-1', '--format=%H'], {
          cwd,
          maxBuffer: MAX_BUFFER_BYTES,
          windowsHide: true,
        }),
      ]);
      const headCommit = head.stdout.trim();
      return {
        available: true,
        dirtyFiles: parseDirtyFiles(status.stdout),
        headCommit: headCommit || null,
      };
    } catch {
      // git 不可用不是错误状态而是事实缺失：如实上报，由展示层显示「未知」
      return { available: false, dirtyFiles: [], headCommit: null };
    }
  }
}
