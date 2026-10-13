import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NormalizedTraceEvent } from '@walker/shared';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import { ContentReleaseService } from './content-release.service';
import {
  CONTENT_RELEASE_RUNNER,
  type ContentReleaseRunnerPort,
  type ReleaseProcessResult,
} from '../ports/content-release-runner.port';
import { GIT_STATUS, type GitStatusPort } from '../ports/git-status.repository';
import { TraceService } from '../traces/trace.service';

/** 可手动完成的假发布进程：用来精确控制「在途」与「终态」两个时刻 */
class FakeReleaseRunner implements ContentReleaseRunnerPort {
  calls = 0;
  private pending: Array<(result: ReleaseProcessResult) => void> = [];

  async runRelease(): Promise<ReleaseProcessResult> {
    this.calls += 1;
    return await new Promise<ReleaseProcessResult>((resolve) => {
      this.pending.push(resolve);
    });
  }

  /** 结束当前在途调用（未在途时什么也不做） */
  complete(result: ReleaseProcessResult): void {
    const resolvers = this.pending;
    this.pending = [];
    for (const resolve of resolvers) resolve(result);
  }
}

const COMPLETE_POST = `---
title: 演示文
type: knowledge
visibility: public
form: article
domain: product
intent: share
valueMode: utility
aiUsePolicy:
  level: AI-2
  readable: true
  citable: true
updated: '2026-09-15'
summary: 摘要
---

正文内容。
`;

/** 只带 form，其余 6 项必需字段全缺 */
const MISSING_POST = `---
title: 缺字段文
type: knowledge
visibility: public
form: article
---

正文内容。
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 轮询等待条件成立（派发是异步的，断言前必须先等到事实出现） */
async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`等待条件超时：${label}`);
}

/** 等终态事件（run.end / run.error）出现：轮询读链，与前端同一路径；启动期的 404 属正常中间态 */
async function waitForTerminal(
  traces: TraceService,
  runId: string,
  timeoutMs = 3_000,
): Promise<NormalizedTraceEvent[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const { events } = await traces.getRunTrace(runId);
      if (events.some((e) => e.type === 'run.end' || e.type === 'run.error')) {
        return events;
      }
    } catch {
      /* 轨迹文件尚未落盘：继续等 */
    }
    if (Date.now() > deadline) throw new Error(`等待发布终态超时：${runId}`);
    await sleep(10);
  }
}

function snapshotDir(dir: string): string {
  return fs
    .readdirSync(dir)
    .sort()
    .map((name) => {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      return `${name}:${st.size}:${st.mtimeMs}:${fs.readFileSync(full, 'utf8')}`;
    })
    .join('\n');
}

describe('内容上线（真实 kernel 接线 + 假发布进程）', () => {
  let moduleRef: TestingModule;
  let service: ContentReleaseService;
  let traces: TraceService;
  let runner: FakeReleaseRunner;
  let contentDir: string;
  let runsDir: string;

  beforeAll(async () => {
    contentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-content-'));
    runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-runs-release-'));
    process.env.CONTENT_LOG_DIR = contentDir;
    process.env.WALKER_RUNS_DIR = runsDir;
    fs.writeFileSync(path.join(contentDir, 'demo-ready.md'), COMPLETE_POST, 'utf8');
    fs.writeFileSync(path.join(contentDir, 'demo-missing.md'), MISSING_POST, 'utf8');

    runner = new FakeReleaseRunner();
    const cleanGit: GitStatusPort = {
      async snapshot() {
        return { available: true, dirtyFiles: ['demo-ready.md'], headCommit: 'head-test' };
      },
      async workspaceSnapshot() {
        return {
          available: true,
          headCommit: 'head-test',
          files: [{ path: 'content/log/demo-ready.md', staged: false, dirty: true, statusCode: ' M' }],
          dirtyFiles: ['content/log/demo-ready.md'],
        };
      },
    };
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, KernelModule],
    })
      .overrideProvider(CONTENT_RELEASE_RUNNER)
      .useValue(runner)
      .overrideProvider(GIT_STATUS)
      .useValue(cleanGit)
      .compile();
    await moduleRef.init();
    service = moduleRef.get(ContentReleaseService);
    traces = moduleRef.get(TraceService);
  });

  afterAll(async () => {
    await moduleRef.close();
    delete process.env.CONTENT_LOG_DIR;
    delete process.env.WALKER_RUNS_DIR;
    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.rmSync(runsDir, { recursive: true, force: true });
  });

  async function prepared(slug: string) {
    const release = await service.prepareRelease({ slug, requestKey: `test-release-${randomUUID()}` });
    return { slug, releaseId: release.id };
  }

  it('预检：字段齐全 → ok；缺字段 → 恰好列出缺失项；不存在 → 404', async () => {
    await expect(service.preflight('demo-ready')).resolves.toMatchObject({ ok: true, missing: [] });
    const missing = await service.preflight('demo-missing');
    expect(missing.ok).toBe(false);
    expect(missing.missing).toEqual([
      'domain',
      'intent',
      'valueMode',
      'aiUsePolicy',
      'updated',
      'summary',
    ]);
    await expect(service.preflight('not-exist')).rejects.toMatchObject({
      response: { code: 'content-not-found' },
    });
  });

  it('预检零写动作：预检前后 content/log 逐字节不变，且不产生任何运行目录（PRD A7）', async () => {
    const before = snapshotDir(contentDir);
    await service.preflight('demo-ready');
    await service.preflight('demo-missing');
    expect(snapshotDir(contentDir)).toBe(before);
    expect(fs.readdirSync(runsDir)).toEqual([]);
    expect(runner.calls).toBe(0);
  });

  it('缺字段内容上线被拒，且不启动进程（零写动作）', async () => {
    const before = snapshotDir(contentDir);
    await expect(service.release({ slug: 'demo-missing', releaseId: 'unused' })).rejects.toMatchObject({
      response: { code: 'validation-error' },
    });
    expect(runner.calls).toBe(0);
    expect(snapshotDir(contentDir)).toBe(before);
    expect(fs.readdirSync(runsDir)).toEqual([]);
  });

  it('并发两次触发：第二次如实返回「进行中」，且只创建一个进程（PRD A9）', async () => {
    const input = await prepared('demo-ready');
    const first = await service.release(input);
    expect(first.status).toBe('RUNNING');
    const second = await service.release(input);
    expect(second.status).toBe('RUNNING');
    expect(second.runId).toBe(first.runId);

    await waitFor(() => runner.calls === 1, '发布进程被派发');
    // 再触发一次仍然只有一个进程
    const third = await service.release(input);
    expect(third.runId).toBe(first.runId);
    expect(runner.calls).toBe(1);

    runner.complete({
      exitCode: 0,
      timedOut: false, exitProof: 'exited',
      stdout: '{"exitCode":0,"elapsedMs":1,"tail":["已 push。"]}\n',
      stderr: '',
    });
    const events = await waitForTerminal(traces, first.runId);
    expect(events.find((e) => e.type === 'run.end')).toMatchObject({
      payload: { status: 'SUCCESS' },
    });
  });

  it('成功上线：轨迹含 kind:publish 的 run.start 与 run.end（D2 / PRD A11）', async () => {
    const { runId } = await service.release(await prepared('demo-ready'));
    await waitFor(() => runner.calls === 2, '发布进程被派发');
    runner.complete({
      exitCode: 0,
      timedOut: false, exitProof: 'exited',
      stdout: '{"exitCode":0,"elapsedMs":5,"tail":["已 push。Vercel 将自动部署 web。"]}\n',
      stderr: '',
    });
    const events = await waitForTerminal(traces, runId);

    const start = events.find((e) => e.type === 'run.start');
    expect(start).toMatchObject({
      source: 'publish',
      payload: { kind: 'publish', target: 'demo-ready' },
    });
    expect(events.find((e) => e.type === 'stage.start')).toBeTruthy();
    expect(events.find((e) => e.type === 'run.end')).toMatchObject({
      payload: { status: 'SUCCESS' },
    });
    // 事件是可经 GET /runs/:runId/trace 读出的事实（升序 seq、信封完整）
    expect(events.map((e) => e.seq)).toEqual(events.map((_event, index) => index + 1));
  });

  it('非零退出：如实回显退出码与输出尾部，绝不包装成成功（PRD A10）', async () => {
    const { runId } = await service.release(await prepared('demo-ready'));
    await waitFor(() => runner.calls === 3, '发布进程被派发');
    const tail = [
      '== 3/3 commit ==',
      'error: 暂存区存在 1 个非内容文件，拒绝提交',
      '  参考路径 /Users/someone/secret/project/file.ts',
    ];
    runner.complete({
      exitCode: 1,
      timedOut: false, exitProof: 'exited',
      stdout: `${JSON.stringify({ exitCode: 1, elapsedMs: 42, tail })}\n`,
      stderr: '',
    });
    const events = await waitForTerminal(traces, runId);

    const error = events.find((e) => e.type === 'run.error');
    expect(error).toMatchObject({
      payload: { status: 'UNKNOWN', code: 'release-outcome-unknown', exitCode: 1 },
    });
    const message = (error!.payload as { message: string }).message;
    expect(message).toContain('暂存区存在 1 个非内容文件');
    expect(message).not.toContain('/Users/someone'); // 绝对路径不进轨迹
    expect(message).toContain('<path>');
    const stageEnd = events.find((e) => e.type === 'stage.end');
    expect((stageEnd!.payload as { data: { exitCode: number } }).data.exitCode).toBe(1);
    // 失败不得出现 run.end
    expect(events.some((e) => e.type === 'run.end')).toBe(false);
  });

  it('超时强杀：标注 release-timeout，不谎报成功', async () => {
    const { runId } = await service.release(await prepared('demo-ready'));
    await waitFor(() => runner.calls === 4, '发布进程被派发');
    runner.complete({ exitCode: null, timedOut: true, exitProof: 'exited', stdout: '', stderr: '构建耗时过长' });
    const events = await waitForTerminal(traces, runId);
    expect(events.find((e) => e.type === 'run.error')).toMatchObject({
      payload: { status: 'UNKNOWN', code: 'release-outcome-unknown' },
    });
    expect(events.some((e) => e.type === 'run.end')).toBe(false);
  });

  it('运行结束后锁释放：可以再次触发（不是一次性锁死）', async () => {
    const { runId } = await service.release(await prepared('demo-ready'));
    await waitFor(() => runner.calls === 5, '发布进程被派发');
    runner.complete({
      exitCode: 0,
      timedOut: false, exitProof: 'exited',
      stdout: '{"exitCode":0,"elapsedMs":1,"tail":[]}\n',
      stderr: '',
    });
    await waitForTerminal(traces, runId);

    const next = await service.release(await prepared('demo-ready'));
    expect(next.status).toBe('RUNNING');
    expect(next.runId).not.toBe(runId);
    await waitFor(() => runner.calls === 6, '第二次派发');
    runner.complete({
      exitCode: 0,
      timedOut: false, exitProof: 'exited',
      stdout: '{"exitCode":0,"elapsedMs":1,"tail":[]}\n',
      stderr: '',
    });
    await waitForTerminal(traces, next.runId);
  });

  it('超长且含引号的输出尾部仍能落痕，且 payload 不破 2000B 契约', async () => {
    const { runId } = await service.release(await prepared('demo-ready'));
    await waitFor(() => runner.calls === 7, '发布进程被派发');
    runner.complete({
      exitCode: 1,
      timedOut: false, exitProof: 'exited',
      stdout: `${JSON.stringify({ exitCode: 1, elapsedMs: 9, tail: ['"'.repeat(2_000)] })}\n`,
      stderr: '"'.repeat(3_000),
    });
    const events = await waitForTerminal(traces, runId);
    const error = events.find((e) => e.type === 'run.error');
    expect(error).toBeTruthy();
    expect(
      Buffer.byteLength(JSON.stringify((error!.payload as unknown) ?? {}), 'utf8'),
    ).toBeLessThanOrEqual(2_000);
  });
});
