import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentChangeView, OpsContentDetail } from "@walker/shared";
import { clearAdminUiEvents, getAdminUiEvents } from "../../api/telemetry";
import { ContentChangeReviewPanel } from "./ContentChangeReviewPanel";

const { useContentChangesMock, useApproveMock, useApplyMock } = vi.hoisted(() => ({
  useContentChangesMock: vi.fn(),
  useApproveMock: vi.fn(),
  useApplyMock: vi.fn(),
}));

vi.mock("../../api/queries", () => ({
  useContentChanges: useContentChangesMock,
  useApproveContentChange: useApproveMock,
  useApplyContentChange: useApplyMock,
}));

const DOC: OpsContentDetail = {
  slug: "demo-post",
  title: "测试文章",
  type: "knowledge",
  raw: "---\ntitle: 测试文章\n---\n\n旧正文\n",
  hash: "hash-base",
  updatedAt: "2026-11-23T09:00:00.000Z",
} as OpsContentDetail;

const CHANGE: ContentChangeView = {
  id: "chg-1",
  target: { kind: "content-file", slug: "demo-post", path: "content/log/demo-post.md" },
  baseHash: "hash-base",
  candidateHash: "hash-cand",
  candidateRef: "ref-1",
  candidateRaw: "---\ntitle: 测试文章\n---\n\n新正文\n",
  state: "PROPOSED",
  sourceRunId: "run-1",
  applyApproval: null,
  createdAt: "2026-11-23T09:10:00.000Z",
  updatedAt: "2026-11-23T09:10:00.000Z",
} as unknown as ContentChangeView;

beforeEach(() => {
  vi.clearAllMocks();
  clearAdminUiEvents();
  useContentChangesMock.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    data: { items: [CHANGE] },
    refetch: vi.fn(),
  });
  useApproveMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn(async () => CHANGE) });
  useApplyMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn(async () => CHANGE) });
});

describe("ContentChangeReviewPanel（轻量按需候选与 AI 无声降级）", () => {
  it("混沌测试：AI 候选接口超时/502 时无声降级并记埋点，不阻断手动编辑", async () => {
    useContentChangesMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("502 Bad Gateway"),
      data: undefined,
      refetch: vi.fn(),
    });
    render(<ContentChangeReviewPanel slug="demo-post" currentDoc={DOC} />);
    expect(screen.getByText(/AI 建议暂不可用，可继续直接手动编辑与发布/)).toBeTruthy();
    await waitFor(() =>
      expect(getAdminUiEvents().some((e) => e.event === "ai.silent_degraded")).toBe(true),
    );
  });

  it("支持差异与 Markdown 预览切换及批准流程", async () => {
    const approveMutate = vi.fn(async () => CHANGE);
    useApproveMock.mockReturnValue({ isPending: false, mutateAsync: approveMutate });
    render(<ContentChangeReviewPanel slug="demo-post" currentDoc={DOC} />);

    expect(screen.getByText(/\+ 新正文/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /预览/ }));
    expect(screen.getByText("新正文")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/L2 授权编号/), { target: { value: "grant-123" } });
    fireEvent.click(screen.getByRole("button", { name: /批准/ }));
    await waitFor(() => expect(approveMutate).toHaveBeenCalledWith({ id: "chg-1", grantId: "grant-123" }));
  });

  it("基线 hash 冲突时禁止批准并提示已过期", () => {
    render(<ContentChangeReviewPanel slug="demo-post" currentDoc={{ ...DOC, hash: "hash-other" }} />);
    expect(screen.getByText(/候选已过期/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /批准/ })).toBeNull();
  });
});
