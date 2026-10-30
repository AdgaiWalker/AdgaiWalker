import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsContentDetail } from '@walker/shared';
import { ContentDetailPage } from './ContentDetailPage';
import { ApiError } from '../../api/http';

// The data router only needs a navigation request here; Node's Request rejects jsdom's signal.
class TestNavigationRequest {
  url: string;
  method: string;
  signal: AbortSignal | undefined;
  headers = new Headers();
  constructor(url: string, init: RequestInit = {}) {
    this.url = url;
    this.method = init.method ?? 'GET';
    this.signal = init.signal ?? undefined;
  }
}
vi.stubGlobal('Request', TestNavigationRequest);

const {
  useContentDetailMock,
  useSaveContentMock,
  useContentVersionMock,
  fetchContentDetailMock,
  saveMutationMock,
} = vi.hoisted(() => {
  const saveMutation = {
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
  };
  return {
    useContentDetailMock: vi.fn(),
    useSaveContentMock: vi.fn(() => saveMutation),
    useContentVersionMock: vi.fn(),
    fetchContentDetailMock: vi.fn(),
    saveMutationMock: saveMutation,
  };
});

vi.mock('../../api/queries', () => ({
  useContentDetail: useContentDetailMock,
  useSaveContent: useSaveContentMock,
  useContentVersion: useContentVersionMock,
  fetchContentDetail: fetchContentDetailMock,
}));

const mockArticle: OpsContentDetail = {
  slug: 'test-slug',
  title: '测试文章标题',
  type: 'post',
  updatedAt: '2026-09-25T10:00:00.000Z',
  raw: '---\ntitle: 测试文章标题\ntype: post\n---\n# 正文内容\n第一行\n第二行',
  hash: 'hash-initial-1111',
  ext: '.md',
};

function renderPage(initialEntries = ['/content/test-slug']) {
  const router = createMemoryRouter([
    { path: '/content/:slug', element: <><Link to="/overview">概览导航</Link><ContentDetailPage /></> },
    { path: '/content', element: <div data-testid="content-list-page">内容列表页</div> },
    { path: '/overview', element: <div data-testid="overview-page">概览页</div> },
  ], { initialEntries });
  return { ...render(<RouterProvider router={router} />), router };
}

describe('ContentDetailPage (C06 文章编辑、差异与预览)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useContentDetailMock.mockReturnValue({
      data: { data: mockArticle },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useContentVersionMock.mockReturnValue({ data: { workingHash: mockArticle.hash, publishedHash: null, indexedHash: null }, isPending: false, isError: false });
    saveMutationMock.isPending = false;
    saveMutationMock.error = null;
  });

  it('载入文章时把无确证记录标为未核验，初始编辑框包含当前正文', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '测试文章标题' })).toBeDefined();
    expect(screen.getByText(/hash-initial-1111/)).toBeDefined();
    expect(screen.getByText(/线上未核验/)).toBeDefined();

    const textarea = screen.getByRole('textbox', { name: '正文编辑器' }) as HTMLTextAreaElement;
    expect(textarea.value).toBe(mockArticle.raw);

    const saveBtn = screen.getByRole('button', { name: '保存到工作区' }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('把内容工作区收为编辑、审核与发布、更新事项、历史四组', () => {
    renderPage();
    const nav = within(screen.getByRole('navigation', { name: '内容工作区' }));
    expect(nav.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      '编辑', '审核与发布', '更新事项', '历史',
    ]);
  });

  it('编辑正文更新草稿并标记为未保存，可切换预览和本地差异', () => {
    renderPage();

    const textarea = screen.getByRole('textbox', { name: '正文编辑器' }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: mockArticle.raw + '\n新增第三行' } });

    expect(screen.getByText(/未保存更改/)).toBeDefined();
    const saveBtn = screen.getByRole('button', { name: '保存到工作区' }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    // 切换到预览标签
    fireEvent.click(screen.getByRole('tab', { name: '预览' }));
    expect(screen.getByRole('heading', { level: 1, name: '正文内容' })).toBeDefined();

    // 切换到差异标签
    fireEvent.click(screen.getByRole('tab', { name: '本地差异' }));
    expect(screen.getByText('+ 新增第三行')).toBeDefined();
  });

  it('有未保存更改时返回导航触发保护弹窗，取消停留在页，确认则离开', () => {
    renderPage();

    const textarea = screen.getByRole('textbox', { name: '正文编辑器' });
    fireEvent.change(textarea, { target: { value: '改动内容' } });

    // 点击返回内容列表
    fireEvent.click(screen.getByText('返回内容列表'));

    // 弹出未保存保护确认弹窗
    expect(screen.getByText('存在未保存的更改')).toBeDefined();
    expect(screen.getByText(/确定要放弃更改并离开吗/)).toBeDefined();

    // 点击取消：留在本页，草稿仍保留
    fireEvent.click(screen.getByRole('button', { name: '留在本页' }));
    expect(screen.queryByText('存在未保存的更改')).toBeNull();
    expect((screen.getByRole('textbox', { name: '正文编辑器' }) as HTMLTextAreaElement).value).toBe('改动内容');

    // 再次点击返回，点击确认放弃
    fireEvent.click(screen.getByText('返回内容列表'));
    fireEvent.click(screen.getByRole('button', { name: '放弃更改并离开' }));
    expect(screen.getByTestId('content-list-page')).toBeDefined();
  });

  it('侧栏式站内导航和浏览器后退都不能直接丢失草稿', async () => {
    const { router } = renderPage(['/overview', '/content/test-slug']);
    fireEvent.change(screen.getByRole('textbox', { name: '正文编辑器' }), { target: { value: '未保存草稿' } });
    fireEvent.click(screen.getByText('概览导航'));
    expect(screen.getByText('存在未保存的更改')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '留在本页' }));
    expect((screen.getByRole('textbox', { name: '正文编辑器' }) as HTMLTextAreaElement).value).toBe('未保存草稿');

    await router.navigate(-1);
    expect(await screen.findByText('存在未保存的更改')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '放弃更改并离开' }));
    expect(await screen.findByTestId('overview-page')).toBeDefined();
  });

  it('保存时携带 expectedHash，保存成功后更新 baseHash 且不宣称已上线', async () => {
    const savedArticle: OpsContentDetail = {
      ...mockArticle,
      raw: mockArticle.raw + '\n新增修改',
      hash: 'hash-updated-2222',
      updatedAt: '2026-09-25T11:00:00.000Z',
    };
    saveMutationMock.mutateAsync.mockResolvedValueOnce(savedArticle);

    renderPage();

    const textarea = screen.getByRole('textbox', { name: '正文编辑器' });
    fireEvent.change(textarea, { target: { value: mockArticle.raw + '\n新增修改' } });

    const saveBtn = screen.getByRole('button', { name: '保存到工作区' }) as HTMLButtonElement;
    fireEvent.click(saveBtn);

    expect(saveMutationMock.mutateAsync).toHaveBeenCalledWith({
      slug: 'test-slug',
      raw: mockArticle.raw + '\n新增修改',
      expectedHash: 'hash-initial-1111',
    });

    await waitFor(() => {
      expect(screen.getByText(/hash-updated-2222/)).toBeDefined();
    });

    expect(screen.getByText(/工作区保存成功；网页状态未改变/)).toBeDefined();
    expect(saveBtn.disabled).toBe(true);
  });

  it('保存遇 409 版本冲突时不自动覆盖本地修改，展示冲突警告并可比对冲突差异', async () => {
    const conflictError = new ApiError('content-version-conflict', '内容版本冲突，磁盘已有新修改', 409);
    saveMutationMock.mutateAsync.mockRejectedValueOnce(conflictError);

    const remoteArticle: OpsContentDetail = {
      ...mockArticle,
      raw: mockArticle.raw + '\n他人编辑的远程修改',
      hash: 'hash-remote-3333',
      updatedAt: '2026-09-25T10:30:00.000Z',
    };
    fetchContentDetailMock.mockResolvedValueOnce(remoteArticle);

    renderPage();

    const textarea = screen.getByRole('textbox', { name: '正文编辑器' });
    fireEvent.change(textarea, { target: { value: mockArticle.raw + '\n我自己的本地改动' } });

    fireEvent.click(screen.getByRole('button', { name: '保存到工作区' }));

    await waitFor(() => {
      expect(screen.getByText(/检测到版本冲突/)).toBeDefined();
    });

    // 冲突后切回编辑标签核对：本地修改绝不能被冲掉！
    fireEvent.click(screen.getByRole('tab', { name: '正文' }));
    expect((screen.getByRole('textbox', { name: '正文编辑器' }) as HTMLTextAreaElement).value).toBe(
      mockArticle.raw + '\n我自己的本地改动',
    );

    // 查看冲突差异标签
    const conflictDiffTab = screen.getByRole('tab', { name: '冲突比对' });
    fireEvent.click(conflictDiffTab);
    expect(screen.getByText(/远程版本差异/)).toBeDefined();

    // 提供选择：以我的修改为准更新 baseHash 或放弃本地修改使用远程
    expect(screen.getByRole('button', { name: '以我的修改为准（更新基线后可重试保存）' })).toBeDefined();
    expect(screen.getByRole('button', { name: '放弃本地修改（使用远程版本）' })).toBeDefined();
  });
  it('C22 项目内容边界：展现项目受控管理说明，校验 status 字段非空', () => {
    const mockProject: OpsContentDetail = {
      ...mockArticle,
      type: 'project',
      title: 'vibe0s 项目',
      raw: '---\ntitle: vibe0s 项目\ntype: project\nstatus: validating\n---\n# 项目内容',
    };
    useContentDetailMock.mockReturnValue({
      data: { data: mockProject },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('项目受控内容边界')).toBeDefined();
    expect(screen.getByText(/前台访客及前台 AI 无法修改项目状态或进度/)).toBeDefined();

    // 尝试清空 status 并保存
    const textarea = screen.getByRole('textbox', { name: '正文编辑器' }) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: '---\ntitle: vibe0s 项目\ntype: project\nstatus: \n---\n# 项目内容' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存到工作区' }));
    expect(screen.getByText(/项目字段校验失败：status 不能为空/)).toBeDefined();
  });

  it('C22 小店内容边界：展示小店边界声明与未接入的禁用交易按钮', () => {
    const mockShop: OpsContentDetail = {
      ...mockArticle,
      type: 'shop',
      title: '小店服务商品',
      raw: '---\ntitle: 小店服务商品\ntype: shop\n---\n# 服务介绍内容',
    };
    useContentDetailMock.mockReturnValue({
      data: { data: mockShop },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText('小店内容与交易边界')).toBeDefined();
    expect(screen.getByText(/不建立订单或库存数据模型/)).toBeDefined();

    const buyBtn = screen.getByRole('button', { name: /在线购买（尚未接入）/ }) as HTMLButtonElement;
    const orderBtn = screen.getByRole('button', { name: /创建订单（尚未接入）/ }) as HTMLButtonElement;
    expect(buyBtn.disabled).toBe(true);
    expect(orderBtn.disabled).toBe(true);
    expect(screen.getByText(/未接通功能不显示可执行交易按钮/)).toBeDefined();
  });
});
