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
  RunReleaseOptions,
} from '../ports/content-release-runner.port';
import { terminateAndVerifyProcessTree } from '../common/process-tree';

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
  async runRelease(...args: [RunReleaseOptions?]): Promise<ReleaseProcessResult> {
    const options = args[0];
    const cwd = resolveRepoRoot();
    const env = { ...process.env };
    delete env.WALKER_CONTENT_LOCK_ID;
    if (options?.lock) {
      env.WALKER_CONTENT_LOCK_PATH = options.lock.lockFile;
      env.WALKER_CONTENT_LOCK_ID = options.lock.lockId;
    }
    const child = spawn('pnpm', [...RELEASE_ARGS], {
      cwd,
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });

    if (child.pid) {
      options?.onSpawn?.(child.pid);
    }

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
      let settled = false;
      let termination: Promise<'exited' | 'unproven'> | null = null;
      const cleanupListeners = () => {
        clearTimeout(timer);
        if (options?.signal && abortHandler) {
          options.signal.removeEventListener('abort', abortHandler);
        }
      };

      const finish = async (code: number | null, error?: Error, knownProof?: 'exited' | 'unproven') => {
        if (settled) return;
        settled = true;
        const exitProof = knownProof ?? (termination ? await termination : 'exited');
        cleanupListeners();
        resolve({
          exitCode: code,
          timedOut,
          stdout,
          stderr: error ? `${stderr}\n${error.message}`.trim() : stderr,
          exitProof,
        });
      };

      const terminate = () => {
        if (!child.pid) {
          child.kill();
          return;
        }
        termination ??= terminateAndVerifyProcessTree(child.pid).catch(() => 'unproven' as const);
        void termination.then((proof) => finish(child.exitCode, undefined, proof));
      };

      const abortHandler = () => {
        terminate();
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          abortHandler();
        } else {
          options.signal.addEventListener('abort', abortHandler, { once: true });
        }
      }

      const timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, resolveTimeoutMs());

      child.on('error', (error: Error) => {
        void finish(null, error);
      });

      child.on('close', (code: number | null) => {
        void finish(code);
      });
    });
  }

  async terminateProcessTree(pid: number): Promise<'exited' | 'unproven'> {
    return terminateAndVerifyProcessTree(pid);
  }
}
