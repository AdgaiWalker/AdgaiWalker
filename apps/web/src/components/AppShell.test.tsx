import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

vi.mock('../api/public-api', () => ({
  publicApi: {
    assistantStream: vi.fn(),
    searchMiss: vi.fn(),
  },
}));

function dispatchSearchHotkey(metaKey: boolean) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      metaKey,
      ctrlKey: !metaKey,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div>home-stub</div>} />
          <Route path={dualEntry.browse.path.slice(1)} element={<div>posts-stub</div>} />
          <Route path={`${dualEntry.browse.path.slice(1)}/:slug`} element={<div>reading-stub</div>} />
          <Route path={WEB_ROUTES.assistant.slice(1)} element={<div>ask-stub</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell 极简顶栏与 Omni-Bar', () => {
  it('主导航展示 文章、探索、图谱、提问 4 个入口，关于进入 /me', () => {
    renderShell(dualEntry.browse.path);
    const nav = within(screen.getByRole('navigation', { name: '站内' }));
    expect(nav.getAllByRole('link').map((link) => link.textContent?.trim())).toEqual([
      '文章',
      '探索',
      '图谱',
      '提问',
    ]);
    const aboutLinks = screen.getAllByRole('link', { name: '关于' });
    expect(aboutLinks[0]).toHaveAttribute('href', WEB_ROUTES.me);
  });

  it('首页挂载「搜索或问小影」轻入口', () => {
    renderShell('/');
    expect(screen.getByRole('button', { name: '搜索或问小影' })).toBeInTheDocument();
  });

  it('内页与阅读页均可呼出 Omni-Bar', () => {
    renderShell(dualEntry.browse.path);
    expect(screen.getAllByRole('button', { name: '搜索或问小影' }).length).toBeGreaterThanOrEqual(1);
    renderShell(`${dualEntry.browse.path}/cc-intro`);
    expect(screen.getAllByRole('button', { name: '搜索或问小影' }).length).toBeGreaterThanOrEqual(1);
  });

  it('/ask 页 ⌘K / Ctrl+K 不打开搜索面板', () => {
    renderShell(WEB_ROUTES.assistant);
    expect(screen.getByText('ask-stub')).toBeInTheDocument();
    act(() => {
      dispatchSearchHotkey(true);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      dispatchSearchHotkey(false);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('首页 ⌘K 与按钮均可打开原生 dialog 并支持 Escape 关闭', async () => {
    renderShell(WEB_ROUTES.home);
    const user = userEvent.setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '搜索或问小影' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      dispatchSearchHotkey(true);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
