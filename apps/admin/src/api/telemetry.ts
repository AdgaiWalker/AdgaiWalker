/**
 * 极简后台交互埋点（fail-open，进程内存环形缓冲，零 SQLite 迁移）。
 * 事件单一真相源：docs/admin-telemetry-events.md
 */
export type AdminUiEventName =
  | "admin.page_view"
  | "editor.save_completed"
  | "publish.flow_started"
  | "publish.flow_completed"
  | "publish.flow_abandoned"
  | "drawer.opened"
  | "ai.silent_degraded"
  | "app.version_drift_refreshed";

export interface AdminUiEventRecord {
  at: string;
  event: AdminUiEventName;
  props?: Record<string, string | number | boolean | null | undefined>;
}

const MAX_BUFFER = 200;
const buffer: AdminUiEventRecord[] = [];
const listeners = new Set<() => void>();

export function trackAdminUiEvent(
  event: AdminUiEventName,
  props?: Record<string, string | number | boolean | null | undefined>,
): void {
  try {
    buffer.push({ at: new Date().toISOString(), event, ...(props ? { props } : {}) });
    if (buffer.length > MAX_BUFFER) buffer.shift();
    listeners.forEach((fn) => fn());
  } catch {
    // fail-open：统计绝不能影响主交互
  }
}

export function getAdminUiEvents(): readonly AdminUiEventRecord[] {
  return buffer;
}

export function clearAdminUiEvents(): void {
  buffer.length = 0;
  listeners.forEach((fn) => fn());
}

export function subscribeAdminUiEvents(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
