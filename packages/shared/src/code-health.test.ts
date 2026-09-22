/**
 * 代码图谱的结构体检（纯函数）。
 *
 * 这四项是**门禁的唯一依据**，且必须全部「机器自证」——不需要任何人工规则文件：
 * 环依赖、解析不到的 import、从真实入口不可达的死文件、packages 反向依赖 apps。
 * 风格项（超级枢纽）只告警，不进基线。
 */
import { describe, expect, it } from 'vitest';
import { buildCodeGraph, inspectCodeGraph, type CodeImport, type CodeSourceFile } from './code-graph.js';

function imp(
  specifier: string,
  outcome: CodeImport['outcome'],
  target: string | null = null,
  form: CodeImport['form'] = 'static',
): CodeImport {
  return { specifier, form, outcome, target };
}

function file(path: string, imports: CodeImport[] = []): CodeSourceFile {
  return { path, created: '2026-01-01T00:00:00Z', imports };
}

describe('环依赖', () => {
  it('A → B → A 报出一个环，成员按路径排序（便于与基线逐条比对）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [imp('./b', 'code', 'apps/web/src/b.ts')]),
        file('apps/web/src/b.ts', [imp('./a', 'code', 'apps/web/src/a.ts')]),
      ],
    });
    const health = inspectCodeGraph(graph, { entries: ['apps/web/src/a.ts'] });
    expect(health.cycles).toEqual([['apps/web/src/a.ts', 'apps/web/src/b.ts']]);
  });

  it('不成环时为空（单向依赖不是环）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [imp('./b', 'code', 'apps/web/src/b.ts')]),
        file('apps/web/src/b.ts'),
      ],
    });
    expect(inspectCodeGraph(graph, { entries: ['apps/web/src/a.ts'] }).cycles).toEqual([]);
  });

  it('三元环整体报一条，不拆成多条两两环', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [imp('./b', 'code', 'apps/web/src/b.ts')]),
        file('apps/web/src/b.ts', [imp('./c', 'code', 'apps/web/src/c.ts')]),
        file('apps/web/src/c.ts', [imp('./a', 'code', 'apps/web/src/a.ts')]),
      ],
    });
    const health = inspectCodeGraph(graph, { entries: ['apps/web/src/a.ts'] });
    expect(health.cycles).toEqual([
      ['apps/web/src/a.ts', 'apps/web/src/b.ts', 'apps/web/src/c.ts'],
    ]);
  });
});

describe('解析不到的 import（幽灵节点）', () => {
  it('列出说明符与引入它的文件，文件已排序去重', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [imp('./nope', 'unresolved'), imp('@walker/gone', 'unresolved')]),
        file('apps/web/src/b.ts', [imp('./nope', 'unresolved')]),
      ],
    });
    const health = inspectCodeGraph(graph, { entries: [] });
    expect(health.unresolved).toEqual([
      { specifier: './nope', importers: ['apps/web/src/a.ts', 'apps/web/src/b.ts'] },
      { specifier: '@walker/gone', importers: ['apps/web/src/a.ts'] },
    ]);
  });

  it('没有幽灵时为空数组', () => {
    const graph = buildCodeGraph({
      files: [file('apps/web/src/a.ts', [imp('./b', 'code', 'apps/web/src/b.ts')]), file('apps/web/src/b.ts')],
    });
    expect(inspectCodeGraph(graph, { entries: [] }).unresolved).toEqual([]);
  });
});

describe('从真实入口不可达的死文件', () => {
  it('入口可达链上的文件不算死文件，脱离入口的才算', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/main.tsx', [imp('./app', 'code', 'apps/web/src/app.tsx')]),
        file('apps/web/src/app.tsx'),
        file('apps/web/src/abandoned.ts'),
      ],
    });
    const health = inspectCodeGraph(graph, { entries: ['apps/web/src/main.tsx'] });
    expect(health.unreachable).toEqual(['apps/web/src/abandoned.ts']);
    expect(health.entries).toEqual(['apps/web/src/main.tsx']);
  });

  it('动态导入也算可达（懒加载的页面不是死代码）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/main.tsx', [
          imp('./lazy', 'code', 'apps/web/src/lazy.ts', 'dynamic'),
        ]),
        file('apps/web/src/lazy.ts'),
      ],
    });
    expect(inspectCodeGraph(graph, { entries: ['apps/web/src/main.tsx'] }).unreachable).toEqual([]);
  });

  it('未在图中存在的入口不产生虚假可达性', () => {
    const graph = buildCodeGraph({ files: [file('apps/web/src/only.ts')] });
    const health = inspectCodeGraph(graph, { entries: ['apps/web/src/not-here.ts'] });
    expect(health.entries).toEqual([]);
    expect(health.unreachable).toEqual(['apps/web/src/only.ts']);
  });
});

describe('packages 反向依赖 apps', () => {
  it('包依赖应用是越界，必须报出来', () => {
    const graph = buildCodeGraph({
      files: [
        file('packages/shared/src/x.ts', [imp('../../apps/web/src/y', 'code', 'apps/web/src/y.ts')]),
        file('apps/web/src/y.ts'),
      ],
    });
    const health = inspectCodeGraph(graph, { entries: [] });
    expect(health.reverseDependencies).toEqual([
      { from: 'packages/shared/src/x.ts', to: 'apps/web/src/y.ts' },
    ]);
  });

  it('应用依赖包是正常方向，不报（本仓大量如此）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/api/src/main.ts', [imp('@walker/shared', 'code', 'packages/shared/src/index.ts')]),
        file('packages/shared/src/index.ts'),
      ],
    });
    expect(
      inspectCodeGraph(graph, { entries: ['apps/api/src/main.ts'] }).reverseDependencies,
    ).toEqual([]);
  });
});

describe('风格项（只告警，不进基线）', () => {
  it('按真实依赖度数排出超级枢纽，取前 N 且确定性排序', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/hub.ts'),
        file('apps/web/src/a.ts', [imp('./hub', 'code', 'apps/web/src/hub.ts')]),
        file('apps/web/src/b.ts', [imp('./hub', 'code', 'apps/web/src/hub.ts')]),
        file('apps/web/src/leaf.ts'),
      ],
    });
    const health = inspectCodeGraph(graph, { entries: [], hubLimit: 2 });
    expect(health.hubs).toEqual([
      { path: 'apps/web/src/hub.ts', linkDegree: 2 },
      { path: 'apps/web/src/a.ts', linkDegree: 1 },
    ]);
  });

  it('超大文件按行数阈值挑出（未统计行数的文件不计入，避免误报）', () => {
    const graph = buildCodeGraph({
      files: [
        { ...file('apps/web/src/big.ts'), lines: 900 },
        { ...file('apps/web/src/exact.ts'), lines: 500 },
        { ...file('apps/web/src/small.ts'), lines: 499 },
        file('apps/web/src/unknown.ts'),
      ],
    });
    expect(inspectCodeGraph(graph, { entries: [] }).largeFiles).toEqual([
      { path: 'apps/web/src/big.ts', lines: 900 },
      { path: 'apps/web/src/exact.ts', lines: 500 },
    ]);
  });
});

describe('确定性', () => {
  it('同一图多次体检结果完全一致', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [imp('./b', 'code', 'apps/web/src/b.ts'), imp('./nope', 'unresolved')]),
        file('apps/web/src/b.ts', [imp('./a', 'code', 'apps/web/src/a.ts')]),
      ],
    });
    const once = inspectCodeGraph(graph, { entries: ['apps/web/src/a.ts'] });
    const twice = inspectCodeGraph(graph, { entries: ['apps/web/src/a.ts'] });
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});
