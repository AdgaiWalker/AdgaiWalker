import { describe, expect, it } from 'vitest';
import {
  countAnswers,
  countAsks,
  rateOrNull,
  resolveStatsWindow,
  summarizeUsage,
} from './ops-stats.js';

describe('运营统计：按唯一实体计数（O06）', () => {
  it('提问数按唯一访客消息 id 去重，重复事件不抬高提问数', () => {
    const facts = countAsks({
      // 同一消息 id 出现两次（重复事件）只算一次
      visitorMessageIds: ['m1', 'm1', 'm2'],
      conversationIds: ['c1', 'c1'],
      turnIds: ['t1', 't1'],
      attemptCountByTurn: [1],
    });
    expect(facts.visitorMessages).toBe(2);
    expect(facts.conversations).toBe(1);
    expect(facts.turns).toBe(1);
    expect(facts.regenerationAttempts).toBe(0);
  });

  it('重新生成只增重生成数，不增提问/会话/轮次', () => {
    const base = {
      visitorMessageIds: ['m1'],
      conversationIds: ['c1'],
      turnIds: ['t1'],
    };
    const once = countAsks({ ...base, attemptCountByTurn: [1] });
    const regenerated = countAsks({ ...base, attemptCountByTurn: [4] });

    expect(regenerated.visitorMessages).toBe(once.visitorMessages);
    expect(regenerated.conversations).toBe(once.conversations);
    expect(regenerated.turns).toBe(once.turns);
    // 4 次尝试 = 3 次重生成（第 1 次是首次生成，不算重生成）
    expect(regenerated.regenerationAttempts).toBe(3);
  });
});

describe('运营统计：成功/降级/失败/未知分开（O06）', () => {
  it('失败与取消绝不算成功，也不伪装成"降级但可用"', () => {
    const facts = countAnswers({
      assistantMessages: [],
      runs: [
        { state: 'SUCCEEDED', aiUsedFlag: true, degradeReason: null },
        { state: 'SUCCEEDED', aiUsedFlag: false, degradeReason: 'ai-disabled' },
        { state: 'FAILED', aiUsedFlag: null, degradeReason: null },
        { state: 'CANCELLED', aiUsedFlag: null, degradeReason: null },
        { state: 'UNKNOWN', aiUsedFlag: null, degradeReason: null },
      ],
    });
    expect(facts.succeeded).toBe(1);
    expect(facts.degraded).toBe(1);
    expect(facts.failed).toBe(2);
    expect(facts.unknown).toBe(1);
    // 合计 = 运行总数：没有一条被丢掉，也没有一条被重复算
    expect(facts.succeeded + facts.degraded + facts.failed + facts.unknown).toBe(5);
  });

  it('缺 aiUsedFlag 的运行计入 unknown，不猜成成功', () => {
    const facts = countAnswers({
      assistantMessages: [],
      runs: [{ state: 'SUCCEEDED', aiUsedFlag: null, degradeReason: null }],
    });
    expect(facts.succeeded).toBe(0);
    expect(facts.unknown).toBe(1);
  });

  it('交付确认独立于生成成功：生成成功不等于访客已收到', () => {
    const facts = countAnswers({
      assistantMessages: [{ delivery: 'ack' }, { delivery: 'sent' }, { delivery: 'pending' }],
      runs: [
        { state: 'SUCCEEDED', aiUsedFlag: true, degradeReason: null },
        { state: 'SUCCEEDED', aiUsedFlag: true, degradeReason: null },
        { state: 'SUCCEEDED', aiUsedFlag: true, degradeReason: null },
      ],
    });
    expect(facts.succeeded).toBe(3);
    expect(facts.deliveryAck).toBe(1);
    expect(facts.deliveryUnconfirmed).toBe(2);
    // 三个成功里只有一个是确认送达的
    expect(facts.deliveryAck).toBeLessThan(facts.succeeded);
  });
});

describe('运营统计：缺失 ≠ 0（O06）', () => {
  it('没有带用量的运行时总量为 null，且覆盖率是 0 而不是 null（有分母）', () => {
    const usage = summarizeUsage([{ tokensIn: null, tokensOut: null }, { tokensIn: null, tokensOut: null }]);
    expect(usage.runs).toBe(2);
    expect(usage.runsWithUsage).toBe(0);
    expect(usage.coverage).toBe(0);
    // 关键：不是 0，而是 null——"没测到"与"测到 0"含义不同
    expect(usage.tokensIn).toBeNull();
    expect(usage.tokensOut).toBeNull();
    expect(usage.totalTokens).toBeNull();
  });

  it('一条运行都没有时没有分母，覆盖率为 null', () => {
    const usage = summarizeUsage([]);
    expect(usage.coverage).toBeNull();
    expect(usage.totalTokens).toBeNull();
  });

  it('部分缺失只累加明确记录的部分，并用覆盖率说明缺口', () => {
    const usage = summarizeUsage([
      { tokensIn: 100, tokensOut: 50 },
      { tokensIn: null, tokensOut: null },
    ]);
    expect(usage.runs).toBe(2);
    expect(usage.runsWithUsage).toBe(1);
    expect(usage.coverage).toBe(0.5);
    expect(usage.tokensIn).toBe(100);
    expect(usage.tokensOut).toBe(50);
    expect(usage.totalTokens).toBe(150);
  });

  it('明确记录的 0 仍然是 0（测到 0 与没测到必须区分开）', () => {
    const usage = summarizeUsage([{ tokensIn: 0, tokensOut: 0 }]);
    expect(usage.runsWithUsage).toBe(1);
    expect(usage.coverage).toBe(1);
    expect(usage.totalTokens).toBe(0);
  });
});

describe('运营统计：不制造没有分母的比率（O06）', () => {
  it('分母为 0 一律返回 null，不用 0% 或 100% 冒充留存率/转化率', () => {
    expect(rateOrNull(0, 0)).toBeNull();
    expect(rateOrNull(5, 0)).toBeNull();
    expect(rateOrNull(0, -1)).toBeNull();
  });

  it('分母非零时给出真实比率', () => {
    expect(rateOrNull(1, 4)).toBe(0.25);
    expect(rateOrNull(0, 4)).toBe(0);
  });
});

describe('运营统计：窗口（O06）', () => {
  it('三个窗口的小时数与区间长度一致', () => {
    const now = new Date('2026-09-27T00:00:00.000Z');
    for (const [window, hours] of [['24h', 24], ['7d', 168], ['30d', 720]] as const) {
      const resolved = resolveStatsWindow(window, now);
      expect(resolved.hours).toBe(hours);
      expect(new Date(resolved.to).getTime() - new Date(resolved.from).getTime()).toBe(hours * 3_600_000);
      expect(resolved.to).toBe(now.toISOString());
    }
  });
});
