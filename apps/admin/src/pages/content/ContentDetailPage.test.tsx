import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/http";
import { clearAdminUiEvents, getAdminUiEvents } from "../../api/telemetry";
import { ContentDetailPage } from "./ContentDetailPage";

const {
  useContentDetailMock,
  useSaveContentMock,
  useDeleteContentMock,
  usePrepareContentReleaseMock,
  useTriggerContentReleaseMock,
  useVerifyContentReleaseMock,
  useReconcileContentReleaseMock,
  useCancelContentReleaseMock,
  useRecordSocialShareMock,
  useLatestContentReleaseMock,
  useContentVersionMock,
  useContentChangesMock,
  useContentVersionHistoryMock,
  fetchContentDetailMock,
  exportAdminContentMock,
  downloadTextFileMock,
} = vi.hoisted(() => ({
  useContentDetailMock: vi.fn(),
  useSaveContentMock: vi.fn(),
  useDeleteContentMock: vi.fn(),
  usePrepareContentReleaseMock: vi.fn(),
  useTriggerContentReleaseMock: vi.fn(),
  useVerifyContentReleaseMock: vi.fn(),
  useReconcileContentReleaseMock: vi.fn(),
  useCancelContentReleaseMock: vi.fn(),
  useRecordSocialShareMock: vi.fn(),
  useLatestContentReleaseMock: vi.fn(),
  useContentVersionMock: vi.fn(),
  useContentChangesMock: vi.fn(),
  useContentVersionHistoryMock: vi.fn(),
  fetchContentDetailMock: vi.fn(),
  exportAdminContentMock: vi.fn(),
  downloadTextFileMock: vi.fn(),
}));

vi.mock("../../api/queries", () => ({
  useContentDetail: useContentDetailMock,
  useSaveContent: useSaveContentMock,
  useDeleteContent: useDeleteContentMock,
  usePrepareContentRelease: usePrepareContentReleaseMock,
  useTriggerContentRelease: useTriggerContentReleaseMock,
  useVerifyContentRelease: useVerifyContentReleaseMock,
  useReconcileContentRelease: useReconcileContentReleaseMock,
  useCancelContentRelease: useCancelContentReleaseMock,
  useRecordSocialShare: useRecordSocialShareMock,
  useLatestContentRelease: useLatestContentReleaseMock,
  useContentVersion: useContentVersionMock,
  useContentChanges: useContentChangesMock,
  useContentVersionHistory: useContentVersionHistoryMock,
  useApproveContentChange: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useApplyContentChange: () => ({ isPending: false, mutateAsync: vi.fn() }),
  fetchContentDetail: fetchContentDetailMock,
  exportAdminContent: exportAdminContentMock,
  downloadTextFile: downloadTextFileMock,
  fetchContentVersionDetail: vi.fn(),
  fetchContentVersionDiff: vi.fn(),
}));

const BASE_RAW = "---\ntitle: 测试文章\nsummary: 简短摘要\nvisibility: draft\n---\n\n# 初始正文\n";

function renderDetail(slug = "demo-post") {
  const router = createMemoryRouter(
    [
      { path: "/content/:slug", element: <ContentDetailPage /> },
      { path: "/content", element: <div>LIST_PAGE</div> },
    ],
    { initialEntries: [`/content/${slug}`] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAdminUiEvents();
  useContentDetailMock.mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      data: {
        id: "demo-post",
        slug: "demo-post",
        title: "测试文章",
        type: "knowledge",
        raw: BASE_RAW,
        hash: "hash-1",
        updatedAt: "2026-11-23T10:00:00.000Z",
      },
    },
    refetch: vi.fn(),
  });
  useSaveContentMock.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(async ({ raw }: { raw: string }) => ({ slug: "demo-post", raw, hash: "hash-2" })),
  });
  useDeleteContentMock.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(async () => ({ ok: true, slug: "demo-post", scope: "local-draft", message: "已删除本地草稿" })),
  });
  exportAdminContentMock.mockResolvedValue({ slug: "demo-post", ext: ".md", sha256: "hash-1", raw: BASE_RAW, updatedAt: "2026-11-23T10:00:00.000Z" });
  usePrepareContentReleaseMock.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(async () => ({ id: "rel-1", stage: "PREPARED" })),
  });
  useTriggerContentReleaseMock.mockReturnValue({
    isPending: false,
    mutateAsync: vi.fn(async () => ({ ok: true })),
  });
  useVerifyContentReleaseMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  useReconcileContentReleaseMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  useCancelContentReleaseMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn() });
  useRecordSocialShareMock.mockReturnValue({ isPending: false, mutateAsync: vi.fn(async () => ({ ok: true })) });
  useLatestContentReleaseMock.mockReturnValue({ data: null, refetch: vi.fn() });
  useContentVersionMock.mockReturnValue({
    data: { workingHash: "hash-1", publishedHash: null, indexedHash: null },
    refetch: vi.fn(),
  });
  useContentChangesMock.mockReturnValue({ isPending: false, isError: false, data: { items: [] }, refetch: vi.fn() });
  useContentVersionHistoryMock.mockReturnValue({ isPending: false, isError: false, data: { slug: "demo-post", versions: [] }, refetch: vi.fn() });
});

describe("ContentDetailPage（纯净单画布 + 一键自动编排发布 + 按需抽屉）", () => {
  it("无 9-Tab 干扰、无原始 YAML 墙：只露出标题框与纯正文画布，支持预览与保存", async () => {
    renderDetail();
    const titleInput = screen.getByLabelText("文章标题") as HTMLInputElement;
    const editor = screen.getByLabelText("文章正文") as HTMLTextAreaElement;
    expect(titleInput.value).toBe("测试文章");
    expect(editor.value).toBe("# 初始正文\n");
    expect(editor.value).not.toContain("visibility:");
    expect(screen.queryByText("发布清单")).toBeNull();

    // 切换预览
    fireEvent.click(screen.getByRole("tab", { name: "预览" }));
    expect(screen.getByRole("heading", { name: "初始正文" })).toBeTruthy();

    // 切回编辑并修改标题与正文 → 露出主按钮「保存」
    fireEvent.click(screen.getByRole("tab", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("文章标题"), { target: { value: "改后标题" } });
    fireEvent.change(screen.getByLabelText("文章正文"), { target: { value: "# 初始正文\n\n新段落" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByText("已保存")).toBeTruthy());
  });

  it("KLM ≤ 3 步一键发布：草稿自动转正 visibility: public，再串行 save → prepare → release", async () => {
    const order: string[] = [];
    let savedPayload = "";
    useSaveContentMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async ({ raw }: { raw: string }) => {
        order.push("save");
        savedPayload = raw;
        return { slug: "demo-post", raw, hash: "hash-2" };
      }),
    });
    usePrepareContentReleaseMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async (input: { versionNote: string }) => {
        order.push(`prepare:${input.versionNote}`);
        return { id: "rel-99", stage: "PREPARED" };
      }),
    });
    useTriggerContentReleaseMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async (input: { releaseId: string }) => {
        order.push(`release:${input.releaseId}`);
        return { ok: true };
      }),
    });

    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    expect(screen.getByText(/当前为草稿，发布上线时将自动转为公开可见/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/补充一线案例/), { target: { value: "补充一线案例" } });
    fireEvent.click(screen.getByRole("button", { name: "发布上线" }));

    await waitFor(() =>
      expect(order).toEqual(["save", "prepare:补充一线案例", "release:rel-99"]),
    );
    expect(savedPayload).toContain("visibility: public");
    expect(getAdminUiEvents().map((e) => e.event)).toContain("publish.flow_completed");
  });

  it("保存撞 CAS 409 时按需弹出双栏冲突解决，支持采用远端版本", async () => {
    useSaveContentMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockRejectedValue(new ApiError("conflict", "外部已修改", 409)),
    });
    fetchContentDetailMock.mockResolvedValue({
      slug: "demo-post",
      raw: "---\ntitle: 测试文章\n---\n\n# 远端新版\n",
      hash: "hash-remote",
    });

    renderDetail();
    fireEvent.change(screen.getByLabelText("文章正文"), { target: { value: "# 初始正文\n本地改动" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("检测到外部更新冲突")).toBeTruthy();
    expect(screen.getByText(/远端新版/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "采用远端版本" }));
    expect((screen.getByLabelText("文章正文") as HTMLTextAreaElement).value).toContain("远端新版");
  });

  it("未保存修改点击离开时弹出离页拦截对话框", async () => {
    renderDetail();
    fireEvent.change(screen.getByLabelText("文章正文"), { target: { value: "# 初始正文\n未保存" } });
    fireEvent.click(screen.getByRole("link", { name: "返回文章列表" }));
    expect(await screen.findByText("有未保存的改动")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "留下继续编辑" }));
    expect(screen.queryByText("LIST_PAGE")).toBeNull();
  });

  it("点击「更多操作」按需展开右侧抽屉并支持元信息/历史/宣发切换", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(await screen.findByText("文章选项")).toBeTruthy();
    expect(screen.getByLabelText("公开摘要")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "历史" }));
    expect(screen.getByText(/还没有公开发布过版本/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "宣发" }));
    expect(screen.getByRole("button", { name: "复制全文案" })).toBeTruthy();
  });

  it("超时旧 VERIFYING 绝不锁死发布按钮，且已发布文章修改中绝不谎称已在线上确证", () => {
    useLatestContentReleaseMock.mockReturnValue({
      data: { id: "rel-old", stage: "VERIFYING", updatedAt: "2026-11-20T00:00:00.000Z" },
      refetch: vi.fn(),
    });
    const { unmount } = renderDetail();
    const republishBtn = screen.getByRole("button", { name: "重新发布" }) as HTMLButtonElement;
    expect(republishBtn.disabled).toBe(false);
    expect(screen.getByText(/上次发布超时未确证/)).toBeTruthy();
    unmount();

    useLatestContentReleaseMock.mockReturnValue({
      data: { id: "rel-ok", stage: "PUBLISHED", updatedAt: new Date().toISOString() },
      refetch: vi.fn(),
    });
    renderDetail();
    // 平时已发布文章 0 像素状态条；编辑成脏态时更绝不显示「已在线上确证」
    expect(screen.queryByText("已在线上确证")).toBeNull();
    fireEvent.change(screen.getByLabelText("文章正文"), { target: { value: "未保存修改" } });
    expect(screen.queryByText("已在线上确证")).toBeNull();
  });

  it("点击「立即核对」未确证时明确回报原因（不静默空点），私密文章发布前必须先点「转为公开」", async () => {
    const verifyMutate = vi.fn(async () => ({ verified: false, reason: "online-hash-not-confirmed" }));
    useVerifyContentReleaseMock.mockReturnValue({ isPending: false, mutateAsync: verifyMutate });
    useLatestContentReleaseMock.mockReturnValue({
      data: { id: "rel-old", stage: "VERIFYING", updatedAt: "2026-11-20T00:00:00.000Z" },
      refetch: vi.fn(),
    });
    const { unmount } = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "立即核对" }));
    expect(await screen.findByText(/online-hash-not-confirmed/)).toBeTruthy();
    unmount();

    useLatestContentReleaseMock.mockReturnValue({ data: null, refetch: vi.fn() });
    useContentDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        data: {
          id: "priv-post",
          slug: "priv-post",
          title: "私密文章",
          type: "knowledge",
          raw: "---\ntitle: 私密文章\nsummary: 私密摘要\nvisibility: private\n---\n\n私密正文\n",
          hash: "hash-p",
          updatedAt: "2026-11-23T10:00:00.000Z",
        },
      },
      refetch: vi.fn(),
    });
    renderDetail("priv-post");
    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    fireEvent.change(screen.getByPlaceholderText(/补充一线案例/), { target: { value: "尝试发布" } });
    const submitBtn = screen.getByRole("button", { name: "发布上线" }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "转为公开" }));
    expect(submitBtn.disabled).toBe(false);
  });

  it("按 currentPublicHash 同源比对显示「重新发布」次按钮，二次发布绑定新 ID 不瞬闪旧确证，并显式提示孤儿 PREPARED", async () => {
    useContentVersionMock.mockReturnValue({
      data: { workingHash: "hash-file-raw", currentPublicHash: "hash-pub-1", publishedHash: null, indexedHash: "hash-pub-1" },
      refetch: vi.fn(),
    });
    const { unmount } = renderDetail();
    const republishBtn = screen.getByRole("button", { name: "重新发布" });
    expect(republishBtn.className).toBe("btn");
    unmount();

    // 二次发布绑定 publishedReleaseId：旧 PUBLISHED 记录在 refetch 切换前绝不误触发「已在线上确证」
    useContentDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        data: {
          id: "demo-post", slug: "demo-post", title: "测试文章", type: "knowledge",
          raw: "---\ntitle: 测试文章\nsummary: 简短摘要\nvisibility: public\n---\n\n# 已公开正文\n",
          hash: "hash-1", updatedAt: "2026-11-23T10:00:00.000Z",
        },
      },
      refetch: vi.fn(),
    });
    useLatestContentReleaseMock.mockReturnValue({
      data: { id: "rel-old", stage: "PUBLISHED", updatedAt: "2026-11-23T09:00:00.000Z" },
      refetch: vi.fn(),
    });
    usePrepareContentReleaseMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async () => ({ id: "rel-new", stage: "PREPARED" })),
    });
    const r2 = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "重新发布" }));
    fireEvent.change(screen.getByPlaceholderText(/补充一线案例/), { target: { value: "二次修订" } });
    fireEvent.click(screen.getByRole("button", { name: "发布上线" }));
    await waitFor(() => expect(screen.getByText(/正在自动等待线上确证/)).toBeTruthy());
    expect(screen.queryByText("已在线上确证")).toBeNull();
    expect(screen.queryByRole("link", { name: /打开文章/ })).toBeNull();
    r2.unmount();

    // 孤儿 PREPARED 发布单可见并支持取消，绝不误报已上线
    useLatestContentReleaseMock.mockReturnValue({
      data: { id: "rel-prep", stage: "PREPARED", updatedAt: "2026-11-23T09:30:00.000Z" },
      refetch: vi.fn(),
    });
    renderDetail();
    expect(screen.getByText(/存在未推送的待发布单/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消发布单" })).toBeTruthy();
    expect(screen.queryByText("已在线上确证")).toBeNull();
  });

  it("已上线文章在存在未上线本地改动（含已保存未发布）时露出「放弃本地修改（恢复线上版）」，且元信息抽屉支持导出 Markdown", async () => {
    const deleteMutate = vi.fn(async () => ({
      ok: true,
      slug: "demo-post",
      scope: "discard-draft",
      message: "已放弃未上线修改，恢复为线上版本",
    }));
    useDeleteContentMock.mockReturnValue({ isPending: false, mutateAsync: deleteMutate });
    useContentVersionMock.mockReturnValue({
      data: { workingHash: "local-saved", currentPublicHash: "pub-new", publishedHash: "pub-old", indexedHash: "pub-old" },
      refetch: vi.fn(),
    });
    fetchContentDetailMock.mockResolvedValue({
      id: "demo-post",
      slug: "demo-post",
      title: "测试文章",
      type: "knowledge",
      raw: "---\ntitle: 测试文章\nsummary: 简短摘要\nvisibility: public\n---\n\n# 线上原版\n",
      hash: "hash-restored",
      updatedAt: "2026-11-24T00:00:00.000Z",
    });

    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("button", { name: /导出 Markdown/ }));
    await waitFor(() => expect(exportAdminContentMock).toHaveBeenCalledWith("demo-post"));
    expect(downloadTextFileMock).toHaveBeenCalledWith("demo-post.md", BASE_RAW, "text/markdown;charset=utf-8");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByText(/删除将同时移除 GitHub/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /放弃本地修改（恢复线上版）/ }));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith({ slug: "demo-post", mode: "discard-draft" }));
    await waitFor(() => expect((screen.getByLabelText("文章正文") as HTMLTextAreaElement).value).toContain("线上原版"));
  });
});
