/**
 * 公开站前端系统日志与统计事件环形缓冲（SSOT: docs/web-telemetry-events.md）。
 * 零外部请求；为 ErrorBoundary、版本漂移与优雅降级提供即时可复制的现场轨迹。
 */

export const WEB_TELEMETRY_EVENTS = [
  'web.page_view',
  'web.postcard_sent',
  'web.article_ask_opened',
  'web.ai_graceful_degraded',
  'web.runtime_error_caught',
] as const;

export type WebTelemetryEventName = (typeof WEB_TELEMETRY_EVENTS)[number];

export type WebTelemetryProps = Record<string, string | number | boolean | null>;

export interface WebTelemetryEntry {
  at: string;
  event: WebTelemetryEventName;
  props: WebTelemetryProps;
}

export const MAX_WEB_TELEMETRY_ENTRIES = 100;
export const PRELOAD_RELOAD_SESSION_KEY = 'walker:web-preload-reloaded';

const buffer: WebTelemetryEntry[] = [];

export function getWebBuildVersion(): string {
  return typeof __WEB_BUILD_VERSION__ !== 'undefined' ? __WEB_BUILD_VERSION__ : 'dev';
}

export function trackWebEvent(
  event: WebTelemetryEventName,
  props: WebTelemetryProps = {},
): WebTelemetryEntry {
  const entry: WebTelemetryEntry = {
    at: new Date().toISOString(),
    event,
    props,
  };
  buffer.push(entry);
  if (buffer.length > MAX_WEB_TELEMETRY_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_WEB_TELEMETRY_ENTRIES);
  }
  return entry;
}

export function getWebTelemetryEntries(): readonly WebTelemetryEntry[] {
  return [...buffer];
}

export function clearWebTelemetryForTest(): void {
  buffer.length = 0;
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 760px)')?.matches ?? window.innerWidth <= 760;
}

export function formatDiagnosticsReport(error?: {
  message?: string;
  stack?: string;
} | null): string {
  const href = typeof window !== 'undefined' ? window.location.pathname : '/';
  const payload = {
    version: getWebBuildVersion(),
    route: href,
    capturedAt: new Date().toISOString(),
    error: error ? { message: error.message ?? 'unknown', stack: error.stack?.slice(0, 400) } : null,
    recentEvents: buffer.slice(-15),
  };
  return JSON.stringify(payload, null, 2);
}

/** 安装全局错误与动态 chunk 404 自愈监听（返回清理函数方便单测与严格模式卸载）。 */
export function installGlobalWebErrorHandlers(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    trackWebEvent('web.runtime_error_caught', {
      kind: 'error',
      message: (event.message || 'script-error').slice(0, 140),
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'unhandled-rejection';
    trackWebEvent('web.runtime_error_caught', {
      kind: 'rejection',
      message: message.slice(0, 140),
    });
  };

  const onPreloadError = (event: Event) => {
    trackWebEvent('web.runtime_error_caught', {
      kind: 'preload',
      message: 'vite-preload-error',
    });
    try {
      const current = getWebBuildVersion();
      if (window.sessionStorage.getItem(PRELOAD_RELOAD_SESSION_KEY) === current) return;
      window.sessionStorage.setItem(PRELOAD_RELOAD_SESSION_KEY, current);
      event.preventDefault();
      window.location.reload();
    } catch {
      /* sessionStorage unavailable */
    }
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('vite:preloadError', onPreloadError);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('vite:preloadError', onPreloadError);
  };
}
