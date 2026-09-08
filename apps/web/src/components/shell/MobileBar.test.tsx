import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { dualEntry } from '../../shared/dual-entry';
import { MobileBar } from './MobileBar';

describe('MobileBar', () => {
  it('阅读模式不需要 onToggleMenu，只渲染返回逛', () => {
    render(
      <MemoryRouter>
        <MobileBar reading />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('link', { name: `返回${dualEntry.browse.title}` }),
    ).toHaveAttribute('href', dualEntry.browse.path);
    expect(screen.queryByRole('button', { name: '菜单' })).not.toBeInTheDocument();
  });
});
