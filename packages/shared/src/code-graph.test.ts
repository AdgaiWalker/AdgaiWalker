/**
 * 代码架构图谱模型（纯函数，无 IO）。
 *
 * 语义照抄 Obsidian Graph View，与内容图谱同口径：
 * 圆圈 = 文件（节点），线 = 文件之间的真实引用（边），被依赖越多节点越大。
 * 节点 kind 与边 kind 完全沿用内容图谱的四个名字，好让 web 侧引擎零改动复用。
 *
 * 注意：每个文件都会挂一条「文件类型」标签边，所以断言依赖关系时一律用 `deps()`
 * 过滤掉 tag 边——它数的是标签，不是依赖。
 */
import { describe, expect, it } from 'vitest';
import {
  buildCodeGraph,
  type CodeGraph,
  type CodeSourceFile,
  type CodeImport,
} from './code-graph.js';

/** 造一条已解析好的导入 */
function imp(
  specifier: string,
  outcome: CodeImport['outcome'],
  target: string | null = null,
  form: CodeImport['form'] = 'static',
): CodeImport {
  return { specifier, form, outcome, target };
}

function file(
  path: string,
  imports: CodeImport[] = [],
  created = '2026-01-01T00:00:00Z',
): CodeSourceFile {
  return { path, created, imports };
}

const byId = (graph: CodeGraph, id: string) => graph.nodes.find((node) => node.id === id);
/** 只看真实依赖边（import / 动态导入 / 附件引用），滤掉文件类型标签边 */
const deps = (graph: CodeGraph) => graph.edges.filter((edge) => edge.kind !== 'tag');

describe('节点', () => {
  it('代码文件成为 note 节点，带路径、标签、所属 app 与 git 首次提交时间', () => {
    const graph = buildCodeGraph({
      files: [file('apps/web/src/App.tsx')],
      now: '2026-09-14T00:00:00Z',
    });
    expect(byId(graph, 'note:apps/web/src/App.tsx')).toMatchObject({
      kind: 'note',
      path: 'apps/web/src/App.tsx',
      label: 'App',
      app: 'apps/web',
      created: '2026-01-01T00:00:00Z',
    });
  });

  it('被导入的非代码文件成为 attachment 节点（css / json 有真实边，不是空开关）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/main.tsx', [
          imp('./styles/walker.css', 'attachment', 'apps/web/src/styles/walker.css'),
        ]),
        file('apps/web/src/styles/walker.css'),
      ],
    });
    expect(byId(graph, 'attachment:apps/web/src/styles/walker.css')).toMatchObject({
      kind: 'attachment',
      path: 'apps/web/src/styles/walker.css',
      label: 'walker.css',
    });
  });

  it('解析不到的 import 成为 ghost 节点，用原始说明符标识', () => {
    const graph = buildCodeGraph({
      files: [file('apps/web/src/main.tsx', [imp('./nope', 'unresolved')])],
    });
    expect(byId(graph, 'ghost:./nope')).toMatchObject({ kind: 'ghost', specifier: './nope' });
  });

  it('外部包既不建节点也不建边（照 Obsidian「外链不算边」）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/main.tsx', [imp('react', 'external'), imp('node:fs', 'external')]),
      ],
    });
    expect(graph.nodes.filter((node) => node.kind === 'ghost')).toHaveLength(0);
    expect(deps(graph)).toHaveLength(0);
  });

  it('同名文件用相对路径消歧（照 Obsidian 重名时的处理）', () => {
    const graph = buildCodeGraph({
      files: [file('packages/shared/src/index.ts'), file('apps/web/src/index.ts')],
    });
    expect(byId(graph, 'note:packages/shared/src/index.ts')?.label).toBe(
      'packages/shared/src/index',
    );
    expect(byId(graph, 'note:apps/web/src/index.ts')?.label).toBe('apps/web/src/index');
  });

  it('文件名不重复时只用文件名做标签', () => {
    const graph = buildCodeGraph({
      files: [file('apps/web/src/App.tsx'), file('apps/api/src/main.ts')],
    });
    expect(byId(graph, 'note:apps/web/src/App.tsx')?.label).toBe('App');
    expect(byId(graph, 'note:apps/api/src/main.ts')?.label).toBe('main');
  });
});

describe('边', () => {
  it('静态导入是 link，动态导入是 embed', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.tsx', [
          imp('./b', 'code', 'apps/web/src/b.ts'),
          imp('./c', 'code', 'apps/web/src/c.ts', 'dynamic'),
        ]),
        file('apps/web/src/b.ts'),
        file('apps/web/src/c.ts'),
      ],
    });
    expect(deps(graph)).toContainEqual({
      source: 'note:apps/web/src/a.tsx',
      target: 'note:apps/web/src/b.ts',
      kind: 'link',
    });
    expect(deps(graph)).toContainEqual({
      source: 'note:apps/web/src/a.tsx',
      target: 'note:apps/web/src/c.ts',
      kind: 'embed',
    });
  });

  it('指向非代码文件的边是 attachment（线型与 import 区分）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/main.tsx', [
          imp('./styles.css', 'attachment', 'apps/web/src/styles.css'),
        ]),
        file('apps/web/src/styles.css'),
      ],
    });
    expect(deps(graph)).toEqual([
      {
        source: 'note:apps/web/src/main.tsx',
        target: 'attachment:apps/web/src/styles.css',
        kind: 'attachment',
      },
    ]);
  });

  it('不产生自环（文件 import 自己不是边）', () => {
    const graph = buildCodeGraph({
      files: [file('apps/web/src/a.ts', [imp('./a', 'code', 'apps/web/src/a.ts')])],
    });
    expect(deps(graph)).toHaveLength(0);
  });

  it('同一对文件的多条 import 只算一条边（去重按 源+目标+类型）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [
          imp('./b', 'code', 'apps/web/src/b.ts'),
          imp('./b.js', 'code', 'apps/web/src/b.ts'),
        ]),
        file('apps/web/src/b.ts'),
      ],
    });
    expect(deps(graph)).toEqual([
      { source: 'note:apps/web/src/a.ts', target: 'note:apps/web/src/b.ts', kind: 'link' },
    ]);
  });

  it('文件类型标签成为 tag 节点，代码文件与附件都挂标签', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [imp('./x.css', 'attachment', 'apps/web/src/x.css')]),
        file('apps/web/src/x.css'),
      ],
    });
    expect(byId(graph, 'tag:.ts')?.kind).toBe('tag');
    expect(graph.edges).toContainEqual({
      source: 'note:apps/web/src/a.ts',
      target: 'tag:.ts',
      kind: 'tag',
    });
    expect(graph.edges).toContainEqual({
      source: 'attachment:apps/web/src/x.css',
      target: 'tag:.css',
      kind: 'tag',
    });
  });
});

describe('度数口径（与内容图谱一致，不可混用）', () => {
  it('linkDegree 只数真实依赖边（import / 动态导入 / 附件引用），不含标签', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [
          imp('./b', 'code', 'apps/web/src/b.ts'),
          imp('./x.css', 'attachment', 'apps/web/src/x.css'),
        ]),
        file('apps/web/src/b.ts'),
        file('apps/web/src/x.css'),
      ],
    });
    // a.ts：两条依赖边 + 一条类型标签边
    expect(byId(graph, 'note:apps/web/src/a.ts')).toMatchObject({
      inDegree: 0,
      outDegree: 3,
      totalDegree: 3,
      linkDegree: 2,
    });
    // b.ts：被 a 依赖（1）+ 自己的类型标签（1）
    expect(byId(graph, 'note:apps/web/src/b.ts')).toMatchObject({
      inDegree: 1,
      outDegree: 1,
      totalDegree: 2,
      linkDegree: 1,
    });
    // 附件：被 a 引用（1）+ 自己的类型标签（1）
    expect(byId(graph, 'attachment:apps/web/src/x.css')).toMatchObject({
      inDegree: 1,
      outDegree: 1,
      totalDegree: 2,
      linkDegree: 1,
    });
    // 标签节点：只有入边，且不计入 linkDegree
    expect(byId(graph, 'tag:.ts')).toMatchObject({
      inDegree: 2,
      outDegree: 0,
      totalDegree: 2,
      linkDegree: 0,
    });
  });
});

describe('确定性与入参校验', () => {
  it('同一输入产出同一图（含重复路径与重复边时顺序仍稳定）', () => {
    const build = () =>
      buildCodeGraph({
        now: '2026-09-22T00:00:00.000Z',
        files: [
          file('apps/web/src/b.ts'),
          file('apps/web/src/a.ts', [imp('./b', 'code', 'apps/web/src/b.ts')]),
          file('apps/web/src/b.ts'),
        ],
      });
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('未提供导入的文件仍是节点（零依赖的文件是真实存在的孤岛，不能被丢掉）', () => {
    const graph = buildCodeGraph({
      files: [file('scripts/standalone.ts'), file('apps/web/src/a.ts')],
    });
    expect(byId(graph, 'note:scripts/standalone.ts')).toBeDefined();
    expect(deps(graph)).toHaveLength(0);
    expect(graph.edges.every((edge) => edge.kind === 'tag')).toBe(true);
  });

  it('seed 与 generatedAt 可注入，便于产出可复现的产物', () => {
    const graph = buildCodeGraph({
      files: [file('apps/web/src/a.ts')],
      seed: 7,
      now: '2026-09-14T00:00:00Z',
    });
    expect(graph.seed).toBe(7);
    expect(graph.generatedAt).toBe('2026-09-14T00:00:00Z');
  });
});
