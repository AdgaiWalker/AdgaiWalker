import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>home-stub</div>} />
          <Route path={dualEntry.browse.path.slice(1)} element={<div>posts-stub</div>} />
          <Route path={`${dualEntry.browse.path.slice(1)}/:slug`} element={<div>reading-stub</div>} />
          <Route path={WEB_ROUTES.me.slice(1)} element={<div>me-stub</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell 纸页壳', () => {
  it('页眉为 关于 / 作品 / 文章 / 在线 + 右侧「问」入口，首页不误点亮锚点', () => {
    renderShell('/');
    const nav = within(screen.getByRole('navigation', { name: '站点' }));
    const links = nav.getAllByRole('link');
    expect(links.map((link) => link.textContent?.trim())).toEqual(['关于', '作品', '文章', '在线']);
    for (const link of links) {
      expect(link).not.toHaveAttribute('aria-current', 'page');
    }
    expect(screen.getByRole('banner').querySelector(`a[href="${dualEntry.ask.path}"]`)).toBeTruthy();
  });

  it('进入文章页点亮「文章」，进入关于页点亮「关于」', () => {
    const view = renderShell(`${dualEntry.browse.path}/some-post`);
    const nav = within(screen.getByRole('navigation', { name: '站点' }));
    expect(nav.getByRole('link', { name: '文章' })).toHaveAttribute('aria-current', 'page');
    view.unmount();

    renderShell(WEB_ROUTES.me);
    const meNav = within(screen.getByRole('navigation', { name: '站点' }));
    expect(meNav.getByRole('link', { name: '关于' })).toHaveAttribute('aria-current', 'page');
  });

  it('页脚再给一次全站入口（含脉络、RSS 与问一步）', () => {
    renderShell('/');
    const footer = within(screen.getByRole('navigation', { name: '页脚' }));
    expect(footer.getByRole('link', { name: '脉络' })).toHaveAttribute('href', WEB_ROUTES.graph);
    expect(footer.getByRole('link', { name: 'RSS' })).toHaveAttribute('href', '/rss.xml');
    expect(screen.getByRole('contentinfo').querySelector(`a[href="${dualEntry.ask.path}"]`)).toBeTruthy();
  });

  it('配色按钮三态循环并写入 html[data-theme]', () => {
    window.localStorage.clear();
    renderShell('/');
    const toggle = screen.getByRole('button', { name: '配色：跟随系统' });
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: '配色：浅色' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: '配色：深色' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
