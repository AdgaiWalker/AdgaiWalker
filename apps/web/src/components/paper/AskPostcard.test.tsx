import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AskPostcard } from './AskPostcard';

function AskProbe() {
  const location = useLocation();
  return <div data-testid="ask-probe">{JSON.stringify(location.state)}</div>;
}

function renderPostcard(onSend?: (text: string) => void) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route index element={<AskPostcard onSend={onSend} />} />
        <Route path="tools" element={<AskProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AskPostcard 回邮卡', () => {
  it('极简自明，寄出后带着原话进入问页', async () => {
    const user = userEvent.setup();
    renderPostcard();
    for (const crutch of ['回邮卡', '免登录', '试试：']) {
      expect(screen.queryByText(crutch)).not.toBeInTheDocument();
    }
    const send = screen.getByRole('button', { name: '寄出' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('写下你卡在哪'), '想学 AI 写周报，不知道从哪开始');
    await user.click(send);
    expect(screen.getByTestId('ask-probe')).toHaveTextContent('想学 AI 写周报，不知道从哪开始');
  });

  it('Enter 直接寄出，Shift+Enter 仅换行不提交', async () => {
    const user = userEvent.setup();
    renderPostcard();
    const input = screen.getByLabelText('写下你卡在哪');
    await user.type(input, '想学 AI{Shift>}{Enter}{/Shift}从哪开始');
    expect(screen.queryByTestId('ask-probe')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('ask-probe')).toHaveTextContent('想学 AI\\n从哪开始');
  });

  it('传入 onSend 时仅回调不跳转 /tools', async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    renderPostcard(spy);
    await user.type(screen.getByLabelText('写下你卡在哪'), '这篇第二步怎么做');
    await user.click(screen.getByRole('button', { name: '寄出' }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('这篇第二步怎么做');
    expect(screen.queryByTestId('ask-probe')).toBeNull();
  });
});
