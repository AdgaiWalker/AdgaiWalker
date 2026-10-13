import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ContentLedgerEntry } from '@walker/shared';
import { ContentListPage } from './ContentListPage';

const { useContentMock } = vi.hoisted(() => ({
  useContentMock: vi.fn(),
}));

vi.mock('../../api/queries', () => ({
  useContent: useContentMock,
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
});
