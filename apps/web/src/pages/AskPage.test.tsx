import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AskPage } from './AskPage';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

describe('AskPage 重定向', () => {
  it('访问 /ask 即刻重定向至 /tools', () => {
    render(
      <MemoryRouter initialEntries={['/ask']}>
        <Routes>
          <Route path="/ask" element={<AskPage />} />
          <Route path="/tools" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location').textContent).toBe('/tools');
  });

  it('访问 /ask 带 query 参数时，保留 query 重定向至 /tools', () => {
    render(
      <MemoryRouter initialEntries={['/ask?q=how+to+learn+ai']}>
        <Routes>
          <Route path="/ask" element={<AskPage />} />
          <Route path="/tools" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('location').textContent).toBe('/tools?q=how+to+learn+ai');
  });
});
