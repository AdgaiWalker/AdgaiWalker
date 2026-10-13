import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewEntryView } from '@walker/shared';
import { ContentReviewPanel } from './ContentReviewPanel';

const { useReviewsMock, useCreateReviewMock, createMutationMock, useConvertReviewToActionMock, convertMutationMock } = vi.hoisted(() => {
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  const convert = { mutateAsync: vi.fn(), isPending: false };
  return {
    useReviewsMock: vi.fn(),
    useCreateReviewMock: vi.fn(() => mutation),
    createMutationMock: mutation,
    useConvertReviewToActionMock: vi.fn(() => convert),
    convertMutationMock: convert,
  };
});

vi.mock('../../api/queries', () => ({
  useReviews: useReviewsMock,
  useCreateReview: useCreateReviewMock,
  useConvertReviewToAction: useConvertReviewToActionMock,
}));

const mockReviews: ReviewEntryView[] = [
  {
    id: 'rev-1',
    actionId: 'act-101',
    releaseId: 'rel-202',
    didWhat: '优化标题与三处核心数据说明',
    observed: '访客提问中该词匹配率上升，但样本量仅 3 次',
    windowStart: '2026-09-20',
    windowEnd: '2026-09-27',
    nextAttempt: '下周增加案例演示部分，再对比提问转化',
    evidenceState: 'UNKNOWN',
    evidenceNote: '来源于 /ops/overview 7d 窗口，样本不足无法证明因果',
    createdBy: 'owner',
    requestKey: 'req-rev-1',
    createdAt: '2026-09-27T01:00:00.000Z',
    updatedAt: '2026-09-27T01:00:00.000Z',
  },
  {
    id: 'rev-2',
    actionId: 'act-102',
    releaseId: null,
    didWhat: '修复移动端代码块溢出排版',
    observed: '格式正常无换行截断',
    windowStart: null,
    windowEnd: null,
    nextAttempt: null,
    evidenceState: 'SUFFICIENT',
    evidenceNote: '经过全尺寸机型真机核验',
    createdBy: 'owner',
    requestKey: 'req-rev-2',
    createdAt: '2026-09-26T12:00:00.000Z',
    updatedAt: '2026-09-26T12:00:00.000Z',
  },
];

describe('ContentReviewPanel (O08 内容更新复盘)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMutationMock.isPending = false;
    convertMutationMock.isPending = false;
    useReviewsMock.mockReturnValue({
      data: mockReviews,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('展示复盘历史列表，包含行为、观察、证据状态与下一次尝试', () => {
    render(<ContentReviewPanel />);

    expect(screen.getByText('内容更新复盘')).toBeDefined();
    expect(screen.getByText('优化标题与三处核心数据说明')).toBeDefined();
    expect(screen.getByText(/访客提问中该词匹配率上升/)).toBeDefined();
    expect(screen.getByText('证据未知 / 样本不足')).toBeDefined();
    expect(screen.getByText(/来源于 \/ops\/overview 7d 窗口/)).toBeDefined();
    expect(screen.getByText(/下周增加案例演示部分/)).toBeDefined();
    expect(screen.getByText(/事项：act-101/)).toBeDefined();
    expect(screen.getByText(/发布：rel-202/)).toBeDefined();

    // 第二条复盘
    expect(screen.getByText('修复移动端代码块溢出排版')).toBeDefined();
    expect(screen.getByText('已验证成效')).toBeDefined();
  });

  it('登记新复盘表单可展开，支持填写完整事实并提交', async () => {
    createMutationMock.mutateAsync.mockResolvedValue({});
    render(<ContentReviewPanel />);

    // 默认表单不展开
    expect(screen.queryByLabelText('做了什么变更')).toBeNull();

    // 点击登记新复盘展开表单
    fireEvent.click(screen.getByRole('button', { name: '登记新复盘' }));
    expect(screen.getByLabelText('做了什么变更')).toBeDefined();
    expect(screen.getByText('收起表单')).toBeDefined();

    // 填写必填项
    fireEvent.change(screen.getByLabelText('关联事项 ID'), { target: { value: 'act-new' } });
    fireEvent.change(screen.getByLabelText('做了什么变更'), { target: { value: '把一句话改成三句话' } });
    fireEvent.change(screen.getByLabelText('观察到的结果'), { target: { value: '提问稍有增加' } });
    fireEvent.change(screen.getByLabelText('证据充分度'), { target: { value: 'UNKNOWN' } });
    fireEvent.change(screen.getByLabelText('证据来源说明'), { target: { value: '样本仅 2 次，数据来自 overview' } });
    fireEvent.change(screen.getByLabelText('下一次尝试'), { target: { value: '继续观察一周' } });

    // 提交
    fireEvent.click(screen.getByRole('button', { name: '保存复盘记录' }));

    await waitFor(() => expect(createMutationMock.mutateAsync).toHaveBeenCalled());
    expect(createMutationMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'act-new',
        didWhat: '把一句话改成三句话',
        observed: '提问稍有增加',
        evidenceState: 'UNKNOWN',
        evidenceNote: '样本仅 2 次，数据来自 overview',
        nextAttempt: '继续观察一周',
        requestKey: expect.any(String),
      }),
    );
  });

  it('表单缺少必填项时给出明确提示且不提交', async () => {
    render(<ContentReviewPanel />);

    fireEvent.click(screen.getByRole('button', { name: '登记新复盘' }));
    // 留空事项 ID 与变更
    fireEvent.submit(screen.getByRole('button', { name: '保存复盘记录' }).closest('form')!);

    expect(createMutationMock.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('必须指定关联事项 ID')).toBeDefined();
  });

  it('有下一次尝试的复盘显示「转为下一事项」；点击后调用转换接口并携带日期与 requestKey', async () => {
    convertMutationMock.mutateAsync.mockResolvedValue({
      replayed: false,
      action: { id: 'act-new-1', title: '下一尝试：下周增加案例演示部分，再对比提问转化', plannedDate: '2026-10-10', dueAt: '2026-10-09T16:00:00.000Z' },
    });
    render(<ContentReviewPanel />);

    // 复盘 rev-1 有 nextAttempt → 显示转换控件
    const dateInput = screen.getByLabelText('为复盘 rev-1 设置提醒日期');
    expect(dateInput).toBeDefined();
    const convertButton = screen.getByRole('button', { name: '转为下一事项' });
    expect(convertButton).toBeDefined();

    // 填日期并点击
    fireEvent.change(dateInput, { target: { value: '2026-10-10' } });
    fireEvent.click(convertButton);

    await waitFor(() => expect(convertMutationMock.mutateAsync).toHaveBeenCalledTimes(1));
    expect(convertMutationMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: 'rev-1',
        plannedDate: '2026-10-10',
        requestKey: expect.any(String),
      }),
    );

    await waitFor(() => {
      expect(screen.getByText(/已创建下一事项：下一尝试：下周增加案例演示部分/)).toBeDefined();
    });
  });

  it('转换幂等回放：replayed=true 时如实提示不谎称又执行了一次', async () => {
    convertMutationMock.mutateAsync.mockResolvedValue({
      replayed: true,
      action: { id: 'act-new-1', title: '下一尝试：下周增加案例演示部分，再对比提问转化', plannedDate: null, dueAt: null },
    });
    render(<ContentReviewPanel />);

    fireEvent.click(screen.getByRole('button', { name: '转为下一事项' }));

    await waitFor(() => {
      expect(screen.getByText(/这次转换此前已生效（重复点击未创建第二条事项）/)).toBeDefined();
    });
  });

  it('重复点击复用同一 requestKey（服务端据此幂等）', async () => {
    convertMutationMock.mutateAsync.mockResolvedValue({
      replayed: false,
      action: { id: 'act-new-2', title: '下一尝试：修复排版', plannedDate: null, dueAt: null },
    });
    render(<ContentReviewPanel />);

    fireEvent.click(screen.getByRole('button', { name: '转为下一事项' }));
    fireEvent.click(screen.getByRole('button', { name: '转为下一事项' }));

    await waitFor(() => expect(convertMutationMock.mutateAsync).toHaveBeenCalledTimes(2));
    const first = convertMutationMock.mutateAsync.mock.calls[0]![0];
    const second = convertMutationMock.mutateAsync.mock.calls[1]![0];
    expect(second.requestKey).toBe(first.requestKey);
  });

  it('空态说明如何开始，不伪造复盘记录', () => {
    useReviewsMock.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ContentReviewPanel />);

    expect(screen.getByText('暂无内容更新复盘记录')).toBeDefined();
    expect(screen.getByText(/完成内容发布与观察后/)).toBeDefined();
  });
});
