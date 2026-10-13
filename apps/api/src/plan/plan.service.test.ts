/**
 * PlanService 日历聚合单元测试（PRD §4.4 验收锚点）。
 * 排期事实走假仓储；内容阶段走假台账——本服务只合流，不做判据推导。
 */
import { describe, expect, it } from 'vitest';
import type { ContentLedger } from '@walker/shared';
import { PlanService } from './plan.service';
import type { ActionRecord, ActionRepositoryPort } from '../ports/action.repository';
import type { ClueRecord, ClueRepositoryPort } from '../ports/clue.repository';
import type { ExecutionRecord, ExecutionRepositoryPort } from '../ports/execution.repository';
import type { SeedRecord, SeedRepositoryPort } from '../ports/seed.repository';
import type { ContentLedgerService } from '../content-ledger/content-ledger.service';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const NOW = new Date('2026-09-15T00:00:00.000Z');

function makeAction(overrides: Partial<ActionRecord>): ActionRecord {
  return {
    id: 'a-1',
    title: '排期项',
    note: null,
    kind: 'TASK',
    entityType: null,
    entityId: null,
    status: 'OPEN',
    plannedDate: null,
    dueAt: null,
    timezone: null,
    completedAt: null,
    evidenceRef: null,
    source: 'HUMAN',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function unusedPort(): never {
  throw new Error('not needed');
}

function makeHarness(
  actions: ActionRecord[],
  ledgerItems: ContentLedger['items'],
  process?: {
    clues?: ClueRecord[];
    seeds?: SeedRecord[];
    executions?: ExecutionRecord[];
    gitAvailable?: boolean;
  },
) {
  const repository: ActionRepositoryPort = {
    async create() { unusedPort(); },
    async ensureOpenForEntity() { unusedPort(); },
    async findById() { return null; },
    async listDue() { return []; },
    async list(input) {
      return actions
        .filter((record) => !input.status || record.status === input.status)
        .slice(0, input.limit);
    },
    async update() { unusedPort(); },
    async setCompletion() { unusedPort(); },
    async delete() { unusedPort(); },
  };
  const ledger = {
    async ledger(): Promise<ContentLedger> {
      return {
        items: ledgerItems,
        generatedAt: NOW.toISOString(),
        gitAvailable: process?.gitAvailable ?? true,
        publicationAvailable: true,
      };
    },
  } as unknown as ContentLedgerService;
  const clues: ClueRepositoryPort = {
    async create() { unusedPort(); },
    async list() { return process?.clues ?? []; },
    async findById() { return null; },
    async updatePoolStatus() { unusedPort(); },
  };
  const seeds: SeedRepositoryPort = {
    async create() { unusedPort(); },
    async findById() { return null; },
    async list() { return process?.seeds ?? []; },
    async linkClue() { unusedPort(); },
    async setPrimary() { unusedPort(); },
    async updateTwoQuestions() { unusedPort(); },
    async updateTopic() { unusedPort(); },
  };
  const executions: ExecutionRepositoryPort = {
    async create() { unusedPort(); },
    async findBySeedId() { return null; },
    async findById() { return null; },
    async list() { return process?.executions ?? []; },
    async deliver() { unusedPort(); },
    async review() { unusedPort(); },
  };
  return { service: new PlanService(repository, ledger, clues, seeds, executions) };
}

function ledgerItem(overrides: Partial<ContentLedger['items'][number]>): ContentLedger['items'][number] {
  return {
    slug: 'post-a',
    title: '文章 A',
    type: 'knowledge',
    group: 'article',
    stage: 'ready',
    visibility: 'public',
    missing: [],
    dirty: true,
    publication: { currentPublicHash: null, publishedHash: null, verifiedAt: null, indexedHash: null, latestAttemptStage: null },
    updatedAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('PlanService.calendar', () => {
  it('带日期的排期出现在对应日期格子（PRD §4.4 第 1 条）', async () => {
    const today = todayString();
    const { service } = makeHarness([makeAction({ plannedDate: today })], []);
    const calendar = await service.calendar({ from: today, to: today });
    expect(calendar.days).toHaveLength(1);
    expect(calendar.days[0]!.items.map((item) => item.id)).toEqual(['a-1']);
  });

  it('勾完成后不再出现在待办积压；完成项仍留在日历格子里可回查（PRD §4.4 第 2 条）', async () => {
    const today = todayString();
    const { service } = makeHarness(
      [
        makeAction({ id: 'open', plannedDate: null }),
        makeAction({ id: 'done-undated', plannedDate: null, status: 'DONE', completedAt: NOW }),
        makeAction({ id: 'done-dated', plannedDate: today, status: 'DONE', completedAt: NOW }),
      ],
      [],
    );
    const calendar = await service.calendar({ from: today, to: today });
    expect(calendar.undated.map((item) => item.id)).toEqual(['open']);
    expect(calendar.days[0]!.items.map((item) => item.id)).toEqual(['done-dated']);
  });

  it('「待上线」内容进入未排期列；落为 OPEN 排期后消失（PRD §4.4 第 3 条）', async () => {
    const ready = ledgerItem({ slug: 'post-a', stage: 'ready' });
    const before = makeHarness([], [ready]);
    const calendar = await before.service.calendar({ from: todayString(), to: todayString() });
    expect(calendar.unscheduledReady.map((item) => item.slug)).toEqual(['post-a']);

    const after = makeHarness(
      [makeAction({ entityType: 'CONTENT', entityId: 'post-a', plannedDate: todayString() })],
      [ready],
    );
    const scheduled = await after.service.calendar({ from: todayString(), to: todayString() });
    expect(scheduled.unscheduledReady).toEqual([]);
    expect(scheduled.days[0]!.items[0]).toMatchObject({ entityType: 'CONTENT', entityId: 'post-a' });
  });

  it('关联内容排期带实时阶段（读台账，不复制状态）；查不到即 null 不编造', async () => {
    const today = todayString();
    const { service } = makeHarness(
      [
        makeAction({ id: 'a-1', entityType: 'CONTENT', entityId: 'post-a', plannedDate: today }),
        makeAction({ id: 'a-2', entityType: 'CONTENT', entityId: 'ghost', plannedDate: today }),
      ],
      [ledgerItem({ slug: 'post-a', stage: 'live' })],
    );
    const calendar = await service.calendar({ from: today, to: today });
    const items = calendar.days[0]!.items;
    expect(items.find((item) => item.id === 'a-1')!.contentStage).toBe('live');
    expect(items.find((item) => item.id === 'a-2')!.contentStage).toBeNull();
  });

  it('逾期未完成有明确标记；已完成或未来排期不算逾期（PRD §4.4 第 4 条）', async () => {
    const today = todayString();
    const yesterday = shiftDate(today, -1);
    const tomorrow = shiftDate(today, 1);
    const { service } = makeHarness(
      [
        makeAction({ id: 'overdue', plannedDate: yesterday }),
        makeAction({ id: 'overdue-done', plannedDate: yesterday, status: 'DONE', completedAt: NOW }),
        makeAction({ id: 'future', plannedDate: tomorrow }),
      ],
      [],
    );
    const calendar = await service.calendar({ from: yesterday, to: tomorrow });
    const all = calendar.days.flatMap((day) => day.items);
    expect(all.find((item) => item.id === 'overdue')!.overdue).toBe(true);
    expect(all.find((item) => item.id === 'overdue-done')!.overdue).toBe(false);
    expect(all.find((item) => item.id === 'future')!.overdue).toBe(false);
  });

  it('窗口之外的逾期 OPEN 项仍出现在 overdue 列表（排期视图不丢历史逾期）', async () => {
    const today = todayString();
    const lastMonth = shiftDate(today, -40);
    const { service } = makeHarness(
      [makeAction({ id: 'old-overdue', plannedDate: lastMonth })],
      [],
    );
    const calendar = await service.calendar({ from: today, to: today });
    expect(calendar.overdue.map((item) => item.id)).toEqual(['old-overdue']);
    expect(calendar.days.flatMap((day) => day.items)).toEqual([]);
  });

  it('非法日期与倒置区间直接 400（不静默退回默认窗口）', async () => {
    const { service } = makeHarness([], []);
    await expect(service.calendar({ from: 'not-a-date' })).rejects.toSatisfy((error: unknown) => {
      const body = (error as { getResponse?: () => { message?: string } }).getResponse?.();
      return body?.message === 'invalid-from-date';
    });
    await expect(
      service.calendar({ from: '2026-09-20', to: '2026-09-10' }),
    ).rejects.toSatisfy((error: unknown) => {
      const body = (error as { getResponse?: () => { message?: string } }).getResponse?.();
      return body?.message === 'invalid-date-range';
    });
  });

  it('gitAvailable 透传台账事实（git 不可用时前端据此前端降「未知」）', async () => {
    const { service } = makeHarness([], [], { gitAvailable: false });
    const calendar = await service.calendar({
      from: todayString(),
      to: todayString(),
    });
    expect(calendar.gitAvailable).toBe(false);
  });
});

describe('PlanService.next', () => {
  it('候选线索给出入池动作', async () => {
    const { service } = makeHarness([], [], {
      clues: [
        {
          id: 'c1',
          body: '访客想学周报自动化',
          source: 'tools-visitor',
          poolStatus: 'candidate',
          anonId: null,
          createdAt: NOW,
        },
      ],
    });
    const next = await service.next();
    expect(next.actions).toEqual([
      {
        kind: 'pool-clue',
        id: 'c1',
        label: '入池线索',
        summary: '访客想学周报自动化',
      },
    ]);
  });

  it('主选摘要用人话，不用记录 id', async () => {
    const { service } = makeHarness([], [], {
      clues: [
        {
          id: 'c-in',
          body: '想学 AI 入门从哪开始比较好',
          source: 'manual-self',
          poolStatus: 'in-pool',
          anonId: null,
          createdAt: NOW,
        },
      ],
      seeds: [
        {
          id: 's1',
          title: 't-mtob3n',
          severity: null,
          selfInterest: null,
          primaryClueId: null,
          workflowStatus: 'INBOX',
          whyNow: null,
          links: [{ clueId: 'c-in', role: 'backup', poolStatus: 'in-pool' }],
          createdAt: NOW,
        },
      ],
    });
    const next = await service.next();
    expect(next.actions[0]?.kind).toBe('promote-seed');
    expect(next.actions[0]?.summary).toBe('想学 AI 入门从哪开始比较好');
  });
});
