import { act, render, screen } from '@testing-library/react';
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

vi.mock('./xiaoying/scene', () => ({
  mountPet: () => ({ play: vi.fn(), pause: vi.fn(), dispose: vi.fn() }),
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
          <Route
            path={`${dualEntry.browse.path.slice(1)}/:slug`}
            element={<div>reading-stub</div>}
          />
          <Route
            path={WEB_ROUTES.assistant.slice(1)}
            element={<div>ask-stub</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell 搜索入口', () => {
  it('首页挂载「搜索或问小影」入口', () => {
    renderShell('/');
    expect(
      screen.getByRole('button', { name: '搜索或问小影' }),
    ).toBeInTheDocument();
  });

  it('逛页挂载「搜索或问小影」入口', () => {
    renderShell(dualEntry.browse.path);
    expect(
      screen.getByRole('button', { name: '搜索或问小影' }),
    ).toBeInTheDocument();
  });

  it('阅读页挂载「搜索或问小影」入口', () => {
    renderShell(`${dualEntry.browse.path}/cc-intro`);
    expect(
      screen.getByRole('button', { name: '搜索或问小影' }),
    ).toBeInTheDocument();
  });

  it('/ask 页不挂载 AskBar', () => {
    renderShell(WEB_ROUTES.assistant);
    expect(
      screen.queryByRole('button', { name: '搜索或问小影' }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByText('ask-stub')).toBeInTheDocument();
  });

  it('首页 ⌘K 仍打开搜索面板', () => {
    renderShell(WEB_ROUTES.home);
    act(() => {
      dispatchSearchHotkey(true);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('逛页不再保留侧栏/移动栏搜索按钮', () => {
    renderShell(dualEntry.browse.path);
    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '搜索 ⌘K' }),
    ).not.toBeInTheDocument();
  });

  it('阅读页不再保留顶栏搜索按钮', () => {
    renderShell(`${dualEntry.browse.path}/cc-intro`);
    expect(screen.queryByRole('button', { name: '搜索' })).not.toBeInTheDocument();
  });

  it('点 AskBar 打开搜索面板，Escape 关闭', async () => {
    renderShell(WEB_ROUTES.home);
    const user = userEvent.setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '搜索或问小影' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
