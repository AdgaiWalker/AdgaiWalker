/**
 * 产物契约层的测试。
 *
 * 这层存在的原因：codegraph.json / codegraph-health.json / architecture-baseline.json
 * 是 gen 期写、请求期读的**跨进程接口**，有三个消费者（api / agent / 门禁）。
 * 消费者各自手写校验时，漏掉的字段会在下游某个 `.length` 处变成 TypeError。
 * 这里锁住的行为：**形状不对 → 拒绝并给出原因**，绝不放行一个「看起来像」的产物。
 */
import { describe, expect, it } from 'vitest';
import { buildCodeGraph } from './code-graph.js';
import {
  CODE_GRAPH_SCHEMA_VERSION,
  codeGraphCounts,
  parseArchitectureBaseline,
  parseCodeGraphArtifact,
  parseCodeGraphHealthArtifact,
  type CodeGraphArtifact,
  type CodeGraphHealthArtifact,
} from './code-artifact.js';

const validGraphArtifact: CodeGraphArtifact = {
  schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
  generatedAt: '2026-09-15T00:00:00.000Z',
  seed: 7,
  nodes: [
    {
      id: 'note:apps/web/src/a.ts',
      kind: 'note',
      label: 'a',
      totalDegree: 0,
      linkDegree: 0,
      inDegree: 0,
      outDegree: 0,
      path: 'apps/web/src/a.ts',
      app: 'apps/web',
      extension: '.ts',
      created: '',
      lines: 1,
    },
  ],
  edges: [],
};

const validHealthArtifact: CodeGraphHealthArtifact = {
  schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
  entries: ['apps/web/src/main.tsx'],
  cycles: [],
  unresolved: [],
  unreachable: [],
  reverseDependencies: [],
  hubs: [],
  largeFiles: [],
  nominated: [],
  sourceCommit: 'abc1234',
  generatedAt: '2026-09-15T00:00:00.000Z',
  counts: {
    files: 1,
    attachments: 0,
    tags: 0,
    ghosts: 0,
    edges: { total: 0, dependency: 0 },
  },
};

const validBaseline = {
  schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
  generatedAt: '2026-09-15T00:00:00.000Z',
  sourceCommit: 'abc1234',
  accepted: { cycles: [], unresolved: [], unreachable: [], reverseDependencies: [] },
};

describe('parseCodeGraphArtifact（图产物）', () => {
  it('接受当前版本的图产物', () => {
    const result = parseCodeGraphArtifact(validGraphArtifact);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.nodes).toHaveLength(1);
  });

  it('拒绝没有 schemaVersion 的旧产物（旧时代产物没有版本位）', () => {
    const { schemaVersion: _dropped, ...legacy } = validGraphArtifact;
    const result = parseCodeGraphArtifact(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('schemaVersion');
  });

  it('拒绝版本不匹配的产物（提示重跑 code:gen，而不是碰运气解析）', () => {
    const result = parseCodeGraphArtifact({
      ...validGraphArtifact,
      schemaVersion: CODE_GRAPH_SCHEMA_VERSION + 99,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('重跑');
  });

  it('拒绝 nodes 缺失或节点缺 id / kind 的产物', () => {
    expect(parseCodeGraphArtifact({ ...validGraphArtifact, nodes: 'nope' }).ok).toBe(false);
    expect(
      parseCodeGraphArtifact({ ...validGraphArtifact, nodes: [{ id: 'x' }] }).ok,
    ).toBe(false);
  });

  it('拒绝边缺 source / target / kind 的产物', () => {
    expect(
      parseCodeGraphArtifact({ ...validGraphArtifact, edges: [{ source: 'a' }] }).ok,
    ).toBe(false);
  });
});

describe('parseCodeGraphHealthArtifact（体检产物）', () => {
  it('接受当前版本的体检产物', () => {
    const result = parseCodeGraphHealthArtifact(validHealthArtifact);
    expect(result.ok).toBe(true);
  });

  it('拒绝上一版产物（缺 largeFiles）——它曾一路通过校验后在 .length 处抛 TypeError', () => {
    const { largeFiles: _dropped, ...legacy } = validHealthArtifact;
    const result = parseCodeGraphHealthArtifact(legacy);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('largeFiles');
  });

  it('拒绝把硬伤列表写成非数组的产物', () => {
    expect(
      parseCodeGraphHealthArtifact({ ...validHealthArtifact, unreachable: 'none' }).ok,
    ).toBe(false);
  });

  it('拒绝 unresolved 条目缺 importers 的产物（下游 codeDebtItems 会读它）', () => {
    expect(
      parseCodeGraphHealthArtifact({
        ...validHealthArtifact,
        unresolved: [{ specifier: './missing' }],
      }).ok,
    ).toBe(false);
  });

  it('拒绝 counts 缺 dependency 的产物（admin 要用它展示依赖边）', () => {
    const { edges: _dropped, ...counts } = validHealthArtifact.counts;
    expect(parseCodeGraphHealthArtifact({ ...validHealthArtifact, counts }).ok).toBe(false);
  });
});

describe('parseArchitectureBaseline（门禁基线）', () => {
  it('接受当前版本的基线', () => {
    expect(parseArchitectureBaseline(validBaseline).ok).toBe(true);
  });

  it('拒绝 accepted 缺反向依赖段的基线（下游 accepted[category].length 会抛）', () => {
    const { reverseDependencies: _dropped, ...accepted } = validBaseline.accepted;
    const result = parseArchitectureBaseline({ ...validBaseline, accepted });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('reverseDependencies');
  });

  it('拒绝 cycles 不是「字符串数组的数组」的基线', () => {
    expect(
      parseArchitectureBaseline({
        ...validBaseline,
        accepted: { ...validBaseline.accepted, cycles: ['a → b'] },
      }).ok,
    ).toBe(false);
  });
});

describe('codeGraphCounts（唯一口径的计数）', () => {
  it('依赖边与全部边分开计数：标签边计入 total 而不计入 dependency', () => {
    const graph = buildCodeGraph({
      files: [
        { path: 'apps/web/src/a.ts', imports: [] },
        {
          path: 'apps/web/src/b.ts',
          imports: [
            { specifier: './a', form: 'static', outcome: 'code', target: 'apps/web/src/a.ts' },
          ],
        },
        { path: 'apps/web/src/style.css', imports: [] },
      ],
    });
    const counts = codeGraphCounts(graph);
    expect(counts).toEqual({
      files: 2,
      attachments: 1,
      tags: 2, // .ts 与 .css 各一个标签节点
      ghosts: 0,
      edges: {
        // 全部边 = 1 条依赖边 + 3 条标签边（两个 .ts 文件 + 一个 .css）
        total: graph.edges.length,
        dependency: 1,
      },
    });
    expect(counts.edges.total).toBeGreaterThan(counts.edges.dependency);
  });
});
