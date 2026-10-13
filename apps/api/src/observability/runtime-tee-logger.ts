import type { LoggerService } from '@nestjs/common';
import { prepareRuntimeLogEntry, redactSensitive, type RuntimeLogLevel } from '@walker/shared';
import type { RuntimeLogBufferPort } from '../ports/runtime-monitor.port';

/**
 * 把 Nest Logger 的输出**同时**喂给终端与控制台缓冲。
 *
 * 为什么要 tee 而不是改各处 logger 调用：项目里 Logger 实例散在几十个 service 里，
 * 逐个改既漏又贵；从 app.useLogger 这一处接，覆盖率就是"全部"。
 * 终端行为保持不变（inner 照旧打印），只是多留一份可查的副本。
 *
 * fail-open：任何采集异常都吞掉——观测坏了不能让业务跟着坏。
 */
export class RuntimeTeeLogger implements LoggerService {
  constructor(
    private readonly inner: LoggerService,
    private readonly buffer: RuntimeLogBufferPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * 先采集再打印：打印通道故障（终端断开、EPIPE）时，记录不该跟着一起丢。
   * 反过来 inner 抛错仍然照原样抛出——终端行为不由本类改变。
   */
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('info', message, optionalParams);
    this.inner.log(message, ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('warn', message, optionalParams);
    this.inner.warn(message, ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('error', message, optionalParams);
    this.inner.error(message, ...optionalParams);
  }

  /** Nest 11 的 fatal；终端仍走 error，避免 ConsoleLogger 版本差异。 */
  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.capture('error', message, optionalParams);
    this.inner.error(message, ...optionalParams);
  }

  private capture(level: RuntimeLogLevel, message: unknown, optionalParams: unknown[]): void {
    try {
      // Nest 的 Logger 把 context 放在最后一个参数（error 的 stack 在它之前）。
      // 注意：context 之外的参数**不能丢**——Logger.error('失败', stack, 'Ctx') 的 stack
      // 和 Logger.error('失败', {detail}, 'Ctx') 的明细，排错时都要看得到。
      const last = optionalParams.at(-1);
      const context = typeof last === 'string' ? last : null;
      const extras = context === null ? optionalParams : optionalParams.slice(0, -1);
      const text = [readableText(message), ...extras.map(readableText)]
        .filter((part) => part.length > 0)
        .join(' ');
      this.buffer.append(
        prepareRuntimeLogEntry({
          ts: this.now(),
          context,
          level,
          text,
          redact: redactSensitive,
        }),
      );
    } catch {
      // fail-open：采集失败只影响"能不能查到"，不影响服务本身
    }
  }
}

/** Error 要带上 stack（排错全靠它）；对象走 JSON，取不到就退化到 String。 */
export function readableText(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.stack ?? message.message;
  if (message === null || message === undefined) return '';
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}
