/**
 * 代码结构体检（站主面）。
 *
 * 重点不在「字段透传」，而在**对账口径**：admin 显示的「新增 / 已还清」
 * 必须与构建期门禁 `verify:architecture` 得出同一个结论 —— 两边共用
 * shared 的 `diffCodeDebt`，这个测试就是在钉住这一点。
 */
import { describe, expect, it } from 'vitest';
import {
  CODE_GRAPH_SCHEMA_VERSION,
  buildCodeGraph,
  type CodeGraphHealthArtifact,
} from '@walker/shared';
import { ArchitectureService } from './architecture.service';
import type { ArchitectureBaseline, CodeHealthBundle, CodeHealthPort } from '../ports/code-health.port';
import { CodeHealthError } from '../ports/code-health.port';

const graph = buildCodeGraph({
  files: [
    { path: 'apps/web/src/a.ts', created: '', lines: 10, imports: [] },
    { path: 'apps/web/src/b.ts', created: '', lines: 20, imports: [] },
  ],
  now: '2026-01-01T00:00:00Z',
});

function health(patch: Partial<CodeGraphHealthArtifact> = {}): CodeGraphHealthArtifact {
  return {
    schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
    entries: ['apps/web/src/a.ts'],
    cycles: [],
    unresolved: [],
    unreachable: [],
    reverseDependencies: [],
    hubs: [{ path: 'apps/web/src/b.ts', linkDegree: 3 }],
    largeFiles: [{ path: 'apps/web/src/b.ts', lines: 800 }],
    nominated: [],
    sourceCommit: 'abc1234',
    generatedAt: '2026-09-15T00:00:00.000Z',
    counts: {
      files: 2,
      attachments: 0,
      tags: 1,
      ghosts: 0,
      edges: { total: 2, dependency: 0 },
    },
    ...patch,
  };
}

function baseline(accepted: ArchitectureBaseline['accepted']): ArchitectureBaseline {
  return {
    schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
    generatedAt: '2026-09-14T00:00:00.000Z',
    sourceCommit: 'base000',
    accepted,
  };
}

function service(bundle: Partial<CodeHealthBundle>): ArchitectureService {
  const port: CodeHealthPort = {
    load: async () => ({
      graph,
      health: health(),
      baseline: null,
      ...bundle,
    }),
  };
  return new ArchitectureService(port);
}

describe('现状透传', () => {
  it('体检产物与图的规模原样交给 admin（不在 API 里二次解释）', async () => {
    const view = await service({}).health();
    expect(view.health.counts.files).toBe(2);
    expect(view.health.counts.edges.dependency).toBe(0);
    expect(view.graphTotals).toEqual({ nodes: graph.nodes.length, edges: graph.edges.length });
    expect(view.health.largeFiles).toEqual([{ path: 'apps/web/src/b.ts', lines: 800 }]);
  });

  it('基线缺席时不冒充「对账通过」', async () => {
    const view = await service({ baseline: null }).health();
    expect(view.baseline).toBeNull();
  });
});

describe('与基线对账（口径必须与门禁一致）', () => {
  it('现存与基线逐条相同 → 无新增无还清', async () => {
    const view = await service({
      health: health({ unreachable: ['apps/web/src/dead.ts'] }),
      baseline: baseline({
        cycles: [],
        unresolved: [],
        unreachable: ['apps/web/src/dead.ts'],
        reverseDependencies: [],
      }),
    }).health();
    expect(view.baseline?.added).toEqual([]);
    expect(view.baseline?.resolved).toEqual([]);
    expect(view.baseline?.total).toBe(1);
    expect(view.baseline?.categories.find((entry) => entry.category === 'unreachable')).toEqual({
      category: 'unreachable',
      accepted: 1,
      current: 1,
      added: 0,
      resolved: 0,
    });
  });

  it('真正多出来的进 added（admin 据此提示「门禁会失败」）', async () => {
    const view = await service({
      health: health({ unreachable: ['apps/web/src/dead.ts', 'apps/web/src/new.ts'] }),
      baseline: baseline({
        cycles: [],
        unresolved: [],
        unreachable: ['apps/web/src/dead.ts'],
        reverseDependencies: [],
      }),
    }).health();
    expect(view.baseline?.added).toEqual([
      { category: 'unreachable', key: 'apps/web/src/new.ts', detail: 'apps/web/src/new.ts' },
    ]);
  });

  it('已还清的进 resolved（admin 据此提示「可收敛基线」）', async () => {
    const view = await service({
      health: health(),
      baseline: baseline({
        cycles: [],
        unresolved: ['../packages/shared/dist/x.js'],
        unreachable: [],
        reverseDependencies: [],
      }),
    }).health();
    expect(view.baseline?.resolved).toEqual([
      { category: 'unresolved', key: '../packages/shared/dist/x.js', detail: '../packages/shared/dist/x.js' },
    ]);
  });

  it('环的成员换个顺序不算新增（与门禁同一身份口径）', async () => {
    const view = await service({
      health: health({ cycles: [['apps/web/src/b.ts', 'apps/web/src/a.ts']] }),
      baseline: baseline({
        cycles: [['apps/web/src/a.ts', 'apps/web/src/b.ts']],
        unresolved: [],
        unreachable: [],
        reverseDependencies: [],
      }),
    }).health();
    expect(view.baseline?.added).toEqual([]);
  });
});

describe('读端失败按「谁的错」映射成 HTTP', () => {
  async function errorOf(error: unknown): Promise<{ status: number; code: string }> {
    const port: CodeHealthPort = { load: async () => Promise.reject(error) };
    try {
      await new ArchitectureService(port).health();
    } catch (caught) {
      const http = caught as { status?: number; response?: { code?: string } };
      return { status: http.status ?? 0, code: http.response?.code ?? '' };
    }
    return { status: 0, code: '' };
  }

  it('产物没生成 → 503 + code-health-unavailable（可操作：跑 code:gen）', async () => {
    const { status, code } = await errorOf(
      new CodeHealthError('code-health-unavailable', '找不到产物'),
    );
    expect(status).toBe(503);
    expect(code).toBe('code-health-unavailable');
  });

  it('产物过期/损坏 → 500 + code-health-malformed（数据问题，不是暂时不可用）', async () => {
    const { status, code } = await errorOf(
      new CodeHealthError('code-health-malformed', 'schemaVersion 不匹配'),
    );
    expect(status).toBe(500);
    expect(code).toBe('code-health-malformed');
  });
});
