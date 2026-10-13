import { Injectable } from '@nestjs/common';
import {
  RUNTIME_LOG_BUFFER_LIMIT,
  RUNTIME_REQUEST_BUFFER_LIMIT,
  computeRuntimeMetrics,
  isRuntimeErrorEntry,
  isHumanRuntimeRequest,
  isRuntimeRequestError,
  isRuntimeRequestInterrupted,
  outcomeForStatus,
  type RuntimeLogChannel,
  type RuntimeLogEntry,
  type RuntimeLogPage,
  type RuntimeMetrics,
  type RuntimeRequestEntry,
  type RuntimeRequestPage,
} from '@walker/shared';
import type {
  RuntimeLogBufferPort,
  RuntimeRequestBufferPort,
  RuntimeRequestRecordInput,
} from '../ports/runtime-monitor.port';

/**
 * 定容环形缓冲。满了就覆盖最旧的一条并计数 dropped——
 * 容量固定才守得住内存上限（日志 800 行 × 单行 2KB 约 2MB）。
 *
 * 为什么不用 push()/shift()：那是在数组头部搬移，容量再大也挡不住"看起来没上限"的写法，
 * 且 dropped 计数会失去唯一落点。这里把上限与计数一起焊死在结构里。
 */
class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private next = 0;
  private size = 0;
  private droppedCount = 0;

  constructor(private readonly capacity: number) {
    this.items = new Array<T | undefined>(capacity);
  }

  push(value: T): void {
    if (this.size === this.capacity) this.droppedCount += 1;
    this.items[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  /** 旧 → 新顺序展开 */
  toArray(): T[] {
    const out: T[] = [];
    const start = (this.next - this.size + this.capacity) % this.capacity;
    for (let index = 0; index < this.size; index += 1) {
      const value = this.items[(start + index) % this.capacity];
      if (value !== undefined) out.push(value);
    }
    return out;
  }

  /** 先筛后用：filter 作用在整段缓冲上，再取最后 limit 条（不是先截断再筛）。 */
  tail(limit: number, filter?: (value: T) => boolean): T[] {
    const ordered = this.toArray();
    const matched = filter ? ordered.filter(filter) : ordered;
    return matched.length <= limit ? matched : matched.slice(matched.length - limit);
  }
}

@Injectable()
export class InMemoryRuntimeLogBuffer implements RuntimeLogBufferPort {
  private readonly ring = new RingBuffer<RuntimeLogEntry>(RUNTIME_LOG_BUFFER_LIMIT);

  append(entry: RuntimeLogEntry): void {
    try {
      this.ring.push(entry);
    } catch {
      // fail-open：观测写失败绝不影响业务（后台日志在这里会 503 拒绝执行——语义相反）
    }
  }

  dropped(): number {
    return this.ring.dropped;
  }

  page(input: { limit: number; channel?: RuntimeLogChannel; errorsOnly: boolean }): RuntimeLogPage {
    const entries = this.ring.tail(
      input.limit,
      (entry) =>
        (!input.channel || entry.channel === input.channel) &&
        (!input.errorsOnly || isRuntimeErrorEntry(entry)),
    );
    const counts: Record<RuntimeLogChannel, number> = { task: 0, chat: 0, sys: 0 };
    for (const entry of this.ring.toArray()) counts[entry.channel] += 1;
    return { entries, counts, dropped: this.ring.dropped };
  }
}

@Injectable()
export class InMemoryRuntimeMetricsBuffer implements RuntimeRequestBufferPort {
  private readonly ring = new RingBuffer<RuntimeRequestEntry>(RUNTIME_REQUEST_BUFFER_LIMIT);
  private readonly startedAt = new Date().toISOString();
  private completed = 0;
  private failed = 0;
  private interrupted = 0;
  private inFlight = 0;
  private totalDurationMs = 0;

  begin(): void {
    this.inFlight += 1;
  }

  finish(input: RuntimeRequestRecordInput): void {
    try {
      // 先减再记：即便 push 抛错，进行中计数也不会永久卡住（那会让界面一直显示"2 个进行中"）
      this.inFlight = Math.max(0, this.inFlight - 1);
      const entry: RuntimeRequestEntry = {
        ts: input.ts.toISOString(),
        method: input.method,
        route: input.route,
        status: input.status,
        outcome: input.outcome ?? outcomeForStatus(input.status),
        durationMs: Math.max(0, Math.round(input.durationMs)),
        requestId: input.requestId ?? null,
        background: input.background ?? false,
      };
      if (isRuntimeRequestInterrupted(entry)) {
        // 被我们主动掐断（前端 abort 轮询）：记明细、单独计数，不进成功率分母，
        // 也不计入平均耗时——否则每 5 秒一次 aborted 轮询就会把指标写成假的。
        this.interrupted += 1;
      } else {
        this.completed += 1;
        if (isRuntimeRequestError(entry)) this.failed += 1;
        this.totalDurationMs += entry.durationMs;
      }
      this.ring.push(entry);
    } catch {
      // fail-open
    }
  }

  snapshot(now: Date, droppedLogLines: number): RuntimeMetrics {
    return computeRuntimeMetrics({
      startedAt: this.startedAt,
      now,
      completed: this.completed,
      failed: this.failed,
      interrupted: this.interrupted,
      inFlight: this.inFlight,
      totalDurationMs: this.totalDurationMs,
      droppedLogLines,
      droppedRequests: this.ring.dropped,
    });
  }

  page(input: { limit: number; errorsOnly: boolean; humanOnly: boolean }): RuntimeRequestPage {
    // 无筛选时不做任何过滤（不构造恒真函数——那只是浪费一次遍历）
    const filter =
      input.errorsOnly || input.humanOnly
        ? (entry: RuntimeRequestEntry) =>
            (!input.errorsOnly || isRuntimeRequestError(entry)) &&
            (!input.humanOnly || isHumanRuntimeRequest(entry))
        : undefined;
    return { entries: this.ring.tail(input.limit, filter) };
  }
}
