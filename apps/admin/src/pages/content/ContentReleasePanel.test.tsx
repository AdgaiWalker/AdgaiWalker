import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type {
  ContentRelease,
  ContentVersionSnapshot,
  OpsContentDetail,
  ReleaseManifest,
  ReleasePreflightResult,
} from '@walker/shared';
import { ContentReleasePanel } from './ContentReleasePanel';

const {
  useContentVersionMock,
  useContentPreflightMock,
  useLatestContentReleaseMock,
  useTriggerContentReleaseMock,
  usePrepareContentReleaseMock,
  useVerifyContentReleaseMock,
  useReconcileContentReleaseMock,
  useCancelContentReleaseMock,
  useContentSocialStatsMock,
  useRecordSocialShareMock,
  triggerMutationMock,
  prepareMutationMock,
  verifyMutationMock,
  reconcileMutationMock,
  cancelMutationMock,
} = vi.hoisted(() => {
  const triggerMutation = { mutateAsync: vi.fn(), isPending: false };
  const prepareMutation = { mutateAsync: vi.fn(), isPending: false };
  const verifyMutation = { mutateAsync: vi.fn(), isPending: false };
  const reconcileMutation = { mutateAsync: vi.fn(), isPending: false };
  const cancelMutation = { mutateAsync: vi.fn(), isPending: false };
  const recordSocialShareMutation = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };

  return {
    useContentVersionMock: vi.fn(),
    useContentPreflightMock: vi.fn(),
    useLatestContentReleaseMock: vi.fn(),
    useTriggerContentReleaseMock: vi.fn(() => triggerMutation),
    usePrepareContentReleaseMock: vi.fn(() => prepareMutation),
    useVerifyContentReleaseMock: vi.fn(() => verifyMutation),
    useReconcileContentReleaseMock: vi.fn(() => reconcileMutation),
    useCancelContentReleaseMock: vi.fn(() => cancelMutation),
    useContentSocialStatsMock: vi.fn(() => ({ data: { shareCount: 0, lastSharedAt: null, records: [] }, refetch: vi.fn() })),
    useRecordSocialShareMock: vi.fn(() => recordSocialShareMutation),
    triggerMutationMock: triggerMutation,
    prepareMutationMock: prepareMutation,
    verifyMutationMock: verifyMutation,
    reconcileMutationMock: reconcileMutation,
    cancelMutationMock: cancelMutation,
    recordSocialShareMutationMock: recordSocialShareMutation,
  };
});

vi.mock('../../api/queries', () => ({
  useContentVersion: useContentVersionMock,
  useContentPreflight: useContentPreflightMock,
  useLatestContentRelease: useLatestContentReleaseMock,
  useTriggerContentRelease: useTriggerContentReleaseMock,
  usePrepareContentRelease: usePrepareContentReleaseMock,
  useVerifyContentRelease: useVerifyContentReleaseMock,
  useReconcileContentRelease: useReconcileContentReleaseMock,
  useCancelContentRelease: useCancelContentReleaseMock,
  useContentSocialStats: useContentSocialStatsMock,
  useRecordSocialShare: useRecordSocialShareMock,
}));

const mockDoc: OpsContentDetail = {
  slug: 'test-article',
  title: '测试文章',
  type: 'post',
  updatedAt: '2026-09-25T12:00:00.000Z',
  raw: '---\ntitle: 测试文章\n---\n正文',
  hash: 'a'.repeat(64),
  ext: '.md',
};

const mockManifest: ReleaseManifest = {
  targetSlug: 'test-article',
  targetHash: 'a'.repeat(64),
  headCommit: 'abcdef12',
  manifestHash: 'm'.repeat(64),
  createdAt: '2026-09-25T12:00:00.000Z',
  items: [
    {
      path: 'content/log/test-article.md',
      slug: 'test-article',
      hash: 'a'.repeat(64),
      kind: 'content',
      status: 'modified',
    },
  ],
};

const mockPreflightOk: ReleasePreflightResult = {
  ok: true,
  missing: [],
  targetSlug: 'test-article',
  targetHash: 'a'.repeat(64),
  publicHash: 'a'.repeat(64),
  manifest: mockManifest,
  scopeConflict: null,
};

const mockVersionSnapshot: ContentVersionSnapshot = {
  workingHash: 'a'.repeat(64),
  publishedHash: 'b'.repeat(64),
  indexedHash: 'c'.repeat(64),
};

const mockRelease: ContentRelease = {
  id: 'rel-123456',
  changeId: 'chg-789',
  action: 'publish-website',
  target: { kind: 'content', slug: 'test-article' },
  baseHash: 'b'.repeat(64),
  sourceHash: 'a'.repeat(64),
  publishApproval: {
    id: 'app-999',
    binding: {
      action: 'publish-website',
      target: { kind: 'content', slug: 'test-article' },
      baseHash: 'b'.repeat(64),
      candidateHash: 'a'.repeat(64),
      grantId: 'grant-test-l2',
      grantRevision: 1,
    },
    bindingHash: 'h'.repeat(64),
    approvedBy: 'owner',
    approvedAt: '2026-09-25T12:01:00.000Z',
  },
  stage: 'PREPARED',
  assistantIndexState: 'PENDING',
  manifestHash: 'm'.repeat(64),
  manifestRef: null,
  gitCommit: null,
  publishedSnapshotId: null,
  verifiedHash: null,
  verifiedAt: null,
  errorCode: null,
  requestKey: 'req-key-1',
  createdAt: '2026-09-25T12:01:00.000Z',
  updatedAt: '2026-09-25T12:01:00.000Z',
};

describe('ContentReleasePanel (C20 发布清单与版本状态界面)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContentVersionMock.mockReturnValue({
      data: mockVersionSnapshot,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    });
    useContentPreflightMock.mockReturnValue({
      data: mockPreflightOk,
      dataUpdatedAt: Date.now(),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useLatestContentReleaseMock.mockReturnValue({
      data: mockRelease,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    });

    triggerMutationMock.isPending = false;
    prepareMutationMock.isPending = false;
    verifyMutationMock.isPending = false;
    reconcileMutationMock.isPending = false;
    cancelMutationMock.isPending = false;
  });

  it('正确渲染编辑/网页/问答三版本状态与同步差异徽章', () => {
    render(
      <MemoryRouter>
        <ContentReleasePanel slug="test-article" currentDoc={mockDoc} />
      </MemoryRouter>,
    );

    expect(screen.getByText('版本状态（正本 · 网页 · 问答索引）')).toBeDefined();
    expect(screen.getByText('编辑正本版本（工作区文件）')).toBeDefined();
    expect(screen.getByText('网页发布版本（线上确证）')).toBeDefined();
    expect(screen.getByText('问答快照版本（公开助理索引）')).toBeDefined();
    expect(screen.getByText('有待发布修改')).toBeDefined();
    expect(screen.getByText('索引待同步')).toBeDefined();
  });

  it('预检通过时正确展示稳定清单 manifest 与提交文件列表', () => {
    render(
      <MemoryRouter>
        <ContentReleasePanel slug="test-article" currentDoc={mockDoc} />
      </MemoryRouter>,
    );

    expect(screen.getByText('预检通过：发布范围安全，门禁字段完整')).toBeDefined();
    expect(screen.getByText('content/log/test-article.md')).toBeDefined();
    expect(screen.getByText('abcdef12')).toBeDefined();
  });

  it('发布范围冲突或门禁字段不完整时展示阻塞路径与错误原因，且禁用发布按钮', () => {
    useContentPreflightMock.mockReturnValue({
      data: {
        ok: false,
        missing: ['summary', 'valueMode'],
        scopeConflict: {
          reason: 'code-dirty',
          message: '检测到 2 个代码文件处于未提交状态，为防止夹带代码，禁止发布',
          details: ['apps/api/src/index.ts', 'packages/shared/src/index.ts'],
        },
      },
      dataUpdatedAt: Date.now(),
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ContentReleasePanel slug="test-article" currentDoc={mockDoc} />
      </MemoryRouter>,
    );

    expect(screen.getByText('发布范围冲突或门禁字段不完整，发布受阻')).toBeDefined();
    expect(screen.getByText('apps/api/src/index.ts')).toBeDefined();
    expect(screen.getByText('packages/shared/src/index.ts')).toBeDefined();
    const pathDetails = screen.getByText('查看全部 2 条阻断路径').closest('details');
    expect(pathDetails).not.toBeNull();
    expect(pathDetails!.open).toBe(false);
    expect(screen.getByText(/summary、valueMode/)).toBeDefined();

    const publishBtn = screen.getByRole('button', { name: '执行发布上线' }) as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(true);
  });

  it('展示独立发布批准信息，点击执行发布触发上线流程并防重复点击', async () => {
    triggerMutationMock.mutateAsync.mockResolvedValueOnce({
      runId: 'run-rel-test-888',
      status: 'RUNNING',
    });

    render(
      <MemoryRouter>
        <ContentReleasePanel slug="test-article" currentDoc={mockDoc} />
      </MemoryRouter>,
    );

    expect(screen.getByText('已绑定独立发布批准')).toBeDefined();
    expect(screen.getByText(/grant-test-l2/)).toBeDefined();

    const publishBtn = screen.getByRole('button', { name: '执行发布上线' }) as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(false);

    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(triggerMutationMock.mutateAsync).toHaveBeenCalledWith({
        slug: 'test-article',
        releaseId: 'rel-123456',
      });
    });

    expect(screen.getByText(/上线流程已触发，运行 ID：run-rel-test-888/)).toBeDefined();
  });

  it('上一单已发布且工作版本变化时可再次批准，但不能执行旧发布单', () => {
    useContentPreflightMock.mockReturnValue({
      data: { ...mockPreflightOk, publicHash: 'd'.repeat(64) }, dataUpdatedAt: Date.now(),
      isPending: false, isError: false, refetch: vi.fn(),
    });
    useLatestContentReleaseMock.mockReturnValue({
      data: { ...mockRelease, stage: 'PUBLISHED', verifiedHash: 'a'.repeat(64) },
      dataUpdatedAt: Date.now(), refetch: vi.fn(),
    });
    render(<MemoryRouter><ContentReleasePanel slug="test-article" currentDoc={mockDoc} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: '独立发布批准' })).toBeDefined();
    expect((screen.getByRole('button', { name: '执行发布上线' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('处于 FAILED 或 UNKNOWN 阶段时显示失败解释并提供核对与重试核验动作，声明不假设回滚成功', async () => {
    useLatestContentReleaseMock.mockReturnValue({
      data: {
        ...mockRelease,
        stage: 'UNKNOWN',
        errorCode: 'push-lost-unknown',
      },
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    });

    reconcileMutationMock.mutateAsync.mockResolvedValueOnce({
      releaseId: 'rel-123456',
      previousStage: 'UNKNOWN',
      currentStage: 'VERIFYING',
      resolved: false,
      nextAction: 'wait-deployment',
      details: 'Git 提交已在远程存在，正等待 Vercel 部署生效',
    });

    render(
      <MemoryRouter>
        <ContentReleasePanel slug="test-article" currentDoc={mockDoc} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/发布处于 UNKNOWN 阶段/)).toBeDefined();
    expect(screen.getByText(/系统不会假定或承诺自动回滚已成功/)).toBeDefined();

    const reconcileBtn = screen.getByRole('button', { name: '核对真实状态' });
    fireEvent.click(reconcileBtn);

    await waitFor(() => {
      expect(reconcileMutationMock.mutateAsync).toHaveBeenCalledWith('rel-123456');
    });

    expect(screen.getByText(/Git 提交已在远程存在，正等待 Vercel 部署生效/)).toBeDefined();
  });

  it('发布成功为 PUBLISHED 阶段时展示社媒宣发卡片，支持发到 X 与复制文案', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextSpy },
      configurable: true,
      writable: true,
    });

    useLatestContentReleaseMock.mockReturnValue({
      data: { ...mockRelease, stage: 'PUBLISHED', verifiedHash: 'a'.repeat(64) },
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ContentReleasePanel slug="test-article" currentDoc={mockDoc} />
      </MemoryRouter>,
    );

    const shareCard = screen.getByTestId('social-share-panel');
    expect(shareCard).toBeDefined();
    expect(screen.getByText(/文章已确证上线！/)).toBeDefined();
    expect(screen.getByText(/已根据文章标题与摘要自动组装精炼推文/)).toBeDefined();

    // 点击发到 X 按钮
    const xButton = screen.getByRole('button', { name: /发到 X \(Twitter\)/ });
    fireEvent.click(xButton);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://x.com/intent/tweet'),
      '_blank',
      'noopener,noreferrer',
    );

    // 点击复制宣发文案
    const copyButton = screen.getByRole('button', { name: /复制宣发文案/ });
    fireEvent.click(copyButton);
    expect(writeTextSpy).toHaveBeenCalled();
  });
});
