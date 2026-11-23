import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationLogDetail } from "@walker/shared";
import { ConversationLogDetailPage } from "./ConversationLogDetailPage";
import { RunListPage } from "./RunListPage";

const {
  useConversationLogDetailMock,
  useConversationActionPreviewMock,
  useConvertConversationToActionMock,
  useActivityMock,
  useActivityCountsMock,
} = vi.hoisted(() => ({
  useConversationLogDetailMock: vi.fn(),
  useConversationActionPreviewMock: vi.fn(),
  useConvertConversationToActionMock: vi.fn(),
  useActivityMock: vi.fn(),
  useActivityCountsMock: vi.fn(),
}));

vi.mock("../../api/queries", () => ({
  useConversationLogDetail: useConversationLogDetailMock,
  useConversationActionPreview: useConversationActionPreviewMock,
  useConvertConversationToAction: useConvertConversationToActionMock,
  useActivity: useActivityMock,
  useActivityCounts: useActivityCountsMock,
}));

const detail: ConversationLogDetail = {
  conversationId: "conversation-v20",
  placementKey: "post-detail",
  contentSlug: "post-a",
  createdAt: "2026-09-25T00:00:00.000Z",
  lastActivityAt: "2026-09-25T01:00:00.000Z",
  turns: [
    {
      id: "turn-v20",
      seq: 1,
      createdAt: "2026-09-25T00:30:00.000Z",
      messages: [
        {
          id: "visitor-v20",
          role: "visitor",
          body: "访客问题内容",
          delivery: "ack",
          createdAt: "2026-09-25T00:30:00.000Z",
          citations: null,
          aiUsedFlag: null,
          degradeReason: null,
        },
        {
          id: "assistant-v20",
          role: "assistant",
          body: "助手回答内容",
          delivery: "ack",
          createdAt: "2026-09-25T00:31:00.000Z",
          citations: ["post-a"],
          aiUsedFlag: true,
          degradeReason: null,
        },
      ],
      attempts: [
        {
          id: "attempt-zero",
          state: "generated",
          createdAt: "2026-09-25T00:30:10.000Z",
          agent: { agentId: "agent-a", agentName: "小影", revision: 7, revisionId: "revision-a", modelId: "model-a" },
          run: { id: "run-zero", state: "SUCCEEDED", kind: "chat", createdAt: "2026-09-25T00:30:10.000Z", stopReason: null, tokensIn: 0, tokensOut: 0, elapsedMs: 20, events: [] },
        },
        {
          id: "attempt-unknown",
          state: "failed",
          createdAt: "2026-09-25T00:32:10.000Z",
          agent: { agentId: "agent-a", agentName: "小影", revision: 7, revisionId: "revision-a", modelId: "model-a" },
          run: { id: "run-unknown", state: "FAILED", kind: "chat", createdAt: "2026-09-25T00:32:10.000Z", stopReason: "runtime-error", tokensIn: null, tokensOut: null, elapsedMs: null, events: [] },
        },
      ],
    },
  ],
  interactions: [
    { id: "event-attempt", at: "2026-09-25T00:30:00.000Z", featureKey: "assistant.ask", event: "attempt", failCode: null, props: null },
    { id: "event-success", at: "2026-09-25T00:31:00.000Z", featureKey: "assistant.ask", event: "success", failCode: null, props: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  useActivityMock.mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      sourceLimit: 30,
      next: null,
      events: [
        {
          key: "visitor:conversation-v20",
          ts: "2026-09-25T01:00:00.000Z",
          kind: "visitor",
          severity: "info",
          title: "访客询问退款到账时间",
          detail: "2 轮 · post-a",
          provenance: { kind: "visitor", id: "conversation-v20", ref: null },
          isTodo: false,
        },
      ],
    },
    refetch: vi.fn(),
  });
  useActivityCountsMock.mockReturnValue({
    isPending: false,
    isError: false,
    data: { remindersPending: 0, answersDegraded: 0, runsFailed: 0, releaseWorkingAhead: null },
    refetch: vi.fn(),
  });
  useConversationLogDetailMock.mockReturnValue({ isPending: false, isError: false, data: detail, refetch: vi.fn() });
  useConversationActionPreviewMock.mockReturnValue({
    data: { conversationId: "conversation-v20", contentSlug: "post-a", title: "回应访客：访客问题内容", summary: "访客问题内容", messageIds: ["visitor-v20"], turnCount: 1 },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  useConvertConversationToActionMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
});

describe("V20 conversation log UI", () => {
  it("displays detailed turns and distinguishes measured zero usage from unknown usage", () => {
    render(
      <MemoryRouter initialEntries={["/records/conversations/conversation-v20"]}>
        <Routes>
          <Route path="/records/conversations/:id" element={<ConversationLogDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("访客问题内容")).toBeTruthy();
    expect(screen.getByText("助手回答内容")).toBeTruthy();
    expect(screen.getByText("输入 0 / 输出 0")).toBeTruthy();
    expect(screen.getByText("输入 未知 / 输出 未知")).toBeTruthy();
    expect(screen.getByText("问答开始")).toBeTruthy();
    expect(screen.getByText("回答完成")).toBeTruthy();
  });

  it("首页会话显示友好范围、规则兜底和结果待核对，并读成员切换的实际属性", () => {
    useConversationLogDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      data: {
        ...detail,
        placementKey: "home-xiaoying",
        contentSlug: "site-public",
        turns: [
          {
            ...detail.turns[0]!,
            attempts: [
              { ...detail.turns[0]!.attempts[0]!, id: "fallback-attempt", state: "fallback" },
              { ...detail.turns[0]!.attempts[1]!, id: "unknown-attempt", state: "unknown" },
            ],
          },
        ],
        interactions: [
          {
            id: "member-switch",
            at: "2026-09-25T01:00:00.000Z",
            featureKey: "assistant.interaction",
            event: "member-switch",
            failCode: null,
            props: { member: { name: "小影", revision: 7 } },
          },
        ],
      } satisfies ConversationLogDetail,
    });
    render(
      <MemoryRouter initialEntries={["/records/conversations/conversation-v20"]}>
        <Routes>
          <Route path="/records/conversations/:id" element={<ConversationLogDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "访客对话 · 全站公开内容" })).toBeTruthy();
    expect(screen.getByText(/首页小影 · 开始/)).toBeTruthy();
    expect(screen.getByText(/规则兜底/)).toBeTruthy();
    expect(screen.getByText(/结果待核对/)).toBeTruthy();
    expect(screen.getByText("已切换至 小影 · v7")).toBeTruthy();
  });

  it("records 页是活动流：访客事件行出现在时间线上并链接到会话详情", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/records"]}>
          <RunListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("访客询问退款到账时间")).toBeTruthy();
    const link = screen.getByRole("link", { name: /正常/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("/records/conversations/conversation-v20");
  });
});
