import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContentFeedback } from './ContentFeedback';

const idle = {
  done: false,
  error: null as string | null,
  note: '',
  pendingSignal: null as 'needs-more' | 'outdated' | 'useful' | null,
  busy: false,
  onSelectUseful: vi.fn(),
  onSelectNeedsMore: vi.fn(),
  onSelectOutdated: vi.fn(),
  onNoteChange: vi.fn(),
  onSubmitPending: vi.fn(),
};


describe('ContentFeedback（展示块 UX）', () => {
  it('done 时只展示已收到', () => {
    render(
      <ContentFeedback
        {...idle}
        done
        onSelectUseful={vi.fn()}
        onSelectNeedsMore={vi.fn()}
        onSelectOutdated={vi.fn()}
        onNoteChange={vi.fn()}
        onSubmitPending={vi.fn()}
      />,
    );
    expect(screen.getByText(/已收到反馈/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '有用' })).not.toBeInTheDocument();
  });

  it('有用按钮抛出 onSelectUseful', async () => {
    const onSelectUseful = vi.fn();
    const user = userEvent.setup();
    render(<ContentFeedback {...idle} onSelectUseful={onSelectUseful} />);
    await user.click(screen.getByRole('button', { name: '有用' }));
    expect(onSelectUseful).toHaveBeenCalledTimes(1);
  });

  it('需补充时展示说明框与提交', async () => {
    const onSubmitPending = vi.fn();
    const onNoteChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ContentFeedback
        {...idle}
        pendingSignal="needs-more"
        note="缺例子"
        onSubmitPending={onSubmitPending}
        onNoteChange={onNoteChange}
      />,
    );
    expect(screen.getByPlaceholderText('可选说明')).toHaveValue('缺例子');
    await user.click(screen.getByRole('button', { name: '提交' }));
    expect(onSubmitPending).toHaveBeenCalledTimes(1);
  });

  it('busy 时禁用操作按钮', () => {
    render(<ContentFeedback {...idle} busy pendingSignal="outdated" />);
    expect(screen.getByRole('button', { name: '有用' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });
});
