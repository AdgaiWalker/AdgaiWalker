import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentSyncStatus } from "@walker/shared";
import { GitSyncBadge } from "./GitSyncBadge";

const {
  useContentSyncStatusMock,
  useContentSyncPullMock,
  useContentSyncForceCheckMock,
  useContentDraftBackupMock,
} = vi.hoisted(() => ({
  useContentSyncStatusMock: vi.fn(),
  useContentSyncPullMock: vi.fn(),
  useContentSyncForceCheckMock: vi.fn(),
  useContentDraftBackupMock: vi.fn(),
}));

vi.mock("../api/queries", () => ({
  useContentSyncStatus: useContentSyncStatusMock,
  useContentSyncPull: useContentSyncPullMock,
  useContentSyncForceCheck: useContentSyncForceCheckMock,
  useContentDraftBackup: useContentDraftBackupMock,
}));

function mockStatus(patch: Partial<ContentSyncStatus> = {}): ContentSyncStatus {
  return {
    available: true,
    behind: 0,
    ahead: 0,
    headCommit: "abc1234",
    remoteCommit: "abc1234",
    dirtyFiles: [],
    incomingFiles: [],
    lastCheckedAt: "2026-11-23T06:00:00Z",
    ...patch,
  };
}

describe("GitSyncBadge（诚实状态展示，禁止假绿灯）", () => {
  const pullMutate = vi.fn();
  const forceMutate = vi.fn();
  const backupMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useContentSyncPullMock.mockReturnValue({ isPending: false, mutateAsync: pullMutate });
    useContentSyncForceCheckMock.mockReturnValue({ isPending: false, mutateAsync: forceMutate });
    useContentDraftBackupMock.mockReturnValue({ isPending: false, mutateAsync: backupMutate });
  });

  it("fetchError 存在时绝不显示「GitHub 已同步」，诚实显示「远端探测失败」", () => {
    useContentSyncStatusMock.mockReturnValue({
      data: mockStatus({ fetchError: "ssh timeout" }),
      refetch: vi.fn(),
    });

    render(<GitSyncBadge compact />);
    expect(screen.getByText("远端探测失败")).toBeDefined();
    expect(screen.queryByText(/GitHub 已同步/)).toBeNull();
  });

  it("同篇冲突或状态未知时诚实暴露，绝不显示假绿灯", () => {
    useContentSyncStatusMock.mockReturnValue({
      data: mockStatus({ dirtyFiles: ["a.md"], conflicts: ["a.md"] }),
      refetch: vi.fn(),
    });

    render(<GitSyncBadge compact />);
    expect(screen.getByText(/存在 1 篇同篇冲突/)).toBeDefined();
    expect(screen.queryByText(/GitHub 已同步/)).toBeNull();
  });

  it("存在草稿时（非紧凑态）提供备份草稿到 drafts 分支按钮", async () => {
    backupMutate.mockResolvedValueOnce({
      ok: true,
      branch: "drafts",
      commit: "1234567890abcdef",
      backedUpFiles: ["content/log/draft-1.md"],
      message: "已将 1 篇草稿备份到 GitHub drafts 分支",
    });
    useContentSyncStatusMock.mockReturnValue({
      data: mockStatus({ dirtyFiles: ["draft-1.md"] }),
      refetch: vi.fn(),
    });

    render(<GitSyncBadge />);
    const btn = screen.getByRole("button", { name: /备份草稿/ });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(backupMutate).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/已将 1 篇草稿备份到 GitHub drafts 分支/)).toBeDefined();
  });

  it("compact 顶栏模式下点击同步失败时显示报错短文案与完整提示，不静默吞错", async () => {
    pullMutate.mockRejectedValueOnce(new Error("SSH connection reset by peer"));
    useContentSyncStatusMock.mockReturnValue({
      data: mockStatus({ behind: 2 }),
      refetch: vi.fn(),
    });

    render(<GitSyncBadge compact />);
    fireEvent.click(screen.getByRole("button", { name: /从 GitHub 同步/ }));

    const failedBtn = await screen.findByRole("button", { name: "同步失败" });
    expect(failedBtn.getAttribute("title")).toContain("SSH connection reset by peer");
  });
});
