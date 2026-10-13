import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { XiaoyingHome } from './XiaoyingHome';
import type { AssistantMessage } from '../../hooks/useAssistant';
import { HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE } from '@walker/shared';

const mock = vi.hoisted(() => ({ play: vi.fn(), pause: vi.fn(), dispose: vi.fn(), mount: vi.fn() }));
const assistant = vi.hoisted(() => ({
  send: vi.fn(async () => {}),
  stop: vi.fn(),
  reset: vi.fn(),
  messages: [] as AssistantMessage[],
  loading: false,
  streaming: false,
  error: null as string | null,
  context: null as unknown,
  restoreHistory: vi.fn(),
  generationConflict: false,
}));
const api = vi.hoisted(() => ({
  placement: vi.fn(), history: vi.fn(), interaction: vi.fn(async () => ({})),
}));
vi.mock('../../api/public-api', () => ({
  publicApi: { assistantPlacement: api.placement, assistantHistory: api.history, assistantInteraction: api.interaction },
}));
vi.mock('./scene', () => ({ mountPet: mock.mount }));
vi.mock('../../hooks/useAssistant', () => ({
  useAssistant: (context: unknown) => {
    assistant.context = context;
    return ({
    send: assistant.send,
    stop: assistant.stop,
    reset: assistant.reset,
    messages: assistant.messages,
    loading: assistant.loading,
    streaming: assistant.streaming,
    error: assistant.error,
    restoreHistory: assistant.restoreHistory,
    generationConflict: assistant.generationConflict,
  });
  },
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
    assistant.context = null;
    assistant.generationConflict = false;
    api.placement.mockResolvedValue({ placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE, available: false, aiEnabled: true, generation: null, defaultMemberKey: null, members: [] });
    api.history.mockResolvedValue({ conversationId: null, placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE, deploymentGeneration: null, messages: [] });
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
    vi.restoreAllMocks();
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

  it('收起气泡不让隐藏链接进入键盘焦点，关闭后焦点回到小影', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    assistant.messages = [
      { role: 'user', text: '上一问' },
      { role: 'assistant', text: '上一答', citations: ['cc-intro'], aiUsedFlag: true },
    ];
    renderHome();
    const panel = document.querySelector('.xiaoying-panel') as HTMLElement;
    const petButton = screen.getByRole('button', { name: '摸摸小影' });
    expect(panel.hasAttribute('inert')).toBe(true);
    expect(petButton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(petButton);
    expect(panel.hasAttribute('inert')).toBe(false);
    expect(petButton.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(screen.getByRole('textbox', { name: '问小影' })).toHaveFocus());
    clock.mockReturnValue(2000);
    fireEvent.pointerDown(document.body);
    expect(panel.hasAttribute('inert')).toBe(true);
    document.body.tabIndex = -1;
    document.body.focus();
    await waitFor(() => expect(petButton).toHaveFocus());
    document.body.removeAttribute('tabindex');
    clock.mockRestore();
  });

  it('旧成员回答隐藏时显示安全占位，不显示原文或引用', () => {
    assistant.messages = [
      { role: 'user', text: '旧问题' },
      { role: 'assistant', text: '', citations: ['cc-intro'], aiUsedFlag: false, hidden: true, restored: true },
    ];
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    expect(screen.getByText('这条历史回答对应的成员已不在当前公开位置，内容已隐藏。')).toBeInTheDocument();
    expect(screen.queryByText('cc-intro')).toBeNull();
  });

  it('首页小影使用后台当前部署的默认成员和版本发问', async () => {
    api.placement.mockResolvedValue({
      placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE,
      available: true, aiEnabled: true, generation: 4, defaultMemberKey: 'member-1',
      members: [{ key: 'member-1', name: '小影', revision: 2, isDefault: true }],
    });
    renderHome();
    await waitFor(() => expect(assistant.context).toMatchObject({
      placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE,
      memberKey: 'member-1', deploymentGeneration: 4,
    }));
    expect(api.placement).toHaveBeenCalledWith(HOME_XIAOYING_PLACEMENT, PUBLIC_SITE_SCOPE);
  });

  it('初次加载同时恢复该公开位置的业务消息', async () => {
    const history = {
      conversationId: 'conversation-home', placementKey: HOME_XIAOYING_PLACEMENT,
      scopeSlug: PUBLIC_SITE_SCOPE, deploymentGeneration: null, messages: [],
    };
    api.history.mockResolvedValue(history);
    renderHome();
    await waitFor(() => expect(assistant.restoreHistory).toHaveBeenCalledWith(history));
  });

  it('部署代次冲突后重新获取当前公开成员', async () => {
    const initial = {
      placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE,
      available: true, aiEnabled: true, generation: 1, defaultMemberKey: 'old-member',
      members: [{ key: 'old-member', name: '小影', revision: 1, isDefault: true }],
    };
    const updated = {
      ...initial, generation: 2, defaultMemberKey: 'new-member',
      members: [{ key: 'new-member', name: '小影', revision: 2, isDefault: true }],
    };
    api.placement.mockResolvedValue(initial);
    const view = renderHome();
    await waitFor(() => expect(assistant.context).toMatchObject({ memberKey: 'old-member', deploymentGeneration: 1 }));
    api.placement.mockResolvedValue(updated);
    assistant.generationConflict = true;
    view.rerender(<MemoryRouter><XiaoyingHome /></MemoryRouter>);
    await waitFor(() => expect(assistant.context).toMatchObject({ memberKey: 'new-member', deploymentGeneration: 2 }));
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

  it('位置状态读取完成后空态提示词一点就问', async () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dora 是谁？' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Dora 是谁？' }));
    expect(assistant.send).toHaveBeenCalledWith('Dora 是谁？');
  });

  it('回车把问题交给流式问答', async () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dora 是谁？' })).not.toBeDisabled());
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

  it('新问题失败时不把上一轮回答当作当前回答', () => {
    assistant.messages = [
      { role: 'user', text: '上一问' },
      { role: 'assistant', text: '上一答。', citations: [], aiUsedFlag: false },
      { role: 'user', text: '这次的问题' },
    ];
    assistant.error = '服务暂时不可用';
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    expect(screen.getByText('这次的问题')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('服务暂时不可用');
    expect(screen.queryByText('上一答。')).toBeNull();
  });

  it('接入模型后将旧固定回答标成历史消息', async () => {
    api.placement.mockResolvedValue({
      placementKey: HOME_XIAOYING_PLACEMENT, scopeSlug: PUBLIC_SITE_SCOPE,
      available: true, aiEnabled: true, generation: 2, defaultMemberKey: 'member-1',
      members: [{ key: 'member-1', name: '小影', revision: 1, isDefault: true }],
    });
    assistant.messages = [
      { role: 'user', text: '旧问题' },
      { role: 'assistant', text: '旧固定回答', citations: [], aiUsedFlag: false, restored: true },
    ];
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: '摸摸小影' }));
    await waitFor(() => expect(screen.getByText('当前由 小影 · v1 回答')).toBeInTheDocument());
    expect(screen.getByText('历史固定回答')).toBeInTheDocument();
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
