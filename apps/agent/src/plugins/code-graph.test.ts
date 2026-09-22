/**
 * code-graph 插件：读产物、答四个问题。
 *
 * fixture 用 `buildCodeGraph` 现造（而不是手写 JSON）—— 这样测试读的**就是真实产物形状**，
 * 模型一变测试先红，而不是插件与产物悄悄错配。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import {
  CODE_GRAPH_SCHEMA_VERSION,
  buildCodeGraph,
  type CodeGraph,
  type CodeSourceFile,
} from '@walker/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { CodeGraphService, IMPACT_LIST_LIMIT, type CodeGraphConfig } from './code-graph.js';

const dir = mkdtempSync(path.join(tmpdir(), 'walker-codegraph-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const A = 'apps/web/src/a.ts';
const B = 'apps/web/src/b.ts';
const C = 'apps/web/src/c.ts';
const D = 'apps/api/src/d.ts';
const E = 'apps/web/src/e.ts';

function graphFixture(): CodeGraph {
  const link = (specifier: string, target: string) =>
    ({ specifier, form: 'static' as const, outcome: 'code' as const, target });
  const files: CodeSourceFile[] = [
    { path: A, created: '', lines: 10, imports: [link('./b', B)] },
    { path: B, created: '', lines: 20, imports: [link('./c', C)] },
    { path: C, created: '', lines: 30, imports: [] },
    { path: D, created: '', lines: 40, imports: [link('@walker/shared', B)] },
    { path: E, created: '', lines: 50, imports: [link('./a', A)] },
  ];
  return buildCodeGraph({ files, now: '2026-01-01T00:00:00Z' });
}

const healthFixture = {
  schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
  entries: [A],
  cycles: [[A, B]],
  unresolved: [{ specifier: './gone', importers: [A] }],
  unreachable: [C, D],
  reverseDependencies: [{ from: 'packages/shared/src/x.ts', to: A }],
  hubs: [{ path: B, linkDegree: 9 }],
  largeFiles: [{ path: B, lines: 800 }],
  nominated: [{ path: C, nominatedBy: [D] }],
  sourceCommit: 'abc1234',
  generatedAt: '2026-09-15T00:00:00.000Z',
  counts: {
    files: 5,
    attachments: 0,
    tags: 1,
    ghosts: 1,
    edges: { total: 5, dependency: 4 },
  },
};

/** 写一份完整产物到临时目录，返回配置；health 传 false 缺席、传对象则自定义内容 */
function withArtifacts(options: { health?: boolean | object; graph?: unknown } = {}): CodeGraphConfig {
  const graphFile = path.join(dir, `codegraph-${Math.random().toString(36).slice(2)}.json`);
  const healthFile = path.join(dir, `codegraph-health-${Math.random().toString(36).slice(2)}.json`);
  // 内存图包上落盘元数据：测试读的**就是真实产物形状**（带 schemaVersion）
  writeFileSync(
    graphFile,
    JSON.stringify({ schemaVersion: CODE_GRAPH_SCHEMA_VERSION, ...(options.graph ?? graphFixture()) }),
  );
  if (options.health !== false) {
    writeFileSync(
      healthFile,
      JSON.stringify(options.health === undefined || options.health === true ? healthFixture : options.health),
    );
  }
  return { codeGraphPath: graphFile, healthPath: healthFile };
}

function load(config: CodeGraphConfig = withArtifacts()): CodeGraphService {
  return new CodeGraphService(new Context(), config);
}

describe('产物读取', () => {
  it('坏产物（缺 edges）启动即失败，并说清是哪个文件、怎么补', () => {
    expect(() => load(withArtifacts({ graph: { nodes: [] } }))).toThrow(/codegraph\.json/);
  });

  it('体检产物缺失只降级健康查询，不牵连依赖查询', () => {
    const service = load(withArtifacts({ health: false }));
    expect(service.healthSummary()).toMatchObject({ error: 'health-unavailable' });
    // 依赖查询仍然可用 —— 两者的价值不对等，不该被一起拖死
    expect(service.dependents('c.ts')).toMatchObject({ files: [B] });
  });

  it('上一版体检产物（缺 largeFiles）回结构化 error，绝不在 .length 处抛 TypeError', () => {
    // 这正是评审抓到的缺陷：旧实现只查 2/8 个字段，旧产物放行后在 style 里崩
    const { largeFiles: _dropped, ...legacy } = healthFixture;
    const service = load(withArtifacts({ health: legacy }));
    expect(service.healthSummary()).toMatchObject({ error: 'health-unavailable' });
  });
});

describe('dependencies：它依赖谁', () => {
  it('唯一后缀即可命中，返回直接依赖与边的类型', () => {
    const result = load().dependencies('a.ts');
    if ('error' in result) throw new Error(result.hint);
    expect(result.file).toMatchObject({ path: A, app: 'apps/web', lines: 10 });
    expect(result.files).toEqual([B]);
    expect(result.edges).toEqual([{ from: A, to: B, kind: 'link' }]);
    expect(result.direction).toBe('out');
  });

  it('深度 2 会展开到间接依赖', () => {
    const result = load().dependencies(A, 2);
    if ('error' in result) throw new Error(result.hint);
    expect(result.files).toEqual([B, C]);
  });
});

describe('dependents：谁依赖它', () => {
  it('方向与 dependencies 相反（同一份图，答案完全不同）', () => {
    const service = load();
    const dependents = service.dependents('b.ts');
    if ('error' in dependents) throw new Error(dependents.hint);
    // 结果按路径排序，故 apps/api 在前
    expect(dependents.files).toEqual([D, A]);
    expect(dependents.direction).toBe('in');

    const dependencies = service.dependencies('b.ts');
    if ('error' in dependencies) throw new Error(dependencies.hint);
    expect(dependencies.files).toEqual([C]);
  });
});

describe('impact：改动影响面', () => {
  it('分开直接与间接依赖者，并按工作区单元归堆', () => {
    const result = load().impact('b.ts');
    if ('error' in result) throw new Error(result.hint);
    expect(result.center).toBe(B);
    expect(result.direct).toEqual([D, A]);
    expect(result.transitive).toEqual([E]);
    expect(result.byApp).toEqual([
      { app: 'apps/web', count: 2 },
      { app: 'apps/api', count: 1 },
    ]);
  });

  it('枢纽文件的影响面会被截断，但总数如实回报（不静默丢信息）', () => {
    // 61 个叶子都经 middle 依赖 hub：传递层超过上限，必须体现为「截断 + 总数」
    const middle = 'apps/web/src/middle.ts';
    const leaves = 61;
    const files: CodeSourceFile[] = [
      { path: 'apps/web/src/hub.ts', created: '', imports: [] },
      {
        path: middle,
        created: '',
        imports: [
          { specifier: './hub', form: 'static', outcome: 'code', target: 'apps/web/src/hub.ts' },
        ],
      },
    ];
    for (let index = 0; index < leaves; index += 1) {
      files.push({
        path: `apps/web/src/leaf-${String(index).padStart(3, '0')}.ts`,
        created: '',
        imports: [{ specifier: '../middle', form: 'static', outcome: 'code', target: middle }],
      });
    }
    const result = load(
      withArtifacts({ graph: buildCodeGraph({ files, now: '2026-01-01T00:00:00Z' }) }),
    ).impact('hub.ts');
    if ('error' in result) throw new Error(result.hint);
    expect(result.direct).toEqual([middle]);
    expect(result.transitiveTotal).toBe(leaves);
    expect(result.truncated).toBe(true);
    expect(result.transitive).toHaveLength(IMPACT_LIST_LIMIT);
    // byApp 由**全量**算出，不受列表截断影响
    expect(result.byApp).toEqual([{ app: 'apps/web', count: leaves + 1 }]);
  });
});

describe('health：体检摘要', () => {
  it('四项硬伤与风格项分开计数，并带上产物来源', () => {
    const result = load().healthSummary();
    if ('error' in result) throw new Error(result.hint);
    expect(result.hard).toEqual({
      cycles: 1,
      unresolved: 1,
      unreachable: 2,
      reverseDependencies: 1,
    });
    expect(result.style.largeFiles).toBe(1);
    expect(result.style.topHubs).toEqual([{ path: B, linkDegree: 9 }]);
    expect(result.style.nominated).toBe(1);
    expect(result.sourceCommit).toBe('abc1234');
    expect(result.counts.files).toBe(5);
    expect(result.counts.edges.dependency).toBe(4);
  });
});

describe('查不到时回原因而不是抛错', () => {
  it('不存在的文件给出 not-found 与下一步提示', () => {
    const result = load().dependencies('definitely-missing.ts');
    expect(result).toMatchObject({ error: 'not-found', query: 'definitely-missing.ts' });
    if ('error' in result) expect(result.hint).toContain('pnpm code:gen');
  });

  it('后缀命中多个时给出 ambiguous 与候选清单，绝不猜', () => {
    const graph = buildCodeGraph({
      files: [
        { path: 'apps/web/src/index.ts', created: '', imports: [] },
        { path: 'packages/shared/src/index.ts', created: '', imports: [] },
      ],
    });
    const result = load(withArtifacts({ graph })).dependents('index.ts');
    expect(result).toMatchObject({ error: 'ambiguous' });
    if ('error' in result) {
      expect(result.candidates).toEqual([
        'apps/web/src/index.ts',
        'packages/shared/src/index.ts',
      ]);
    }
  });
});
