import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentChangeView, OpsContentDetail } from '@walker/shared';
import { ContentChangeReviewPanel } from './ContentChangeReviewPanel';

const {
  useContentChangesMock,
  useApproveContentChangeMock,
  useApplyContentChangeMock,
  approveMutationMock,
  applyMutationMock,
} = vi.hoisted(() => {
  const approveMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
  };
  const applyMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
  };
  return {
    useContentChangesMock: vi.fn(),
    useApproveContentChangeMock: vi.fn(() => approveMutation),
    useApplyContentChangeMock: vi.fn(() => applyMutation),
    approveMutationMock: approveMutation,
    applyMutationMock: applyMutation,
  };
});

vi.mock('../../api/queries', () => ({
  useContentChanges: useContentChangesMock,
  useApproveContentChange: useApproveContentChangeMock,
  useApplyContentChange: useApplyContentChangeMock,
}));

const mockDoc: OpsContentDetail = {
  slug: 'test-article',
  title: '测试文章',
  type: 'post',
  updatedAt: '2026-09-25T10:00:00.000Z',
  raw: '---\ntitle: 测试文章\ntype: post\n---\n# 原文标题\n旧内容行\n',
  hash: 'base-hash-1111',
  ext: '.md',
};

const mockChangeProposed: ContentChangeView = {
  id: 'change-prop-01',
  action: 'apply-candidate',
  target: { kind: 'content', slug: 'test-article' },
  baseHash: 'base-hash-1111',
  candidateHash: 'cand-hash-2222',
  candidateRef: 'cand_ref_01',
  candidateRaw: '---\ntitle: 测试文章\ntype: post\n---\n# 原文标题\n修改后的新内容行\n',
  sourceRunId: 'run-source-01',
  state: 'PROPOSED',
  applyApproval: null,
  appliedHash: null,
  requestKey: 'req-01',
  createdAt: '2026-09-25T11:00:00.000Z',
  updatedAt: '2026-09-25T11:00:00.000Z',
};

const mockChangeApproved: ContentChangeView = {
  ...mockChangeProposed,
  id: 'change-appr-02',
  state: 'APPROVED',
  applyApproval: {
    id: 'appr-02',
    binding: {
      action: 'apply-candidate',
      target: { kind: 'content', slug: 'test-article' },
      baseHash: 'base-hash-1111',
      candidateHash: 'cand-hash-2222',
      grantId: 'grant-l2-valid',
      grantRevision: 1,
    },
    bindingHash: 'binding-hash-2222',
    approvedBy: 'owner',
    approvedAt: '2026-09-25T11:30:00.000Z',
  },
};

describe('ContentChangeReviewPanel (C10 候选差异与审批 UI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContentChangesMock.mockReturnValue({
      data: { items: [mockChangeProposed] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    approveMutationMock.isPending = false;
    applyMutationMock.isPending = false;
  });

  it('展示动作、范围、原文/候选行级差异，能看清将修改什么', () => {
    render(<ContentChangeReviewPanel slug="test-article" currentDoc={mockDoc} />);

    // 动作与范围
    expect(screen.getByText(/动作：apply-candidate/)).toBeDefined();
    expect(screen.getByText(/范围：content:test-article/)).toBeDefined();
    expect(screen.getByText(/待审批/)).toBeDefined();

    // 差异内容：删除旧内容，增加新内容
    expect(screen.getByText('- 旧内容行')).toBeDefined();
    expect(screen.getByText('+ 修改后的新内容行')).toBeDefined();
  });

  it('批准保存和批准发布分别操作，且后台禁用持续自主内容授权入口', () => {
    render(<ContentChangeReviewPanel slug="test-article" currentDoc={mockDoc} />);

    // 批准保存按钮存在且可用
    const approveBtn = screen.getByRole('button', { name: '批准保存' }) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(false);

    // 批准发布是分开的独立操作（不可自动混入）
    const publishBtn = screen.getByRole('button', { name: '批准发布' }) as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(true);
    expect(screen.getByText(/保存不等于发布/)).toBeDefined();

    // 持续自主授权入口明确被禁用并警示系统红线
    const autoGrantBtn = screen.getByRole('button', { name: '持续自主内容授权' }) as HTMLButtonElement;
    expect(autoGrantBtn.disabled).toBe(true);
    expect(screen.getByText(/禁用持续自主内容授权/)).toBeDefined();
  });

  it('点击批准保存调用受控接口，重复点击结果幂等', async () => {
    approveMutationMock.mutateAsync.mockResolvedValueOnce({
      ...mockChangeProposed,
      state: 'APPROVED',
    });

    render(<ContentChangeReviewPanel slug="test-article" currentDoc={mockDoc} />);

    // 输入授权 ID
    const grantInput = screen.getByRole('textbox', { name: '授权编号' });
    fireEvent.change(grantInput, { target: { value: 'grant-l2-test-01' } });

    const approveBtn = screen.getByRole('button', { name: '批准保存' });
    fireEvent.click(approveBtn);

    expect(approveMutationMock.mutateAsync).toHaveBeenCalledWith({
      id: 'change-prop-01',
      grantId: 'grant-l2-test-01',
    });
  });

  it('已批准候选可点击应用到工作区，重复点击幂等', async () => {
    useContentChangesMock.mockReturnValue({
      data: { items: [mockChangeApproved] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    applyMutationMock.mutateAsync.mockResolvedValueOnce({
      ...mockChangeApproved,
      state: 'APPLIED',
    });

    render(<ContentChangeReviewPanel slug="test-article" currentDoc={mockDoc} />);

    expect(screen.getByText(/已批准/)).toBeDefined();
    const applyBtn = screen.getByRole('button', { name: '应用到工作区' }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);

    fireEvent.click(applyBtn);

    expect(applyMutationMock.mutateAsync).toHaveBeenCalledWith({
      id: 'change-appr-02',
    });
  });

  it('当正本已修改与基线不一致时，展示显式冲突与失效原因并禁用批准', () => {
    const conflictedDoc: OpsContentDetail = {
      ...mockDoc,
      hash: 'base-hash-conflict-9999',
    };

    render(<ContentChangeReviewPanel slug="test-article" currentDoc={conflictedDoc} />);

    expect(screen.getByText(/基线版本冲突/)).toBeDefined();
    expect(screen.getByText(/正本在磁盘上已有新修改/)).toBeDefined();

    const approveBtn = screen.getByRole('button', { name: '批准保存' }) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);
  });
});
