/**
 * 债务身份与对账（纯函数）。
 *
 * 这里锁的是**门禁会不会误报**：顺序变化、引入方增减、说明符重排都不该算「新增」。
 * 一旦这里松了，门禁天天喊「新增硬伤」而其实什么都没变，很快就会被无视 ——
 * 那比没有门禁更糟。
 */
import { describe, expect, it } from 'vitest';
import {
  acceptedDebtFromHealth,
  acceptedDebtItems,
  codeDebtItems,
  cycleDebtKey,
  diffCodeDebt,
  reverseDebtKey,
  type AcceptedCodeDebt,
} from './code-debt.js';

const empty: AcceptedCodeDebt = {
  cycles: [],
  unresolved: [],
  unreachable: [],
  reverseDependencies: [],
};

describe('债务身份', () => {
  it('环的 key 与成员顺序、起点无关（同一个环永远同一个 key）', () => {
    const a = cycleDebtKey(['b.ts', 'a.ts', 'c.ts']);
    const b = cycleDebtKey(['c.ts', 'b.ts', 'a.ts']);
    expect(a).toBe(b);
    expect(a).toBe('a.ts → b.ts → c.ts');
  });

  it('方向相反的边是两个不同的身份', () => {
    expect(reverseDebtKey({ from: 'x', to: 'y' })).not.toBe(reverseDebtKey({ from: 'y', to: 'x' }));
  });

  it('解析不到的引用以说明符为身份，引入方只进说明文字', () => {
    const [item] = codeDebtItems({
      cycles: [],
      unresolved: [{ specifier: './gone', importers: ['a.ts', 'b.ts'] }],
      unreachable: [],
      reverseDependencies: [],
    });
    expect(item).toEqual({
      category: 'unresolved',
      key: './gone',
      detail: './gone ← a.ts、b.ts',
    });
  });

  it('基线里的引用没有引入方时，说明文字不留下空箭头', () => {
    const [item] = acceptedDebtItems({ ...empty, unresolved: ['./gone'] });
    expect(item?.detail).toBe('./gone');
  });
});

describe('对账', () => {
  it('同一条债务换个顺序、加个引入方，都不算新增', () => {
    const diff = diffCodeDebt(
      {
        ...empty,
        cycles: [['b.ts', 'a.ts']],
        unresolved: ['./gone'],
        unreachable: ['x.ts'],
      },
      {
        ...empty,
        cycles: [['a.ts', 'b.ts']],
        unresolved: ['./gone'],
        unreachable: ['x.ts'],
      },
    );
    expect(diff.added).toEqual([]);
    expect(diff.resolved).toEqual([]);
  });

  it('真正多出来的才算新增，并分到对应分类', () => {
    const diff = diffCodeDebt(
      { ...empty, unreachable: ['x.ts', 'new.ts'] },
      { ...empty, unreachable: ['x.ts'] },
    );
    expect(diff.added).toEqual([
      { category: 'unreachable', key: 'new.ts', detail: 'new.ts' },
    ]);
    expect(diff.categories.find((entry) => entry.category === 'unreachable')).toEqual({
      category: 'unreachable',
      accepted: 1,
      current: 2,
      added: 1,
      resolved: 0,
    });
  });

  it('基线里还清的那条进 resolved（可据此收敛基线）', () => {
    const diff = diffCodeDebt(empty, { ...empty, unreachable: ['x.ts'] });
    expect(diff.added).toEqual([]);
    expect(diff.resolved).toEqual([
      { category: 'unreachable', key: 'x.ts', detail: 'x.ts' },
    ]);
  });

  it('不同分类里的同名条目互不干扰', () => {
    const diff = diffCodeDebt(
      { ...empty, unreachable: ['./a'] },
      { ...empty, unresolved: ['./a'] },
    );
    expect(diff.added).toEqual([
      { category: 'unreachable', key: './a', detail: './a' },
    ]);
    expect(diff.resolved).toEqual([
      { category: 'unresolved', key: './a', detail: './a' },
    ]);
  });

  it('从体检结果直接取出基线形状（写基线时用，不另做转换）', () => {
    const accepted = acceptedDebtFromHealth({
      cycles: [['a.ts', 'b.ts']],
      unresolved: [{ specifier: './gone', importers: ['a.ts'] }],
      unreachable: ['x.ts'],
      reverseDependencies: [{ from: 'packages/p.ts', to: 'apps/a.ts' }],
    });
    expect(accepted).toEqual({
      cycles: [['a.ts', 'b.ts']],
      unresolved: ['./gone'],
      unreachable: ['x.ts'],
      reverseDependencies: [{ from: 'packages/p.ts', to: 'apps/a.ts' }],
    });
    // 取出来再摊回去，往返之后身份不变
    expect(acceptedDebtItems(accepted).map((item) => item.key)).toEqual([
      'a.ts → b.ts',
      './gone',
      'x.ts',
      'packages/p.ts → apps/a.ts',
    ]);
  });
});
