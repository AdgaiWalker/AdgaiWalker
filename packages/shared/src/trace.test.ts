import { describe, expect, it } from 'vitest';
import {
  normalizeTraceEvent,
  parseTraceLine,
  TRACE_CONTRACT_VERSION,
  TRACE_EVENT_TYPES,
  isTraceEventType,
} from './trace.js';

describe('trace 事件契约 v1（TECH-DESIGN §4）', () => {
  it('词表覆盖 §4.2 的十个类型', () => {
    expect([...TRACE_EVENT_TYPES]).toEqual([
      'run.start',
      'stage.start',
      'stage.end',
      'model.usage',
      'tool.call',
      'tool.result',
      'gate.check',
      'run.end',
      'run.error',
      'raw',
    ]);
    expect(isTraceEventType('run.start')).toBe(true);
    expect(isTraceEventType('whatever.next')).toBe(false);
  });

  it('v1 已知类型：补全信封缺省，payload 透传未知字段', () => {
    const event = normalizeTraceEvent({
      v: 1,
      seq: 12,
      ts: 1750000000123,
      runId: 'run_1',
      type: 'stage.end',
      source: 'dsh',
      payload: { stage: 'model', elapsedMs: 42, data: { promptTokens: 10, futureField: true } },
    });
    expect(event).toMatchObject({
      v: 1,
      seq: 12,
      runId: 'run_1',
      type: 'stage.end',
      source: 'dsh',
      payload: { stage: 'model', elapsedMs: 42, data: { futureField: true } },
    });
  });

  it('缺 seq 的 v1 事件：seq 记 0，不崩', () => {
    const event = normalizeTraceEvent({
      v: 1,
      ts: 100,
      runId: 'run_1',
      type: 'run.start',
      source: 'api',
      payload: { kind: 'agent' },
    });
    expect(event.seq).toBe(0);
    expect(event.type).toBe('run.start');
  });

  it('未知 type：保留原文不崩（读在前写在后）', () => {
    const event = normalizeTraceEvent({
      v: 1,
      seq: 3,
      ts: 100,
      runId: 'run_1',
      type: 'run.amended',
      source: 'api',
      payload: { note: 'future' },
    });
    expect(event.type).toBe('run.amended');
    expect(event.seq).toBe(3);
    expect((event.payload as { note: string }).note).toBe('future');
  });

  it('v 不匹配：保留原文按 v 分支，不按 v1 解释', () => {
    const event = normalizeTraceEvent({
      v: 2,
      seq: 1,
      ts: 100,
      runId: 'run_1',
      type: 'run.start',
      source: 'api',
      payload: { kind: 'agent' },
    });
    expect(event.v).toBe(2);
    expect(event.type).toBe('run.start');
    expect(event.seq).toBe(1);
  });

  it('坏行降级为 raw，保留原始行文本', () => {
    const event = parseTraceLine('{not-json');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('raw');
    expect((event?.payload as { line: string }).line).toBe('{not-json');
  });

  it('空白行返回 null（不算坏行）', () => {
    expect(parseTraceLine('')).toBeNull();
    expect(parseTraceLine('   ')).toBeNull();
  });

  it('非对象 JSON 降级为 raw 形状', () => {
    const event = normalizeTraceEvent('just a string');
    expect(event.type).toBe('raw');
    expect((event.payload as { line: string }).line).toBe('just a string');
  });

  describe('旧事件兼容映射（TECH-DESIGN §4.3）', () => {
    it('start → run.start（agentId / targetFile 迁入 payload）', () => {
      const event = normalizeTraceEvent({
        event: 'start',
        runId: 'run_1',
        agentId: 'xiaoying',
        targetFile: 'content/log/a.md',
        instruction: '分析',
        timestamp: 1750000000000,
      });
      expect(event).toMatchObject({
        v: TRACE_CONTRACT_VERSION,
        seq: 0,
        ts: 1750000000000,
        runId: 'run_1',
        type: 'run.start',
        source: 'api',
        payload: { kind: 'agent', agentId: 'xiaoying', target: 'content/log/a.md' },
      });
    });

    it('stage{input} → stage.end（label 并入 data）', () => {
      const event = normalizeTraceEvent({
        event: 'stage',
        stage: 'input',
        label: '装载 Markdown 文件',
        elapsedMs: 15,
        data: { fileBytes: 100 },
      });
      expect(event).toMatchObject({
        type: 'stage.end',
        payload: { stage: 'input', elapsedMs: 15, data: { fileBytes: 100, label: '装载 Markdown 文件' } },
      });
    });

    it('stage{model} → stage.end', () => {
      const event = normalizeTraceEvent({
        event: 'stage',
        stage: 'model',
        elapsedMs: 900,
        data: { promptTokens: 10 },
      });
      expect(event.type).toBe('stage.end');
    });

    it('未识别的旧 stage 值不强行映射，保留原文', () => {
      const event = normalizeTraceEvent({ event: 'stage', stage: 'unknown-stage', elapsedMs: 1 });
      expect(event.type).toBe('stage');
    });

    it('done → run.end', () => {
      const event = normalizeTraceEvent({
        event: 'done',
        status: 'SUCCESS',
        elapsedMs: 1200,
        metrics: { turns: 1 },
      });
      expect(event).toMatchObject({
        type: 'run.end',
        payload: { status: 'SUCCESS', elapsedMs: 1200, metrics: { turns: 1 } },
      });
    });

    it('error → run.error（message 取自 error 字段）', () => {
      const event = normalizeTraceEvent({
        event: 'error',
        status: 'FAILED',
        elapsedMs: 50,
        error: 'boom',
      });
      expect(event).toMatchObject({
        type: 'run.error',
        payload: { status: 'FAILED', message: 'boom' },
      });
    });

    it('旧文件整行经 parseTraceLine 可读（新旧混合不崩）', () => {
      const legacy = parseTraceLine(
        JSON.stringify({ event: 'done', status: 'SUCCESS', elapsedMs: 5, metrics: {} }),
      );
      const current = parseTraceLine(
        JSON.stringify({ v: 1, seq: 1, ts: 1, runId: 'r', type: 'run.end', source: 'api', payload: { status: 'SUCCESS', elapsedMs: 5, metrics: {} } }),
      );
      expect(legacy?.type).toBe('run.end');
      expect(current?.type).toBe('run.end');
    });

    it('v 不匹配与旧事件、坏行混合解析：各行独立降级，互不污染', () => {
      const lines = [
        JSON.stringify({ event: 'start', runId: 'r1', agentId: 'a', timestamp: 1 }),
        JSON.stringify({ v: 2, seq: 9, ts: 2, runId: 'r2', type: 'run.end', source: 'api', payload: {} }),
        JSON.stringify({ v: 1, seq: 3, ts: 3, runId: 'r3', type: 'run.start', source: 'api', payload: { kind: 'agent' } }),
        'not-json',
      ];
      const events = lines.map((line) => parseTraceLine(line));
      expect(events.map((e) => e?.type)).toEqual(['run.start', 'run.end', 'run.start', 'raw']);
      // 高版本行保留 v=2 与 seq，不被 v1 规范化吞掉
      expect(events[1]?.v).toBe(2);
      expect(events[1]?.seq).toBe(9);
      // 坏行保留原始文本，不影响前后行
      expect((events[3]?.payload as { line: string }).line).toBe('not-json');
    });
  });
});
