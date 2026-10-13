import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { assistantStreamEventId } from '@walker/shared';
import { publicApi } from '../../api/public-api';
import { ArticleAssistantPanel } from './ArticleAssistantPanel';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

function manifestResponse(available = true, aiEnabled = true) {
  return new Response(JSON.stringify({
    placementKey: 'post-detail',
    scopeSlug: 'post-a',
    label: '文章详情',
    available,
    aiEnabled,
    generation: available ? 3 : null,
    defaultMemberKey: available ? 'public-member-a' : null,
    members: available ? [
      { key: 'public-member-a', name: '小影', revision: 2, isDefault: true },
      { key: 'public-member-b', name: '观察者', revision: 1, isDefault: false },
    ] : [],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function historyResponse(messages: unknown[] = [], conversationId: string | null = null) {
  return new Response(JSON.stringify({
    conversationId, placementKey: 'post-detail', scopeSlug: 'post-a', deploymentGeneration: 3, messages,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('ArticleAssistantPanel', () => {
  it('只读取位置清单，明确说明规则模式且介绍关闭后本会话不再显示', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/assistant/conversations/')
      ? historyResponse()
      : manifestResponse(false));
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const panel = () => <MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>;

    const first = render(panel());
    expect(await screen.findByText(/还没有启用 Agent/)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/assistant/placements/post-detail/post-a'))).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/assistant/events'))).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('/assistant/stream'))).toBe(false);

    await user.click(screen.getByRole('button', { name: '关闭介绍' }));
    expect(screen.queryByRole('complementary', { name: '助手介绍' })).not.toBeInTheDocument();
    first.unmount();

    render(panel());
    expect(await screen.findByText(/还没有启用 Agent/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭介绍' })).not.toBeInTheDocument();
  });

  it('用户点击示例后才发送，并绑定当前文章位置与公开消息上下文', async () => {
    const messageId = 'message-1234567890abcdef12345678';
    const attemptId = 'attempt-1234567890abcdef12345678';
    const runId = 'run-123';
    const postedBodies: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assistant/placements/')) return manifestResponse(true);
      if (url.includes('/assistant/conversations/')) return historyResponse();
      if (url.endsWith('/assistant/stream')) {
        const posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        postedBodies.push(posted);
        const requestId = String(posted.requestKey);
        const result = {
          sessionId: 'sdk-session', answer: '按文章里的步骤先做第一步。', citations: [{ slug: 'post-a' }],
          aiUsedFlag: true, elapsedMs: 30, requestId, messageId, attemptId, runId,
          conversationId: 'conversation-post-a',
        };
        const events = [
          { version: 2, type: 'accepted', eventId: assistantStreamEventId(messageId, 0), requestId, messageId, attemptId, runId: null, sequence: 0 },
          { version: 2, type: 'delta', eventId: assistantStreamEventId(messageId, 1), requestId, messageId, attemptId, runId, sequence: 1, delta: '按文章里的步骤先做第一步。' },
          { version: 2, type: 'done', eventId: assistantStreamEventId(messageId, 2), requestId, messageId, attemptId, runId, sequence: 2, result },
        ];
        const source = events.map((event) => `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
        return new Response(source, { status: 200 });
      }
      if (url.endsWith(`/assistant/messages/${messageId}/ack`)) {
        return new Response(JSON.stringify({ acknowledged: true, duplicate: false }), { status: 201 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(publicApi.assistantPlacement('post-detail', 'post-a')).resolves.toMatchObject({ available: true });
    const user = userEvent.setup();
    render(<MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>);
    await screen.findByText(/当前由「小影 · v2」回答/);
    expect(fetcher.mock.calls.some(([input]) => String(input).endsWith('/assistant/stream'))).toBe(false);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dora 是谁？' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Dora 是谁？' }));
    expect(await screen.findByText('按文章里的步骤先做第一步。')).toBeInTheDocument();
    expect(postedBodies[0]).toMatchObject({
      placementKey: 'post-detail', scopeSlug: 'post-a', conversationId: null,
      memberKey: 'public-member-a', deploymentGeneration: 3,
    });
    expect(typeof postedBodies[0]?.requestKey).toBe('string');
    await waitFor(() => expect(fetcher.mock.calls.some(([input]) => String(input).endsWith(`/assistant/messages/${messageId}/ack`))).toBe(true));
  });

  it('切换只在已发布成员中进行，并在刷新后恢复同一消息时间线', async () => {
    const messageId = 'message-2234567890abcdef12345678';
    const attemptId = 'attempt-2234567890abcdef12345678';
    const historyMessages: unknown[] = [
      { id: 'visitor-1', role: 'visitor', text: '之前的问题', delivery: 'ack', createdAt: '2026-09-24T00:00:00.000Z', member: null },
      { id: 'answer-1', role: 'assistant', text: '小影先前的回答', delivery: 'ack', createdAt: '2026-09-24T00:00:01.000Z', member: { name: '小影', revision: 2 } },
      { id: 'answer-hidden', role: 'assistant', text: '', delivery: 'unavailable', createdAt: '2026-09-24T00:00:02.000Z', member: null, hidden: true },
    ];
    const postedBodies: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assistant/placements/')) return manifestResponse(true);
      if (url.includes('/assistant/conversations/')) return historyResponse(historyMessages, 'conversation-post-a');
      if (url.endsWith('/assistant/stream')) {
        const posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        postedBodies.push(posted);
        const requestId = String(posted.requestKey);
        const result = {
          sessionId: 'sdk-session-b', answer: '观察者的回答。', citations: [], aiUsedFlag: true, elapsedMs: 20,
          requestId, messageId, attemptId, runId: 'run-public', conversationId: 'conversation-post-a',
        };
        historyMessages.push(
          { id: 'visitor-2', role: 'visitor', text: '换一个角度', delivery: 'ack', createdAt: '2026-09-24T00:00:02.000Z', member: null },
          { id: messageId, role: 'assistant', text: result.answer, delivery: 'sent', createdAt: '2026-09-24T00:00:03.000Z', member: { name: '观察者', revision: 1 } },
        );
        const events = [
          { version: 2, type: 'accepted', eventId: assistantStreamEventId(messageId, 0), requestId, messageId, attemptId, runId: null, sequence: 0 },
          { version: 2, type: 'delta', eventId: assistantStreamEventId(messageId, 1), requestId, messageId, attemptId, runId: 'run-public', sequence: 1, delta: result.answer },
          { version: 2, type: 'done', eventId: assistantStreamEventId(messageId, 2), requestId, messageId, attemptId, runId: 'run-public', sequence: 2, result },
        ];
        return new Response(events.map((event) => `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { status: 200 });
      }
      if (url.endsWith(`/assistant/messages/${messageId}/ack`)) return new Response('{}', { status: 201 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const panel = () => <MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>;
    const first = render(panel());

    expect(await screen.findByText('小影先前的回答')).toBeInTheDocument();
    expect(screen.getByText('这条历史回答对应的成员已不在当前公开位置，内容已隐藏。')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '选择回答成员' })).toHaveValue('public-member-a');
    await user.selectOptions(screen.getByRole('combobox', { name: '选择回答成员' }), 'public-member-b');
    await user.type(screen.getByRole('textbox', { name: '问观察者' }), '换一个角度');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('观察者的回答。')).toBeInTheDocument();
    expect(screen.getByText('观察者 · v1', { selector: 'p' })).toBeInTheDocument();
    expect(postedBodies[0]).toMatchObject({
      memberKey: 'public-member-b', deploymentGeneration: 3, conversationId: 'conversation-post-a',
    });

    first.unmount();
    render(panel());
    expect(await screen.findByText('小影先前的回答')).toBeInTheDocument();
    expect(await screen.findByText('观察者的回答。')).toBeInTheDocument();
  });

  it('页面使用过期部署代次时刷新成员并提示访客重新确认', async () => {
    let manifestCalls = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assistant/placements/')) {
        manifestCalls += 1;
        const generation = manifestCalls === 1 ? 3 : 4;
        const members = generation === 3
          ? [{ key: 'public-member-a', name: '小影', revision: 2, isDefault: true }, { key: 'public-member-b', name: '观察者', revision: 1, isDefault: false }]
          : [
              { key: 'public-member-c', name: '小影', revision: 3, isDefault: true },
              { key: 'public-member-d', name: '观察者', revision: 2, isDefault: false },
            ];
        return new Response(JSON.stringify({
          placementKey: 'post-detail', scopeSlug: 'post-a', label: '文章详情', available: true,
          aiEnabled: true, generation, members, defaultMemberKey: members[0]?.key ?? null,
        }), { status: 200 });
      }
      if (url.includes('/assistant/conversations/')) return historyResponse();
      if (url.endsWith('/assistant/stream')) {
        const posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const requestId = String(posted.requestKey);
        const event = {
          version: 2, type: 'error', eventId: assistantStreamEventId(requestId, 0), requestId,
          messageId: requestId, attemptId: requestId, runId: null, sequence: 0,
          code: 'placement-generation-conflict', message: '公开成员列表已更新，请刷新后重试。',
        };
        return new Response(`id: ${event.eventId}\nevent: error\ndata: ${JSON.stringify(event)}\n\n`, { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Dora 是谁？' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Dora 是谁？' }));
    expect(await screen.findByText(/公开助手配置已更新，已刷新成员列表/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '选择回答成员' })).toHaveValue('public-member-c');
    expect(await screen.findByText(/请确认最新成员后再试/)).toBeInTheDocument();
  });

  it('AI 关闭时说明规则答复且不把公开成员当作模型调用目标', async () => {
    const messageId = 'message-3234567890abcdef12345678';
    const attemptId = 'attempt-3234567890abcdef12345678';
    let postedBody: Record<string, unknown> | null = null;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assistant/placements/')) return manifestResponse(true, false);
      if (url.includes('/assistant/conversations/')) return historyResponse();
      if (url.endsWith('/assistant/stream')) {
        postedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const requestId = String(postedBody.requestKey);
        const result = {
          sessionId: 'rule-session', answer: '规则模式回答。', citations: [], aiUsedFlag: false, elapsedMs: 1,
          requestId, messageId, attemptId, runId: null, conversationId: null,
        };
        const events = [
          { version: 2, type: 'accepted', eventId: assistantStreamEventId(messageId, 0), requestId, messageId, attemptId, runId: null, sequence: 0 },
          { version: 2, type: 'delta', eventId: assistantStreamEventId(messageId, 1), requestId, messageId, attemptId, runId: null, sequence: 1, delta: result.answer },
          { version: 2, type: 'done', eventId: assistantStreamEventId(messageId, 2), requestId, messageId, attemptId, runId: null, sequence: 2, result },
        ];
        return new Response(events.map((event) => `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>);

    expect(await screen.findByText(/AI 当前关闭，提问会由规则回答/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '选择回答成员' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dora 是谁？' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Dora 是谁？' }));
    expect(await screen.findByText('规则模式回答。')).toBeInTheDocument();
    expect(postedBody).toMatchObject({ memberKey: null, deploymentGeneration: null });
  });

  it('显式停止时轮询到服务端确认后才显示已停止', async () => {
    const messageId = 'message-4234567890abcdef12345678';
    const attemptId = 'attempt-4234567890abcdef12345678';
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    let stopCalls = 0;
    const historyMessages: unknown[] = [];
    const stopSpy = vi.spyOn(publicApi, 'stopAssistant').mockImplementation(async (placementKey, scopeSlug, requestedMessageId) => {
      stopCalls += 1;
      expect([placementKey, scopeSlug, requestedMessageId]).toEqual(['post-detail', 'post-a', messageId]);
      if (stopCalls === 1) return { state: 'PENDING', confirmed: false };
      const event = {
        version: 2, type: 'error', eventId: assistantStreamEventId(messageId, 2),
        requestId: 'stream-request', messageId, attemptId, runId: 'run-public', sequence: 2,
        code: 'user-stopped', message: '回答已停止。',
      };
      streamController?.enqueue(new TextEncoder().encode(`id: ${event.eventId}\nevent: error\ndata: ${JSON.stringify(event)}\n\n`));
      streamController?.close();
      historyMessages.push(
        { id: 'visitor-v14', role: 'visitor', text: 'Dora 是谁？', delivery: 'ack', createdAt: '2026-09-25T00:00:00.000Z', member: null },
        { id: messageId, role: 'assistant', text: '已经生成的一部分', delivery: 'partial', createdAt: '2026-09-25T00:00:01.000Z', member: { name: '小影', revision: 2 }, stopped: true },
      );
      return { state: 'CANCELLED', confirmed: true };
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assistant/placements/')) return manifestResponse(true);
      if (url.includes('/assistant/conversations/')) return historyResponse(historyMessages, 'conversation-post-a');
      if (url.endsWith('/assistant/stream')) {
        const posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const requestId = String(posted.requestKey);
        const frames = [
          { version: 2, type: 'accepted', eventId: assistantStreamEventId(messageId, 0), requestId, messageId, attemptId, runId: null, sequence: 0 },
          { version: 2, type: 'delta', eventId: assistantStreamEventId(messageId, 1), requestId, messageId, attemptId, runId: 'run-public', sequence: 1, delta: '已经生成的一部分' },
        ];
        const source = frames.map((event) => `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(new TextEncoder().encode(source));
          },
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const view = render(<MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dora 是谁？' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Dora 是谁？' }));
    expect(await screen.findByText('已经生成的一部分')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '停止' }));
    await waitFor(() => expect(stopCalls).toBe(2));
    expect(await screen.findByText(/已停止/)).toBeInTheDocument();
    expect(stopSpy).toHaveBeenCalledTimes(2);
    view.unmount();
    render(<MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>);
    expect(await screen.findByText('已经生成的一部分')).toBeInTheDocument();
    expect(screen.getByText(/已停止/)).toBeInTheDocument();
  });

  it('只发送白名单助手部件事件和安全 ID', async () => {
    const messageId = 'message-7234567890abcdef12345678';
    const attemptId = 'attempt-7234567890abcdef12345678';
    const recorded: Record<string, unknown>[] = [];
    vi.spyOn(publicApi, 'assistantInteraction').mockImplementation(async (event) => {
      recorded.push(event as unknown as Record<string, unknown>);
      return { recorded: true, duplicate: false };
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/assistant/placements/')) return manifestResponse(true);
      if (url.includes('/assistant/conversations/')) return historyResponse();
      if (url.endsWith('/assistant/stream')) {
        const posted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const requestId = String(posted.requestKey);
        const result = {
          sessionId: 'sdk-session', answer: '按这篇文章来理解。', citations: [{ slug: 'post-a' }],
          aiUsedFlag: true, elapsedMs: 5, requestId, messageId, attemptId, runId: 'run-public', conversationId: 'conversation-post-a',
        };
        const events = [
          { version: 2, type: 'accepted', eventId: assistantStreamEventId(messageId, 0), requestId, messageId, attemptId, runId: null, sequence: 0 },
          { version: 2, type: 'delta', eventId: assistantStreamEventId(messageId, 1), requestId, messageId, attemptId, runId: 'run-public', sequence: 1, delta: result.answer },
          { version: 2, type: 'done', eventId: assistantStreamEventId(messageId, 2), requestId, messageId, attemptId, runId: 'run-public', sequence: 2, result },
        ];
        return new Response(events.map((event) => `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { status: 200 });
      }
      if (url.endsWith(`/assistant/messages/${messageId}/ack`)) return new Response('{}', { status: 201 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<MemoryRouter><ArticleAssistantPanel slug="post-a" title="文章 A" /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: '关闭介绍' }));
    await user.click(screen.getByRole('button', { name: '收起助手' }));
    await user.click(screen.getByRole('button', { name: '展开助手' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: '选择回答成员' }), 'public-member-b');
    await user.click(screen.getByRole('button', { name: 'Dora 是谁？' }));
    expect(await screen.findByText('按这篇文章来理解。')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: '《post-a》' }));
    await user.click(screen.getByRole('button', { name: '回答有帮助' }));

    await waitFor(() => expect(recorded.map((event) => event.event)).toEqual(expect.arrayContaining([
      'expose', 'intro-dismiss', 'close', 'open', 'member-switch', 'send', 'citation-click', 'feedback',
    ])));
    expect(recorded.find((event) => event.event === 'citation-click')).toMatchObject({ targetSlug: 'post-a', messageId });
    expect(recorded.find((event) => event.event === 'member-switch')).toMatchObject({ memberKey: 'public-member-b' });
    expect(recorded.every((event) => !('url' in event) && !('conversationId' in event))).toBe(true);
  });
});
