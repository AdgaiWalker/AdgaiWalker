import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson, setAdminToken, onUnauthorized } from "./http";
import {
  authProvider,
  queryClient,
  clearPrivateSession,
} from "./auth-provider";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-request-id": "request-1",
    },
  });
afterEach(() => {
  clearPrivateSession();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("单一 HTTP 客户端", () => {
  it("通过代理读取 JSON，凭据只在内存", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ items: [] }));
    vi.stubGlobal("fetch", fetcher);
    setAdminToken("temporary-test");
    expect(await requestJson("/ops/agents")).toEqual({ items: [] });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/ops/agents",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-admin-token": "temporary-test" }),
      }),
    );
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it.each([409, 503])("保留 %i 与请求编号", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ code: "conflict", message: "实际错误" }, status),
        ),
    );
    await expect(requestJson("/ops/agents")).rejects.toMatchObject({
      code: "conflict",
      message: "实际错误",
      statusCode: status,
      requestId: "request-1",
    });
  });
  it("401 通知清空私有缓存且不重试", async () => {
    queryClient.setQueryData(["private"], ["秘密"]);
    const off = onUnauthorized(clearPrivateSession);
    const fetcher = vi.fn().mockResolvedValue(json({}, 401));
    vi.stubGlobal("fetch", fetcher);
    await expect(requestJson("/ops/agents")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    off();
  });
  it("HTML 代理错误与坏 JSON 都不能变成成功", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html/>", {
            status: 502,
            headers: { "content-type": "text/html" },
          }),
        ),
    );
    await expect(requestJson("/ops/agents")).rejects.toMatchObject({
      code: "invalid-response",
      statusCode: 502,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("{", {
            headers: { "content-type": "application/json" },
          }),
        ),
    );
    await expect(requestJson("/ops/agents")).rejects.toMatchObject({
      code: "invalid-response",
    });
  });
  it("区分断网、取消与超时", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(requestJson("/ops/agents")).rejects.toMatchObject({
      code: "network-unavailable",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, { signal }: RequestInit) =>
          new Promise((_resolve, reject) => {
            if (signal?.aborted) reject(new DOMException("", "AbortError"));
            signal?.addEventListener("abort", () =>
              reject(new DOMException("", "AbortError")),
            );
          }),
      ),
    );
    const abort = new AbortController();
    const pending = requestJson("/ops/agents", { signal: abort.signal });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      requestJson("/ops/agents", { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "request-timeout" });
  });
  it("切换凭据后丢弃旧响应，迟到401不能锁住新会话", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const listener = vi.fn(),
      off = onUnauthorized(listener);
    const old = requestJson("/ops/agents");
    setAdminToken("new-session");
    resolve(json({}, 401));
    await expect(old).rejects.toMatchObject({ name: "AbortError" });
    expect(listener).not.toHaveBeenCalled();
    off();
  });
  it("登录失败与退出都会清空缓存", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    queryClient.setQueryData(["private"], 1);
    expect(await authProvider.login({ token: "wrong" })).toMatchObject({
      success: false,
    });
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
    queryClient.setQueryData(["private"], 1);
    await authProvider.logout({});
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
  });
});
