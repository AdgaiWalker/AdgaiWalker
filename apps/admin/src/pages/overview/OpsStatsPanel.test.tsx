import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsOverviewStats } from '@walker/shared';
import { OpsStatsPanel } from './OpsStatsPanel';

const { useOpsOverviewMock } = vi.hoisted(() => ({ useOpsOverviewMock: vi.fn() }));

vi.mock('../../api/queries', () => ({
  useOpsOverview: useOpsOverviewMock,
}));

function stats(overrides: Partial<OpsOverviewStats> = {}): OpsOverviewStats {
  return {
    provenance: {
      window: '7d',
      from: '2026-09-20T00:00:00.000Z',
      to: '2026-09-27T00:00:00.000Z',
      hours: 168,
      sources: ['ConversationMessage(role=visitor) → 提问数（按消息 id 去重）', 'ExecutionRun.tokensIn/tokensOut → 用量（缺失不计 0）'],
      missing: [
        { key: 'usage', note: '没有任何运行记录带用量时，总量为 null（不是 0）', coverage: 0.5 },
        { key: 'answerOutcome', note: '缺少 AssistantRun 关联的运行如实计入 unknown', coverage: null },
      ],
    },
    asks: { visitorMessages: 12, conversations: 8, turns: 12, regenerationAttempts: 3 },
    answers: { succeeded: 9, degraded: 2, failed: 1, deliveryAck: 7, deliveryUnconfirmed: 5, unknown: 0 },
    usage: { runs: 20, runsWithUsage: 10, coverage: 0.5, tokensIn: 1200, tokensOut: 800, totalTokens: 2000 },
    reminders: { open: 5, overdue: 2, occurrencesCreated: 4, resolved: { done: 1, snoozed: 1, ignored: 1 } },
    content: {
      changes: 3, releases: 2, published: 1, publicationAvailable: true,
      stages: { draft: 4, review: 2, ready: 3, live: 10 },
      versionStates: { workingAhead: 3, indexBehind: 1, indexUnknown: 0, inSync: 9 },
    },
    drilldowns: [
      { key: 'asks', label: '访客提问', count: 12, route: 'records', filter: 'tab=visitors' },
      { key: 'overdue', label: '已到期事项', count: 2, route: 'overview', filter: 'scope=overdue' },
      { key: 'failedRuns', label: '失败运行', count: 1, route: 'records', filter: 'state=FAILED' },
    ],
    ...overrides,
  };
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OpsStatsPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockQuery(overrides: Record<string, unknown> = {}) {
  useOpsOverviewMock.mockReturnValue({
    data: stats(),
    dataUpdatedAt: Date.now(),
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  });
}

describe('OpsStatsPanel（O07 关键数据概览）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery();
  });

  it('展示提问数、回答结果、到期事项、内容阶段与索引落后', () => {
    renderPanel();

    expect(screen.getByText('关键数据')).toBeDefined();
    // 「访客提问」同时出现在数字卡片与下钻区，故按卡片 aria-label 精确定位
    expect(screen.getByRole('link', { name: /访客提问：12，查看明细/ })).toBeDefined();
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
    // 回答结果分层与交付确认分开显示
    expect(screen.getByText(/降级 2 · 失败 1 · 未知 0/)).toBeDefined();
    expect(screen.getByText(/未确认送达 5（生成成功 ≠ 已送达）/)).toBeDefined();
    // 到期事项
    expect(screen.getByText(/未完成合计 5/)).toBeDefined();
    // 内容阶段
    expect(screen.getByText(/待审 2 · 草稿 4 · Git 已同步 10/)).toBeDefined();
  });

  it('每个数字可下钻，链接带与数字同口径的筛选参数', () => {
    renderPanel();

    const asksLink = screen.getByRole('link', { name: /访客提问：12，查看明细/ });
    expect(asksLink.getAttribute('href')).toBe('/records?tab=visitors');

    const overdueLink = screen.getByRole('link', { name: /已到期事项：2，查看明细/ });
    expect(overdueLink.getAttribute('href')).toBe('/overview?scope=overdue');

    // 下钻区同样带筛选
    const failedLink = screen.getByRole('link', { name: /失败运行/ });
    expect(failedLink.getAttribute('href')).toBe('/records?state=FAILED');
  });

  it('口径与来源可展开：列出数据来源与缺失覆盖', () => {
    renderPanel();

    expect(screen.getByText(/口径与来源（每个数字都能追到明细）/)).toBeDefined();
    expect(screen.getByText(/ConversationMessage\(role=visitor\)/)).toBeDefined();
    // 「缺失不计 0」在用量说明与 missing 条目里都出现，用 getAllBy
    expect(screen.getAllByText(/缺失不计 0/).length).toBeGreaterThan(0);
  });

  it('缺少用量时显示「—」而不是 0：缺失 ≠ 0', () => {
    mockQuery({
      data: stats({
        usage: { runs: 3, runsWithUsage: 0, coverage: 0, tokensIn: null, tokensOut: null, totalTokens: null },
      }),
    });
    renderPanel();

    // 总量显示占位符，而不是 0
    expect(screen.getByText(/用量：— tokens/)).toBeDefined();
    expect(screen.getByText(/覆盖 0%/)).toBeDefined();
  });

  it('没有分母的比率显示「—」（覆盖率为 null 时不写成 0% 或 100%）', () => {
    mockQuery({
      data: stats({
        usage: { runs: 0, runsWithUsage: 0, coverage: null, tokensIn: null, tokensOut: null, totalTokens: null },
      }),
    });
    renderPanel();

    // usage 与 answerOutcome 的覆盖率都是 null → 两处都显示「—」，绝不能写成 0%
    const dashed = screen.getAllByText(/覆盖 —/);
    expect(dashed.length).toBeGreaterThan(0);
    expect(screen.queryByText(/覆盖 0%/)).toBeNull();
    expect(screen.queryByText(/覆盖 100%/)).toBeNull();
  });

  it('空数据时给出可开始的引导，且不画任何趋势图', () => {
    mockQuery({
      data: stats({
        asks: { visitorMessages: 0, conversations: 0, turns: 0, regenerationAttempts: 0 },
        reminders: { open: 0, overdue: 0, occurrencesCreated: 0, resolved: { done: 0, snoozed: 0, ignored: 0 } },
        content: {
          changes: 0, releases: 0, published: 0, publicationAvailable: true,
          stages: { draft: 0, review: 0, ready: 0, live: 0 },
          versionStates: { workingAhead: 0, indexBehind: 0, indexUnknown: 0, inSync: 0 },
        },
      }),
    });
    renderPanel();

    expect(screen.getByText(/这个窗口还没有数据/)).toBeDefined();
    expect(screen.getByText(/数字会随真实事实出现，这里不画趋势图/)).toBeDefined();
    // 没有假图表：不含 svg 图表元素
    expect(document.querySelector('svg.chart')).toBeNull();
  });

  it('窗口可切换，切换后用新窗口重新查询', async () => {
    const refetch = vi.fn();
    mockQuery({ refetch });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '近 24 小时' }));

    await waitFor(() => {
      // 最后一次调用应带 24h
      const calls = useOpsOverviewMock.mock.calls;
      expect(calls[calls.length - 1]![0]).toMatchObject({ window: '24h' });
    });
  });

  it('默认按 5 秒轮询；页面隐藏时停轮询', () => {
    renderPanel();
    expect(useOpsOverviewMock.mock.calls[0]![0]).toMatchObject({ refetchInterval: 5_000 });
  });

  it('读取失败显示错误并给重试，不显示假数字', () => {
    const refetch = vi.fn();
    mockQuery({ data: undefined, dataUpdatedAt: 0, isError: true, error: new Error('无法连接'), refetch });
    renderPanel();

    expect(screen.getByRole('alert')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /重新读取/ }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.queryByText('访客提问')).toBeNull();
  });
});
