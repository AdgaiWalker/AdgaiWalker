import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getBrowseItems } from '../content';
import { chapterOf } from '../shared/chapters';
import { WEB_ROUTES } from '../shared/routes';
import { PostsPage } from './PostsPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PostsPage />
    </MemoryRouter>,
  );
}

describe('PostsPage 文章目录（Wiki 索引）', () => {
  it('默认列出全部文章，并按年分组', () => {
    renderAt('/posts');
    const total = getBrowseItems().length;
    expect(screen.getAllByRole('listitem')).toHaveLength(total);
    const tabs = within(screen.getByRole('navigation', { name: '章节' }));
    expect(tabs.getByRole('link', { name: '全部' })).toHaveAttribute('aria-current', 'page');
  });

  it('?c=make 只列造物章，并点亮对应页签', () => {
    renderAt('/posts?c=make');
    const expected = getBrowseItems().filter((item) => chapterOf(item) === 'make').length;
    expect(screen.getAllByRole('listitem')).toHaveLength(expected);
    const tabs = within(screen.getByRole('navigation', { name: '章节' }));
    expect(tabs.getByRole('link', { name: /造物/ })).toHaveAttribute('aria-current', 'page');
  });

  it('非法章节键回落到全部；右侧可进入脉络', () => {
    renderAt('/posts?c=lab');
    expect(screen.getAllByRole('listitem')).toHaveLength(getBrowseItems().length);
    expect(screen.getByRole('link', { name: '脉络' })).toHaveAttribute('href', WEB_ROUTES.graph);
  });

  it('支持 ?q= 全文检索 Wiki 正文，且切换章节链接保留当前检索词', () => {
    renderAt('/posts?q=烧烤架散热');
    expect(screen.getByRole('link', { name: /我的生产力装备/ })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const tabs = within(screen.getByRole('navigation', { name: '章节' }));
    expect(tabs.getByRole('link', { name: /用好/ })).toHaveAttribute(
      'href',
      `/posts?c=use&q=${encodeURIComponent('烧烤架散热')}`,
    );
    expect(tabs.getByRole('link', { name: '全部' })).toHaveAttribute(
      'href',
      `/posts?q=${encodeURIComponent('烧烤架散热')}`,
    );
  });
});
