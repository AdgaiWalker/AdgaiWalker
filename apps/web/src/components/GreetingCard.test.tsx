import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { GreetingCard } from './GreetingCard';

describe('GreetingCard 身份', () => {
  it('头像与称呼用 Dora，不用 duola', () => {
    render(
      <MemoryRouter>
        <GreetingCard sparks={[]} />
      </MemoryRouter>,
    );
    const img = screen.getByRole('img', { name: 'Dora' });
    expect(img).toHaveAttribute('src', '/images/dora.jpg');
    expect(img.getAttribute('src')).not.toContain('duola');
    expect(screen.getByRole('heading', { name: /I'm Dora/i })).toBeInTheDocument();
  });

  it('Dora 是首页主标题，抽点子有独立键盘按钮', async () => {
    render(<MemoryRouter><GreetingCard sparks={[{ title: '试一个想法', slug: null, isReal: false }]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: /I'm Dora/i })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '抽个点子' }));
    expect(screen.getByText('试一个想法')).toBeInTheDocument();
  });
});
