/**
 * JSON HTTP 传输（规则/适配层共用）
 * 职责：统一 fetch + JSON 解析；不含业务码映射、不含 UI。
 *
 * 依赖：浏览器/运行时 fetch
 * 调用：web/admin 门面包装后抛领域错误
 * 触发：任意同源 /api 请求
 * 实现：fetch → status/body
 */

export type JsonRequestOk<T> = { ok: true; data: T };
export type JsonRequestFail = {
  ok: false;
  status: number;
  code: string;
  message?: string;
};
export type JsonRequestResult<T> = JsonRequestOk<T> | JsonRequestFail;

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<JsonRequestResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    /* 断网 / 代理挂 / 无 API 主机 */
    return {
      ok: false,
      status: 0,
      code: 'network-error',
      message: '无法连接服务',
    };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const body = data as { code?: string; message?: string } | null;
    const fallbackCode =
      res.status === 404
        ? 'api-not-found'
        : res.status === 502 || res.status === 503 || res.status === 504
          ? 'api-unavailable'
          : res.statusText || 'request-failed';
    return {
      ok: false,
      status: res.status,
      code: body?.code ?? fallbackCode,
      message: body?.message,
    };
  }

  return { ok: true, data: data as T };
}
