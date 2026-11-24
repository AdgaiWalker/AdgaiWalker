import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { dualEntry } from '../../shared/dual-entry';
import { MobileBar } from './MobileBar';

describe('MobileBar', () => {
  it('阅读模式只渲染返回文章（无底栏、无汉堡菜单）', () => {
    render(
      <MemoryRouter>
        <MobileBar reading />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: `返回${dualEntry.browse.title}` }),
    ).toHaveAttribute('href', dualEntry.browse.path);
    expect(screen.queryByRole('button', { name: '菜单' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '手机底栏' })).not.toBeInTheDocument();
  });

  it('常规内页提供 4 键单手底部导航栏', () => {
    render(
      <MemoryRouter>
        <MobileBar />
      </MemoryRouter>,
    );
    const nav = within(screen.getByRole('navigation', { name: '手机底栏' }));
    expect(nav.getAllByRole('link').map((el) => el.textContent?.trim())).toEqual([
      '文章',
      '探索',
      '图谱',
      '提问',
    ]);
  });
});
