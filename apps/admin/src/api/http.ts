export class ApiError extends Error {
  constructor(public code: string, message: string, public statusCode = 0, public requestId?: string) {
    super(message);
    this.name = "ApiError";
  }
}

let token: string | undefined;
let username: string | undefined;
let sessionVersion = 0;
const requests = new Set<AbortController>();
const authListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void) {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}
export function getAdminUsername(): string { return username ?? "Dora"; }
export function setAdminToken(value?: string, user?: string) {
  token = value?.trim() || undefined;
  username = user?.trim() || undefined;
  sessionVersion++;
  for (const r of requests) r.abort();
  requests.clear();
}

/** 分层等待预算（ms）：longTask 必须 ≥ 后端 BACKGROUND_DEADLINE_MS (120s)。 */
export const REQUEST_TIMEOUTS = { read: 10_000, write: 30_000, longTask: 180_000 } as const;

function assertValidPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new ApiError("invalid-path", "接口地址不正确");
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, ...(token ? { "x-admin-token": token } : {}), ...(username ? { "x-admin-username": username } : {}) };
}

async function runWithAbort<T>(
  path: string,
  timeoutMs: number,
  timeoutMessage: string,
  signal: AbortSignal | undefined,
  exec: (controller: AbortController, version: number) => Promise<T>,
): Promise<T> {
  assertValidPath(path);
  const controller = new AbortController(), version = sessionVersion;
  requests.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    return await exec(controller, version);
  } catch (error) {
    if (timedOut) throw new ApiError("request-timeout", timeoutMessage);
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
    throw new ApiError("network-unavailable", "无法连接本站服务，请检查网络与 API");
  } finally {
    clearTimeout(timer);
    requests.delete(controller);
    signal?.removeEventListener("abort", abort);
  }
}

export function requestJson<T>(
  path: string,
  options: { signal?: AbortSignal; timeoutMs?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; backgroundPoll?: boolean } = {},
): Promise<T> {
  return runWithAbort(
    path,
    options.timeoutMs ?? REQUEST_TIMEOUTS.read,
    "等待超时：服务可能仍在后台执行，请稍后刷新查看结果，不要重复提交",
    options.signal,
    async (controller, version) => {
      const res = await fetch(`/api${path}`, {
        method: options.method ?? "GET",
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        credentials: "same-origin",
        headers: authHeaders({
          Accept: "application/json",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(options.backgroundPoll ? { "x-admin-background-poll": "1" } : {}),
        }),
        signal: controller.signal,
      });
      const requestId = res.headers.get("x-request-id") ?? undefined;
      if (version !== sessionVersion || controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
      if (res.status === 401) {
        authListeners.forEach((fn) => fn());
        throw new ApiError("admin-auth-required", "请验证管理权限后继续", 401, requestId);
      }
      if (!res.headers.get("content-type")?.includes("application/json"))
        throw new ApiError("invalid-response", "服务未返回数据，请检查 API 连接", res.status, requestId);
      let data: unknown;
      try { data = await res.json(); } catch { throw new ApiError("invalid-response", "服务返回的数据无法解析", res.status, requestId); }
      if (!res.ok) {
        const body = data as { code?: string; message?: string } | null;
        throw new ApiError(body?.code ?? "request-failed", body?.message ?? "请求失败，请稍后重试", res.status, requestId);
      }
      if (version !== sessionVersion || controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
      return data as T;
    },
  );
}

export function requestBlob(path: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Blob> {
  return runWithAbort(
    path,
    options.timeoutMs ?? REQUEST_TIMEOUTS.longTask,
    "下载等待超时；文件可能仍可用，请刷新导出状态后再试",
    options.signal,
    async (controller, version) => {
      const res = await fetch(`/api${path}`, {
        credentials: "same-origin",
        headers: authHeaders({ Accept: "text/csv, application/json" }),
        signal: controller.signal,
      });
      const requestId = res.headers.get("x-request-id") ?? undefined;
      if (version !== sessionVersion || controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
      if (res.status === 401) {
        authListeners.forEach((fn) => fn());
        throw new ApiError("admin-auth-required", "请验证管理权限后继续", 401, requestId);
      }
      if (!res.ok) {
        if (!res.headers.get("content-type")?.includes("application/json"))
          throw new ApiError("invalid-response", "服务未返回可识别的错误信息", res.status, requestId);
        let data: { code?: string; message?: string };
        try { data = (await res.json()) as { code?: string; message?: string }; } catch {
          throw new ApiError("invalid-response", "服务返回的数据无法解析", res.status, requestId);
        }
        throw new ApiError(data.code ?? "request-failed", data.message ?? "请求失败，请稍后重试", res.status, requestId);
      }
      const blob = await res.blob();
      if (version !== sessionVersion || controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
      return blob;
    },
  );
}

/** 读取运行文本流。调用方用 AbortSignal 结束观察，这本身不是停止运行。 */
export async function openEventStream(path: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  assertValidPath(path);
  const res = await fetch(`/api${path}`, { headers: authHeaders({ Accept: "text/event-stream" }), credentials: "same-origin", signal });
  if (res.status === 401) {
    authListeners.forEach((fn) => fn());
    throw new ApiError("admin-auth-required", "请验证管理权限后继续", 401);
  }
  if (!res.ok || !res.body) throw new ApiError("request-failed", "无法观察这次运行", res.status);
  return res.body;
}

/** 轻量观测埋点上报（fail-open + keepalive，绝不触发登出或打断主交互）。 */
export function postTelemetry(path: string, body: unknown): void {
  if (typeof fetch !== "function" || (import.meta as { env?: { VITEST?: unknown } }).env?.VITEST) return;
  try {
    void fetch(`/api${path}`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: authHeaders({ "Content-Type": "application/json", "x-admin-background-poll": "1" }),
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    // fail-open
  }
}
