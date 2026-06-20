// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { mountToolMatch } from './tool-match-chat';

/**
 * 构造 mountToolMatch 所需的完整 root DOM。
 * 包含 initToolMatch 里所有 querySelector('#...') 引用的 id，
 * 以及 sendMessage / 历史面板 / 反馈按钮所需的结构。
 */
function mountRoot(): HTMLElement {
  const root = document.createElement('section');
  root.setAttribute('data-tool-match-root', '');
  root.innerHTML = `
    <button id="match-open" type="button"></button>
    <dialog id="match-dialog"></dialog>
    <button id="match-close" type="button"></button>
    <div id="chat-messages"></div>
    <textarea id="chat-input"></textarea>
    <button id="chat-send" type="button"></button>
    <div id="chat-status"></div>
    <input id="chat-consent" type="checkbox" checked />
    <select id="match-audience"><option value="prefer-not-say"></option></select>
    <select id="match-stage"><option value=""></option></select>
    <button id="context-toggle" type="button"></button>
    <div id="context-panel" class="hidden"></div>
    <div id="chat-suggestions"></div>
    <span id="match-stat"></span>
    <span id="memory-turn-count"></span>
    <span id="memory-role-label"></span>
    <span id="memory-friction-label"></span>
    <span class="signal-note"></span>
    <button id="match-history-toggle" type="button"></button>
    <div id="chat-history-panel"></div>
    <div id="history-list"></div>
    <button id="history-close" type="button"></button>
  `;
  document.body.appendChild(root);
  return root;
}

/** 刷新微任务队列，等 probeIdentity / sendMessage 的 fetch 链落定。 */
function flushMicrotasks(times = 3) {
  return new Promise((resolve) => {
    let count = 0;
    const tick = () => {
      if (++count >= times) resolve(undefined);
      else queueMicrotask(tick);
    };
    queueMicrotask(tick);
  });
}

function mockFetchSequence(responses: Array<{ url?: string; status?: number; body?: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const match = responses.find((r) => !r.url || url.includes(r.url)) ?? responses[0];
    return {
      ok: (match.status ?? 200) < 400,
      status: match.status ?? 200,
      json: async () => match.body ?? {},
    } as Response;
  });
  return calls;
}

describe('mountToolMatch (smoke)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('mounts and returns a cleanup function without throwing', () => {
    const root = mountRoot();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const cleanup = mountToolMatch(root);
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup!()).not.toThrow();
  });

  it('survives a mount → cleanup → remount cycle', () => {
    const root = mountRoot();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const cleanup1 = mountToolMatch(root);
    cleanup1!();
    const cleanup2 = mountToolMatch(root);
    expect(typeof cleanup2).toBe('function');
    cleanup2!();
  });
});

describe('mountToolMatch — 身份探测 (characterization)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('admin profile → signal-note 和 role-label 显示「管理员」', async () => {
    const root = mountRoot();
    mockFetchSequence([
      { url: '/api/profile', body: { authState: 'admin' } },
    ]);

    mountToolMatch(root);
    await flushMicrotasks(4);

    const signalNote = root.querySelector('.signal-note');
    const roleLabel = root.querySelector('#memory-role-label');
    expect(signalNote?.textContent).toBe('管理员');
    expect(roleLabel?.textContent).toBe('管理员');
  });

  it('401 → 标记为 public，signal-note 显示「登录可解锁」', async () => {
    const root = mountRoot();
    mockFetchSequence([{ url: '/api/profile', status: 401 }]);

    mountToolMatch(root);
    await flushMicrotasks(4);

    expect(root.querySelector('.signal-note')?.textContent).toBe('登录可解锁');
  });
});

describe('mountToolMatch — 发送会话 (characterization)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('点击 send → POST /api/match → recommendation 渲染结果卡', async () => {
    const root = mountRoot();
    const calls = mockFetchSequence([
      { url: '/api/profile', body: { authState: 'admin' } },
      {
        url: '/api/match',
        body: {
          responseMode: 'recommendation',
          sessionId: 'sess-1',
          bridge: '先做这一步',
          actionPlan: { primaryTool: { id: 't1', name: 'Cursor', useFor: '写代码' }, prompt: 'hi' },
        },
      },
    ]);

    mountToolMatch(root);
    await flushMicrotasks(4);

    const input = root.querySelector('#chat-input') as HTMLTextAreaElement;
    input.value = '帮我写代码';
    root.querySelector('#chat-send')!.dispatchEvent(new Event('click'));

    await flushMicrotasks(8);

    const matchCall = calls.find((c) => c.url.includes('/api/match'));
    expect(matchCall).toBeTruthy();
    const payload = JSON.parse(matchCall!.init!.body as string);
    expect(payload.messages[0].content).toBe('帮我写代码');

    // recommendation 模式渲染 .chat-result-card
    const card = root.querySelector('.chat-result-card');
    expect(card).toBeTruthy();
    expect(card?.querySelector('.action-tool-name')?.textContent).toBe('Cursor');
  });
});

describe('mountToolMatch — 反馈提交 (characterization)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('点击反馈按钮 → POST /api/match-feedback → 按钮禁用', async () => {
    const root = mountRoot();
    const calls = mockFetchSequence([
      { url: '/api/profile', body: { authState: 'admin' } },
      {
        url: '/api/match',
        body: {
          responseMode: 'recommendation',
          sessionId: 'sess-fb',
          bridge: '建议',
          actionPlan: { primaryTool: { id: 't1', name: 'X', useFor: 'y' }, prompt: 'p' },
        },
      },
      { url: '/api/match-feedback', body: {} },
    ]);

    mountToolMatch(root);
    await flushMicrotasks(4);

    root.querySelector('#chat-input')!.setAttribute('value', '问题');
    (root.querySelector('#chat-input') as HTMLTextAreaElement).value = '问题';
    root.querySelector('#chat-send')!.dispatchEvent(new Event('click'));
    await flushMicrotasks(8);

    const feedbackBtn = root.querySelector('[data-feedback="first-draft"]') as HTMLButtonElement;
    expect(feedbackBtn).toBeTruthy();
    feedbackBtn.dispatchEvent(new Event('click', { bubbles: true }));
    await flushMicrotasks(6);

    const feedbackCall = calls.find((c) => c.url.includes('/api/match-feedback'));
    expect(feedbackCall).toBeTruthy();
    const payload = JSON.parse(feedbackCall!.init!.body as string);
    expect(payload.sessionId).toBe('sess-fb');
    expect(payload.feedbackType).toBe('first-draft');
    // 提交后所有反馈按钮应被禁用
    const allFeedbackBtns = root.querySelectorAll('[data-feedback]');
    expect([...allFeedbackBtns].every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe('mountToolMatch — 历史加载 (characterization)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('localStorage 有 sessionIds → 点 history toggle → GET /api/match-history → 渲染列表', async () => {
    const root = mountRoot();
    localStorage.setItem('match-session-ids', JSON.stringify(['s1', 's2']));
    const calls = mockFetchSequence([
      { url: '/api/profile', body: { authState: 'admin' } },
      {
        url: '/api/match-history',
        body: {
          conversations: [
            { sessionId: 's1', startedAt: '2026-06-01T00:00:00Z', messages: [{ role: 'user', content: '第一个问题' }] },
            { sessionId: 's2', startedAt: '2026-06-02T00:00:00Z', messages: [{ role: 'user', content: '第二个问题' }] },
          ],
        },
      },
    ]);

    mountToolMatch(root);
    await flushMicrotasks(4);

    root.querySelector('#match-history-toggle')!.dispatchEvent(new Event('click'));
    await flushMicrotasks(6);

    const historyCall = calls.find((c) => c.url.includes('/api/match-history'));
    expect(historyCall).toBeTruthy();
    expect(historyCall!.url).toContain('sessionIds=s1');
    expect(historyCall!.url).toContain('s2');

    const items = root.querySelectorAll('.history-item');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.history-item-text')?.textContent).toContain('第一个问题');
  });
});
