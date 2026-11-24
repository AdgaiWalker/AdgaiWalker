import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SearchModal, type SearchModalProps } from './SearchModal';
import { publicApi } from '../../api/public-api';

const sceneSpy = vi.hoisted(() => ({ mount: vi.fn() }));

vi.mock('../../api/public-api', () => ({
  publicApi: {
    assistantStream: vi.fn(),
  },
}));

vi.mock('../xiaoying/scene', () => ({
  mountPet: sceneSpy.mount,
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

describe('SearchModal（原生 dialog Omni-Bar + 无 3D + 优雅降级）', () => {
  beforeEach(() => {
    mockedStream.mockReset();
    sceneSpy.mount.mockReset();
  });

  it('open=false 时不展示对话窗且永不挂载第二个 3D WebGL 桌宠', () => {
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
    expect(sceneSpy.mount).not.toHaveBeenCalled();
  });

  it('open 时不挂载 3D scene，渲染搜索框并回传 query 变更', async () => {
    const { onQueryChange } = renderModal({ query: '' });
    expect(sceneSpy.mount).not.toHaveBeenCalled();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/搜索或问小影/);
    await user.type(input, 'a');
    expect(onQueryChange).toHaveBeenCalled();
  });

  it('展示 hits 链接与无结果提示', () => {
    renderModal({
      hits: [{ url: '/posts/x', title: '标题甲' }],
      note: '',
    });
    expect(screen.getByRole('link', { name: '标题甲' })).toHaveAttribute('href', '/posts/x');

    renderModal({ note: '无结果' });
    expect(screen.getByText('无结果')).toBeInTheDocument();
  });

  it('回车即问小影：切到面板内对话并流式发送', async () => {
    mockedStream.mockImplementationOnce(async ({ onText }) => {
      onText('{"answer":"duola 是站主的分身');
      return {
        sessionId: 's-1',
        answer: 'duola 是站主的分身',
        citations: [{ slug: 'cc-intro' }],
        aiUsedFlag: true,
        elapsedMs: 10,
        requestId: 'request-1',
        messageId: 'message-1',
        attemptId: 'attempt-1',
        runId: null,
        conversationId: null,
      };
    });
    renderModal({ query: 'duola 是谁' });
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/搜索或问小影/);
    await user.type(input, '{Enter}');
    expect(mockedStream).toHaveBeenCalledWith(expect.objectContaining({
      body: 'duola 是谁',
      sessionId: null,
      onText: expect.any(Function),
      signal: expect.any(AbortSignal),
      source: 'assistant-stream',
      context: expect.objectContaining({ conversationId: null, requestKey: expect.any(String) }),
      onAccepted: expect.any(Function),
    }));
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
      requestId: 'request-2',
      messageId: 'message-2',
      attemptId: 'attempt-2',
      runId: null,
      conversationId: null,
    });
    renderModal({ query: '低成本 AI 社群', note: '无结果' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /问问小影/ }));
    expect(mockedStream).toHaveBeenCalledOnce();
    expect(await screen.findByText('规则回答')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /返回搜索/ }));
    expect(screen.getByPlaceholderText(/搜索或问小影/)).toBeInTheDocument();
  });

  it('AI 问答失败时无声降级展示本地匹配与规则下一步入口', async () => {
    mockedStream.mockRejectedValueOnce(new Error('assistant-timeout'));
    renderModal({ query: 'Claude Code 入门' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /问问小影/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: '用规则版拆解下一步' })).toHaveAttribute(
        'href',
        '/tools?q=Claude%20Code%20%E5%85%A5%E9%97%A8',
      );
    });
  });

  it('query 过短不出现问小影入口，关闭面板会 abort 进行中请求', async () => {
    renderModal({ query: ' d ' });
    expect(screen.queryByRole('button', { name: /问问小影/ })).not.toBeInTheDocument();

    let signal: AbortSignal | undefined;
    mockedStream.mockImplementationOnce(({ onText, signal: s }) => {
      signal = s;
      onText('{"answer":"半句');
      return new Promise(() => {});
    });
    function Harness({ open }: { open: boolean }) {
      return (
        <MemoryRouter>
          <SearchModal
            open={open}
            query="Dora 是谁"
            hits={[]}
            note=""
            onClose={() => {}}
            onQueryChange={() => {}}
          />
        </MemoryRouter>
      );
    }
    const user = userEvent.setup();
    const { rerender } = render(<Harness open />);
    await user.click(screen.getByRole('button', { name: /问问小影/ }));
    expect(signal?.aborted).toBe(false);
    rerender(<Harness open={false} />);
    expect(signal?.aborted).toBe(true);
  });

  it('seedAsk 打开后直接问小影', async () => {
    mockedStream.mockResolvedValueOnce({
      sessionId: 's-3',
      answer: '从宠物来的问题',
      citations: [],
      aiUsedFlag: true,
      elapsedMs: 4,
      requestId: 'request-3',
      messageId: 'message-3',
      attemptId: 'attempt-3',
      runId: null,
      conversationId: null,
    });
    renderModal({ query: 'Dora 是谁', seedAsk: 'Dora 是谁' });
    expect(await screen.findByText('从宠物来的问题')).toBeInTheDocument();
  });
});
