import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LikeButton } from './LikeButton';

describe('LikeButton（展示块 UX）', () => {
  it('count 为数字时展示赞数', () => {
    render(<LikeButton count={3} onLike={() => {}} />);
    expect(screen.getByRole('button', { name: /赞\s*3/ })).toBeInTheDocument();
  });

  it('count 为 null 时展示加载占位', () => {
    render(<LikeButton count={null} onLike={() => {}} />);
    expect(screen.getByRole('button', { name: /赞\s*…/ })).toBeInTheDocument();
  });

  it('点击触发 onLike，不自行请求', async () => {
    const onLike = vi.fn();
    const user = userEvent.setup();
    render(<LikeButton count={1} onLike={onLike} />);
    await user.click(screen.getByRole('button', { name: /赞/ }));
    expect(onLike).toHaveBeenCalledTimes(1);
  });

  it('busy 时按钮禁用并暴露 aria-busy', () => {
    render(<LikeButton count={1} busy onLike={() => {}} />);
    const btn = screen.getByRole('button', { name: /赞/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });

  it('有 error 时展示错误文案', () => {
    render(<LikeButton count={1} error="失败了" onLike={() => {}} />);
    expect(screen.getByText(/失败了/)).toBeInTheDocument();
  });
});
