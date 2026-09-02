import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ExploreLegacyRedirectPage } from './ExploreLegacyRedirectPage';
import { ExplorePage } from './ExplorePage';

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

describe('ExplorePage', () => {
  it('在同一页切换点子与项目视图', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/explore?view=idea']}>
        <ExplorePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '探索' })).toBeInTheDocument();
    expect(screen.getByText('GoOut — 多场景个人统筹 Agent')).toBeInTheDocument();
    expect(
      screen.getByText('iTab Agent Spaces — 把新标签页变成 Agent 任务空间'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('墨览 — 跨手机与电脑的 AI 文件助手'),
    ).toBeInTheDocument();
    expect(screen.getByText('CLI 命令面板 — 卡牌式技能加载器')).toBeInTheDocument();
    expect(
      screen.getByText('卡牌桌点子页面 — 页面本身就是一个点子'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /项目/ }));
    expect(
      screen.queryByText('卡牌桌点子页面 — 页面本身就是一个点子'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('DoraZoom — macOS 屏幕讲解与标注工具'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('vibe0s — 让 AI 帮你选 Skill、排流程、留方法'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('GoOut — 多场景个人统筹 Agent'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('iTab Agent Spaces — 把新标签页变成 Agent 任务空间'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('墨览 — 跨手机与电脑的 AI 文件助手'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('CLI 命令面板 — 卡牌式技能加载器'),
    ).not.toBeInTheDocument();
  });

  it('旧项目链接跳到探索视图并保留锚点', async () => {
    render(
      <MemoryRouter initialEntries={['/projects#ferry']}>
        <Routes>
          <Route
            path="/projects"
            element={<ExploreLegacyRedirectPage view="project" />}
          />
          <Route path="/explore" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/explore?view=project#ferry',
      );
    });
  });
});
