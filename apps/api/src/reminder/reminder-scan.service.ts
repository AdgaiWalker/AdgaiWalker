import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DEFAULT_LIST_LIMIT } from '@walker/shared';
import { resolveRestoreGatePath, isRestoreGatePending } from '../runtime/restore-gate';
import { ACTION_REPOSITORY, type ActionRepositoryPort } from '../ports/action.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { ReminderService } from './reminder.service';

/** 扫描间隔：每 5 分钟（TECH-DESIGN §12.4） */
export const REMINDER_SCAN_INTERVAL_MS = 5 * 60 * 1_000;
/** 单轮至多处理多少个到期事项；超过则留到下一轮，保证单轮时长可控 */
export const REMINDER_SCAN_BATCH_LIMIT = 200;
/** 单轮扫描的轮次上限（防止一次性补扫把进程占满） */
const SCAN_PASS_LIMIT = 20;

export interface ReminderScanResult {
  scannedAt: string;
  /** 本轮新产生的发生记录数 */
  created: number;
  /** 本轮命中唯一键、已存在故未新增的数量（重复扫描的诚实计数） */
  deduped: number;
  /** 跳过的到期事项数（多为已处置/已忽略） */
  skipped: number;
}

/**
 * 到期扫描与恢复补检（O02，TECH-DESIGN §12.4）
 *
 * 只做三件事，且都不依赖模型：
 * 1. 领取 `dueAt <= now` 且状态为 OPEN 的事项；
 * 2. 为每个到期写一条发生记录（唯一键去重，重复扫描不会重复产生）；
 * 3. 绝不发外部通知、绝不新建 Agent 进程、绝不调用模型。
 *
 * 「补检」= 启动时立即跑一轮：重启期间到期的提醒不该等到下一个 5 分钟才被看见。
 * 卡口沿用既有约定：恢复门（restore pending）期间不扫描。
 */
@Injectable()
export class ReminderScanService implements OnModuleDestroy {
  private readonly log = new Logger('ReminderScan');
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 防重入：上一轮未跑完就跳过这一轮，避免同一到期被并发处理 */
  private scanning = false;
  private stopped = false;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(ACTION_REPOSITORY) private readonly actions: ActionRepositoryPort,
    @Inject(ReminderService) private readonly reminders: ReminderService,
  ) {}

  /** 启动补检 + 起定时器；恢复门未清或库不可写时不启动 */
  async startScheduler(): Promise<void> {
    if (this.timer || this.stopped) return;
    if (isRestoreGatePending(resolveRestoreGatePath())) return;
    if (!this.prisma.isWritable()) return;
    this.timer = setInterval(() => void this.scanOnce().catch(() => undefined), REMINDER_SCAN_INTERVAL_MS);
    // 定时器不该拖住进程退出（测试与优雅关闭都要求能收干净）
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 跑一轮扫描（生产由定时器调用，启动补检与测试走同一入口）。
   * 返回真实计数：不把「已存在」算成「新增」，也不把跳过算成成功。
   */
  async scanOnce(now = new Date()): Promise<ReminderScanResult> {
    const result: ReminderScanResult = {
      scannedAt: now.toISOString(),
      created: 0,
      deduped: 0,
      skipped: 0,
    };
    if (this.scanning) return result;
    if (!this.prisma.isWritable()) return result;
    if (isRestoreGatePending(resolveRestoreGatePath())) return result;

    this.scanning = true;
    try {
      for (let pass = 0; pass < SCAN_PASS_LIMIT; pass += 1) {
        const due = await this.actions.listDue(now, REMINDER_SCAN_BATCH_LIMIT);
        if (due.length === 0) break;

        let progressed = false;
        for (const action of due) {
          try {
            const outcome = await this.reminders.recordDueOccurrence(action, now);
            if (outcome.created) {
              result.created += 1;
              progressed = true;
            } else {
              // 发生记录已存在：本轮无需再处理，避免同一批反复空转
              result.deduped += 1;
            }
          } catch {
            // 单条失败不拖垮整轮：如实计为跳过，下一轮再试
            result.skipped += 1;
          }
        }

        // 没有任何新增说明这一批已全部建过记录：再扫同一批不会前进，直接结束
        if (!progressed) break;
      }
      return result;
    } finally {
      this.scanning = false;
    }
  }
}
