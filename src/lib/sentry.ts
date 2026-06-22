/**
 * sentry.ts —— 轻量手封 Sentry 异常上报（不依赖 @sentry SDK）
 *
 * 设计要点：
 * - SENTRY_DSN 走 import.meta.env.SENTRY_DSN；未配置时 no-op（不抛错、不阻塞）。
 * - fire-and-forget：captureException 不 await，失败静默（.catch(() => {})）。
 * - 直接 fetch 到 Sentry envelope 端点，手封 envelope（NDJSON，三行 \n 分隔）。
 *
 * DSN 格式：https://<publickey>@<host>/<projectid>
 * envelope 端点：https://<host>/api/<projectid>/envelope/
 */

interface ParsedDsn {
  host: string;
  projectId: string;
}

/**
 * 解析 DSN：https://<publickey>@<host>/<projectid>
 * 解析失败返回 null（调用方走 no-op）。
 */
function parseDsn(dsn: string): ParsedDsn | null {
  const match = /^https:\/\/[^/@]+@([^/]+)\/(.+)$/.exec(dsn);
  if (!match) return null;
  return { host: match[1], projectId: match[2] };
}

function envelopeEndpoint(parsed: ParsedDsn): string {
  return `https://${parsed.host}/api/${parsed.projectId}/envelope/`;
}

interface ExceptionValue {
  type: string;
  value: string;
  stacktrace?: { raw?: string };
}

function toExceptionValue(error: unknown): ExceptionValue {
  if (error instanceof Error) {
    const value: ExceptionValue = {
      type: error.name || 'Error',
      value: error.message || String(error),
    };
    if (error.stack) value.stacktrace = { raw: error.stack };
    return value;
  }
  return { type: typeof error, value: String(error) };
}

/**
 * 构建 Sentry envelope：三行 NDJSON，\n 分隔。
 *   行1 header      {"event_id":"<uuid>","sent_at":"<iso>"}
 *   行2 item header  {"type":"event"}
 *   行3 payload      event JSON（level:error, exception values, extra:context）
 */
function buildEnvelope(error: unknown, context: Record<string, unknown> | undefined): string {
  const eventId = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  const event: Record<string, unknown> = {
    event_id: eventId,
    level: 'error',
    exception: { values: [toExceptionValue(error)] },
  };
  if (context && Object.keys(context).length > 0) {
    event.extra = context;
  }

  const header = JSON.stringify({ event_id: eventId, sent_at: sentAt });
  const itemHeader = JSON.stringify({ type: 'event' });
  const payload = JSON.stringify(event);

  return [header, itemHeader, payload].join('\n');
}

/** POST envelope 到 Sentry 端点；失败由调用方 .catch 吞掉。 */
async function sendEnvelope(
  endpoint: string,
  error: unknown,
  context: Record<string, unknown> | undefined,
): Promise<void> {
  const body = buildEnvelope(error, context);
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
}

/**
 * 捕获异常并上报到 Sentry（fire-and-forget）。
 * - 未配置 SENTRY_DSN 或 DSN 无法解析 → no-op。
 * - 不 await、失败静默：上报网络错误绝不阻塞或抛错。
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const dsn = import.meta.env.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;
  void sendEnvelope(envelopeEndpoint(parsed), error, context).catch(() => {
    // 失败静默：上报不应阻塞或抛错
  });
}
