/**
 * 计划面聚合读模型（PRD-B §4.2/§4.3、TECH-DESIGN §6.2）
 *
 * GET /admin/plan/calendar?from=<date>&to=<date>
 *
 * 三条纪律（PRD §4.3）：
 * 1. 不建新表：排期事实全部来自既有 Action（plannedDate / entityType / entityId）。
 * 2. 不复制阶段状态：内容阶段每次请求实时读台账读模型（ContentLedgerService），
 *    绝不落库、绝不缓存；查不到即 null（不编造）。
 * 3. 逾期由本层计算：status==='OPEN' 且 plannedDate < today，前端只做展示。
 *
 * 删排期只删 Action 行，不触碰 content/log（PRD §4.4 末条）。
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_LIST_LIMIT,
  decorateNextActionSummaries,
  normalizePlannedDate,
  pickNextActions,
  type ContentLedgerEntry,
  type ContentStage,
  type PlanNext,
} from '@walker/shared';
import { validationError } from '../common/http-error';
import { ACTION_REPOSITORY, type ActionRecord, type ActionRepositoryPort } from '../ports/action.repository';
import { CLUE_REPOSITORY, type ClueRepositoryPort } from '../ports/clue.repository';
import { EXECUTION_REPOSITORY, type ExecutionRepositoryPort } from '../ports/execution.repository';
import { SEED_REPOSITORY, type SeedRepositoryPort } from '../ports/seed.repository';
import { ContentLedgerService } from '../content-ledger/content-ledger.service';

/** 日历单格条目：Action 事实 + 本层计算的逾期标记 + 关联内容实时阶段（只读引用） */
export interface PlanCalendarEntry extends ActionRecord {
  overdue: boolean;
  /** entityType==='CONTENT' 时来自台账的实时阶段；非内容排期或查不到即 null */
  contentStage: ContentStage | null;
}

export interface PlanCalendar {
  from: string;
  to: string;
  /** 服务端视角的今天（UTC 日期），前端逾期/今天锚点以此为锚 */
  today: string;
  days: Array<{ date: string; items: PlanCalendarEntry[] }>;
  /** 未排期积压：OPEN 且无 plannedDate（PRD §4.2 排期视图的「未排期」列） */
  undated: PlanCalendarEntry[];
  /** 逾期未完成：OPEN 且 plannedDate < today，即使落在查询窗口之外也返回（排期视图不丢历史逾期） */
  overdue: PlanCalendarEntry[];
  /** 未排定发布日的「待上线」内容：stage==='ready' 且没有任何 OPEN 的内容排期指向它 */
  unscheduledReady: ContentLedgerEntry[];
  gitAvailable: boolean;
}

/** 日历拉取条数上限：排期是一人站主低频数据，500 条已远超实际量级 */
const CALENDAR_LIST_LIMIT = 500;
/** 默认窗口：今天起两周（from/to 缺省时） */
const DEFAULT_WINDOW_DAYS = 14;

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

/** 日期参数：缺省给默认窗口；给了必须合法（复用 shared 词表化校验，非法即 400） */
function parseDateParam(value: string | undefined, fallback: string, name: string): string {
  if (value === undefined || value.trim() === '') return fallback;
  try {
    return normalizePlannedDate(value) as string;
  } catch {
    throw validationError(`invalid-${name}-date`);
  }
}

@Injectable()
export class PlanService {
  constructor(
    @Inject(ACTION_REPOSITORY) private readonly actions: ActionRepositoryPort,
    @Inject(ContentLedgerService) private readonly ledger: ContentLedgerService,
    @Inject(CLUE_REPOSITORY) private readonly clues: ClueRepositoryPort,
    @Inject(SEED_REPOSITORY) private readonly seeds: SeedRepositoryPort,
    @Inject(EXECUTION_REPOSITORY) private readonly executions: ExecutionRepositoryPort,
  ) {}

  async next(): Promise<PlanNext> {
    const [clues, seeds, executions] = await Promise.all([
      this.clues.list(DEFAULT_LIST_LIMIT),
      this.seeds.list(DEFAULT_LIST_LIMIT),
      this.executions.list(DEFAULT_LIST_LIMIT),
    ]);
    const actions = pickNextActions({
      clues: clues.map((clue) => ({
        id: clue.id,
        body: clue.body,
        poolStatus: clue.poolStatus,
      })),
      seeds: seeds.map((seed) => ({
        id: seed.id,
        title: seed.title,
        primaryClueId: seed.primaryClueId,
      })),
      executions: executions.map((execution) => ({
        id: execution.id,
        seedId: execution.seedId,
        status: execution.status,
        deliveryUrl: execution.deliveryUrl,
        outcome: execution.outcome,
      })),
    });
    return {
      generatedAt: new Date().toISOString(),
      actions: decorateNextActionSummaries(actions, {
        clues,
        seeds,
        executions,
      }),
    };
  }

  async calendar(input: { from?: string; to?: string } = {}): Promise<PlanCalendar> {
    const today = toDateString(new Date());
    const from = parseDateParam(input.from, today, 'from');
    const to = parseDateParam(input.to, shiftDate(from, DEFAULT_WINDOW_DAYS - 1), 'to');
    if (to < from) throw validationError('invalid-date-range');

    const [records, ledger] = await Promise.all([
      this.actions.list({ limit: CALENDAR_LIST_LIMIT }),
      this.ledger.ledger(),
    ]);
    const stageBySlug = new Map(ledger.items.map((item) => [item.slug, item.stage]));

    const enrich = (record: ActionRecord): PlanCalendarEntry => ({
      ...record,
      overdue: record.status === 'OPEN' && record.plannedDate !== null && record.plannedDate < today,
      contentStage:
        record.entityType === 'CONTENT' && record.entityId !== null
          ? (stageBySlug.get(record.entityId) ?? null)
          : null,
    });

    const inWindow = new Map<string, PlanCalendarEntry[]>();
    const undated: PlanCalendarEntry[] = [];
    const overdue: PlanCalendarEntry[] = [];
    for (const record of records) {
      if (record.plannedDate === null) {
        if (record.status === 'OPEN') undated.push(enrich(record));
        continue;
      }
      const entry = enrich(record);
      if (entry.overdue) overdue.push(entry);
      if (record.plannedDate < from || record.plannedDate > to) continue;
      const bucket = inWindow.get(record.plannedDate) ?? [];
      bucket.push(entry);
      inWindow.set(record.plannedDate, bucket);
    }

    // 已有 OPEN 内容排期指向的 slug：不再出现在「未排期」列（避免同一篇双列）
    const scheduledSlugs = new Set(
      records
        .filter(
          (record) =>
            record.status === 'OPEN' && record.entityType === 'CONTENT' && record.entityId !== null,
        )
        .map((record) => record.entityId as string),
    );

    const days: PlanCalendar['days'] = [];
    for (let date = from; date <= to; date = shiftDate(date, 1)) {
      days.push({ date, items: inWindow.get(date) ?? [] });
    }

    return {
      from,
      to,
      today,
      days,
      undated,
      overdue,
      unscheduledReady: ledger.items.filter(
        (item) => item.stage === 'ready' && !scheduledSlugs.has(item.slug),
      ),
      gitAvailable: ledger.gitAvailable,
    };
  }
}
