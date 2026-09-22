/**
 * FsCodeHealth 的行为测试（tests-after：实现先落，这里钉住三条硬规则）。
 *
 * 重点不是「读文件」，而是三条评审修复的行为：
 * 1. 旧形状产物被契约层拒绝（malformed），而不是放行后下游 TypeError；
 * 2. 环境变量配错路径 → misconfigured，而不是裸 ENOENT；
 * 3. 缓存签名覆盖三个输入 —— 基线变更必须失效（旧实现只看 health 的 mtime，会一直
 *    返回旧对账，且毫无提示）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CODE_GRAPH_SCHEMA_VERSION, type CodeGraphArtifact } from '@walker/shared';
import { FsCodeHealth } from './fs-code-health';
import { CodeHealthError } from '../ports/code-health.port';

const graphArtifact: CodeGraphArtifact = {
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

const healthArtifact = {
  schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
  entries: [],
  cycles: [],
  unresolved: [],
  unreachable: [],
  reverseDependencies: [],
  hubs: [],
  largeFiles: [],
  nominated: [],
  sourceCommit: 'abc1234',
  generatedAt: '2026-09-15T00:00:00.000Z',
  counts: { files: 1, attachments: 0, tags: 0, ghosts: 0, edges: { total: 0, dependency: 0 } },
};

const baselineOf = (total: number) => ({
  schemaVersion: CODE_GRAPH_SCHEMA_VERSION,
  generatedAt: '2026-09-14T00:00:00.000Z',
  sourceCommit: 'base000',
  accepted: {
    cycles: [],
    unresolved: [],
    unreachable: Array.from({ length: total }, (_, index) => `apps/web/src/dead-${index}.ts`),
    reverseDependencies: [],
  },
});

let root = '';
const cwd = process.cwd();
const genDir = () => path.join(root, 'apps/web/src/generated');

async function writeFixtures(options: {
  graph?: object;
  health?: object;
  baseline?: object | null;
}): Promise<void> {
  await fs.mkdir(genDir(), { recursive: true });
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.writeFile(
    path.join(genDir(), 'codegraph.json'),
    JSON.stringify(options.graph ?? graphArtifact),
  );
  await fs.writeFile(
    path.join(genDir(), 'codegraph-health.json'),
    JSON.stringify(options.health ?? healthArtifact),
  );
  if (options.baseline === null) {
    // 跨用例共用一个临时目录：显式删掉，别让上一个用例的基线漏进来
    await fs.rm(path.join(root, 'scripts/architecture-baseline.json'), { force: true });
  } else {
    await fs.writeFile(
      path.join(root, 'scripts/architecture-baseline.json'),
      JSON.stringify(options.baseline ?? baselineOf(1)),
    );
  }
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-health-'));
  // cwd = <root>/apps/api 时，探测候选 ../… 恰好落进 <root>/apps/web/src/generated
  await fs.mkdir(path.join(root, 'apps/api'), { recursive: true });
  process.chdir(path.join(root, 'apps/api'));
});

afterAll(async () => {
  process.chdir(cwd);
  await fs.rm(root, { recursive: true, force: true });
});

describe('正常读取与缓存', () => {
  it('三件套原样返回；重复 load 命中缓存（同一对象）', async () => {
    await writeFixtures({});
    const adapter = new FsCodeHealth();
    const first = await adapter.load();
    expect(first.health.counts.files).toBe(1);
    expect(first.baseline?.accepted.unreachable).toHaveLength(1);
    expect(await adapter.load()).toBe(first);
  });

  it('基线文件变更（mtime 变）→ 缓存失效，返回新对账（旧实现会一直给旧的）', async () => {
    await writeFixtures({ baseline: baselineOf(1) });
    const adapter = new FsCodeHealth();
    expect((await adapter.load()).baseline?.accepted.unreachable).toHaveLength(1);

    const baselinePath = path.join(root, 'scripts/architecture-baseline.json');
    await fs.writeFile(baselinePath, JSON.stringify(baselineOf(3)));
    const later = new Date(Date.now() + 5000);
    await fs.utimes(baselinePath, later, later);

    expect((await adapter.load()).baseline?.accepted.unreachable).toHaveLength(3);
  });

  it('基线缺席 → baseline 为 null，其余照常（不冒充对账过）', async () => {
    await writeFixtures({ baseline: null });
    const result = await new FsCodeHealth().load();
    expect(result.baseline).toBeNull();
  });
});

describe('失败按「谁的错」分类', () => {
  it('旧形状产物（缺 schemaVersion）→ malformed，原因说清出路', async () => {
    const { schemaVersion: _dropped, ...legacy } = graphArtifact;
    await writeFixtures({ graph: legacy });
    const error = await new FsCodeHealth().load().catch((caught) => caught);
    expect(error).toBeInstanceOf(CodeHealthError);
    expect((error as CodeHealthError).code).toBe('code-health-malformed');
    expect((error as CodeHealthError).message).toContain('schemaVersion');
  });

  it('环境变量指向不存在的文件 → misconfigured，而不是裸 ENOENT', async () => {
    await writeFixtures({});
    process.env.WALKER_CODE_GRAPH_JSON = '/nowhere/codegraph.json';
    try {
      const error = await new FsCodeHealth().load().catch((caught) => caught);
      expect(error).toBeInstanceOf(CodeHealthError);
      expect((error as CodeHealthError).code).toBe('code-health-misconfigured');
    } finally {
      delete process.env.WALKER_CODE_GRAPH_JSON;
    }
  });

  it('产物没生成 → unavailable', async () => {
    // 独立临时目录：探测候选 `../…` 会往上级找，不能落回主 fixture 区
    const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'code-health-empty-'));
    process.chdir(bare);
    try {
      const error = await new FsCodeHealth().load().catch((caught) => caught);
      expect(error).toBeInstanceOf(CodeHealthError);
      expect((error as CodeHealthError).code).toBe('code-health-unavailable');
    } finally {
      process.chdir(path.join(root, 'apps/api'));
      await fs.rm(bare, { recursive: true, force: true });
    }
  });
});
