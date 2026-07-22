import { describe, expect, it } from 'vitest';
import { pickNextActions } from './next-actions.js';

describe('下一动作 pickNextActions', () => {
  it('有候选线索时优先给出入池动作', () => {
    const actions = pickNextActions({
      clues: [
        {
          id: 'c-candidate',
          body: '访客想学周报自动化',
          poolStatus: 'candidate',
        },
      ],
      seeds: [],
      executions: [],
    });

    expect(actions).toEqual([
      {
        kind: 'pool-clue',
        id: 'c-candidate',
        label: '入池线索',
        summary: '访客想学周报自动化',
      },
    ]);
  });

  it('有已入池线索且题苗无主选时给出主选动作', () => {
    const actions = pickNextActions({
      clues: [
        {
          id: 'c-in',
          body: '已入池的线索',
          poolStatus: 'in-pool',
        },
      ],
      seeds: [{ id: 's1', title: '周报题苗', primaryClueId: null }],
      executions: [],
    });

    expect(actions).toEqual([
      {
        kind: 'promote-seed',
        id: 's1',
        label: '主选题苗',
        summary: '周报题苗',
      },
    ]);
  });

  it('已交付未检验的执行给出检验动作', () => {
    const actions = pickNextActions({
      clues: [],
      seeds: [],
      executions: [
        {
          id: 'e-rev',
          seedId: 's1',
          status: 'delivered',
          deliveryUrl: 'https://iwalk.pro/posts/x',
          outcome: null,
        },
      ],
    });

    expect(actions).toEqual([
      {
        kind: 'review-execution',
        id: 'e-rev',
        label: '检验执行',
        summary: 'https://iwalk.pro/posts/x',
      },
    ]);
  });

  it('进行中未交付的执行给出交付动作', () => {
    const actions = pickNextActions({
      clues: [],
      seeds: [],
      executions: [
        {
          id: 'e-del',
          seedId: 's1',
          status: 'doing',
          deliveryUrl: null,
          outcome: null,
        },
      ],
    });

    expect(actions).toEqual([
      {
        kind: 'deliver-execution',
        id: 'e-del',
        label: '交付执行',
        summary: '待交付',
      },
    ]);
  });

  it('优先级：入池 > 主选 > 检验 > 交付，同类至多一条，最多三条', () => {
    const actions = pickNextActions({
      clues: [
        { id: 'c1', body: '候选甲', poolStatus: 'candidate' },
        { id: 'c2', body: '候选乙', poolStatus: 'candidate' },
        { id: 'c3', body: '入池丙', poolStatus: 'in-pool' },
      ],
      seeds: [
        { id: 's1', title: '苗一', primaryClueId: null },
        { id: 's2', title: '苗二', primaryClueId: null },
      ],
      executions: [
        {
          id: 'e1',
          seedId: 's0',
          status: 'delivered',
          deliveryUrl: 'https://a.example/1',
          outcome: null,
        },
        {
          id: 'e2',
          seedId: 's0',
          status: 'doing',
          deliveryUrl: null,
          outcome: null,
        },
      ],
    });

    expect(actions.map((a) => a.kind)).toEqual([
      'pool-clue',
      'promote-seed',
      'review-execution',
    ]);
    expect(actions).toHaveLength(3);
    expect(actions[0]?.id).toBe('c1');
    expect(actions[1]?.id).toBe('s1');
    expect(actions[2]?.id).toBe('e1');
  });

  it('无线索题苗执行时返回空列表', () => {
    expect(
      pickNextActions({ clues: [], seeds: [], executions: [] }),
    ).toEqual([]);
  });

  it('仅有已丢弃线索时不给出入池', () => {
    expect(
      pickNextActions({
        clues: [{ id: 'c-d', body: '丢了', poolStatus: 'discarded' }],
        seeds: [],
        executions: [],
      }),
    ).toEqual([]);
  });

  it('无线索入池时不给出主选', () => {
    expect(
      pickNextActions({
        clues: [{ id: 'c', body: '还是候选', poolStatus: 'candidate' }],
        seeds: [{ id: 's1', title: '苗', primaryClueId: null }],
        executions: [],
      }),
    ).toEqual([
      {
        kind: 'pool-clue',
        id: 'c',
        label: '入池线索',
        summary: '还是候选',
      },
    ]);
  });
});
