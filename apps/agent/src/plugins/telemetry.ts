/**
 * telemetry 插件 — 工具调用观测。
 * 脚手架阶段：结构化 JSON 行落 stdout（A4 将接主站 FeatureEvent 管理端点，
 * 带 x-admin-token；失败不阻断——「记录不得改变业务结果」）。
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { TelemetryEvent } from '../types.js';

export class TelemetryService extends Service {
  static readonly provide = 'telemetry';

  constructor(ctx: Context) {
    super(ctx, 'telemetry');
  }

  record(event: TelemetryEvent): void {
    // A4 TODO: 回写主站 FeatureEvent（featureKey=agent.mcp）。本地日志兜底永不抛错。
    // 注意：stdout 是 MCP stdio 协议通道，观测输出只能走 stderr
    process.stderr.write(
      `${JSON.stringify({ ts: new Date().toISOString(), feature: 'agent.mcp', ...event })}\n`,
    );
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    telemetry: TelemetryService;
  }
}
