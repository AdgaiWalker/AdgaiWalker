import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderInbox } from '@walker/shared';
import { ReminderInboxPanel } from './ReminderInboxPanel';

const { useReminderInboxMock, useDisposeReminderMock, disposeMutationMock } = vi.hoisted(() => {
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    useReminderInboxMock: vi.fn(),
    useDisposeReminderMock: vi.fn(() => mutation),
    disposeMutationMock: mutation,
  };
});

vi.mock('../api/queries', () => ({
  useReminderInbox: useReminderInboxMock,
  useDisposeReminder: useDisposeReminderMock,
}));

function inbox(overrides: Partial<ReminderInbox> = {}): ReminderInbox {
  return {
    today: '2026-09-26',
    timezone: 'Asia/Shanghai',
    generatedAt: '2026-09-26T02:00:00.000Z',
    counts: { overdue: 1, today: 1, upcoming: 1, undated: 1 },
    items: [
      {
        actionId: 'act-overdue',
        title: '更新：过期文章',
        note: null,
        status: 'OPEN',
        plannedDate: '2026-09-20',
        dueAt: '2026-09-19T16:00:00.000Z',
        timezone: 'Asia/Shanghai',
        dueState: 'overdue',
        occurrenceOutcome: null,
        hasPendingOccurrence: false,
        contentSlug: 'post-a',
      },
      {
        actionId: 'act-today',
        title: '更新：今天该看',
        note: '核对数据',
        status: 'OPEN',
        plannedDate: '2026-09-26',
        dueAt: '2026-09-25T16:00:00.000Z',
        timezone: 'Asia/Shanghai',
        dueState: 'today',
        occurrenceOutcome: 'PENDING',
        hasPendingOccurrence: true,
        contentSlug: 'post-b',
      },
      {
        actionId: 'act-upcoming',
        title: '更新：以后再看',
        note: null,
        status: 'OPEN',
        plannedDate: '2026-10-10',
        dueAt: '2026-10-09T16:00:00.000Z',
        timezone: 'Asia/Shanghai',
        dueState: 'upcoming',
        occurrenceOutcome: null,
        hasPendingOccurrence: false,
        contentSlug: null,
      },
      {
        actionId: 'act-undated',
        title: '更新：还没排期',
        note: null,
        status: 'OPEN',
        plannedDate: null,
        dueAt: null,
        timezone: null,
        dueState: 'undated',
        occurrenceOutcome: null,
        hasPendingOccurrence: false,
        contentSlug: null,
      },
    ],
    ...overrides,
  };
}

function renderPanel(props: { contentSlug?: string } = {}) {
  return render(
    <MemoryRouter>
      <ReminderInboxPanel {...props} />
    </MemoryRouter>,
  );
}

describe('ReminderInboxPanel（O04 提醒箱界面）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disposeMutationMock.isPending = false;
    useReminderInboxMock.mockReturnValue({
      data: inbox(),
      dataUpdatedAt: Date.now(),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('按服务端到期分类展示四类事项与计数，并显示站点时区与今天', () => {
    renderPanel();

    expect(screen.getByText('提醒箱')).toBeDefined();
    // 四类到期徽章各自可见（「未排期」在到期列也会出现，故用 getAllBy）
    expect(screen.getByText('已到期')).toBeDefined();
    expect(screen.getByText('今天到期')).toBeDefined();
    expect(screen.getByText('即将到期')).toBeDefined();
    expect(screen.getAllByText('未排期').length).toBeGreaterThan(0);
    // 服务端给的今天与站点时区如实展示
    expect(screen.getByText(/站点时区 Asia\/Shanghai/)).toBeDefined();
    expect(screen.getByText(/今天 2026-09-26/)).toBeDefined();
    // 到期瞬时同样展示，便于核对跨日
    expect(screen.getByText(/UTC 2026-09-19T16:00:00.000Z/)).toBeDefined();
  });

  it('从概览带 scope=overdue 下钻时仅显示已到期事项', () => {
    render(
      <MemoryRouter initialEntries={['/overview?scope=overdue']}>
        <ReminderInboxPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText(/已应用筛选：仅显示已到期事项/)).toBeDefined();
    // 只有逾期项可见
    expect(screen.getByText('更新：过期文章')).toBeDefined();
    expect(screen.queryByText('更新：今天该看')).toBeNull();
    expect(screen.queryByText('更新：以后再看')).toBeNull();
  });

  it('内容详情内嵌时只显示该内容的提醒', () => {
    renderPanel({ contentSlug: 'post-a' });

    expect(screen.getByText('更新：过期文章')).toBeDefined();
    expect(screen.queryByText('更新：今天该看')).toBeNull();
    expect(screen.queryByText('更新：以后再看')).toBeNull();
  });

  it('完成：调用处置接口并回传 requestKey；重复点击复用同一键（服务端幂等）', async () => {
    disposeMutationMock.mutateAsync.mockResolvedValue({ disposition: 'complete', replayed: false });
    renderPanel();

    const completeButtons = screen.getAllByRole('button', { name: /完成/ });
    fireEvent.click(completeButtons[0]!);
    fireEvent.click(completeButtons[0]!);

    await waitFor(() => expect(disposeMutationMock.mutateAsync).toHaveBeenCalledTimes(2));

    const first = disposeMutationMock.mutateAsync.mock.calls[0]![0];
    const second = disposeMutationMock.mutateAsync.mock.calls[1]![0];
    expect(first).toMatchObject({ disposition: 'complete', actionId: 'act-overdue' });
    // 同一按钮重复点击必须复用同一 requestKey —— 否则服务端会当成两次不同操作
    expect(second.requestKey).toBe(first.requestKey);
    expect(first.requestKey).toBeTruthy();
  });

  it('幂等回放如实提示，不谎称又执行了一次', async () => {
    disposeMutationMock.mutateAsync.mockResolvedValue({ disposition: 'complete', replayed: true });
    renderPanel();

    fireEvent.click(screen.getAllByRole('button', { name: /完成/ })[0]!);

    await waitFor(() => {
      expect(screen.getByText(/此前已生效（重复点击未产生第二次副作用）/)).toBeDefined();
    });
  });

  it('延后：按本地日期 +7 天，不经 UTC 偏移算错一天', async () => {
    disposeMutationMock.mutateAsync.mockResolvedValue({ disposition: 'snooze', replayed: false });
    renderPanel();

    // 第一条是 plannedDate=2026-09-20 的逾期项 → +7 天应为 2026-09-27
    fireEvent.click(screen.getAllByRole('button', { name: /延后 7 天/ })[0]!);

    await waitFor(() => expect(disposeMutationMock.mutateAsync).toHaveBeenCalled());
    expect(disposeMutationMock.mutateAsync.mock.calls[0]![0]).toMatchObject({
      disposition: 'snooze',
      plannedDate: '2026-09-27',
    });
  });

  it('忽略：带原因提交，并提示已忽略', async () => {
    disposeMutationMock.mutateAsync.mockResolvedValue({ disposition: 'ignore', replayed: false });
    renderPanel();

    fireEvent.click(screen.getAllByRole('button', { name: /忽略/ })[0]!);

    await waitFor(() => expect(disposeMutationMock.mutateAsync).toHaveBeenCalled());
    expect(disposeMutationMock.mutateAsync.mock.calls[0]![0]).toMatchObject({
      disposition: 'ignore',
      reason: '在提醒箱里忽略',
    });
    await waitFor(() => expect(screen.getByText('已忽略这次提醒')).toBeDefined());
  });

  it('失败时如实报错，不假装成功', async () => {
    disposeMutationMock.mutateAsync.mockRejectedValue(new Error('内容已变化，请重新读取后再保存'));
    renderPanel();

    fireEvent.click(screen.getAllByRole('button', { name: /完成/ })[0]!);

    await waitFor(() => {
      expect(screen.getByText('内容已变化，请重新读取后再保存')).toBeDefined();
    });
  });

  it('空态说明如何开始，不伪造提醒', () => {
    useReminderInboxMock.mockReturnValue({
      data: inbox({ items: [], counts: { overdue: 0, today: 0, upcoming: 0, undated: 0 } }),
      dataUpdatedAt: Date.now(),
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPanel();

    expect(screen.getByText(/当前没有待处理的提醒/)).toBeDefined();
    expect(screen.getByText(/为内容设置某日提醒后/)).toBeDefined();
  });

  it('读取失败时显示错误并给重试，不显示假数据', () => {
    const refetch = vi.fn();
    useReminderInboxMock.mockReturnValue({
      data: undefined,
      dataUpdatedAt: 0,
      isPending: false,
      isError: true,
      error: new Error('无法连接'),
      refetch,
    });
    renderPanel();

    // ErrorState 用统一标题 + 兜底说明（非 ApiError 时不外显原始堆栈文案）
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('暂时无法读取数据')).toBeDefined();
    expect(screen.getByRole('button', { name: /重新读取/ })).toBeDefined();
    // 关键：失败时绝不显示任何提醒数据
    expect(screen.queryByText('更新：过期文章')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /重新读取/ }));
    expect(refetch).toHaveBeenCalled();
  });
});
