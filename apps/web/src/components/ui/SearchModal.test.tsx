import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SearchModal, type SearchModalProps } from './SearchModal';
import { publicApi } from '../../api/public-api';

vi.mock('../../api/public-api', () => ({
  publicApi: {
    assistantStream: vi.fn(),
  },
}));

const mockedStream = vi.mocked(publicApi.assistantStream);

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

describe('SearchModal（搜索 + 面板内问小影）', () => {
  beforeEach(() => {
    mockedStream.mockReset();
  });

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
    const input = screen.getByPlaceholderText(/搜索或问小影/);
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

  it('回车即问小影：切到面板内对话并发送', async () => {
    mockedStream.mockImplementationOnce(async (_q, _sid, onText) => {
      onText('{"answer":"duola 是站主的分身');
      return {
        sessionId: 's-1',
        answer: 'duola 是站主的分身',
        citations: [{ slug: 'cc-intro' }],
        aiUsedFlag: true,
        elapsedMs: 10,
      };
    });
    renderModal({ query: 'duola 是谁' });
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/搜索或问小影/);
    await user.type(input, '{Enter}');
    expect(mockedStream).toHaveBeenCalledWith(
      'duola 是谁',
      null,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(await screen.findByText('duola 是站主的分身')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回搜索/ })).toBeInTheDocument();
  });

  it('「问问小影」行点击进入对话；返回搜索回到结果视图', async () => {
    mockedStream.mockResolvedValueOnce({
      sessionId: 's-2',
      answer: '规则回答',
      citations: [],
      aiUsedFlag: false,
      elapsedMs: 5,
    });
    renderModal({ query: '低成本 AI 社群', note: '无结果' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /问问小影/ }));
    expect(mockedStream).toHaveBeenCalledOnce();
    expect(await screen.findByText('规则回答')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /返回搜索/ }));
    expect(
      screen.getByPlaceholderText(/搜索或问小影/),
    ).toBeInTheDocument();
  });

  it('query 过短不出现问小影入口', () => {
    renderModal({ query: ' d ' });
    expect(screen.queryByRole('button', { name: /问问小影/ })).not.toBeInTheDocument();
  });
});
