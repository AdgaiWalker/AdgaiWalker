import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { XiaoyingHome } from './XiaoyingHome';
import type { AssistantMessage } from '../../hooks/useAssistant';

const mock = vi.hoisted(() => ({ play: vi.fn(), pause: vi.fn(), dispose: vi.fn(), mount: vi.fn() }));
const assistant = vi.hoisted(() => ({
  send: vi.fn(async () => {}),
  stop: vi.fn(),
  reset: vi.fn(),
  messages: [] as AssistantMessage[],
  loading: false,
  streaming: false,
  error: null as string | null,
}));
vi.mock('./scene', () => ({ mountPet: mock.mount }));
vi.mock('../../hooks/useAssistant', () => ({
  useAssistant: () => ({
    send: assistant.send,
    stop: assistant.stop,
    reset: assistant.reset,
    messages: assistant.messages,
    loading: assistant.loading,
    streaming: assistant.streaming,
    error: assistant.error,
  }),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <XiaoyingHome />
    </MemoryRouter>,
  );
}

describe('小影首页桌宠', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assistant.messages = [];
    assistant.loading = false;
    assistant.streaming = false;
    assistant.error = null;
    sessionStorage.removeItem('walker:xiaoying-met');
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe() { queueMicrotask(() => this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
      disconnect() {}
    });
    mock.mount.mockImplementation((_host, ready, _error, motion) => {
      ready();
      mock.play.mockImplementation(motion);
      return mock;
    });
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {};
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('加载中不展示摄影棚静帧', async () => {
    mock.mount.mockImplementation((_host, _ready, _error, motion) => {
      mock.play.mockImplementation(motion);
      return mock;
    });
    renderHome();
    await waitFor(() => expect(mock.mount).toHaveBeenCalledOnce());
    expect(document.querySelector('.xiaoying-poster')).toBeNull();
    expect(document.querySelector('.xiaoying-stage')).toHaveAttribute('data-pet-status', 'loading');
  });

  it('模型失败才用静帧', async () => {
    mock.mount.mockImplementation((_host, _ready, error, motion) => {
      error();
      mock.play.mockImplementation(motion);
      return mock;
    });
    renderHome();
    await waitFor(() => expect(document.querySelector('.xiaoying-poster')).toBeTruthy());
    expect(document.querySelector('.xiaoying-stage')).toHaveAttribute('data-pet-status', 'fallback');
  });

  it('点宠物打开悬浮对话，不经过搜索面板', async () => {
    renderHome();
    await waitFor(() => expect(mock.mount).toHaveBeenCalledOnce());
    const layer = document.querySelector('.xiaoying-object') as HTMLElement;
    expect(layer).toHaveAttribute('data-panel', 'tucked');
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    expect(mock.play).toHaveBeenLastCalledWith('joy');
    expect(layer).toHaveAttribute('data-panel', 'open');
    await waitFor(() => expect(screen.getByRole('textbox', { name: '问小影' })).toHaveFocus());
  });

  it('第一次用身体招呼，不另占芯片', () => {
    renderHome();
    expect(document.querySelector('.xiaoying-wave')).toBeNull();
    expect(document.querySelector('.xiaoying-object')).toHaveAttribute('data-invite', 'true');
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    expect(document.querySelector('.xiaoying-object')).toHaveAttribute('data-invite', 'false');
    expect(sessionStorage.getItem('walker:xiaoying-met')).toBe('1');
  });

  it('窄屏打开对话不自动弹出键盘', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width: 760px'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    expect(document.querySelector('.xiaoying-object')).toHaveAttribute('data-panel', 'open');
    expect(screen.getByRole('textbox', { name: '问小影' })).not.toHaveFocus();
  });

  it('进页时面板收起；点开后不会马上收掉', () => {
    vi.useFakeTimers();
    renderHome();
    const layer = document.querySelector('.xiaoying-object') as HTMLElement;
    expect(layer).toHaveAttribute('data-panel', 'tucked');
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    expect(layer).toHaveAttribute('data-panel', 'open');
    act(() => { vi.advanceTimersByTime(600); });
    expect(layer).toHaveAttribute('data-panel', 'open');
    vi.useRealTimers();
  });

  it('空态提示词一点就问', () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dora 是谁？' }));
    expect(assistant.send).toHaveBeenCalledWith('Dora 是谁？');
  });

  it('回车把问题交给流式问答', async () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    const input = screen.getByRole('textbox', { name: '问小影' });
    fireEvent.change(input, { target: { value: 'Dora 是谁' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(assistant.send).toHaveBeenCalledWith('Dora 是谁');
  });

  it('流式回答是主内容，引用是次要', () => {
    assistant.loading = true;
    assistant.streaming = true;
    assistant.messages = [
      { role: 'user', text: 'Dora 是谁' },
      { role: 'assistant', text: 'Dora 是站主。', citations: ['cc-intro'], aiUsedFlag: true },
    ];
    renderHome();
    expect(document.querySelector('[data-pet-activity="speaking"]')).toBeTruthy();
    expect(screen.getByText('Dora 是站主。')).toBeInTheDocument();
    expect(screen.getByText('Dora 是谁')).toBeInTheDocument();
    const answer = document.querySelector('.xiaoying-panel-answer');
    expect(answer).toHaveAttribute('data-primary', 'true');
    expect(answer).toHaveAttribute('data-streaming', 'true');
    expect(answer).toHaveAttribute('data-has-text', 'true');
    expect(document.querySelector('.xiaoying-panel-cites')).toBeTruthy();
  });

  it('只亮当前这一句，旧轮不占主位', () => {
    assistant.messages = [
      { role: 'user', text: '上一问' },
      { role: 'assistant', text: '上一答。', citations: [], aiUsedFlag: true },
      { role: 'user', text: 'Dora 是谁' },
      { role: 'assistant', text: 'Dora 是站主。', citations: ['cc-intro'], aiUsedFlag: true },
    ];
    renderHome();
    expect(screen.getByText('Dora 是站主。')).toBeInTheDocument();
    expect(screen.getByText('Dora 是谁')).toBeInTheDocument();
    expect(screen.queryByText('上一问')).toBeNull();
    expect(screen.queryByText('上一答。')).toBeNull();
  });

  it('开口前是在想，不是空光标', () => {
    assistant.loading = true;
    assistant.streaming = true;
    assistant.messages = [
      { role: 'user', text: 'Dora 是谁' },
      { role: 'assistant', text: '', citations: [], aiUsedFlag: false },
    ];
    renderHome();
    expect(screen.getByText('在想')).toBeInTheDocument();
    expect(document.querySelector('.xiaoying-panel-answer')).toBeNull();
  });

  it('模型或 WebGL 失败时显示静态形象，问答仍可使用', async () => {
    mock.mount.mockImplementation((_host, _ready, error) => { error(); return mock; });
    renderHome();
    await screen.findByText('小影暂时静静陪你，搜索照常可用');
    expect(screen.getByRole('img', { name: '毛茸茸的影鳐小影' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    const input = screen.getByRole('textbox', { name: '问小影' });
    fireEvent.change(input, { target: { value: 'AI 入门' } });
    fireEvent.submit(input.closest('form')!);
    expect(assistant.send).toHaveBeenCalledWith('AI 入门');
  });

  it('拖过阈值后会移动，且不再当点按', async () => {
    renderHome();
    const layer = document.querySelector('.xiaoying-object') as HTMLElement;
    Object.defineProperty(layer, 'offsetWidth', { value: 240, configurable: true });
    Object.defineProperty(layer, 'offsetHeight', { value: 200, configurable: true });
    const before = layer.style.transform;
    fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 120, clientY: 80 });
    fireEvent.pointerMove(layer, { pointerId: 1, clientX: 200, clientY: 160 });
    expect(layer.dataset.dragging).toBe('true');
    fireEvent.pointerUp(layer, { pointerId: 1, clientX: 200, clientY: 160 });
    expect(layer.style.transform).not.toBe(before);
    expect(layer.dataset.dragging).toBe('false');
    expect(mock.play).not.toHaveBeenCalledWith('joy');
  });

  it('离开首页释放渲染器', async () => {
    const view = render(
      <MemoryRouter>
        <XiaoyingHome />
      </MemoryRouter>,
    );
    await waitFor(() => expect(mock.mount).toHaveBeenCalledOnce());
    act(() => view.unmount());
    expect(mock.dispose).toHaveBeenCalledOnce();
  });
});
