/**
 * 运营活动流：把五个旧 tab 的数据源投影成一条时间线（只读，不落库）。
 *
 * 这是**读取时聚合**，不是新表：每条事件都是 run / conversation / reminder / review /
 * AdminRequestLog 的投影，带 provenance 回指。删了源记录，流里就没有——不存在第二真相源。
 *
 * 分页（shared activity.ts 纪律③）：每源取最近 N 条，按时间游标 before 过滤后归并。
 * 某一源事件更密时，深处历史会稀疏不均，界面明说"翻更早建议按类型筛"。
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  ACTIVITY_TODO_TS,
  beforeCursor,
  mergeActivity,
  runTitle,
  visitorTitle,
  type ActivityCounts,
  type ActivityEvent,
  type ActivityKind,
  type ActivityPage,
  type ActivitySeverity,
} from '@walker/shared';
import { storageUnavailable, validationError } from '../common/http-error';
import { ADMIN_REQUEST_LOG, type AdminRequestLogPort } from '../ports/admin-request-log.port';
import { AgentExecutionService } from '../execution/agent-execution.service';
import { ReminderService } from '../reminder/reminder.service';
import { ConversationQueryService } from '../log-resources/conversation-query.service';
import { OperationsService } from './operations.service';

/** 每源参与归并前取多少条。归并分页精度受它约束，超过它只能靠"按类型筛"。 */
const SOURCE_FETCH = 30;

@Injectable()
export class ActivityService {
  constructor(
    @Inject(AgentExecutionService) private readonly runs: AgentExecutionService,
    @Inject(ConversationQueryService) private readonly conversations: ConversationQueryService,
    @Inject(ReminderService) private readonly reminders: ReminderService,
    @Inject(ADMIN_REQUEST_LOG) private readonly adminLog: AdminRequestLogPort,
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}

  async page(input: {
    kinds: ActivityKind[];
    before: string | null;
    limit: number;
  }): Promise<ActivityPage> {
    const want = (kind: ActivityKind): boolean => input.kinds.length === 0 || input.kinds.includes(kind);

    // 并行取各源（互不依赖）；单源失败不拖垮整页——但会少一类，调用方如实呈现
    const [runEvents, visitorEvents, reminderEvents, reviewEvents, adminEvents] = await Promise.all([
      want('run') ? this.runSource() : Promise.resolve([]),
      want('visitor') ? this.visitorSource() : Promise.resolve([]),
      want('reminder') ? this.reminderSource() : Promise.resolve([]),
      want('review') ? this.reviewSource() : Promise.resolve([]),
      want('admin') ? this.adminSource() : Promise.resolve([]),
    ]);

    // 时间游标在归并**前**过滤（shared beforeCursor），保证每源参与的都是早于 before 的最近 N 条
    const sources = [runEvents, visitorEvents, reminderEvents, reviewEvents, adminEvents].map(
      (source) => beforeCursor(source, input.before),
    );
    const events = mergeActivity(sources, input.limit);
    return {
      events,
      sourceLimit: SOURCE_FETCH,
      next: events.length === input.limit ? events[events.length - 1].ts : null,
    };
  }

  /**
   * 顶部计数：全部来自 /ops/overview 的既有口径（O06 已验收），零新统计。
   * answers 系列是 7 天窗口；工作区领先数没有确证发布事实时是 null（不是 0）。
   */
  async counts(): Promise<ActivityCounts> {
    const stats = await this.operations.overview({ window: '7d' });
    return {
      remindersPending: stats.reminders.open,
      answersDegraded: stats.answers.degraded,
      runsFailed: stats.answers.failed,
      releaseWorkingAhead: stats.content.publicationAvailable
        ? stats.content.versionStates.workingAhead
        : null,
    };
  }

  // ── 各源投影 ──────────────────────────────────────────────────────

  private async runSource(): Promise<ActivityEvent[]> {
    const page = await this.runs.ownedRuns(undefined, SOURCE_FETCH);
    return page.items.map((run) => {
      const bad = run.state === 'FAILED' || run.state === 'CANCELLED';
      return {
        key: 'run:' + run.id,
        ts: run.createdAt,
        kind: 'run' as const,
        severity: (bad ? 'error' : 'info') as ActivitySeverity,
        title: runTitle(run.state, run.elapsedMs, run.agentName),
        detail: run.stopReason ? '停止原因：' + run.stopReason : null,
        provenance: { kind: 'run' as const, id: run.id, ref: run.agentId },
        isTodo: false,
      };
    });
  }

  private async visitorSource(): Promise<ActivityEvent[]> {
    const page = await this.conversations.list({ limit: '50' });
    return page.items.map((item) => {
      const bad = item.latestRunState === 'FAILED';
      return {
        key: 'visitor:' + item.conversationId,
        ts: item.lastActivityAt,
        kind: 'visitor' as const,
        severity: (bad ? 'error' : 'info') as ActivitySeverity,
        title: visitorTitle(item.latestQuestion, item.turnCount),
        detail: item.turnCount + ' 轮' + (item.contentSlug ? ' · ' + item.contentSlug : ''),
        provenance: { kind: 'visitor' as const, id: item.conversationId, ref: null },
        isTodo: false,
      };
    });
  }

  private async reminderSource(): Promise<ActivityEvent[]> {
    const inbox = await this.reminders.inbox();
    return inbox.items
      .filter((item) => item.occurrenceOutcome !== 'IGNORED')
      .map((item) => ({
        // 待办没有"发生时间"语义：置顶占位 + dueAt 放进 detail，如实可读
        key: 'reminder:' + item.actionId,
        ts: ACTIVITY_TODO_TS,
        kind: 'reminder' as const,
        severity: 'todo' as ActivitySeverity,
        title: item.title,
        detail:
          (item.dueAt ? '到期 ' + item.dueAt.slice(0, 10) : '未排期') +
          (item.contentSlug ? ' · ' + item.contentSlug : ''),
        provenance: { kind: 'reminder' as const, id: item.actionId, ref: null },
        isTodo: true,
      }));
  }

  private async reviewSource(): Promise<ActivityEvent[]> {
    const reviews = await this.reminders.listReviews({ limit: SOURCE_FETCH });
    return reviews.map((review) => ({
      key: 'review:' + review.id,
      ts: review.createdAt.toISOString(),
      kind: 'review' as const,
      severity: 'info' as ActivitySeverity,
      title: review.didWhat,
      detail: review.nextAttempt ? '下一事项：' + review.nextAttempt : null,
      provenance: { kind: 'review' as const, id: review.id, ref: review.actionId },
      isTodo: false,
    }));
  }

  private async adminSource(): Promise<ActivityEvent[]> {
    const rows = await this.adminLog.list({ limit: SOURCE_FETCH, method: 'WRITE' });
    return rows.map((row) => {
      const bad = (row.statusCode ?? 0) >= 500;
      const warn = !bad && (row.statusCode ?? 0) >= 400;
      return {
        key: 'admin:' + row.id,
        ts: row.createdAt.toISOString(),
        kind: 'admin' as const,
        severity: (bad ? 'error' : warn ? 'warn' : 'info') as ActivitySeverity,
        title: row.method + ' ' + row.path,
        detail:
          row.statusCode === null
            ? '进行中 / 待核对'
            : String(row.statusCode) + (row.durationMs === null ? '' : ' · ' + row.durationMs + ' ms'),
        provenance: { kind: 'admin' as const, id: row.id, ref: null },
        isTodo: false,
      };
    });
  }
}
