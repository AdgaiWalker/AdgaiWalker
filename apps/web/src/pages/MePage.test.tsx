import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MePage } from './MePage';

describe('MePage 关于我', () => {
  it('写状态与三站分工、恢复老站装备/基建入口，不引用 citable:false 的私密细节，不含头像', () => {
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: '关于我' })).toBeInTheDocument();
    expect(screen.getByText(/空乘专业给了我时间，马哲给了我方法/)).toBeInTheDocument();
    expect(screen.getByText(/我是个 AI 实践主义者/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '物理 Bot' })).toHaveAttribute(
      'href',
      '/posts/bot-physical-body',
    );
    expect(screen.getByRole('link', { name: '生产力装备' })).toHaveAttribute(
      'href',
      '/posts/dora-gear',
    );
    expect(screen.getByRole('link', { name: '点子共促' })).toHaveAttribute(
      'href',
      '/posts/idea-cocreate',
    );
    expect(screen.getByRole('heading', { name: '我做的事' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '我做过的事' })).toBeInTheDocument();
    expect(screen.getByText(/我致力于探索如何把人的注意力从重复步骤里解放出来/)).toBeInTheDocument();
    expect(screen.getByText(/引我入门的秋芝，带我成长的海哥/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '未然界域' })).toHaveAttribute(
      'href',
      'https://goodloop.si',
    );
    expect(screen.getByText(/、DIY Bot 工作手册和/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'DoraZoom' })).toHaveAttribute('href', '/posts/dorazoom');
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/AdgaiWalker',
    );
    expect(screen.queryByText(/眼睛不过关/)).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
