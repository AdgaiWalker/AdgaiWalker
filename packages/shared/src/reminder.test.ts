import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_TIMEZONE,
  isValidTimeZone,
  normalizeReviewWindow,
  reminderOccurrenceKey,
  classifyReminderDue,
  countReminderItems,
  resolveActionDue,
  utcToZonedDate,
  zonedWallTimeToUtc,
} from './reminder.js';

describe('提醒时区换算（O01：日期 → UTC → 日期 可还原）', () => {
  it('站点时区当日 00:00 到期，存 UTC 且保留生成时区', () => {
    const due = resolveActionDue({ plannedDate: '2026-09-26' });
    expect(due).toEqual({
      dueAt: '2026-09-25T16:00:00.000Z',
      timezone: DEFAULT_SITE_TIMEZONE,
      source: 'date',
    });
  });

  it('UTC → 站点日期可无损还原（含跨日）', () => {
    const due = resolveActionDue({ plannedDate: '2026-09-26' });
    expect(utcToZonedDate(due.dueAt!, DEFAULT_SITE_TIMEZONE)).toBe('2026-09-26');
    // 同日 UTC 晚间仍属站点次日
    expect(utcToZonedDate('2026-09-25T16:00:00.000Z', DEFAULT_SITE_TIMEZONE)).toBe('2026-09-26');
    expect(utcToZonedDate('2026-09-25T15:59:59.000Z', DEFAULT_SITE_TIMEZONE)).toBe('2026-09-25');
  });

  it('未设日期则未排期，且不保留伪时区（无瞬时即无生成时区）', () => {
    expect(resolveActionDue({ plannedDate: null })).toEqual({
      dueAt: null,
      timezone: null,
      source: null,
    });
    expect(resolveActionDue({ plannedDate: '' }).timezone).toBeNull();
  });

  it('非法时区与非法日期一律拒绝，不静默回退', () => {
    expect(() => resolveActionDue({ plannedDate: '2026-09-26', timezone: 'Not/AZone' })).toThrow('invalid-timezone');
    expect(() => resolveActionDue({ plannedDate: '2026-9-6' })).toThrow('invalid-planned-date');
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('不同时区产出不同瞬时（换算不是写死的偏移量）', () => {
    const shanghai = resolveActionDue({ plannedDate: '2026-09-26', timezone: 'Asia/Shanghai' });
    const utc = resolveActionDue({ plannedDate: '2026-09-26', timezone: 'UTC' });
    const tokyo = resolveActionDue({ plannedDate: '2026-09-26', timezone: 'Asia/Tokyo' });
    expect(shanghai.dueAt).toBe('2026-09-25T16:00:00.000Z');
    expect(utc.dueAt).toBe('2026-09-26T00:00:00.000Z');
    expect(tokyo.dueAt).toBe('2026-09-25T15:00:00.000Z');
  });

  it('夏令时边界（America/New_York 3 月切换）仍还原为同一日期', () => {
    // 切换前（EST, UTC-5）与切换后（EDT, UTC-4）偏移不同
    const before = zonedWallTimeToUtc({ year: 2026, month: 3, day: 7, hour: 0, minute: 0, second: 0 }, 'America/New_York');
    const after = zonedWallTimeToUtc({ year: 2026, month: 3, day: 9, hour: 0, minute: 0, second: 0 }, 'America/New_York');
    expect(before).toBe('2026-03-07T05:00:00.000Z');
    expect(after).toBe('2026-03-09T04:00:00.000Z');
    expect(utcToZonedDate(before, 'America/New_York')).toBe('2026-03-07');
    expect(utcToZonedDate(after, 'America/New_York')).toBe('2026-03-09');
  });
});

describe('提醒发生去重键（重复扫描不得穿透唯一约束）', () => {
  it('同事项同到期同时区 → 同键；任一变化 → 不同键', () => {
    const base = { actionId: 'act-1', dueAt: '2026-09-25T16:00:00.000Z', timezone: 'Asia/Shanghai' };
    expect(reminderOccurrenceKey(base)).toBe(reminderOccurrenceKey({ ...base }));
    expect(reminderOccurrenceKey(base)).not.toBe(reminderOccurrenceKey({ ...base, dueAt: '2026-09-26T16:00:00.000Z' }));
    expect(reminderOccurrenceKey(base)).not.toBe(reminderOccurrenceKey({ ...base, actionId: 'act-2' }));
    // 键不含扫描时间：重复扫描必然命中同一键
    expect(reminderOccurrenceKey(base)).toBe('act-1@2026-09-25T16:00:00.000Z@Asia/Shanghai');
  });
});

describe('提醒箱到期分类（O04：服务端算好，前端只展示）', () => {
  it('按站点本地日期分类：逾期 / 今天 / 即将 / 未排期', () => {
    const today = '2026-09-26';
    expect(classifyReminderDue({ plannedDate: '2026-09-25', today })).toBe('overdue');
    expect(classifyReminderDue({ plannedDate: '2026-09-26', today })).toBe('today');
    expect(classifyReminderDue({ plannedDate: '2026-09-27', today })).toBe('upcoming');
    expect(classifyReminderDue({ plannedDate: null, today })).toBe('undated');
  });

  it('跨日边界用本地日期比较，不被 UTC 日期带偏', () => {
    // 站点 2026-09-26 00:00 = UTC 2026-09-25T16:00Z：
    // 若误用 UTC 日期（25 日），当天到期会被错判成「已到期」。
    const timezone = 'Asia/Shanghai';
    const justAfterMidnight = zonedWallTimeToUtc(
      { year: 2026, month: 9, day: 26, hour: 0, minute: 0, second: 0 }, timezone,
    );
    const today = utcToZonedDate(justAfterMidnight, timezone);
    expect(today).toBe('2026-09-26');
    expect(classifyReminderDue({ plannedDate: '2026-09-26', today })).toBe('today');
    // 同一瞬时的 UTC 日期确实是前一天，说明这里必须用本地日期
    expect(justAfterMidnight.slice(0, 10)).toBe('2026-09-25');
  });

  it('计数只算未忽略项：忽略的到期不抬高待办数', () => {
    const base = {
      title: 't', note: null, status: 'OPEN' as const, timezone: 'Asia/Shanghai',
      dueAt: null, hasPendingOccurrence: false, contentSlug: null,
    };
    const items = [
      { ...base, actionId: 'a', plannedDate: '2026-09-20', dueState: 'overdue' as const, occurrenceOutcome: null },
      { ...base, actionId: 'b', plannedDate: '2026-09-20', dueState: 'overdue' as const, occurrenceOutcome: 'IGNORED' as const },
      { ...base, actionId: 'c', plannedDate: '2026-09-26', dueState: 'today' as const, occurrenceOutcome: 'PENDING' as const },
      { ...base, actionId: 'd', plannedDate: null, dueState: 'undated' as const, occurrenceOutcome: null },
    ];
    expect(countReminderItems(items)).toEqual({ overdue: 1, today: 1, upcoming: 0, undated: 1 });
  });
});

describe('复盘观察窗口（O01：行为、观察窗口、下一次尝试）', () => {
  it('接受有序窗口并规范为站点本地日期', () => {
    expect(normalizeReviewWindow({ windowStart: '2026-09-01', windowEnd: '2026-09-30' }))
      .toEqual({ windowStart: '2026-09-01', windowEnd: '2026-09-30' });
  });

  it('允许只写一端或都不写（自由文本复盘不被强制方法论）', () => {
    expect(normalizeReviewWindow({ windowStart: '2026-09-01' })).toEqual({ windowStart: '2026-09-01', windowEnd: null });
    expect(normalizeReviewWindow({})).toEqual({ windowStart: null, windowEnd: null });
  });

  it('起止颠倒或日期非法一律拒绝', () => {
    expect(() => normalizeReviewWindow({ windowStart: '2026-09-30', windowEnd: '2026-09-01' })).toThrow('invalid-review-window');
    expect(() => normalizeReviewWindow({ windowStart: 'bad' })).toThrow('invalid-planned-date');
  });
});
