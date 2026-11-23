import type { AdminUiEventName } from "@walker/shared";
import { postTelemetry } from "./http";

export type { AdminUiEventName };

/**
 * 极简后台交互埋点（fail-open：本地 200 条环形缓冲 + 静默上报服务端 POST /ops/runtime/ui-events）。
 * 事件单一真相源：packages/shared/src/runtime-monitor.ts 与 docs/admin-telemetry-events.md
 */
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
    postTelemetry("/ops/runtime/ui-events", { event, ...(props ? { props } : {}) });
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
