import { describe, expect, it } from 'vitest';
import {
  RUNTIME_LOG_LINE_MAX_BYTES,
  RUNTIME_REQUEST_PAGE_LIMIT_MAX,
  RUNTIME_UNMATCHED_ROUTE,
  channelForContext,
  combineRuntimeLogLevel,
  computeRuntimeMetrics,
  countsTowardSuccessRate,
  flattenRuntimeLogText,
  formatRuntimeDuration,
  formatRuntimeRatio,
  isRuntimeErrorEntry,
  isRuntimeRequestError,
  isHumanRuntimeRequest,
  isRuntimeRequestInterrupted,
  isRuntimeWarningEntry,
  levelForText,
  outcomeForStatus,
  parseRuntimeFlag,
  parseRuntimePageLimit,
  prepareRuntimeLogEntry,
  routeTemplate,
  truncateRuntimeLogText,
  utf8Length,
} from './runtime-monitor.js';

describe('运行监控：频道归类（唯一一份判定）', () => {
  it('执行/发布/调度类 context 归「任务」', () => {
    expect(channelForContext('AgentExecutionService')).toBe('task');
    expect(channelForContext('ContentReleaseService')).toBe('task');
    expect(channelForContext('ReminderScanService')).toBe('task');
    expect(channelForContext('OutboxDispatcher')).toBe('task');
  });

  it('模型/harness/助手类 context 归「对话」', () => {
    expect(channelForContext('HarnessAssistantAdapter')).toBe('chat');
    expect(channelForContext('ModelConfigService')).toBe('chat');
    expect(channelForContext('AssistantEventRecorder')).toBe('chat');
  });

  it('未知或缺失 context 一律归「系统」，不猜', () => {
    expect(channelForContext('NestApplication')).toBe('sys');
    expect(channelForContext('')).toBe('sys');
    expect(channelForContext(null)).toBe('sys');
    expect(channelForContext(undefined)).toBe('sys');
  });

  it('任务与对话同时命中时按「任务」优先，结果稳定可预期', () => {
    expect(channelForContext('AssistantExecutionRunner')).toBe('task');
  });
});

describe('运行监控：报错判定（前后端同一份正则）', () => {
  it('英文与中文报错词都判为 error', () => {
    expect(levelForText('TypeError: x is not a function')).toBe('error');
    expect(levelForText('发布运行异常结束：超时')).toBe('error');
    expect(levelForText('写入失败')).toBe('error');
  });

  it('降级/冷却/超时一类判为 warn', () => {
    expect(levelForText('AI 已降级为规则回答')).toBe('warn');
    expect(levelForText('账号冷却中')).toBe('warn');
  });

  it('普通日志是 info', () => {
    expect(levelForText('api_started')).toBe('info');
  });

  it('调用点等级与文本等级取更高者', () => {
    expect(combineRuntimeLogLevel('warn', '保存失败')).toBe('error');
    expect(combineRuntimeLogLevel('error', '一切正常')).toBe('error');
    expect(combineRuntimeLogLevel('info', '已降级')).toBe('warn');
    expect(combineRuntimeLogLevel('info', '一切正常')).toBe('info');
  });

  it('「只看报错」用的判定把文本与等级一起看', () => {
    expect(isRuntimeErrorEntry({ level: 'error', text: '普通文案' })).toBe(true);
    expect(isRuntimeErrorEntry({ level: 'info', text: '读取失败' })).toBe(true);
    expect(isRuntimeErrorEntry({ level: 'info', text: '一切正常' })).toBe(false);
    expect(isRuntimeWarningEntry({ level: 'info', text: '已降级' })).toBe(true);
    // 报错不算警告：黄与红互斥
    expect(isRuntimeWarningEntry({ level: 'info', text: '读取失败' })).toBe(false);
  });
});

describe('运行监控：文本处理（脱敏 → 压平 → 截断）', () => {
  it('换行压平成单行，保持"一行一条"的流式观感', () => {
    expect(flattenRuntimeLogText('第一行\n第二行')).toBe('第一行 ⏎ 第二行');
    expect(flattenRuntimeLogText('  前后留白  ')).toBe('前后留白');
  });

  it('按 UTF-8 字节截断，并如实标记 truncated', () => {
    const ascii = 'a'.repeat(RUNTIME_LOG_LINE_MAX_BYTES + 50);
    const cut = truncateRuntimeLogText(ascii);
    expect(cut.truncated).toBe(true);
    expect(utf8Length(cut.text)).toBeLessThanOrEqual(RUNTIME_LOG_LINE_MAX_BYTES);

    // 中文 3 字节：不能按字符数切，否则会超上限
    const chinese = '中'.repeat(1_000);
    const cut2 = truncateRuntimeLogText(chinese);
    expect(cut2.truncated).toBe(true);
    expect(utf8Length(cut2.text)).toBeLessThanOrEqual(RUNTIME_LOG_LINE_MAX_BYTES);
    expect(cut2.text.endsWith('…')).toBe(true);
  });

  it('没超上限时原样返回，不乱改内容', () => {
    const short = 'api_started';
    expect(truncateRuntimeLogText(short)).toEqual({ text: short, truncated: false });
  });

  it('采集入口先脱敏再截断，凭据不会因截断逃过匹配', () => {
    const entry = prepareRuntimeLogEntry({
      ts: new Date('2026-10-12T00:00:00.000Z'),
      context: 'ModelConfigService',
      text: '调用模型 sk-abcdefghijklmnopqrstuvwxyz 失败',
      requestId: 'req-1',
      redact: (text) => text.replace(/sk-[a-z]+/gu, '[redacted-api-key]'),
    });
    expect(entry.text).toContain('[redacted-api-key]');
    expect(entry.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(entry.channel).toBe('chat');
    expect(entry.level).toBe('error');
    expect(entry.ts).toBe('2026-10-12T00:00:00.000Z');
    expect(entry.requestId).toBe('req-1');
  });
});

describe('运行监控：请求结果与路由模板', () => {
  it('状态码映射到结果分档', () => {
    expect(outcomeForStatus(200)).toBe('success');
    expect(outcomeForStatus(304)).toBe('redirect');
    expect(outcomeForStatus(404)).toBe('client_error');
    expect(outcomeForStatus(500)).toBe('server_error');
    expect(isRuntimeRequestError({ outcome: 'client_error' })).toBe(true);
    expect(isRuntimeRequestError({ outcome: 'success' })).toBe(false);
    // 主动掐断的连接既不算成功也不算失败，也不进成功率分母
    expect(isRuntimeRequestError({ outcome: 'interrupted' })).toBe(false);
    expect(isRuntimeRequestInterrupted({ outcome: 'interrupted' })).toBe(true);
    expect(countsTowardSuccessRate({ outcome: 'interrupted' })).toBe(false);
    expect(countsTowardSuccessRate({ outcome: 'success' })).toBe(true);
    // 人工操作 = 不是后台自动请求：筛选与界面上的「自动」标记共用这一处语义
    expect(isHumanRuntimeRequest({ background: false })).toBe(true);
    expect(isHumanRuntimeRequest({ background: true })).toBe(false);
  });

  it('路由模板只拼 baseUrl 与模式，拿不到模式时写占位', () => {
    expect(routeTemplate('/ops', '/runtime/logs')).toBe('/ops/runtime/logs');
    expect(routeTemplate(undefined, '/health')).toBe('/health');
    expect(routeTemplate('/ops', undefined)).toBe(RUNTIME_UNMATCHED_ROUTE);
    expect(routeTemplate(undefined, undefined)).toBe(RUNTIME_UNMATCHED_ROUTE);
  });
});

describe('运行监控：指标（分母为 0 不出比率）', () => {
  it('没有任何已结束请求时，比率与平均耗时都是 null 而不是 0', () => {
    const metrics = computeRuntimeMetrics({
      startedAt: '2026-10-12T00:00:00.000Z',
      now: new Date('2026-10-12T00:00:10.000Z'),
      completed: 0,
      failed: 0,
      inFlight: 2,
      interrupted: 0,
      totalDurationMs: 0,
      droppedLogLines: 0,
      droppedRequests: 0,
    });
    expect(metrics.successRate).toBeNull();
    expect(metrics.avgDurationMs).toBeNull();
    expect(metrics.inFlight).toBe(2);
    expect(metrics.uptimeMs).toBe(10_000);
  });

  it('成功率与平均耗时按已结束请求计算', () => {
    const metrics = computeRuntimeMetrics({
      startedAt: '2026-10-12T00:00:00.000Z',
      now: new Date('2026-10-12T00:00:01.000Z'),
      completed: 4,
      failed: 1,
      inFlight: 0,
      interrupted: 2,
      totalDurationMs: 100,
      droppedLogLines: 3,
      droppedRequests: 1,
    });
    expect(metrics.successRate).toBe(0.75);
    expect(metrics.avgDurationMs).toBe(25);
    expect(metrics.interrupted).toBe(2);
    expect(metrics.droppedLogLines).toBe(3);
    expect(metrics.droppedRequests).toBe(1);
  });

  it('显示口径：null 一律「—」，不写 0%', () => {
    expect(formatRuntimeRatio(null)).toBe('—');
    expect(formatRuntimeRatio(1)).toBe('100%');
    expect(formatRuntimeRatio(0.75)).toBe('75%');
    expect(formatRuntimeRatio(0.8333)).toBe('83.3%');
    expect(formatRuntimeDuration(null)).toBe('—');
    expect(formatRuntimeDuration(null)).not.toContain('0 ms');
  });
});

describe('运行监控：查询参数解析（非法就拒，不静默兜底）', () => {
  it('缺省取上限，越界与非法返回 null', () => {
    expect(parseRuntimePageLimit(undefined, RUNTIME_REQUEST_PAGE_LIMIT_MAX)).toBe(RUNTIME_REQUEST_PAGE_LIMIT_MAX);
    expect(parseRuntimePageLimit('50', RUNTIME_REQUEST_PAGE_LIMIT_MAX)).toBe(50);
    expect(parseRuntimePageLimit('0', RUNTIME_REQUEST_PAGE_LIMIT_MAX)).toBeNull();
    expect(parseRuntimePageLimit('201', RUNTIME_REQUEST_PAGE_LIMIT_MAX)).toBeNull();
    expect(parseRuntimePageLimit('abc', RUNTIME_REQUEST_PAGE_LIMIT_MAX)).toBeNull();
    expect(parseRuntimePageLimit('1.5', RUNTIME_REQUEST_PAGE_LIMIT_MAX)).toBeNull();
  });

  it('布尔参数只认明确真值', () => {
    expect(parseRuntimeFlag('1')).toBe(true);
    expect(parseRuntimeFlag('true')).toBe(true);
    expect(parseRuntimeFlag('0')).toBe(false);
    expect(parseRuntimeFlag(undefined)).toBe(false);
  });
});
