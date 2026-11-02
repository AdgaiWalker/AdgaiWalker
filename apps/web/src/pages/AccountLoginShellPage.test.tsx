import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountLoginShellPage } from './AccountLoginShellPage';

describe('AccountLoginShellPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('默认渲染登录模式，并支持切换到注册模式', () => {
    render(
      <MemoryRouter>
        <AccountLoginShellPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /账号登录/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/邮箱地址/)).toBeInTheDocument();
    expect(screen.getByLabelText(/密码/)).toBeInTheDocument();

    const switchBtn = screen.getByRole('button', { name: /还没有账号？点击切换注册/ });
    fireEvent.click(switchBtn);

    expect(screen.getByRole('heading', { name: /注册账号/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /已有账号？点击返回登录/ })).toBeInTheDocument();
  });

  it('提交表单提示插槽说明', () => {
    render(
      <MemoryRouter>
        <AccountLoginShellPage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/邮箱地址/), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/密码/), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^登录/ }));

    expect(screen.getByText(/当前访客免登录即可畅享全站功能/)).toBeInTheDocument();
  });
});
