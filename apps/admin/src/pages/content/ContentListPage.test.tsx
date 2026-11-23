import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentLedgerEntry } from "@walker/shared";
import { ContentListPage } from "./ContentListPage";

const {
  useContentMock,
  useContentSyncStatusMock,
  useContentSyncPullMock,
  useContentDraftBackupMock,
  useSaveContentMock,
  navigateMock,
} = vi.hoisted(() => ({
  useContentMock: vi.fn(),
  useContentSyncStatusMock: vi.fn(),
  useContentSyncPullMock: vi.fn(),
  useContentDraftBackupMock: vi.fn(),
  useSaveContentMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../../api/queries", () => ({
  useContent: useContentMock,
  useContentSyncStatus: useContentSyncStatusMock,
  useContentSyncPull: useContentSyncPullMock,
  useContentDraftBackup: useContentDraftBackupMock,
  useSaveContent: useSaveContentMock,
}));

const ITEMS: Array<ContentLedgerEntry & { id: string }> = [
  {
    id: "post-draft",
    slug: "post-draft",
    title: "草稿文章一",
    type: "knowledge",
    group: "article",
    stage: "live", // 旧 stage=live 但未线上确证，不得显示为已上线
    visibility: "public",
    missing: [],
    dirty: true,
    publication: {
      currentPublicHash: "hash-new",
      publishedHash: null,
      verifiedAt: null,
      indexedHash: null,
      latestAttemptStage: null,
    },
    updatedAt: "2026-11-23T10:00:00.000Z",
  },
  {
    id: "post-live",
    slug: "post-live",
    title: "已确证文章",
    type: "project",
    group: "product",
    stage: "live",
    visibility: "public",
    missing: [],
    dirty: false,
    publication: {
      currentPublicHash: "hash-v1",
      publishedHash: "hash-v1",
      verifiedAt: "2026-11-23T09:00:00.000Z",
      indexedHash: "hash-v1",
      latestAttemptStage: "PUBLISHED",
    },
    updatedAt: "2026-11-23T09:00:00.000Z",
  },
  {
    id: "post-indexed",
    slug: "post-indexed",
    title: "Git 老文章已公开",
    type: "knowledge",
    group: "article",
    stage: "live",
    visibility: "public",
    missing: [],
    dirty: false,
    publication: {
      currentPublicHash: "hash-idx",
      publishedHash: null,
      verifiedAt: null,
      indexedHash: "hash-idx",
      latestAttemptStage: null,
    },
    updatedAt: "2026-11-23T08:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  useContentMock.mockReturnValue({
    isPending: false,
    isError: false,
    data: { data: ITEMS, total: ITEMS.length, generatedAt: "2026-11-23T10:00:00.000Z", gitAvailable: true, publicationAvailable: true },
    refetch: vi.fn(),
  });
  useContentSyncStatusMock.mockReturnValue({
    data: { available: true, behind: 0, ahead: 0, dirtyFiles: [], incomingFiles: [], conflicts: [], fetchError: null },
    refetch: vi.fn(),
  });
  useContentSyncPullMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn(async () => ({ ok: true, message: "已同步" })) });
  useContentDraftBackupMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn(async () => ({ ok: true, message: "已备份到 drafts" })) });
  useSaveContentMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn(async () => ({ slug: "new-post", raw: "", hash: "h1" })) });
});

describe("ContentListPage（极简默认首页）", () => {
  it("严格区分已上线（发布单确证）/ 已公开（公开索引命中）/ 草稿，不反向把老文章全标草稿", () => {
    render(
      <MemoryRouter initialEntries={["/content"]}>
        <ContentListPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("草稿文章一")).toBeTruthy();
    expect(screen.getByText("已确证文章")).toBeTruthy();
    expect(screen.getByText("Git 老文章已公开")).toBeTruthy();
    expect(screen.getAllByText("草稿").length).toBe(1);
    expect(screen.getAllByText("已公开").length).toBe(1);
    expect(screen.getAllByText("已上线").length).toBe(2); // 1 筛选芯片 + 1 行徽章
  });

  it("支持搜索与 3 态筛选（全部 / 未上线 / 已上线）", () => {
    render(
      <MemoryRouter initialEntries={["/content"]}>
        <ContentListPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "已上线" }));
    expect(screen.queryByText("草稿文章一")).toBeNull();
    expect(screen.getByText("已确证文章")).toBeTruthy();
    expect(screen.getByText("Git 老文章已公开")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    fireEvent.change(screen.getByLabelText("搜索文章"), { target: { value: "post-draft" } });
    expect(screen.getByText("草稿文章一")).toBeTruthy();
    expect(screen.queryByText("已确证文章")).toBeNull();
  });

  it("无草稿且无落后时不显示多余同步条；有草稿或落后时按需显现操作", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/备份草稿/)).toBeNull();
    expect(screen.queryByText(/拉取最新/)).toBeNull();

    const backupMutate = vi.fn(async () => ({ ok: true, message: "已将 1 篇草稿备份到 drafts" }));
    useContentDraftBackupMock.mockReturnValue({ isPending: false, mutateAsync: backupMutate });
    useContentSyncStatusMock.mockReturnValue({
      data: { available: true, behind: 2, ahead: 0, dirtyFiles: ["content/log/post-draft.md"], incomingFiles: [], conflicts: [], fetchError: null },
      refetch: vi.fn(),
    });
    rerender(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("GitHub 有 2 个新提交待拉取")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /备份草稿 \(1\)/ }));
    await waitFor(() => expect(backupMutate).toHaveBeenCalledTimes(1));
  });

  it("点击唯一主按钮「新建文章」后自动生成 slug 并创建跳转至编辑画布", async () => {
    const saveMutate = vi.fn(async () => ({ slug: "hello-world", raw: "", hash: "h1" }));
    useSaveContentMock.mockReturnValue({ isPending: false, mutateAsync: saveMutate });
    render(
      <MemoryRouter>
        <ContentListPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "新建文章" }));
    fireEvent.change(screen.getByPlaceholderText("输入文章标题"), { target: { value: "Hello World" } });
    fireEvent.click(screen.getByRole("button", { name: "开始写作" }));

    await waitFor(() =>
      expect(saveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "hello-world",
          expectedHash: null,
          raw: expect.stringMatching(/date: \d{4}-\d{2}-\d{2}[\s\S]*summary: "Hello World · hello-world"[\s\S]*level: AI-2/),
        }),
      ),
    );
    expect(navigateMock).toHaveBeenCalledWith("/content/hello-world");
  });
});
