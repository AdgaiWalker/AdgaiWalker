import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./AdminShell";
import { AppErrorBoundary } from "../components/AppErrorBoundary";

const { useCapabilitiesMock, useDeployedAdminVersionMock, useActivityCountsMock, useContentMock } = vi.hoisted(() => ({
  useCapabilitiesMock: vi.fn(),
  useDeployedAdminVersionMock: vi.fn(),
  useActivityCountsMock: vi.fn(),
  useContentMock: vi.fn(),
}));

vi.mock("../api/queries", () => ({
  useCapabilities: useCapabilitiesMock,
  useDeployedAdminVersion: useDeployedAdminVersionMock,
  useActivityCounts: useActivityCountsMock,
  useContent: useContentMock,
  useContentSyncStatus: () => ({ data: { available: true, behind: 0, ahead: 0, dirtyFiles: [], incomingFiles: [] }, refetch: vi.fn() }),
  useContentSyncPull: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useContentSyncForceCheck: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useContentDraftBackup: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useCapabilitiesMock.mockReturnValue({ isPending: false, isError: false, data: { items: [] } });
  useDeployedAdminVersionMock.mockReturnValue({ data: "same-sha" });
  useActivityCountsMock.mockReturnValue({ data: { remindersPending: 0, runsFailed: 0, answersDegraded: 0, releaseWorkingAhead: 3 } });
  useContentMock.mockReturnValue({ data: { data: [{ id: "hello", slug: "hello", title: "测试标题" }] } });
});

function CrashComponent(): never {
  throw new Error("simulated-render-crash");
}

describe("AdminShell 与兜底三件套（混沌验证）", () => {
  it("去除假页脚与多余主导航，仅保留文章/访客主位 + 系统收纳 + ⌘K 快速跳转", () => {
    render(
      <MemoryRouter initialEntries={["/content"]}>
        <Routes>
          <Route element={<AdminShell />}>
            <Route path="/content" element={<div>CONTENT_OK</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("CONTENT_OK")).toBeTruthy();
    expect(screen.queryByText(/上线状态尚未核验/)).toBeNull();
    expect(screen.queryByText("概览")).toBeNull();
    expect(screen.queryByText("Agent")).toBeNull();
    // 文章未发布计数 releaseWorkingAhead=3 不应污染「访客」红点
    expect(screen.queryByLabelText(/项需关注/)).toBeNull();

    // ⌘K 呼出快速跳转并搜到文章
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByText("快速跳转")).toBeTruthy();
    expect(screen.getByText("测试标题")).toBeTruthy();
  });

  it("静态 /version.json 漂移时，顶栏按需浮现「有新版本 · 刷新」胶囊；一致时不显示", () => {
    useDeployedAdminVersionMock.mockReturnValue({ data: "new5678" });
    const { rerender } = render(
      <MemoryRouter initialEntries={["/content"]}>
        <Routes>
          <Route element={<AdminShell buildVersion="old1234" />}>
            <Route path="/content" element={<div>OK</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /有新版本 · 刷新/ })).toBeTruthy();

    rerender(
      <MemoryRouter initialEntries={["/content"]}>
        <Routes>
          <Route element={<AdminShell buildVersion="new5678" />}>
            <Route path="/content" element={<div>OK</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /有新版本 · 刷新/ })).toBeNull();
  });

  it("混沌测试：子路由渲染崩溃时 AppErrorBoundary 兜底不白屏，并提供重试/返回/运行日志出口", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <AppErrorBoundary scope="test">
        <CrashComponent />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("页面出现异常，已安全兜底")).toBeTruthy();
    expect(screen.getByText("simulated-render-crash")).toBeTruthy();
    expect(screen.getByRole("button", { name: /重试/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /返回文章/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /查看运行日志/ })).toBeTruthy();
    spy.mockRestore();
  });
});
