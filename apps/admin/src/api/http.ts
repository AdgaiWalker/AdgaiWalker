export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 0,
    public requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let token: string | undefined;
let sessionVersion = 0;
const requests = new Set<AbortController>();
const authListeners = new Set<() => void>();
export function onUnauthorized(listener: () => void) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}
export function setAdminToken(value?: string) {
  token = value?.trim() || undefined;
  sessionVersion++;
  for (const request of requests) request.abort();
  requests.clear();
}
export async function requestJson<T>(
  path: string,
  options: { signal?: AbortSignal; timeoutMs?: number; method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new ApiError("invalid-path", "接口地址不正确");
  const controller = new AbortController(),
    version = sessionVersion;
  requests.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 10_000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { "x-admin-token": token } : {}),
      },
      signal: controller.signal,
    });
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (version !== sessionVersion || controller.signal.aborted)
      throw new DOMException("请求已取消", "AbortError");
    if (response.status === 401) {
      authListeners.forEach((listener) => listener());
      throw new ApiError(
        "admin-auth-required",
        "请验证管理权限后继续",
        401,
        requestId,
      );
    }
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError(
        "invalid-response",
        "服务未返回数据，请检查 API 连接",
        response.status,
        requestId,
      );
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        "invalid-response",
        "服务返回的数据无法解析",
        response.status,
        requestId,
      );
    }
    if (!response.ok) {
      const body = data as { code?: string; message?: string } | null;
      throw new ApiError(
        body?.code ?? "request-failed",
        body?.message ?? "请求失败，请稍后重试",
        response.status,
        requestId,
      );
    }
    if (version !== sessionVersion || controller.signal.aborted)
      throw new DOMException("请求已取消", "AbortError");
    return data as T;
  } catch (error) {
    if (timedOut) throw new ApiError("request-timeout", "连接超时，请重试");
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new DOMException("请求已取消", "AbortError");
    throw new ApiError(
      "network-unavailable",
      "无法连接本站服务，请检查网络与 API",
    );
  } finally {
    clearTimeout(timer);
    requests.delete(controller);
    options.signal?.removeEventListener("abort", abort);
  }
}

/** 读取运行文本流。调用方用 AbortSignal 结束观察，这本身不是停止运行。 */
export async function openEventStream(path: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  if (!path.startsWith('/') || path.startsWith('//')) throw new ApiError('invalid-path', '接口地址不正确');
  const response = await fetch(`/api${path}`, {
    headers: { Accept: 'text/event-stream', ...(token ? { 'x-admin-token': token } : {}) },
    credentials: 'same-origin',
    signal,
  });
  if (response.status === 401) {
    authListeners.forEach((listener) => listener());
    throw new ApiError('admin-auth-required', '请验证管理权限后继续', 401);
  }
  if (!response.ok || !response.body) throw new ApiError('request-failed', '无法观察这次运行', response.status);
  return response.body;
}
