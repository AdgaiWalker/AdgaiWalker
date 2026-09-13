import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { WEB_ROUTES } from '../shared/routes';
import { MePage } from './MePage';

describe('MePage 双入口', () => {
  it('没有第三颗「问小影」按钮', () => {
    render(
      <MemoryRouter>
        <MePage />
      </MemoryRouter>,
    );
    const cta = document.querySelector('.home-dual-cta');
    expect(cta).toBeTruthy();
    expect(cta?.querySelector(`a[href="${WEB_ROUTES.assistant}"]`)).toBeNull();
    expect(
      screen.queryByRole('link', { name: '问小影' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dora' })).toBeInTheDocument();
    expect(screen.getByText(/我是 Dora/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dora 与硬件' })).toHaveAttribute(
      'href',
      WEB_ROUTES.gear,
    );
    expect(screen.getByRole('link', { name: '关于本站' })).toHaveAttribute(
      'href',
      WEB_ROUTES.about,
    );
  });
});
