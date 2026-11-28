import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getBrowseItems } from '../content';
import { WEB_ROUTES } from '../shared/routes';
import { HomePage } from './HomePage';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route index element={<HomePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomePage 一张纸', () => {
  it('开场保留个人简介与使命主张，并包含 作品 / 文章 / 在线', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: '你好，我是 Dora。' })).toBeInTheDocument();
    expect(screen.getByText(/05 年生，黑河学院 24 级艺术生，AI 实践主义者/)).toBeInTheDocument();
    expect(screen.getByText(/我致力于探索如何帮人看见、用好 AI/)).toBeInTheDocument();
    expect(screen.getByText(/记下人生余下 29 年/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '更多关于我' })).toHaveAttribute('href', WEB_ROUTES.me);
    for (const label of ['作品', '文章', '在线']) {
      expect(screen.getByRole('heading', { level: 2, name: label })).toBeInTheDocument();
    }
    const postsSection = screen.getByRole('region', { name: '文章' });
    expect(within(postsSection).getByRole('link', { name: '全部' })).toHaveAttribute(
      'href',
      WEB_ROUTES.browse,
    );
  });

  it('作品与工具区展示三站分工及精选工具，在线区包含 X、微信与新邮箱', () => {
    renderHome();
    const workSection = screen.getByRole('region', { name: '作品' });
    expect(within(workSection).getByText('goodloop.si')).toBeInTheDocument();
    expect(within(workSection).getByText(/bot\.goodloop\.si/)).toBeInTheDocument();
    expect(within(workSection).getByText('github.com/AdgaiWalker/dsh-id')).toBeInTheDocument();
    expect(within(workSection).getByRole('link', { name: 'DoraZoom' })).toHaveAttribute(
      'href',
      '/posts/dorazoom',
    );
    expect(document.querySelector('.home-figure')).toBeNull();

    const onlineSection = screen.getByRole('region', { name: '在线' });
    expect(within(onlineSection).getByRole('link', { name: /^X\b/ })).toHaveAttribute(
      'href',
      'https://x.com/praxiswalker',
    );
    expect(within(onlineSection).getByRole('button', { name: /微信.*wrjy2049/ })).toBeInTheDocument();
    expect(within(onlineSection).getByText('praxiswalker@outlook.com')).toBeInTheDocument();
  });

  it('首页不再放置回邮卡', () => {
    renderHome();
    expect(screen.queryByRole('button', { name: '寄出' })).toBeNull();
  });

  it('文章区块默认只露最新 8 篇，点展开按钮原地显示其余全部文章', async () => {
    const user = userEvent.setup();
    renderHome();
    const essaysTotal = getBrowseItems().filter(
      (item) => item.type !== 'project' && item.type !== 'idea',
    ).length;
    const section = screen.getByRole('region', { name: '文章' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(Math.min(8, essaysTotal));
    const expand = within(section).getByRole('button', {
      name: `展开其余 ${essaysTotal - 8} 篇`,
    });
    await user.click(expand);
    expect(within(section).getAllByRole('listitem')).toHaveLength(essaysTotal);
  });
});
