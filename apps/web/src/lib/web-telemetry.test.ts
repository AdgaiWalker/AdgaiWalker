import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWebTelemetryForTest,
  formatDiagnosticsReport,
  getWebTelemetryEntries,
  installGlobalWebErrorHandlers,
  MAX_WEB_TELEMETRY_ENTRIES,
  PRELOAD_RELOAD_SESSION_KEY,
  trackWebEvent,
} from './web-telemetry';

describe('web-telemetry 环形日志与诊断兜底', () => {
  beforeEach(() => {
    clearWebTelemetryForTest();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('只保留最近 MAX_WEB_TELEMETRY_ENTRIES 条记录并可导出诊断摘要', () => {
    for (let i = 0; i < MAX_WEB_TELEMETRY_ENTRIES + 12; i += 1) {
      trackWebEvent('web.page_view', { path: `/p-${i}`, viewport: 'desktop' });
    }
    const entries = getWebTelemetryEntries();
    expect(entries).toHaveLength(MAX_WEB_TELEMETRY_ENTRIES);
    expect(entries[0]?.props.path).toBe('/p-12');
    expect(entries[entries.length - 1]?.props.path).toBe(`/p-${MAX_WEB_TELEMETRY_ENTRIES + 11}`);

    const report = JSON.parse(formatDiagnosticsReport(new Error('boom'))) as {
      error: { message: string };
      recentEvents: unknown[];
    };
    expect(report.error.message).toBe('boom');
    expect(report.recentEvents).toHaveLength(15);
  });

  it('全局错误监听记录运行时错误，vite:preloadError 仅安全重载一次防止死循环', () => {
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload },
      configurable: true,
    });

    const cleanup = installGlobalWebErrorHandlers();
    try {
      window.dispatchEvent(new ErrorEvent('error', { message: 'chunk oops' }));
      expect(getWebTelemetryEntries().some((e) => e.event === 'web.runtime_error_caught' && e.props.message === 'chunk oops')).toBe(true);

      window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
      window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
      expect(reload).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(PRELOAD_RELOAD_SESSION_KEY)).toBeTruthy();
    } finally {
      cleanup();
      Object.defineProperty(window, 'location', { value: originalLocation, configurable: true });
    }
  });
});
