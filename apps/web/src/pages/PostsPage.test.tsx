import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getAllByHall, getBrowseItems } from '../content';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';
import { PostsPage } from './PostsPage';

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

describe('PostsPage', () => {
  it('统一展示全部内容，并清理旧 type 深链', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={[`${dualEntry.browse.path}?type=idea&source=legacy`]}>
        <Routes>
          <Route
            path={dualEntry.browse.path}
            element={
              <>
                <PostsPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?source=legacy',
      );
    });

    expect(screen.queryByRole('tablist', { name: '类型' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('.post-list-item')).toHaveLength(
      getBrowseItems().length,
    );
    expect(container.querySelector('.post-list-icon')).not.toBeInTheDocument();
    expect(container.querySelector('.status-pill')).not.toBeInTheDocument();
  });

  it('展示动态札记入口，并保留标签筛选', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[dualEntry.browse.path]}>
        <PostsPage />
      </MemoryRouter>,
    );

    const labCount = getAllByHall('lab').length;
    expect(
      screen.getByRole('link', { name: `进入札记，共 ${labCount} 篇` }),
    ).toHaveAttribute('href', WEB_ROUTES.lab);

    await user.click(screen.getByRole('button', { name: '筛选' }));
    const aiTag = screen.getByRole('button', { name: 'AI' });
    await user.click(aiTag);
    expect(aiTag).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(/#AI/)).toHaveLength(2);
  });
});
