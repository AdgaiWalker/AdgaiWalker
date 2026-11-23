/**
 * 内容仓库根目录解析（唯一实现）：
 * 1. WALKER_CONTENT_REPO_DIR 显式指定（生产为独立稀疏仓 C:\Walker\data\content-repo，
 *    与运行态代码目录 C:\Walker\app 物理隔离，彻底切断内容同步对生产代码的干扰）；
 * 2. CONTENT_LOG_DIR 指向 <repo>/content/log 且 <repo> 含 .git 时，自动隔离到 <repo>；
 * 3. 本地开发回落到向上探测 pnpm-workspace.yaml 的仓库根。
 */
import fs from 'node:fs';
import path from 'node:path';

export function resolveContentRepoRoot(): string | null {
  const fromEnv = process.env.WALKER_CONTENT_REPO_DIR?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    return fs.existsSync(resolved) ? resolved : null;
  }

  const logOverride = process.env.CONTENT_LOG_DIR?.trim();
  if (logOverride) {
    const absLog = path.resolve(logOverride);
    if (path.basename(absLog) === 'log' && path.basename(path.dirname(absLog)) === 'content') {
      const candidate = path.dirname(path.dirname(absLog));
      if (fs.existsSync(path.join(candidate, '.git'))) return candidate;
    }
  }

  let dir: string | undefined = process.cwd();
  while (dir) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
