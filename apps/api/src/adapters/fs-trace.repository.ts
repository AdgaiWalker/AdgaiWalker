/**
 * 文件系统轨迹仓储 — `data/runs/<runId>/trace.jsonl`（append-only，TECH-DESIGN §4/§6.3）
 *
 * 读：从文件尾部按块反向扫描，只解析尾部窗口；禁止把整个大文件 JSON.parse 进内存。
 *     默认尾部 500 行；给了 after 游标只回增量。
 * 写：唯一写入器（发布运行与 Agent 运行共用）；seq 单调递增，首次写入从文件尾部续号。
 *
 * 旧格式文件（start/stage/done/error）经 shared parseTraceLine 读侧适配，文件不改写。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  TRACE_CONTRACT_VERSION,
  TRACE_PAYLOAD_MAX_BYTES,
  parseTraceLine,
  type NormalizedTraceEvent,
} from '@walker/shared';
import type {
  TraceAppendInput,
  TraceReadOptions,
  TraceReadResult,
  TraceRepositoryPort,
  TraceWriterPort,
} from '../ports/trace.repository';

/** 默认尾部行数（TECH-DESIGN §6.2：缺省返回尾部 500 行） */
const DEFAULT_TAIL_LINES = 500;
/** 单次返回上限：防止调用方用超大 limit 把内存拖爆 */
const MAX_LINES = 5_000;
/** 反向扫描块大小 */
const CHUNK_BYTES = 64 * 1024;
/** 反向扫描字节上限：limit 很大或文件无换行时的兜底 */
const MAX_SCAN_BYTES = 8 * 1024 * 1024;
/** runId 白名单：路径拼接口必须是受控形状（防穿越） */
const RUN_ID_RE = /^run_[A-Za-z0-9_-]+$/;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export class FsTraceRepository implements TraceRepositoryPort, TraceWriterPort {
  /** 已分配的 seq：同进程内连续追加用；进程重启后由 readMaxSeq 续号 */
  private readonly seqByRun = new Map<string, number>();

  /** 运行根目录：与既有写入点一致（apps/api 运行目录下的 data/runs），可用 WALKER_RUNS_DIR 覆盖（测试/自定部署） */
  private runsDir(): string {
    const fromEnv = process.env.WALKER_RUNS_DIR?.trim();
    return fromEnv ? path.resolve(fromEnv) : path.resolve(process.cwd(), 'data/runs');
  }

  traceFilePath(runId: string): string {
    return path.join(this.runsDir(), runId, 'trace.jsonl');
  }

  async readEvents(
    runId: string,
    options?: TraceReadOptions,
  ): Promise<TraceReadResult | null> {
    if (!RUN_ID_RE.test(runId)) return null;
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(this.traceFilePath(runId), 'r');
    } catch {
      return null;
    }
    try {
      const { size } = await handle.stat();
      const limit = clamp(options?.limit ?? DEFAULT_TAIL_LINES, 1, MAX_LINES);
      const after = options?.after;
      // 默认尾部模式只需 limit 行；after 模式需足够回扫以覆盖游标边界（上限 MAX_LINES）
      const scanCap = after === undefined ? limit : MAX_LINES;

      // 反向扫描：收集尾部窗口内的完整行（旧 → 新）。
      // after 模式的硬约束：窗口必须覆盖 after+1——即回扫到窗口最早一行 seq ≤ after
      // （或扫到文件头）。否则「after 落后于窗口」会静默漏掉最早的增量（待修缺陷）。
      const windowLines: string[] = [];
      let scannedToStart = false;
      let coveredCursor = false;
      let pos = size;
      let partial = '';
      let scannedBytes = 0;

      // 窗口最早一行是否已触及游标边界：新格式按 seq ≤ after 判定；旧格式行 seq=0 视为边界
      const windowReachedCursor = (target: number): boolean => {
        const first = windowLines[0];
        if (first === undefined) return false;
        const parsed = parseTraceLine(first);
        if (!parsed) return false;
        return parsed.seq === 0 || parsed.seq <= target;
      };

      while (pos > 0 && windowLines.length < scanCap && scannedBytes < MAX_SCAN_BYTES) {
        const start = Math.max(0, pos - CHUNK_BYTES);
        const chunk = Buffer.alloc(pos - start);
        await handle.read(chunk, 0, chunk.length, start);
        scannedBytes += chunk.length;
        const combined = chunk.toString('utf8') + partial;
        const parts = combined.split('\n');
        // start > 0 时首个元素是被截断的行头，留待下一轮拼接
        partial = start > 0 ? (parts.shift() ?? '') : '';
        for (let i = parts.length - 1; i >= 0; i--) {
          windowLines.unshift(parts[i]!);
        }
        if (start === 0) {
          scannedToStart = true;
          break;
        }
        pos = start;
        if (after !== undefined && windowReachedCursor(after)) {
          coveredCursor = true;
          break;
        }
      }

      // 窗口内逐行解析（旧 → 新）；只有扫到文件头时才知道行的绝对序号
      const parsed: NormalizedTraceEvent[] = [];
      for (let i = 0; i < windowLines.length; i++) {
        const event = parseTraceLine(windowLines[i]!);
        if (!event) continue;
        // 旧格式行没有 seq（归一为 0）：整文件可见时按行号补一个稳定游标，
        // 使「增量续拉」对旧文件同样成立；不能确定绝对序号时保持 0（如实）
        const effectiveSeq =
          event.seq > 0 ? event.seq : scannedToStart ? i + 1 : 0;
        parsed.push({ ...event, seq: effectiveSeq });
      }

      if (after === undefined) {
        // 默认尾部 N 行：按设计截断，与「游标漏读」不同，故 truncated=false
        return { events: parsed.slice(-limit), truncated: false };
      }
      // 游标续拉：窗口覆盖 after+1 时回最早的 limit 条增量（余量由下一次轮询补上）；
      // 未覆盖（命中扫描上限且未到文件头）则诚实标记 truncated，绝不假装完整
      const truncated = !scannedToStart && !coveredCursor;
      return {
        events: parsed.filter((event) => event.seq > after).slice(0, limit),
        truncated,
      };
    } finally {
      await handle.close();
    }
  }

  async append(runId: string, event: TraceAppendInput): Promise<number> {
    if (!RUN_ID_RE.test(runId)) throw new Error('invalid-run-id');
    const payload = event.payload ?? {};
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > TRACE_PAYLOAD_MAX_BYTES) {
      // 契约纪律：payload ≤2000 字节（正文/密钥/绝对路径本就禁入）
      throw new Error('trace-payload-too-large');
    }
    const file = this.traceFilePath(runId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let seq = this.seqByRun.get(runId);
    if (seq === undefined) seq = await this.readMaxSeq(file);
    seq += 1;
    const record = {
      v: TRACE_CONTRACT_VERSION,
      seq,
      ts: event.ts ?? Date.now(),
      runId,
      type: event.type,
      source: event.source ?? 'api',
      payload,
    };
    await fs.appendFile(file, `${JSON.stringify(record)}\n`, 'utf8');
    this.seqByRun.set(runId, seq);
    return seq;
  }

  async deleteTraceFile(runId: string): Promise<void> {
    if (!RUN_ID_RE.test(runId)) throw new Error('invalid-run-id');
    await fs.rm(this.traceFilePath(runId), { force: true });
    this.seqByRun.delete(runId);
  }

  /** 续号：只读尾部窗口取最大 seq（不做全量解析） */
  private async readMaxSeq(file: string): Promise<number> {
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(file, 'r');
    } catch {
      return 0;
    }
    try {
      const { size } = await handle.stat();
      const start = Math.max(0, size - CHUNK_BYTES);
      const chunk = Buffer.alloc(size - start);
      await handle.read(chunk, 0, chunk.length, start);
      let max = 0;
      for (const line of chunk.toString('utf8').split('\n')) {
        const event = parseTraceLine(line);
        if (event && event.seq > max) max = event.seq;
      }
      return max;
    } finally {
      await handle.close();
    }
  }
}
