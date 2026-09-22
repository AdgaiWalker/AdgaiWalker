import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { KernelModule } from '../kernel.module';
import {
  TRACE_REPOSITORY,
  TRACE_WRITER,
  type TraceRepositoryPort,
  type TraceWriterPort,
} from '../ports/trace.repository';
import { TraceService } from './trace.service';

/**
 * 轨迹读取链集成测（真实 kernel 接线，TECH-DESIGN §6.2/§6.3）。
 * 隔离：WALKER_RUNS_DIR 指向临时目录，测试不碰仓库的 data/runs。
 */
describe('轨迹读取链（真实 kernel 接线）', () => {
  let moduleRef: TestingModule;
  let repo: TraceRepositoryPort;
  let writer: TraceWriterPort;
  let service: TraceService;
  let runsDir: string;

  beforeAll(async () => {
    runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'walker-runs-'));
    process.env.WALKER_RUNS_DIR = runsDir;
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, KernelModule],
    }).compile();
    await moduleRef.init();
    repo = moduleRef.get<TraceRepositoryPort>(TRACE_REPOSITORY);
    writer = moduleRef.get<TraceWriterPort>(TRACE_WRITER);
    service = moduleRef.get(TraceService);
  });

  afterAll(async () => {
    delete process.env.WALKER_RUNS_DIR;
    await moduleRef.close();
    fs.rmSync(runsDir, { recursive: true, force: true });
  });

  it('默认只回尾部 500 行（不做全量解析）', async () => {
    const runId = 'run_tail_500';
    for (let i = 0; i < 1200; i++) {
      await writer.append(runId, {
        type: 'stage.end',
        payload: { stage: 'model', elapsedMs: i, data: {} },
      });
    }
    const result = await repo.readEvents(runId);
    expect(result).not.toBeNull();
    const events = result!.events;
    expect(events.length).toBe(500);
    expect(events[0]!.seq).toBe(701);
    expect(events[events.length - 1]!.seq).toBe(1200);
    // 默认尾部是「按设计」截断，不算游标漏读
    expect(result!.truncated).toBe(false);
  });

  it('游标续拉：after 之后只回增量；游标到尾部返回空', async () => {
    const runId = 'run_tail_500';
    const incremental = await repo.readEvents(runId, { after: 1150 });
    expect(incremental!.events.length).toBe(50);
    expect(incremental!.events[0]!.seq).toBe(1151);
    expect(incremental!.events[incremental!.events.length - 1]!.seq).toBe(1200);
    expect(incremental!.truncated).toBe(false);

    const drained = await repo.readEvents(runId, { after: 1200 });
    expect(drained!.events).toEqual([]);
    expect(drained!.truncated).toBe(false);
  });

  it('after 落后于扫描窗时窗口回扫覆盖 after+1（修复静默漏事件）', async () => {
    // run_tail_500 共 1200 条；after=1 远落后于尾部窗口，旧实现会静默跳过最早的增量
    const result = await repo.readEvents('run_tail_500', { after: 1 });
    expect(result!.truncated).toBe(false);
    const seqs = result!.events.map((e) => e.seq);
    // 必须回最早的一批增量（2..501），而不是只回最新尾部
    expect(seqs[0]).toBe(2);
    expect(seqs.length).toBe(500);
    expect(seqs[seqs.length - 1]).toBe(501);
  });

  it('after 远超扫描上限时诚实标记 truncated（不静默假装完整）', async () => {
    const runId = 'run_truncated';
    const dir = path.join(runsDir, runId);
    fs.mkdirSync(dir, { recursive: true });
    const lines: string[] = [];
    for (let seq = 1; seq <= 6000; seq++) {
      lines.push(
        JSON.stringify({
          v: 1,
          seq,
          ts: seq,
          runId,
          type: 'stage.end',
          source: 'api',
          payload: { stage: 'model', elapsedMs: seq, data: {} },
        }),
      );
    }
    fs.writeFileSync(path.join(dir, 'trace.jsonl'), lines.join('\n') + '\n', 'utf8');

    // 扫描上限 MAX_LINES=5000 < 6000：无法回扫到游标边界，如实标记 truncated
    const lagging = await repo.readEvents(runId, { after: 1 });
    expect(lagging!.truncated).toBe(true);
    // 默认尾部模式不受影响
    const tail = await repo.readEvents(runId);
    expect(tail!.truncated).toBe(false);
  });

  it('limit 生效，且仍按 seq 升序返回', async () => {
    const runId = 'run_tail_500';
    const page = await repo.readEvents(runId, { limit: 3 });
    expect(page!.events.map((e) => e.seq)).toEqual([1198, 1199, 1200]);
  });

  it('旧格式文件（start/stage/done/error）可读：读侧映射为新类型，文件不改写', async () => {
    const runId = 'run_legacy_1';
    const dir = path.join(runsDir, runId);
    fs.mkdirSync(dir, { recursive: true });
    const legacyLines = [
      { event: 'start', runId, agentId: 'xiaoying', targetFile: 'content/log/a.md', timestamp: 1 },
      { event: 'stage', stage: 'input', label: '装载文件', elapsedMs: 12, data: { fileBytes: 9 } },
      { event: 'stage', stage: 'model', elapsedMs: 900, data: { promptTokens: 10 } },
      { event: 'done', status: 'SUCCESS', elapsedMs: 1000, metrics: { turns: 1 } },
    ];
    const file = path.join(dir, 'trace.jsonl');
    const raw = legacyLines.map((line) => JSON.stringify(line)).join('\n') + '\n';
    fs.writeFileSync(file, raw, 'utf8');

    const events = (await repo.readEvents(runId))!.events;
    expect(events.map((e) => e.type)).toEqual([
      'run.start',
      'stage.end',
      'stage.end',
      'run.end',
    ]);
    // 旧行没有 seq：整文件可见时按行号补稳定游标，增量续拉对旧文件同样成立
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    const incremental = (await repo.readEvents(runId, { after: 2 }))!.events;
    expect(incremental.map((e) => e.type)).toEqual(['stage.end', 'run.end']);
    // 文件未被改写（append-only）
    expect(fs.readFileSync(file, 'utf8')).toBe(raw);
  });

  it('坏行降级为 raw，且不影响同文件其余事件', async () => {
    const runId = 'run_broken_line';
    const dir = path.join(runsDir, runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'trace.jsonl'),
      `${JSON.stringify({ event: 'start', runId, timestamp: 1 })}\n{broken-json\n${JSON.stringify({ event: 'done', status: 'SUCCESS', elapsedMs: 2, metrics: {} })}\n`,
      'utf8',
    );
    const events = (await repo.readEvents(runId))!.events;
    expect(events.map((e) => e.type)).toEqual(['run.start', 'raw', 'run.end']);
    expect((events[1]!.payload as { line: string }).line).toBe('{broken-json');
  });

  it('运行不存在时用例层如实 404，不返回空列表冒充', async () => {
    await expect(service.getRunTrace('run_not_found')).rejects.toMatchObject({
      response: { code: 'trace-not-found' },
    });
    // 非法 runId（路径穿越形状）同样按不存在处理（非法形状不得参与路径拼接）
    await expect(service.getRunTrace('../../etc/passwd')).rejects.toMatchObject({
      response: { code: 'trace-not-found' },
    });
  });

  it('payload 超过 2000 字节即拒写（契约纪律）', async () => {
    await expect(
      writer.append('run_payload_guard', {
        type: 'run.error',
        payload: { status: 'FAILED', code: 'x', message: 'a'.repeat(3000) },
      }),
    ).rejects.toThrow('trace-payload-too-large');
  });

  it('写入的事件经用例层读回，信封字段完整（runId/v/seq/ts/source）', async () => {
    const runId = 'run_roundtrip';
    await writer.append(runId, {
      type: 'run.start',
      source: 'publish',
      payload: { kind: 'publish', target: 'demo-slug' },
    });
    const { events } = await service.getRunTrace(runId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      v: 1,
      seq: 1,
      runId,
      type: 'run.start',
      source: 'publish',
    });
    expect(events[0]!.ts).toBeGreaterThan(0);
  });
});
