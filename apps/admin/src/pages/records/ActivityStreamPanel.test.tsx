import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityCounts, ActivityEvent, ActivityPage } from '@walker/shared';
import { ActivityStreamPanel } from './ActivityStreamPanel';
import { RunListPage } from './RunListPage';

const { useActivityCountsMock, useActivityMock } = vi.hoisted(() => ({
  useActivityCountsMock: vi.fn(),
  useActivityMock: vi.fn(),
}));

vi.mock('../../api/queries', () => ({
  useActivityCounts: useActivityCountsMock,
  useActivity: useActivityMock,
}));

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    key: 'run:1',
    ts: '2026-10-12T10:00:00.000Z',
    kind: 'run',
    severity: 'info',
    title: 'Agent · SUCCEEDED 1.2 s',
    detail: null,
    provenance: { kind: 'run', id: '1', ref: null },
    isTodo: false,
    ...overrides,
  };
}

function page(overrides: Partial<ActivityPage> = {}): ActivityPage {
  return { events: [], sourceLimit: 30, next: null, ...overrides };
}

function counts(overrides: Partial<ActivityCounts> = {}): ActivityCounts {
  return {
    remindersPending: 0,
    answersDegraded: 0,
    runsFailed: 0,
    releaseWorkingAhead: null,
    ...overrides,
  };
}

/**
 * 绝大多数用例直接渲染面板；旧 tab 映射那条必须经过 RunListPage（映射 effect 在那）。
 */
function renderPanel(initialEntry = '/records') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ActivityStreamPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <RunListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockQueries(input: {
  counts?: Partial<ActivityCounts>;
  events?: ActivityEvent[];
  next?: string | null;
} = {}) {
  useActivityCountsMock.mockReturnValue({
    data: counts(input.counts),
    dataUpdatedAt: Date.now(),
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  useActivityMock.mockReturnValue({
    data: page({ events: input.events ?? [], next: input.next ?? null }),
    dataUpdatedAt: Date.now(),
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('ActivityStreamPanel（运营活动流）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueries();
  });

  it('四个计数卡片如实显示：null 是「—」，0 就是 0', () => {
    mockQueries({
      counts: {
        remindersPending: 3,
        answersDegraded: 2,
        runsFailed: 0,
        releaseWorkingAhead: null,
      },
    });
    renderPanel();
    expect(screen.getByRole('button', { name: /未完成事项：3/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /降级回答（7 天）：2/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /失败回答（7 天）：0/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /发布未确证：待核对/ })).toBeDefined();
  });

  it('时间线按行渲染：待办置顶蓝、失败红、访客行带详情链接', () => {
    mockQueries({
      events: [
        event({
          key: 'visitor:c1',
          kind: 'visitor',
          severity: 'error',
          title: '为什么打不开？',
          detail: '3 轮 · post-a',
          provenance: { kind: 'visitor', id: 'c1', ref: null },
        }),
        event({
          key: 'run:2',
          severity: 'error',
          title: 'Agent · FAILED 2 s',
          detail: '停止原因：runtime-error',
          provenance: { kind: 'run', id: '2', ref: null },
        }),
        event({
          key: 'reminder:a1',
          kind: 'reminder',
          severity: 'todo',
          title: '到期事项标题',
          detail: '到期 2026-10-13',
          provenance: { kind: 'reminder', id: 'a1', ref: null },
          isTodo: true,
        }),
      ],
    });
    renderPanel();

    // 访客行有链接到会话详情（复用既有详情页，不复制渲染）；
    // 行内链接的可达名是「异常」，与运行行区分用 href 定位
    const links = screen.getAllByRole('link', { name: /异常/ }) as HTMLAnchorElement[];
    const visitorLink = links.find((item) => item.getAttribute('href')?.includes('/records/conversations/c1'));
    expect(visitorLink).toBeDefined();
    // 失败运行红、待办蓝
    expect(screen.getByText('Agent · FAILED 2 s').style.color).toMatch(/#b91c1c|rgb\(185/);
    expect(screen.getByText('到期事项标题').style.color).toMatch(/#1d4ed8|rgb\(29/);
  });

  it('类型筛选进 URL（可分享）：点「访客」后以 kind=visitor 重新拉取', () => {
    renderPanel('/records');
    expect(useActivityMock.mock.calls.at(-1)?.[0]).toMatchObject({ kinds: '' });
    fireEvent.click(screen.getByRole('button', { name: '访客' }));
    expect(useActivityMock.mock.calls.at(-1)?.[0]).toMatchObject({ kinds: 'visitor', before: null });
  });

  it('旧链接 ?tab=visitors 映射为 kind=visitor 筛选（不设重定向表，但语义不丢）', async () => {
    renderPage('/records?tab=visitors');
    await waitFor(() => expect(useActivityMock.mock.calls.at(-1)?.[0]).toMatchObject({ kinds: 'visitor' }), {
      timeout: 2_000,
    });
  });

  it('空结果区分「筛完为空」与「本来就没有」', () => {
    renderPanel('/records');
    expect(screen.getByText('暂无运营记录')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '复盘' }));
    expect(screen.getByText('该类型暂无记录')).toBeDefined();
  });

  it('翻更早传时间游标，回到最新清掉它', () => {
    mockQueries({ next: '2026-10-11T00:00:00.000Z' });
    renderPanel('/records');
    fireEvent.click(screen.getByRole('button', { name: /加载更早/ }));
    expect(useActivityMock.mock.calls.at(-1)?.[0]).toMatchObject({ before: '2026-10-11T00:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: /回到最新/ }));
    expect(useActivityMock.mock.calls.at(-1)?.[0]).toMatchObject({ before: null });
  });
});
