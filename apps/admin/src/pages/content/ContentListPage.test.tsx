import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ContentLedgerEntry } from '@walker/shared';
import { ContentListPage } from './ContentListPage';

const {
  useContentMock,
  useSaveContentMock,
  saveMutationMock,
  useAllContentSocialStatsMock,
  useContentSyncStatusMock,
  useContentSyncPullMock,
  syncPullMutationMock,
  useDeleteContentMock,
  deleteMutationMock,
} = vi.hoisted(() => {
  const saveMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  };
  const syncPullMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  };
  const deleteMutation = {
    mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    isPending: false,
  };
  return {
    useContentMock: vi.fn(),
    useSaveContentMock: vi.fn(() => saveMutation),
    saveMutationMock: saveMutation,
    useDeleteContentMock: vi.fn(() => deleteMutation),
    deleteMutationMock: deleteMutation,
    useAllContentSocialStatsMock: vi.fn(() => ({ data: {}, isLoading: false, refetch: vi.fn() })),
    useContentSyncStatusMock: vi.fn(() => ({
      data: {
        available: true,
        behind: 0,
        ahead: 0,
        headCommit: 'a1b2c3d',
        remoteCommit: 'a1b2c3d',
        dirtyFiles: [] as string[],
        incomingFiles: [] as string[],
        lastCheckedAt: '',
      },
      refetch: vi.fn(),
    })),
    useContentSyncPullMock: vi.fn(() => syncPullMutation),
    syncPullMutationMock: syncPullMutation,
  };
});

vi.mock('../../api/queries', () => ({
  useContent: useContentMock,
  useSaveContent: useSaveContentMock,
  useDeleteContent: useDeleteContentMock,
  useAllContentSocialStats: useAllContentSocialStatsMock,
  useContentSyncStatus: useContentSyncStatusMock,
  useContentSyncPull: useContentSyncPullMock,
}));

const mockItems: ContentLedgerEntry[] = [
  {
    slug: 'post-1',
    title: '知识文章一',
    type: 'knowledge',
    group: 'article',
    stage: 'live',
    visibility: 'public',
    missing: [],
    dirty: false,
    publication: { currentPublicHash: 'current-1', publishedHash: null, verifiedAt: null, indexedHash: null, latestAttemptStage: null },
    updatedAt: '2026-09-25T10:00:00.000Z',
  },
  {
    slug: 'proj-1',
    title: '桌面端项目',
    type: 'project',
    group: 'product',
    stage: 'ready',
    visibility: 'public',
    missing: [],
    dirty: false,
    publication: { currentPublicHash: 'current-2', publishedHash: 'current-2', verifiedAt: '2026-09-25T10:00:00.000Z', indexedHash: 'current-2', latestAttemptStage: 'PUBLISHED' },
    updatedAt: '2026-09-25T11:00:00.000Z',
  },
];

describe('ContentListPage (C22 类型筛选与小店内容边界)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContentMock.mockReturnValue({
      data: {
        data: mockItems,
        gitAvailable: true,
        publicationAvailable: true,
        generatedAt: '2026-09-25T12:00:00.000Z',
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('类型下拉包含项目与小店选项', () => {
    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );

    const select = screen.getByRole('combobox', { name: '内容类型' }) as HTMLSelectElement;
    expect(select).toBeDefined();

    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('project');
    expect(options).toContain('shop');
    expect(options).toContain('knowledge');
  });

  it('筛选项目类型时展示项目管理受控声明', () => {
    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );

    const select = screen.getByRole('combobox', { name: '内容类型' });
    fireEvent.change(select, { target: { value: 'project' } });

    expect(screen.getByText('项目内容管理')).toBeDefined();
    expect(screen.getByText(/前台访客及 AI 无法修改项目状态/)).toBeDefined();
    expect(screen.getByText('桌面端项目')).toBeDefined();
  });

  it('筛选阶段时按阶段过滤（支持从概览下钻）', () => {
    render(
      <MemoryRouter initialEntries={['/content?stage=ready']}>
        <ContentListPage />
      </MemoryRouter>,
    );

    // 只有 stage: 'ready' 的项目可见，'live' 的文章被过滤
    expect(screen.getByText('桌面端项目')).toBeDefined();
    expect(screen.queryByText('知识文章一')).toBeNull();
  });

  it('按网页确证筛选，不把 Git 干净的旧内容误标为已上线', () => {
    render(
      <MemoryRouter initialEntries={['/content?website=unverified']}>
        <ContentListPage />
      </MemoryRouter>,
    );

    expect((screen.getByRole('combobox', { name: '网页状态' }) as HTMLSelectElement).value).toBe('unverified');
    expect(screen.getByText('知识文章一')).toBeDefined();
    expect(screen.queryByText('桌面端项目')).toBeNull();
    const row = screen.getByText('知识文章一').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getAllByText('未核验').length).toBeGreaterThan(0);
  });

  it('筛选小店类型无内容时展示小店边界声明与未接入空态', () => {
    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );

    const select = screen.getByRole('combobox', { name: '内容类型' });
    fireEvent.change(select, { target: { value: 'shop' } });

    expect(screen.getByText('小店内容边界')).toBeDefined();
    expect(screen.getByText(/不建立订单或库存数据模型，不提供可执行交易操作/)).toBeDefined();
    expect(screen.getByText('小店暂无商品或服务介绍')).toBeDefined();
    expect(screen.getByText(/不建立订单\/库存数据模型，不提供在线交易功能/)).toBeDefined();
  });

  it('点击新建文章按钮弹出模态框，填写标题与标识并提交', async () => {
    saveMutationMock.mutateAsync.mockResolvedValueOnce({
      slug: 'my-new-diary',
      raw: 'content',
    });

    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );

    const newBtn = screen.getByRole('button', { name: /新建文章 \/ 日记/ });
    expect(newBtn).toBeDefined();
    fireEvent.click(newBtn);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('heading', { name: '新建文章 / 日记' })).toBeDefined();

    const titleInput = screen.getByLabelText(/文章 \/ 日记标题/);
    const slugInput = screen.getByLabelText(/文件名标识/);

    fireEvent.change(titleInput, { target: { value: '我的第一篇测试日记' } });
    fireEvent.change(slugInput, { target: { value: 'my-new-diary' } });

    const submitBtn = screen.getByRole('button', { name: '创建并开写' });
    fireEvent.click(submitBtn);

    expect(saveMutationMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'my-new-diary',
        expectedHash: null,
      }),
    );
  });

  it('支持在新建模态框中点击 + 添加自定义内容类型并选中创建', async () => {
    saveMutationMock.mutateAsync.mockResolvedValueOnce({
      slug: 'my-essay-1',
      raw: 'content',
    });

    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );

    // 打开模态框
    const newBtn = screen.getByRole('button', { name: /新建文章 \/ 日记/ });
    fireEvent.click(newBtn);

    // 点击 + 按钮展开添加表单
    const plusBtn = screen.getByRole('button', { name: '添加新内容类型按钮' });
    fireEvent.click(plusBtn);

    // 输入标识与名称
    const valInput = screen.getByLabelText('新类型标识');
    const labelInput = screen.getByLabelText('新类型名称');

    fireEvent.change(valInput, { target: { value: 'essay' } });
    fireEvent.change(labelInput, { target: { value: '随笔感悟' } });

    // 确认添加
    const confirmBtn = screen.getByRole('button', { name: '确定添加' });
    fireEvent.click(confirmBtn);

    // 检查下拉选择器已选中新类型
    const typeSelect = screen.getByLabelText('新建内容类型') as HTMLSelectElement;
    expect(typeSelect.value).toBe('essay');

    // 提交创建
    const titleInput = screen.getByLabelText(/文章 \/ 日记标题/);
    const slugInput = screen.getByLabelText(/文件名标识/);
    fireEvent.change(titleInput, { target: { value: '我的第一篇随笔' } });
    fireEvent.change(slugInput, { target: { value: 'my-essay-1' } });

    const submitBtn = screen.getByRole('button', { name: '创建并开写' });
    fireEvent.click(submitBtn);

    expect(saveMutationMock.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'my-essay-1',
        raw: expect.stringContaining('type: essay'),
      }),
    );
  });

  it('展示 GitHub 同步状态徽章，支持点击一键从远端拉取同步', async () => {
    useContentSyncStatusMock.mockReturnValue({
      data: {
        available: true,
        behind: 2,
        ahead: 0,
        headCommit: 'a1b2c3d',
        remoteCommit: 'e4f5a6b',
        dirtyFiles: [],
        incomingFiles: ['2026-11-02.md'],
        lastCheckedAt: '2026-11-02T16:00:00Z',
      },
      refetch: vi.fn(),
    });
    syncPullMutationMock.mutateAsync.mockResolvedValueOnce({
      ok: true,
      pulledCommits: 2,
      incomingFiles: ['2026-11-02.md'],
      message: '已成功从 GitHub 同步 2 个提交',
    });

    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );

    // 智能横幅提示
    expect(screen.getByText(/检测到远端 GitHub 有新内容（落后 2 个提交）/)).toBeDefined();
    expect(screen.getByText(/待拉取文章：2026-11-02.md/)).toBeDefined();

    // 点击横幅的同步按钮
    const pullBtn = screen.getByRole('button', { name: /立即从 GitHub 同步/ });
    fireEvent.click(pullBtn);

    expect(syncPullMutationMock.mutateAsync).toHaveBeenCalled();
  });

  it('支持在内容列表中点击删除按钮并确认删除文章/草稿', async () => {
    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );

    const deleteBtns = screen.getAllByRole('button', { name: '删除' });
    expect(deleteBtns.length).toBeGreaterThan(0);

    fireEvent.click(deleteBtns[0]);
    expect(screen.getByRole('heading', { name: '确认删除文章/草稿？' })).toBeDefined();

    const confirmBtn = screen.getByRole('button', { name: '确认删除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteMutationMock.mutateAsync).toHaveBeenCalledWith({ slug: 'post-1' });
    });
  });
});
