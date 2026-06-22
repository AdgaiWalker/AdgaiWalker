import { describe, expect, it } from 'vitest';

import { suggestNextAction } from './suggest-next-action';

describe('suggestNextAction（P1-E02 结果导向下一步）', () => {
  it('successful → evaluate-asset（不自动注册 Skill）', () => {
    const suggestion = suggestNextAction({ result: 'successful', outcomeSummary: '正面反馈' });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.suggestedActionType).toBe('evaluate-asset');
    expect(suggestion!.reason).toBeTruthy();
    expect(suggestion!.suggestedExpectedOutcome).toBeTruthy();
  });

  it('partial → create-content（按场景拆分或补边界）', () => {
    const suggestion = suggestNextAction({ result: 'partial', outcomeSummary: '部分有效' });
    expect(suggestion!.suggestedActionType).toBe('create-content');
  });

  it('failed → update-content（复核方向，更新或下线）', () => {
    const suggestion = suggestNextAction({ result: 'failed', outcomeSummary: '未解决' });
    expect(suggestion!.suggestedActionType).toBe('update-content');
  });

  it('inconclusive → create-learning-request（补证）', () => {
    const suggestion = suggestNextAction({ result: 'inconclusive', outcomeSummary: '证据不足' });
    expect(suggestion!.suggestedActionType).toBe('create-learning-request');
  });

  it('纯函数：相同输入相同输出，不写入存储、不产生副作用', () => {
    const before = suggestNextAction({ result: 'successful', outcomeSummary: 'x' });
    const after = suggestNextAction({ result: 'successful', outcomeSummary: 'x' });
    expect(before).toEqual(after);
    expect(before!.reason).toBeTruthy();
    expect(before!.suggestedExpectedOutcome).toBeTruthy();
  });

  it('四个结果分支各自映射到不同的 actionType（无重叠）', () => {
    const types = (['successful', 'partial', 'failed', 'inconclusive'] as const).map(result =>
      suggestNextAction({ result, outcomeSummary: 'x' })!.suggestedActionType,
    );
    expect(new Set(types).size).toBe(4);
  });

  it('建议是"建议"而非自动执行：返回值不包含 actionId / workItemId 等执行态字段', () => {
    const suggestion = suggestNextAction({ result: 'successful', outcomeSummary: 'x' })!;
    expect(suggestion).not.toHaveProperty('actionId');
    expect(suggestion).not.toHaveProperty('workItemId');
    // 只有三个字段：建议类型、理由、预期结果文案
    expect(Object.keys(suggestion).sort()).toEqual([
      'reason',
      'suggestedActionType',
      'suggestedExpectedOutcome',
    ]);
  });
});
