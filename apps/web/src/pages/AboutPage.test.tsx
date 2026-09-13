import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';
import { AboutPage } from './AboutPage';

describe('AboutPage 双入口', () => {
  it('只保留卡/逛，没有第三颗「问小影」按钮', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );
    const cta = document.querySelector('.home-dual-cta');
    expect(cta).toBeTruthy();
    expect(cta?.querySelector(`a[href="${WEB_ROUTES.assistant}"]`)).toBeNull();
    expect(
      screen.queryByRole('link', { name: '问小影' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: dualEntry.ask.cta }),
    ).toHaveAttribute('href', dualEntry.ask.path);
    expect(
      screen.getByRole('link', { name: dualEntry.browse.cta }),
    ).toHaveAttribute('href', dualEntry.browse.path);
    expect(screen.getByText(/人是 Dora/)).toBeInTheDocument();
  });
});
