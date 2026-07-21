import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SearchModal, type SearchModalProps } from './SearchModal';

function renderModal(props: Partial<SearchModalProps> = {}) {
  const onClose = vi.fn();
  const onQueryChange = vi.fn();
  render(
    <MemoryRouter>
      <SearchModal
        open
        query=""
        hits={[]}
        note=""
        onClose={onClose}
        onQueryChange={onQueryChange}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onClose, onQueryChange };
}

describe('SearchModal（展示块 UX）', () => {
  it('open=false 时不渲染对话框', () => {
    render(
      <MemoryRouter>
        <SearchModal
          open={false}
          query=""
          hits={[]}
          note=""
          onClose={() => {}}
          onQueryChange={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('open 时渲染搜索框并回传 query 变更', async () => {
    const { onQueryChange } = renderModal({ query: '' });
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/搜索标题或正文/);
    await user.type(input, 'a');
    expect(onQueryChange).toHaveBeenCalled();
  });

  it('展示 hits 链接', () => {
    renderModal({
      hits: [{ url: '/posts/x', title: '标题甲' }],
    });
    expect(screen.getByRole('link', { name: '标题甲' })).toHaveAttribute(
      'href',
      '/posts/x',
    );
  });

  it('无结果 note 可见', () => {
    renderModal({ note: '无结果' });
    expect(screen.getByText('无结果')).toBeInTheDocument();
  });
});
