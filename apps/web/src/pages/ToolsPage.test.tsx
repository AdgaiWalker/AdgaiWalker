import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { WEB_ROUTES } from '../shared/routes';
import { ToolsPage } from './ToolsPage';

vi.mock('../api/public-api', async () => {
  const actual =
    await vi.importActual<typeof import('../api/public-api')>('../api/public-api');
  return { ...actual, publicApi: { ...actual.publicApi, intake: vi.fn() } };
});

import { publicApi } from '../api/public-api';

const intake = vi.mocked(publicApi.intake);
const BODY = '想学 AI 写周报，每天只有半小时，不知道从哪开始';
const EXAMPLE = '想学 AI，从哪开始？';

const OK_RESULT = {
  clueId: 'clue-1',
  nextStep: '先选一个最小场景；连做三次记下卡点。',
  bucketId: 'learn-ai',
  aiUsedFlag: false,
  poolStatus: 'candidate',
};

function stubMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={[WEB_ROUTES.ask]}>
      <ToolsPage />
    </MemoryRouter>,
  );
}

async function typeBody(user: ReturnType<typeof userEvent.setup>, text = BODY) {
  await user.type(screen.getByLabelText('描述你的卡点'), text);
}

describe('卡口对话页', () => {
  beforeEach(() => {
    intake.mockReset();
    window.sessionStorage.clear();
    stubMotion(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('空态给出引导与示例，示例点击即发送', async () => {
    intake.mockResolvedValue(OK_RESULT);
    const user = userEvent.setup();
    renderChat();

    expect(screen.getByRole('heading', { name: '你卡在哪？' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: EXAMPLE }));

    await waitFor(() => {
      expect(intake).toHaveBeenCalledWith(EXAMPLE);
    });
    expect(document.querySelectorAll('.assistant-msg-user')).toHaveLength(1);
  });

  it('字数不足时发送按钮禁用，补足后可发送', async () => {
    const user = userEvent.setup();
    renderChat();

    const send = screen.getByRole('button', { name: '发送' });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText('描述你的卡点'), '太短');
    expect(send).toBeDisabled();

    await typeBody(user);
    expect(send).toBeEnabled();
  });

  it('发送后原地出现问答：回答含下一步与依据', async () => {
    intake.mockResolvedValue(OK_RESULT);
    const user = userEvent.setup();
    renderChat();

    await typeBody(user);
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(document.querySelectorAll('.chat-answer')).toHaveLength(1);
    });
    expect(screen.getByText('先选一个最小场景')).toBeInTheDocument();
    expect(screen.getByText('连做三次记下卡点。')).toBeInTheDocument();
    expect(screen.getByText('这份结论是怎么来的？')).toBeInTheDocument();
    expect(screen.getByText(/命中触发词/)).toBeInTheDocument();
    // 提交的正文不含类型标签：类型只是前端引导
    expect(intake).toHaveBeenCalledWith(BODY);
  });

  it('失败时对话内说明原因，并把内容还给输入框', async () => {
    intake.mockRejectedValue(new ApiError('guest-quota-exceeded', 'quota'));
    const user = userEvent.setup();
    renderChat();

    await typeBody(user);
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/游客/);
    });
    expect(document.querySelectorAll('.chat-answer')).toHaveLength(0);
    expect(screen.getByLabelText('描述你的卡点')).toHaveValue(BODY);
  });

  it('连续两次提问各自成对，可重新开始清空对话', async () => {
    intake.mockResolvedValue(OK_RESULT);
    const user = userEvent.setup();
    renderChat();

    await typeBody(user);
    await user.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => {
      expect(document.querySelectorAll('.chat-answer')).toHaveLength(1);
    });

    await typeBody(user, '第二个卡点：公众号选题总是定不下来');
    await user.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(document.querySelectorAll('.assistant-msg-user')).toHaveLength(2);
    });
    expect(document.querySelectorAll('.chat-answer')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '重新开始' }));
    expect(document.querySelectorAll('.assistant-msg-user')).toHaveLength(0);
    expect(screen.getByRole('button', { name: EXAMPLE })).toBeInTheDocument();
  });
});
