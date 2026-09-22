/**
 * 内容上线用例层（PRD A7–A11、TECH-DESIGN §5.2/§6.2/D2）
 *
 * 为什么异步触发（不在请求内等构建）：
 * 上线是重操作（gen + commit + push + Vercel 部署，可达数分钟），请求内阻塞既拖垮网关超时，
 * 也让「事实时间线 + 轮询」失去意义。因此 release 只做原子互斥登记与派发，立即返回
 * `{ runId, status: 'RUNNING' }`；结果（退出码、耗时、输出尾部）由同一 trace.jsonl 如实落痕，
 * 前端经 `GET /runs/:runId/trace` 轮询读到 run.end / run.error 即为终态（诚实原则）。
 */
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { missingPublishedPostFields, type PublishedPostRequiredField } from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import {
  CONTENT_LEDGER_REPOSITORY,
  type ContentLedgerRepositoryPort,
} from '../ports/content-ledger.repository';
import {
  CONTENT_RELEASE_RUNNER,
  type ContentReleaseRunnerPort,
  type ReleaseProcessResult,
} from '../ports/content-release-runner.port';
import { TRACE_WRITER, type TraceAppendInput, type TraceWriterPort } from '../ports/trace.repository';

/** 输出尾部保留行数（PRD A10：失败回显原始输出尾部若干行） */
const RELEASE_TAIL_LINES = 12;
/** run.error.message 的字节上限：按 JSON 转义后计（引号/换行会膨胀），留出信封余量保证 payload ≤2000B */
const RELEASE_MESSAGE_MAX_BYTES = 1_400;
/** 绝对路径一律脱敏：轨迹 payload 禁放绝对路径（TECH-DESIGN §4.1/§8 #5） */
const ABSOLUTE_PATH_RE =
  /(?:[A-Za-z]:\\[^\s"']+|\/(?:Users|home|var|tmp|private|opt|mnt)\/[^\s"']*)/g;

export type ReleasePreflightResult = {
  ok: boolean;
  /** 缺失的公开必需字段（门禁口径 = shared missingPublishedPostFields，与构建门禁同一份清单） */
  missing: PublishedPostRequiredField[];
};

export type ReleaseResult = {
  runId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
};

/**
 * 解析脚本 `--json` 回报（最后一行 JSON）。
 * 解析不到返回 null —— 进程被超时强杀时根本没有机会输出，此时退回原始 stdout/stderr（如实）。
 */
function parseJsonReport(stdout: string): { tail: string[] } | null {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(line) as { tail?: unknown };
      if (Array.isArray(parsed.tail)) {
        return {
          tail: parsed.tail.filter((item): item is string => typeof item === 'string'),
        };
      }
    } catch {
      /* 不是 JSON 行：继续往前找 */
    }
  }
  return null;
}

function redactAbsolutePaths(line: string): string {
  return line.replace(ABSOLUTE_PATH_RE, '<path>');
}

function fitMessage(text: string): string {
  let out = text;
  // 按 JSON 转义后的字节数裁剪：引号/反斜杠会膨胀，直接按原文字节算会顶破 2000B 上限
  while (
    out.length > 0 &&
    Buffer.byteLength(JSON.stringify(out), 'utf8') > RELEASE_MESSAGE_MAX_BYTES
  ) {
    out = out.slice(0, Math.max(0, out.length - 64));
  }
  return out;
}

@Injectable()
export class ContentReleaseService {
  private readonly log = new Logger(ContentReleaseService.name);
  /** 进程内单实例锁：同一时刻只允许一个发布进程（PRD A9） */
  private running: { runId: string } | null = null;

  constructor(
    @Inject(CONTENT_RELEASE_RUNNER)
    private readonly runner: ContentReleaseRunnerPort,
    @Inject(TRACE_WRITER) private readonly trace: TraceWriterPort,
    @Inject(CONTENT_LEDGER_REPOSITORY)
    private readonly entries: ContentLedgerRepositoryPort,
  ) {}

  /**
   * 上线前预检：只读门禁校验，**零写动作**（PRD A7）。
   * 不跑 content:gen、不落盘、不碰 git——预检失败时工作区与 content/log 逐字节不变。
   */
  async preflight(slug: string): Promise<ReleasePreflightResult> {
    const entry = await this.entries.get(slug);
    if (!entry) {
      throw new ApiError('content-not-found', HttpStatus.NOT_FOUND, '内容不存在');
    }
    const missing = [...missingPublishedPostFields(entry.frontmatter)];
    return { ok: missing.length === 0, missing };
  }

  /** 触发上线：返回 { runId, status }；已有运行在途时如实返回「进行中」 */
  async release(slug: string): Promise<ReleaseResult> {
    const inFlight = this.running;
    if (inFlight) return { runId: inFlight.runId, status: 'RUNNING' };

    // 预检在派发之前：缺字段直接拒，绝不启动进程（也就不会有任何写动作）
    const preflight = await this.preflight(slug);
    if (!preflight.ok) {
      throw validationError(`release-blocked:${preflight.missing.join(',')}`);
    }

    // 原子 check-and-set：预检期间可能已有运行启动，此处到赋值之间无 await
    if (this.running) return { runId: this.running.runId, status: 'RUNNING' };
    const runId = `run_${Date.now()}_${randomBytes(4).toString('hex')}`;
    this.running = { runId };

    void this.execute(runId, slug).catch((error: unknown) => {
      this.log.error(`发布运行异常结束：${error instanceof Error ? error.message : String(error)}`);
    });
    return { runId, status: 'RUNNING' };
  }

  /** 执行发布并落轨迹；任何路径都留痕，绝不写成功（TECH-DESIGN §5.4） */
  private async execute(runId: string, slug: string): Promise<void> {
    const startedAt = Date.now();
    try {
      await this.trace.append(runId, {
        type: 'run.start',
        source: 'publish',
        payload: { kind: 'publish', target: slug },
      });
      const stageStartedAt = Date.now();
      await this.trace.append(runId, {
        type: 'stage.start',
        source: 'publish',
        payload: { stage: 'tool', label: 'content:publish --push' },
      });

      const result = await this.runner.runRelease();
      const tail = this.outputTail(result);

      await this.trace.append(runId, {
        type: 'stage.end',
        source: 'publish',
        payload: {
          stage: 'tool',
          elapsedMs: Math.max(1, Date.now() - stageStartedAt),
          data: { exitCode: result.exitCode, timedOut: result.timedOut },
        },
      });

      if (result.timedOut || result.exitCode !== 0) {
        await this.trace.append(runId, {
          type: 'run.error',
          source: 'publish',
          payload: {
            status: 'FAILED',
            code: result.timedOut ? 'release-timeout' : 'release-failed',
            ...(result.exitCode !== null ? { exitCode: result.exitCode } : {}),
            message: fitMessage(tail.join('\n')),
          },
        });
        return;
      }

      await this.trace.append(runId, {
        type: 'run.end',
        source: 'publish',
        payload: {
          status: 'SUCCESS',
          elapsedMs: Date.now() - startedAt,
          metrics: { exitCode: 0 },
        },
      });
    } catch (error) {
      // 派发失败也是失败事实：如实留痕，不写成功。
      // 绝对路径与 outputTail 同口径脱敏（TECH-DESIGN §4.1/§8 #5：绝对路径不进轨迹）。
      await this.safeAppend(runId, {
        type: 'run.error',
        source: 'publish',
        payload: {
          status: 'FAILED',
          code: 'release-dispatch-failed',
          message: fitMessage(
            redactAbsolutePaths(error instanceof Error ? error.message : String(error)),
          ),
        },
      });
    } finally {
      if (this.running?.runId === runId) this.running = null;
    }
  }

  /**
   * 输出尾部：优先用脚本 `--json` 回报里的 tail（人读日志在该模式下只进 JSON），
   * 解析不到（如被超时强杀）则退回原始 stdout/stderr；统一脱敏绝对路径并按字节裁剪。
   */
  private outputTail(result: ReleaseProcessResult): string[] {
    const report = parseJsonReport(result.stdout);
    const source = report ? report.tail.join('\n') : `${result.stdout}\n${result.stderr}`;
    return source
      .split('\n')
      .map((line) => redactAbsolutePaths(line.trim()))
      .filter((line) => line.length > 0)
      .slice(-RELEASE_TAIL_LINES);
  }

  /** 轨迹写入尽力而为：写不进去也不能把失败包装成成功，只记日志 */
  private async safeAppend(runId: string, event: TraceAppendInput): Promise<void> {
    try {
      await this.trace.append(runId, event);
    } catch (error) {
      this.log.error(
        `轨迹写入失败 runId=${runId}：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
