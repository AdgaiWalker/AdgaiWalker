import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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
});
