/**
 * 发布进程适配器 — 走仓库既有的唯一出口 `pnpm content:publish --push --json`
 * （脚本真身 `scripts/content-publish.ts`，TECH-DESIGN §5.2/§9 A8）
 *
 * 纪律：
 * - 命令与参数全为常量，调用方不参与拼装（无外部文本插值、无注入面）；
 * - 子进程不 detached（要退出码与输出）；带超时，超时强杀并如实标注 timedOut；
 * - Windows 下 pnpm 是 .cmd shim，需 shell:true（与 content-admin.service 的既有做法一致），
 *   但参数仍是常量，不存在文本拼接。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ContentReleaseRunnerPort,
  ReleaseProcessResult,
} from '../ports/content-release-runner.port';

/** 固定参数：发布脚本 + 推送到生产（push 隐含 commit） + 结构化输出供 API 解析 */
const RELEASE_ARGS = ['content:publish', '--push', '--json'] as const;

/** 阶段耗时上限 10 分钟（TECH-DESIGN §5.1），可用 WALKER_RELEASE_TIMEOUT_MS 覆盖 */
const DEFAULT_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/** 仓库根：从 cwd 向上找 pnpm-workspace.yaml（pnpm script 必须在 monorepo 根执行） */
function resolveRepoRoot(): string {
  let dir: string | undefined = process.cwd();
  while (dir) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('repo-root-not-found');
}

function resolveTimeoutMs(): number {
  const raw = Number(process.env.WALKER_RELEASE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export class PnpmContentReleaseRunner implements ContentReleaseRunnerPort {
  async runRelease(): Promise<ReleaseProcessResult> {
    const cwd = resolveRepoRoot();
    const child = spawn('pnpm', [...RELEASE_ARGS], {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (target === 'stdout') {
        stdout = (stdout + text).slice(-MAX_OUTPUT_BYTES);
      } else {
        stderr = (stderr + text).slice(-MAX_OUTPUT_BYTES);
      }
    };
    child.stdout?.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr?.on('data', (chunk: Buffer) => append('stderr', chunk));

    return await new Promise<ReleaseProcessResult>((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, resolveTimeoutMs());

      child.on('error', (error: Error) => {
        clearTimeout(timer);
        resolve({
          exitCode: null,
          timedOut,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
        });
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        resolve({ exitCode: code, timedOut, stdout, stderr });
      });
    });
  }
}
