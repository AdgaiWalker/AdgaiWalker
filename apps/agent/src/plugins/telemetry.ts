/**
 * telemetry 插件 — 工具调用观测（回写主站 FeatureEvent，featureKey=agent.mcp）。
 *
 * 红线：
 * - **记录不得改变业务结果**：上报失败只落 stderr，永不抛错、永不阻断工具调用。
 * - stdout 是 MCP stdio 协议通道，观测输出只能走 stderr。
 * - 未配置 token 时不假装已上报，如实打一行本地说明。
 */
import process from 'node:process';
import { Context, Service } from '@deepseek-ai/cordis';
import type { TelemetryEvent } from '../types.js';

/** 上报超时：观测是旁路，不允许拖慢工具调用 */
export const TELEMETRY_TIMEOUT_MS = 3_000;
const FEATURE_KEY = 'agent.mcp';

export interface TelemetryConfig {
  /** 主站地址；默认 env `WALKER_ADMIN_URL`，再默认本机 8788 */
  endpoint?: string;
  /** 管理 token；默认 env `WALKER_ADMIN_TOKEN`。缺失则只留本地日志 */
  token?: string;
}

export class TelemetryService extends Service {
  static readonly provide = 'telemetry';

  private readonly endpoint: string;
  private readonly token: string | null;

  constructor(ctx: Context, config: TelemetryConfig = {}) {
    super(ctx, 'telemetry');
    this.endpoint = (
      config.endpoint ??
      process.env.WALKER_ADMIN_URL ??
      'http://127.0.0.1:8788'
    ).replace(/\/+$/, '');
    const token = config.token ?? process.env.WALKER_ADMIN_TOKEN;
    this.token = token && token.trim().length > 0 ? token.trim() : null;
  }

  /** 调用方只调这一个方法；任何失败都在内部消化 */
  record(event: TelemetryEvent): void {
    try {
      process.stderr.write(
        `${JSON.stringify({ ts: new Date().toISOString(), feature: FEATURE_KEY, ...event })}\n`,
      );
    } catch {
      /* 日志写不出去也不能影响业务 */
    }
    void this.report(event);
  }

  /** 上报 attempt + success/fail 两条；结果只记日志 */
  private async report(event: TelemetryEvent): Promise<void> {
    if (!this.token) {
      process.stderr.write(
        '[telemetry] 未配置 WALKER_ADMIN_TOKEN，仅本地记录（不假装已上报）\n',
      );
      return;
    }
    const props = { tool: event.tool, detail: event.detail ?? null };
    const results = await Promise.allSettled([
      this.post({ featureKey: FEATURE_KEY, event: 'attempt', actorType: 'owner', props }),
      this.post({
        featureKey: FEATURE_KEY,
        event: event.ok ? 'success' : 'fail',
        actorType: 'owner',
        failCode: event.ok ? null : 'empty-result',
        props,
      }),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        process.stderr.write(`[telemetry] 上报失败（已忽略）：${String(result.reason)}\n`);
      }
    }
  }

  private async post(payload: unknown): Promise<void> {
    const response = await fetch(`${this.endpoint}/admin/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': this.token as string,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    telemetry: TelemetryService;
  }
}
