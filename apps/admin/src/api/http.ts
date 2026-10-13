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
/**
 * 按操作语义分层的等待预算（毫秒）。
 *
 * 为什么必须分层（2026-09-24 实测事故）：前端原先只有一个 10 秒默认值，
 * 而后端后台任务预算是 120 秒、单次模型调用 60 秒。三类测试实测要 44.6 秒——
 * 于是**服务端老老实实跑完了，前端却在 10 秒放弃并报「连接超时」**：
 * 界面在撒谎，用户以为失败，其实数据和结果都是好的。
 *
 * 约定：**前端等待必须 ≥ 后端承诺的预算**，否则这个操作在前端永远显示失败。
 * 默认值只服务"读一次数据"这种快速调用；长操作必须显式声明自己的预算。
 */
export const REQUEST_TIMEOUTS = {
  /** 常规读取（列表、详情、能力）。 */
  read: 10_000,
  /** 写入类（保存配置、创建 Agent）。 */
  write: 30_000,
  /**
   * 长任务：会在服务端**同步等模型跑完**的接口。
   * 必须覆盖后端的后台 deadline（BACKGROUND_DEADLINE_MS = 120s）+ 调度余量。
   */
  longTask: 180_000,
} as const;

export async function requestJson<T>(
  path: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    backgroundPoll?: boolean;
  } = {},
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
  }, options.timeoutMs ?? REQUEST_TIMEOUTS.read);
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
        ...(options.backgroundPoll ? { 'x-admin-background-poll': '1' } : {}),
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
    // 超时要说实话：请求已经发出去了，服务端**很可能仍在执行**。
    // 笼统说「请重试」会诱导用户重复触发（对会产生副作用的长任务尤其危险）。
    if (timedOut)
      throw new ApiError(
        "request-timeout",
        "等待超时：服务可能仍在后台执行，请稍后刷新查看结果，不要重复提交",
      );
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

export async function requestBlob(
  path: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Blob> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new ApiError("invalid-path", "接口地址不正确");
  const controller = new AbortController(), version = sessionVersion;
  requests.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? REQUEST_TIMEOUTS.longTask);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      headers: { Accept: "text/csv, application/json", ...(token ? { "x-admin-token": token } : {}) },
      signal: controller.signal,
    });
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (version !== sessionVersion || controller.signal.aborted)
      throw new DOMException("请求已取消", "AbortError");
    if (response.status === 401) {
      authListeners.forEach((listener) => listener());
      throw new ApiError("admin-auth-required", "请验证管理权限后继续", 401, requestId);
    }
    if (!response.ok) {
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new ApiError("invalid-response", "服务未返回可识别的错误信息", response.status, requestId);
      let data: { code?: string; message?: string };
      try {
        data = await response.json() as { code?: string; message?: string };
      } catch {
        throw new ApiError("invalid-response", "服务返回的数据无法解析", response.status, requestId);
      }
      throw new ApiError(data.code ?? "request-failed", data.message ?? "请求失败，请稍后重试", response.status, requestId);
    }
    const blob = await response.blob();
    if (version !== sessionVersion || controller.signal.aborted)
      throw new DOMException("请求已取消", "AbortError");
    return blob;
  } catch (error) {
    if (timedOut)
      throw new ApiError("request-timeout", "下载等待超时；文件可能仍可用，请刷新导出状态后再试");
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new DOMException("请求已取消", "AbortError");
    throw new ApiError("network-unavailable", "无法连接本站服务，请检查网络与 API");
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
