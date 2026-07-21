/**
 * run — 在仓库根执行子进程，失败即退出
 * 依赖：node:child_process、paths.repoRoot
 * 被调用：build-web、verify-stage1
 */
import { spawnSync } from 'node:child_process';
import { repoRoot } from './paths';

export function run(cmd: string, args: string[], options?: { inherit?: boolean }): number {
  const inherit = options?.inherit !== false;
  const r = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: inherit ? 'inherit' : 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  return r.status ?? 1;
}

export function runOrExit(cmd: string, args: string[]): void {
  const code = run(cmd, args);
  if (code !== 0) process.exit(code);
}
