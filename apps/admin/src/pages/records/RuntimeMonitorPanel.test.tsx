import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeLogEntry, RuntimeLogPage, RuntimeMetrics, RuntimeRequestEntry, RuntimeRequestPage } from '@walker/shared';
import { RuntimeMonitorPanel } from './RuntimeMonitorPanel';

const { useRuntimeMetricsMock, useRuntimeRequestsMock, useRuntimeLogsMock } = vi.hoisted(() => ({
  useRuntimeMetricsMock: vi.fn(),
  useRuntimeRequestsMock: vi.fn(),
  useRuntimeLogsMock: vi.fn(),
}));

vi.mock('../../api/queries', () => ({
  useRuntimeMetrics: useRuntimeMetricsMock,
  useRuntimeRequests: useRuntimeRequestsMock,
  useRuntimeLogs: useRuntimeLogsMock,
}));

function metrics(overrides: Partial<RuntimeMetrics> = {}): RuntimeMetrics {
  return {
    startedAt: '2026-10-12T09:00:00.000Z',
    uptimeMs: 65_000,
    completed: 0,
    failed: 0,
    interrupted: 0,
    inFlight: 0,
    successRate: null,
    avgDurationMs: null,
    droppedLogLines: 0,
    droppedRequests: 0,
    ...overrides,
  };
}

function request(overrides: Partial<RuntimeRequestEntry> = {}): RuntimeRequestEntry {
  return {
    ts: '2026-10-12T09:00:01.000Z',
    method: 'GET',
    route: '/ops/runtime/logs',
    status: 200,
    outcome: 'success',
    durationMs: 12,
    requestId: 'req-1',
    background: false,
    ...overrides,
  };
}

function logEntry(overrides: Partial<RuntimeLogEntry> = {}): RuntimeLogEntry {
  return {
    ts: '2026-10-12T09:00:01.000Z',
    channel: 'sys',
    level: 'info',
    text: 'api_started',
    requestId: null,
    truncated: false,
    ...overrides,
  };
}

function mockQueries(input: {
  metrics?: Partial<RuntimeMetrics>;
  metricsError?: unknown;
  requests?: RuntimeRequestEntry[];
  logs?: RuntimeLogEntry[];
  logCounts?: RuntimeLogPage['counts'];
  dropped?: number;
  dataUpdatedAt?: number;
} = {}) {
  const updatedAt = input.dataUpdatedAt ?? Date.now();
  useRuntimeMetricsMock.mockReturnValue({
    data: input.metricsError ? undefined : metrics(input.metrics),
    dataUpdatedAt: updatedAt,
    isPending: false,
    isError: Boolean(input.metricsError),
    error: input.metricsError ?? null,
    refetch: vi.fn(),
  });
  useRuntimeRequestsMock.mockReturnValue({
    data: { entries: input.requests ?? [] } satisfies RuntimeRequestPage,
    dataUpdatedAt: updatedAt,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  useRuntimeLogsMock.mockReturnValue({
    data: {
      entries: input.logs ?? [],
      counts: input.logCounts ?? { task: 0, chat: 0, sys: 0 },
      dropped: input.dropped ?? 0,
    } satisfies RuntimeLogPage,
    dataUpdatedAt: updatedAt,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RuntimeMonitorPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RuntimeMonitorPanel（运行监控）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueries();
  });

  it('请求指标：分母为 0 时比率与平均耗时显示「—」，不写 0% 或 0 ms', () => {
    renderPanel();
    const summary = screen.getByLabelText('请求指标摘要').textContent ?? '';
    expect(summary).toContain('已完成 0');
    expect(summary).toContain('—');
    expect(summary).not.toContain('0%');
    expect(summary).not.toContain('0 ms');
    // 端内运行时间是绝对数，照常显示
    expect(summary).toContain('1 分 5 秒');
  });

  it('请求指标：有数据时给出成功率、平均耗时、进行中与中断', () => {
    mockQueries({
      metrics: { completed: 4, failed: 1, interrupted: 2, inFlight: 1, successRate: 0.75, avgDurationMs: 25 },
    });
    renderPanel();
    const summary = screen.getByLabelText('请求指标摘要').textContent ?? '';
    expect(summary).toContain('已完成 4');
    expect(summary).toContain('失败 1');
    expect(summary).toContain('成功 75%');
    expect(summary).toContain('平均 25 ms');
    expect(summary).toContain('进行中 1');
    expect(summary).toContain('中断 2');
  });

  it('请求流水：逐条显示时间、方法路由、状态结果、耗时与 requestId，报错行标红', () => {
    mockQueries({
      requests: [
        request(),
        request({ status: 500, outcome: 'server_error', route: '/ops/execution-runs', requestId: 'req-2' }),
      ],
    });
    renderPanel();
    // testing-library 会把连续空白归一成单个空格后再匹配，故这里用一个空格
    const ok = screen.getByText(/GET \/ops\/runtime\/logs/);
    expect(ok.textContent).toContain('200 成功');
    expect(ok.textContent).toContain('12 ms');
    expect(ok.textContent).toContain('req-1');
    const bad = screen.getByText(/500 服务端错误/);
    expect(bad.style.color).toMatch(/rgb\(185, 28, 28\)|#b91c1c/i);
  });

  it('「只看报错」控制两块面板：点击后请求与日志都带上筛选', () => {
    renderPanel();
    expect(useRuntimeRequestsMock.mock.calls.at(-1)?.[0]).toMatchObject({ errorsOnly: false });
    expect(useRuntimeLogsMock.mock.calls.at(-1)?.[0]).toMatchObject({ errorsOnly: false });
    expect(useRuntimeRequestsMock.mock.calls.at(-1)?.[0]).toMatchObject({ humanOnly: false });

    fireEvent.click(screen.getByRole('button', { name: /只看报错/ }));

    expect(useRuntimeRequestsMock.mock.calls.at(-1)?.[0]).toMatchObject({ errorsOnly: true });
    expect(useRuntimeLogsMock.mock.calls.at(-1)?.[0]).toMatchObject({ errorsOnly: true });
  });

  it('空结果文案区分「筛完为空」与「本来就没有」', () => {
    renderPanel();
    expect(screen.getByText('暂无请求记录')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /只看报错/ }));
    expect(screen.getByText('只看报错时没有匹配的请求记录')).toBeDefined();
    expect(screen.getByText('只看报错时没有匹配的运行日志')).toBeDefined();

    // 两个筛选叠加时，文案要把两个都说出来（不能只说一个）
    fireEvent.click(screen.getByRole('button', { name: /只看人工操作/ }));
    expect(screen.getByText('只看报错 + 只看人工操作时没有匹配的请求记录')).toBeDefined();
  });

  it('「只看人工操作」交给服务端过滤，并在流水里把自动轮询标出来', () => {
    mockQueries({
      requests: [
        request({ route: '/ops/capabilities', background: true }),
        request({ route: '/ops/execution-runs', background: false, requestId: 'req-human' }),
      ],
    });
    renderPanel();

    // 全看时：自动行带「[自动]」前缀，人工行不带——噪音一眼可辨
    expect(screen.getByText(/\/ops\/capabilities/).textContent).toContain('[自动]');
    expect(screen.getByText(/\/ops\/execution-runs/).textContent).not.toContain('[自动]');
    expect(useRuntimeRequestsMock.mock.calls.at(-1)?.[0]).toMatchObject({ humanOnly: false });

    // 打开筛选：只把 humanOnly 交给服务端，前端不做本地过滤
    fireEvent.click(screen.getByRole('button', { name: /只看人工操作/ }));
    expect(useRuntimeRequestsMock.mock.calls.at(-1)?.[0]).toMatchObject({ humanOnly: true });
    expect(screen.getByText(/req-human/)).toBeDefined();
  });

  it('运行日志：按频道计数、按 shared 判级着色、如实显示被覆盖的行数', () => {
    mockQueries({
      logs: [
        logEntry({ text: 'api_started' }),
        logEntry({ channel: 'task', text: '发布运行异常结束：超时' }),
        logEntry({ channel: 'chat', text: 'AI 已降级为规则回答' }),
      ],
      logCounts: { task: 1, chat: 1, sys: 1 },
      dropped: 5,
    });
    renderPanel();

    expect(screen.getByText('任务 1 · 对话 1 · 系统 1')).toBeDefined();
    expect(screen.getByText(/已因容量上限覆盖 5 行/)).toBeDefined();

    const errorLine = screen.getByText(/发布运行异常结束/);
    expect(errorLine.style.color).toMatch(/rgb\(185, 28, 28\)|#b91c1c/i);
    const warnLine = screen.getByText(/AI 已降级/);
    expect(warnLine.style.color).toMatch(/rgb\(146, 64, 14\)|#92400e/i);
  });

  it('日志频道切换把 ch 传给查询，全部时不带 ch', () => {
    renderPanel();
    expect(useRuntimeLogsMock.mock.calls.at(-1)?.[0].channel).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: '对话' }));
    expect(useRuntimeLogsMock.mock.calls.at(-1)?.[0].channel).toBe('chat');
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(useRuntimeLogsMock.mock.calls.at(-1)?.[0].channel).toBeUndefined();
  });

  it('数据超过 15 秒未刷新时标陈旧，不假装还是新的', () => {
    mockQueries({ dataUpdatedAt: Date.now() - 20_000 });
    renderPanel();
    expect(screen.getByText(/数据已陈旧/)).toBeDefined();
  });

  it('指标读取失败时如实报错，不显示 0', () => {
    mockQueries({ metricsError: new Error('boom') });
    renderPanel();
    expect(screen.queryByLabelText('请求指标摘要')).toBeNull();
  });
});
