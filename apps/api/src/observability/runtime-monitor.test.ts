/**
 * 运行监控：采集（日志缓冲 / 请求指标 / tee logger / 请求中间件）与查询（HTTP 参数校验）。
 *
 * 这份测试盯的是"界面会据此做判断"的那几条规则，不是实现细节：
 * 容量溢出要如实计数、筛选在服务端生效、中断不算成功也不算失败、观测故障不影响业务。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  RUNTIME_LOG_BUFFER_LIMIT,
  RUNTIME_LOG_PAGE_LIMIT_MAX,
  RUNTIME_REQUEST_BUFFER_LIMIT,
  RUNTIME_REQUEST_PAGE_LIMIT_MAX,
  type RuntimeLogEntry,
} from '@walker/shared';
import type { Request, Response } from 'express';
import {
  InMemoryRuntimeLogBuffer,
  InMemoryRuntimeMetricsBuffer,
} from '../adapters/in-memory-runtime-buffer';
import { RuntimeMonitorController } from '../operations/runtime-monitor.controller';
import type { RuntimeRequestBufferPort } from '../ports/runtime-monitor.port';
import { RequestIdMiddleware } from './request-id.middleware';
import { RuntimeTeeLogger, readableText } from './runtime-tee-logger';

function logEntry(seq: number, overrides: Partial<RuntimeLogEntry> = {}): RuntimeLogEntry {
  return {
    ts: new Date(seq * 1_000).toISOString(),
    channel: 'sys',
    level: 'info',
    text: 'line ' + seq,
    requestId: null,
    truncated: false,
    ...overrides,
  };
}

describe('运行日志缓冲：定容、计数、服务端筛选', () => {
  it('容量固定，覆盖最旧一条并如实累计丢弃数', () => {
    const buffer = new InMemoryRuntimeLogBuffer();
    for (let index = 0; index < RUNTIME_LOG_BUFFER_LIMIT + 5; index += 1) {
      buffer.append(logEntry(index));
    }
    const page = buffer.page({ limit: RUNTIME_LOG_BUFFER_LIMIT, errorsOnly: false });
    expect(page.entries).toHaveLength(RUNTIME_LOG_BUFFER_LIMIT);
    expect(page.dropped).toBe(5);
    // 最旧的 5 条被覆盖：缓冲里第一条是 line 5
    expect(page.entries[0].text).toBe('line 5');
  });

  it('按时间顺序返回（旧 → 新），limit 取最后 N 条', () => {
    const buffer = new InMemoryRuntimeLogBuffer();
    for (let index = 0; index < 10; index += 1) buffer.append(logEntry(index));
    const page = buffer.page({ limit: 3, errorsOnly: false });
    expect(page.entries.map((entry) => entry.text)).toEqual(['line 7', 'line 8', 'line 9']);
  });

  it('频道与"只看报错"都在服务端筛选；计数统计整段缓冲不受筛选影响', () => {
    const buffer = new InMemoryRuntimeLogBuffer();
    buffer.append(logEntry(1, { channel: 'task' }));
    buffer.append(logEntry(2, { channel: 'chat' }));
    buffer.append(logEntry(3, { channel: 'sys', level: 'error', text: '读取失败' }));
    buffer.append(logEntry(4, { channel: 'chat', level: 'info', text: '已降级' }));

    const chat = buffer.page({ limit: 100, channel: 'chat', errorsOnly: false });
    expect(chat.entries.map((entry) => entry.text)).toEqual(['line 2', '已降级']);
    // 计数是整段缓冲的，不是筛选后的子集（界面上的"任务 x · 对话 y · 系统 z"）
    expect(chat.counts).toEqual({ task: 1, chat: 2, sys: 1 });

    const errors = buffer.page({ limit: 100, errorsOnly: true });
    expect(errors.entries.map((entry) => entry.text)).toEqual(['读取失败']);
  });

  it('筛选结果为空时就是空——不回退到未筛选数据（面板踩过的坑）', () => {
    const buffer = new InMemoryRuntimeLogBuffer();
    buffer.append(logEntry(1, { channel: 'task' }));
    const page = buffer.page({ limit: 100, channel: 'chat', errorsOnly: false });
    expect(page.entries).toEqual([]);
  });
});

describe('请求指标缓冲：计数、分母、中断单列', () => {
  function finish(
    buffer: InMemoryRuntimeMetricsBuffer,
    status: number,
    durationMs: number,
    outcome?: 'interrupted',
  ) {
    buffer.begin();
    buffer.finish({
      ts: new Date('2026-10-12T00:00:00.000Z'),
      method: 'GET',
      route: '/ops/runtime/logs',
      status,
      durationMs,
      requestId: 'req',
      ...(outcome ? { outcome } : {}),
    });
  }

  it('一条请求都没有时，比率与平均耗时是 null 而不是 0', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    const metrics = buffer.snapshot(new Date(), 0);
    expect(metrics.completed).toBe(0);
    expect(metrics.successRate).toBeNull();
    expect(metrics.avgDurationMs).toBeNull();
  });

  it('成功率与平均耗时按有真实 HTTP 结果的请求算', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    finish(buffer, 200, 10);
    finish(buffer, 200, 20);
    finish(buffer, 500, 30);
    finish(buffer, 404, 40);
    const metrics = buffer.snapshot(new Date(), 7);
    expect(metrics.completed).toBe(4);
    expect(metrics.failed).toBe(2);
    expect(metrics.successRate).toBe(0.5);
    expect(metrics.avgDurationMs).toBe(25);
    expect(metrics.droppedLogLines).toBe(7);
  });

  it('被主动掐断的请求单列，不进成功率分母也不进平均耗时', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    finish(buffer, 200, 10);
    finish(buffer, 200, 20);
    finish(buffer, 200, 999, 'interrupted');
    const metrics = buffer.snapshot(new Date(), 0);
    expect(metrics.completed).toBe(2);
    expect(metrics.failed).toBe(0);
    expect(metrics.interrupted).toBe(1);
    expect(metrics.successRate).toBe(1);
    expect(metrics.avgDurationMs).toBe(15);
  });

  it('进行中计数随开始与结束增减', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    buffer.begin();
    buffer.begin();
    expect(buffer.snapshot(new Date(), 0).inFlight).toBe(2);
    buffer.finish({ ts: new Date(), method: 'GET', route: '/health', status: 200, durationMs: 1 });
    expect(buffer.snapshot(new Date(), 0).inFlight).toBe(1);
    buffer.finish({ ts: new Date(), method: 'GET', route: '/health', status: 200, durationMs: 1 });
    expect(buffer.snapshot(new Date(), 0).inFlight).toBe(0);
  });

  it('明细溢出不崩，并如实累计丢弃数', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    for (let index = 0; index < RUNTIME_REQUEST_BUFFER_LIMIT + 3; index += 1) {
      finish(buffer, 200, index);
    }
    const page = buffer.page({ limit: RUNTIME_REQUEST_PAGE_LIMIT_MAX, errorsOnly: false, humanOnly: false });
    expect(page.entries).toHaveLength(RUNTIME_REQUEST_BUFFER_LIMIT);
    expect(buffer.snapshot(new Date(), 0).droppedRequests).toBe(3);
  });
});

describe('tee logger：终端照旧，另外留一份可查副本', () => {
  function inner() {
    return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  }

  it('三个等级都转发给终端，同时写进缓冲', () => {
    const buffer = new InMemoryRuntimeLogBuffer();
    const fake = inner();
    const tee = new RuntimeTeeLogger(fake, buffer, () => new Date('2026-10-12T00:00:00.000Z'));
    tee.log('api_started', 'Bootstrap');
    tee.warn('AI 已降级', 'AssistantService');
    tee.error(new Error('boom'), 'ContentReleaseService');

    expect(fake.log).toHaveBeenCalledWith('api_started', 'Bootstrap');
    expect(fake.warn).toHaveBeenCalledWith('AI 已降级', 'AssistantService');
    expect(fake.error).toHaveBeenCalledTimes(1);

    const page = buffer.page({ limit: 10, errorsOnly: false });
    expect(page.entries.map((entry) => entry.channel)).toEqual(['sys', 'chat', 'task']);
    expect(page.entries.map((entry) => entry.level)).toEqual(['info', 'warn', 'error']);
    expect(page.entries[2].text).toContain('boom');
  });

  it('Error 走 stack、对象走 JSON，context 取最后一个字符串参数且其余参数不丢', () => {
    expect(readableText(new Error('boom'))).toContain('boom');
    expect(readableText({ a: 1 })).toBe('{"a":1}');
    expect(readableText(undefined)).toBe('');

    const buffer = new InMemoryRuntimeLogBuffer();
    const tee = new RuntimeTeeLogger(inner(), buffer);
    tee.error('写入失败', { detail: 1 }, 'ContentReleaseService');
    const entry = buffer.page({ limit: 1, errorsOnly: false }).entries[0];
    // 最后一个字符串参数才是 context（对象参数不能被当成 context）；
    // context 之外的参数要拼进正文，排错时不能丢
    expect(entry.channel).toBe('task');
    expect(entry.level).toBe('error');
    expect(entry.text).toContain('写入失败');
    expect(entry.text).toContain('{"detail":1}');
  });

  it('缓冲写失败不影响终端输出，也不把异常抛给业务（fail-open）', () => {
    const exploding = {
      append: () => {
        throw new Error('buffer down');
      },
      dropped: () => 0,
      page: () => ({ entries: [], counts: { task: 0, chat: 0, sys: 0 }, dropped: 0 }),
    };
    const fake = inner();
    const tee = new RuntimeTeeLogger(fake, exploding);
    expect(() => tee.log('还是照常打印')).not.toThrow();
    expect(fake.log).toHaveBeenCalledWith('还是照常打印');
  });

  it('终端通道抛错时记录已经留下（先采集再打印）', () => {
    const buffer = new InMemoryRuntimeLogBuffer();
    const tee = new RuntimeTeeLogger(
      {
        log: () => {
          throw new Error('terminal closed');
        },
        warn: () => {},
        error: () => {},
      },
      buffer,
    );
    expect(() => tee.log('终端断了')).toThrow('terminal closed');
    expect(buffer.page({ limit: 1, errorsOnly: false }).entries[0].text).toBe('终端断了');
  });
});

describe('请求中间件：requestId、路由模板、只登记一次', () => {
  // routePath 传 null 表示"没匹配到路由"；不能用 undefined，那会落回默认值
  // marker 传 '1' 模拟前端轮询自带的 x-admin-background-poll 头
  function exchange(baseUrl = '/ops', routePath: string | null = '/runtime/logs', marker?: string) {
    const listeners: Record<string, Array<() => void>> = {};
    const headers: Record<string, string> = {};
    const req = {
      method: 'GET',
      baseUrl,
      route: routePath === null ? undefined : { path: routePath },
      url: routePath === null ? '/nope?secret=1' : '/ops/runtime/logs?secret=1',
      header: (name: string) =>
        name === 'x-admin-background-poll' ? marker : undefined,
    } as unknown as Request;
    // writableEnded 在 express 类型里是只读的：用 getter 暴露状态，测试通过 state 翻转
    const state = { writableEnded: false };
    const res = {
      statusCode: 200,
      get writableEnded() {
        return state.writableEnded;
      },
      setHeader: (name: string, value: string) => {
        headers[name] = String(value);
      },
      on: (event: string, callback: () => void) => {
        (listeners[event] ??= []).push(callback);
      },
    } as unknown as Response;
    return {
      req,
      res,
      headers,
      state,
      emit: (event: string) => (listeners[event] ?? []).forEach((callback) => callback()),
    };
  }

  it('回写 requestId，并把这次请求登记成路由模板（不含 query）', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    const { req, res, headers, emit } = exchange();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      new RequestIdMiddleware(buffer).use(req, res, () => {});
      expect(headers['x-request-id']).toBeTruthy();
      emit('finish');
    } finally {
      log.mockRestore();
    }
    const entry = buffer.page({ limit: 5, errorsOnly: false, humanOnly: false }).entries[0];
    expect(entry.route).toBe('/ops/runtime/logs');
    expect(entry.route).not.toContain('secret');
    expect(entry.outcome).toBe('success');
    expect(buffer.snapshot(new Date(), 0).inFlight).toBe(0);
  });

  it('匹配不到路由写占位符，绝不退回带 query 的原始 URL', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    const { req, res, emit } = exchange('/ops', null);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      new RequestIdMiddleware(buffer).use(req, res, () => {});
      emit('finish');
    } finally {
      log.mockRestore();
    }
    expect(buffer.page({ limit: 5, errorsOnly: false, humanOnly: false }).entries[0].route).toBe('[unmatched]');
  });

  it('连接被掐断记 interrupted（不算成功也不算失败），且只登记一次', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    const { req, res, state, emit } = exchange();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      new RequestIdMiddleware(buffer).use(req, res, () => {});
      emit('close');
      // 正常收尾与 close 都触发时也只记一次
      state.writableEnded = true;
      emit('finish');
      emit('close');
    } finally {
      log.mockRestore();
    }
    const metrics = buffer.snapshot(new Date(), 0);
    expect(metrics.interrupted).toBe(1);
    expect(metrics.completed).toBe(0);
    expect(metrics.inFlight).toBe(0);
    expect(buffer.page({ limit: 5, errorsOnly: false, humanOnly: false }).entries).toHaveLength(1);
  });

  it('自动轮询被标记为 background（判据与后台日志共用一份实现）', () => {
    const buffer = new InMemoryRuntimeMetricsBuffer();
    const poll = exchange('/ops', '/capabilities', '1');
    const human = exchange('/ops', '/capabilities', undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const middleware = new RequestIdMiddleware(buffer);
      middleware.use(poll.req, poll.res, () => {});
      poll.emit('finish');
      middleware.use(human.req, human.res, () => {});
      human.emit('finish');
    } finally {
      log.mockRestore();
    }
    const entries = buffer.page({ limit: 5, errorsOnly: false, humanOnly: false }).entries;
    expect(entries.map((entry) => entry.background)).toEqual([true, false]);
    // 只看人工操作：自动轮询不出现在结果里
    expect(
      buffer.page({ limit: 5, errorsOnly: false, humanOnly: true }).entries.map((e) => e.background),
    ).toEqual([false]);
  });

  it('指标写侧抛错也不影响请求继续（fail-open）', () => {
    const exploding = {
      begin: () => {
        throw new Error('down');
      },
      finish: () => {
        throw new Error('down');
      },
      snapshot: () => {
        throw new Error('down');
      },
      page: () => {
        throw new Error('down');
      },
    } as unknown as RuntimeRequestBufferPort;
    const { req, res, emit } = exchange();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      let called = false;
      expect(() => new RequestIdMiddleware(exploding).use(req, res, () => {
        called = true;
      })).not.toThrow();
      expect(() => emit('finish')).not.toThrow();
      expect(called).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});

describe('运行监控接口：参数非法就拒，不静默兜底', () => {
  function controller() {
    const logs = new InMemoryRuntimeLogBuffer();
    const requests = new InMemoryRuntimeMetricsBuffer();
    return { controller: new RuntimeMonitorController(logs, requests), logs, requests };
  }

  it('metrics 把日志缓冲的丢弃数一并带上', () => {
    const { controller: api, logs } = controller();
    logs.append(logEntry(1));
    expect(api.metrics()).toMatchObject({ completed: 0, droppedLogLines: 0 });
  });

  it('limit 越界或非法返回 400，不兜成默认值', () => {
    const { controller: api } = controller();
    for (const bad of ['0', '201', 'abc', '1.5']) {
      expect(() => api.listRequests(bad, undefined)).toThrowError(/limit/);
    }
    expect(() => api.listLogs(String(RUNTIME_LOG_PAGE_LIMIT_MAX + 1), undefined, undefined)).toThrowError(/limit/);
    expect(() => api.listRequests('200', undefined)).not.toThrow();
  });

  it('不认识的频道返回 400，认识的频道原样传给缓冲', () => {
    const { controller: api } = controller();
    expect(() => api.listLogs(undefined, 'unknown', undefined)).toThrowError(/ch/);
    expect(() => api.listLogs(undefined, '', undefined)).not.toThrow();
    expect(api.listLogs('5', 'task', '1')).toMatchObject({ counts: { task: 0, chat: 0, sys: 0 } });
  });

  it('requests 的 errorsOnly 与 humanOnly 都只在服务端生效', () => {
    const { controller: api, requests } = controller();
    const record = (status: number, background: boolean) => {
      requests.begin();
      requests.finish({ ts: new Date(), method: 'GET', route: '/health', status, durationMs: 3, background });
    };
    record(500, false);
    record(200, false);
    record(200, true); // 自动轮询

    expect(api.listRequests('10', undefined).entries).toHaveLength(3);
    expect(api.listRequests('10', '1').entries.map((entry) => entry.status)).toEqual([500]);
    // 只看人工操作：自动轮询被服务端滤掉，前端不做本地回退
    expect(api.listRequests('10', undefined, '1').entries.map((entry) => entry.background)).toEqual([
      false,
      false,
    ]);
    expect(api.listRequests('10', '1', '1').entries).toHaveLength(1);
    expect(RUNTIME_REQUEST_PAGE_LIMIT_MAX).toBeGreaterThan(0);
  });
});
