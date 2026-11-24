import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { GreetingCard } from './GreetingCard';

describe('GreetingCard 身份与灵感翻牌', () => {
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

  it('Dora 是首页主标题，翻牌支持直达原文与问小影', async () => {
    const onAskSpark = vi.fn();
    render(
      <MemoryRouter>
        <GreetingCard
          sparks={[{ title: '试一个想法', summary: '一句真实摘要', slug: 'idea-a', isReal: true }]}
          onAskSpark={onAskSpark}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: /I'm Dora/i })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '抽个点子' }));
    expect(screen.getByText('试一个想法')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '读原文' })).toHaveAttribute('href', '/posts/idea-a');
    await user.click(screen.getByRole('button', { name: '问小影' }));
    expect(onAskSpark).toHaveBeenCalledWith('试一个想法', expect.any(HTMLElement));
  });
});
