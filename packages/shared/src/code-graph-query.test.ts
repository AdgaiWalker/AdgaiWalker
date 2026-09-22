/**
 * 代码图谱查询（纯函数）。
 *
 * 三件事各有一组测试，因为它们各自会以不同方式骗人：
 * - `matchCodeFile`：后缀命中多个时必须报歧义，猜错等于回答另一个文件的问题
 * - `codeNeighbors`：方向搞反就答非所问；标签/附件边若不排除，「依赖谁」会混进分类信息
 * - `codeImpact`：环存在时必须收敛（这是唯一会挂死的风险点）
 */
import { describe, expect, it } from 'vitest';
import {
  buildCodeGraph,
  type CodeImport,
  type CodeSourceFile,
} from './code-graph.js';
import { codeImpact, codeNeighbors, matchCodeFile } from './code-graph-query.js';

function imp(
  specifier: string,
  outcome: CodeImport['outcome'],
  target: string | null = null,
  form: CodeImport['form'] = 'static',
): CodeImport {
  return { specifier, form, outcome, target };
}

const link = (specifier: string, target: string): CodeImport => imp(specifier, 'code', target);
const dyn = (specifier: string, target: string): CodeImport =>
  imp(specifier, 'code', target, 'dynamic');

function file(path: string, imports: CodeImport[] = []): CodeSourceFile {
  return { path, created: '2026-01-01T00:00:00Z', imports };
}

/**
 * a → b、a ⇢ c（动态）、a → x.css（附件）
 * b → c
 * d（api）→ b
 * e → a
 */
function fixture() {
  const paths = {
    a: 'apps/web/src/a.ts',
    b: 'apps/web/src/b.ts',
    c: 'apps/web/src/c.ts',
    d: 'apps/api/src/d.ts',
    e: 'apps/web/src/e.ts',
    css: 'apps/web/src/x.css',
  };
  const graph = buildCodeGraph({
    files: [
      file(paths.a, [
        link('./b', paths.b),
        dyn('./c', paths.c),
        imp('./x.css', 'attachment', paths.css),
      ]),
      file(paths.b, [link('./c', paths.c)]),
      file(paths.c),
      file(paths.d, [link('@walker/shared', paths.b)]),
      file(paths.e, [link('./a', paths.a)]),
      file(paths.css),
    ],
  });
  return { graph, paths };
}

describe('指称解析', () => {
  it('完整仓库相对路径与节点 id 都能命中', () => {
    const { graph, paths } = fixture();
    const byPath = matchCodeFile(graph, paths.b);
    const byId = matchCodeFile(graph, `note:${paths.b}`);
    expect(byPath).toMatchObject({ found: true, path: paths.b });
    expect(byId).toMatchObject({ found: true, path: paths.b });
  });

  it('唯一后缀能命中（agent 通常只会说文件名）', () => {
    const { graph, paths } = fixture();
    expect(matchCodeFile(graph, 'd.ts')).toMatchObject({ found: true, path: paths.d });
    expect(matchCodeFile(graph, 'src/c.ts')).toMatchObject({ found: true, path: paths.c });
  });

  it('前缀 `./` 与反斜杠会被归一化', () => {
    const { graph, paths } = fixture();
    expect(matchCodeFile(graph, './apps/web/src/a.ts')).toMatchObject({ path: paths.a });
    expect(matchCodeFile(graph, 'apps\\web\\src\\a.ts')).toMatchObject({ path: paths.a });
  });

  it('后缀命中多个时报歧义并列出候选，绝不猜', () => {
    const graph = buildCodeGraph({
      files: [file('apps/web/src/index.ts'), file('packages/shared/src/index.ts')],
    });
    const result = matchCodeFile(graph, 'index.ts');
    expect(result.found).toBe(false);
    if (result.found) return;
    expect(result.reason).toBe('ambiguous');
    expect(result.candidates).toEqual([
      'apps/web/src/index.ts',
      'packages/shared/src/index.ts',
    ]);
  });

  it('查不到与空查询都返回 not-found', () => {
    const { graph } = fixture();
    for (const query of ['nope.ts', '   ']) {
      expect(matchCodeFile(graph, query)).toEqual({
        found: false,
        reason: 'not-found',
        candidates: [],
      });
    }
  });
});

describe('邻域（有向）', () => {
  it('out = 它依赖谁，且不含附件边（附件是分类，不是依赖）', () => {
    const { graph, paths } = fixture();
    const result = codeNeighbors(graph, `note:${paths.a}`, { direction: 'out' });
    expect(result.paths).toEqual([paths.b, paths.c]);
    expect(result.edges).toContainEqual({ from: paths.a, to: paths.b, kind: 'link' });
    expect(result.edges).toContainEqual({ from: paths.a, to: paths.c, kind: 'embed' });
    expect(result.edges.some((edge) => edge.to === paths.css)).toBe(false);
  });

  it('in = 谁依赖它（与 out 是不同的问题，不可混用）', () => {
    const { graph, paths } = fixture();
    const result = codeNeighbors(graph, `note:${paths.c}`, { direction: 'in' });
    expect(result.paths).toEqual([paths.a, paths.b]);
    expect(result.edges).toContainEqual({ from: paths.a, to: paths.c, kind: 'embed' });
    expect(result.edges).toContainEqual({ from: paths.b, to: paths.c, kind: 'link' });
  });

  it('按方向逐层展开：b 的反向 1 层是 a 与 d，2 层再把 e 带上（结果按路径排序）', () => {
    const { graph, paths } = fixture();
    const one = codeNeighbors(graph, `note:${paths.b}`, { direction: 'in', depth: 1 });
    expect(one.paths).toEqual([paths.d, paths.a]);
    const two = codeNeighbors(graph, `note:${paths.b}`, { direction: 'in', depth: 2 });
    expect(two.paths).toEqual([paths.d, paths.a, paths.e]);
  });

  it('深度被夹在 1–10；未知中心返回空', () => {
    const { graph, paths } = fixture();
    expect(codeNeighbors(graph, `note:${paths.b}`, { direction: 'in', depth: 99 }).depth).toBe(10);
    expect(codeNeighbors(graph, 'note:不存在.ts').paths).toEqual([]);
  });
});

describe('影响面', () => {
  it('分开直接与间接依赖者，并按工作区单元归堆', () => {
    const { graph, paths } = fixture();
    const result = codeImpact(graph, `note:${paths.b}`);
    // 直接：a 与 d 都 import b；间接：e import a（结果按路径排序）
    expect(result.direct).toEqual([paths.d, paths.a]);
    expect(result.transitive).toEqual([paths.e]);
    expect(result.byApp).toEqual([
      { app: 'apps/web', count: 2 },
      { app: 'apps/api', count: 1 },
    ]);
  });

  it('存在环时收敛（A→B→A 不得死循环）', () => {
    const graph = buildCodeGraph({
      files: [
        file('apps/web/src/a.ts', [link('./b', 'apps/web/src/b.ts')]),
        file('apps/web/src/b.ts', [link('./a', 'apps/web/src/a.ts')]),
      ],
    });
    const result = codeImpact(graph, 'note:apps/web/src/a.ts');
    expect(result.direct).toEqual(['apps/web/src/b.ts']);
    expect(result.transitive).toEqual([]);
  });

  it('c 的影响面：直接是 a 与 b，间接再带上依赖 a、b 的 e 与 d；中心本身不出现在结果里', () => {
    const { graph, paths } = fixture();
    const result = codeImpact(graph, `note:${paths.c}`);
    expect(result.direct).toEqual([paths.a, paths.b]);
    expect(result.transitive).toEqual([paths.d, paths.e]);
    expect([...result.direct, ...result.transitive]).not.toContain(paths.c);
  });

  it('没人依赖的文件影响面为空（e 只引用别人，不会被反向波及）', () => {
    const { graph, paths } = fixture();
    expect(codeImpact(graph, `note:${paths.e}`)).toMatchObject({
      center: paths.e,
      direct: [],
      transitive: [],
      byApp: [],
    });
  });

  it('未知中心返回空结构而不是抛错', () => {
    const { graph } = fixture();
    expect(codeImpact(graph, 'note:nope.ts')).toEqual({
      center: '',
      depth: 5,
      direct: [],
      transitive: [],
      byApp: [],
    });
  });
});
