/**
 * 代码图谱的文字兜底结构（纯函数）。
 *
 * 这份清单是**爬虫与无 JS 用户唯一能读到的东西**（canvas 对它们不可见），
 * 所以它必须与图形同源、口径一致：只跟真实依赖边、只出路径与边、
 * 不出体检违规明细（那是内部面）。
 */
import { describe, expect, it } from 'vitest';
import { buildCodeGraph, type CodeImport, type CodeSourceFile } from '@walker/shared';
import { buildCodeGraphOutline } from './code-graph-outline';

function imp(
  specifier: string,
  outcome: CodeImport['outcome'],
  target: string | null = null,
  form: CodeImport['form'] = 'static',
): CodeImport {
  return { specifier, form, outcome, target };
}

const A = 'apps/web/src/a.ts';
const B = 'apps/web/src/b.ts';
const D = 'apps/api/src/d.ts';
const E = 'scripts/e.ts';
const CSS = 'apps/web/src/styles/x.css';

function fixture() {
  const files: CodeSourceFile[] = [
    {
      path: A,
      created: '2026-01-01T00:00:00Z',
      lines: 10,
      imports: [
        imp('./b', 'code', B),
        imp('./styles/x.css', 'attachment', CSS),
        imp('./gone', 'unresolved'),
      ],
    },
    { path: B, created: '2026-02-01T00:00:00Z', lines: 20, imports: [imp('./a', 'code', A)] },
    { path: D, created: '2026-03-01T00:00:00Z', lines: 30, imports: [imp('@walker/shared', 'code', B)] },
    { path: E, created: '2026-04-01T00:00:00Z', lines: 40, imports: [] },
    { path: CSS, created: '2026-01-01T00:00:00Z', lines: 5, imports: [] },
  ];
  return buildCodeGraph({ files, now: '2026-01-01T00:00:00Z' });
}

describe('按工作区单元分组', () => {
  it('分组按文件数降序，组内路径排序；附件不进分组', () => {
    const outline = buildCodeGraphOutline(fixture());
    expect(outline.groups).toEqual([
      { app: 'apps/web', paths: [A, B] },
      { app: 'apps/api', paths: [D] },
      { app: 'scripts', paths: [E] },
    ]);
  });

  it('文件类型统计覆盖全部文件（含附件），与图上的类型标签节点同口径', () => {
    const outline = buildCodeGraphOutline(fixture());
    expect(outline.extensions).toEqual([
      { extension: '.ts', count: 4 },
      { extension: '.css', count: 1 },
    ]);
    // 标签两个：.ts 与 .css（附件也挂类型标签）
    expect(outline.counts).toEqual({ files: 4, attachments: 1, ghosts: 1, tags: 2 });
    expect(outline.attachments).toEqual([CSS]);
  });
});

describe('依赖边', () => {
  it('imports / importedBy 只跟真实依赖边，不含文件类型标签边与附件边', () => {
    const outline = buildCodeGraphOutline(fixture());
    const a = outline.entries.find((entry) => entry.path === A)!;
    // a → b 是依赖；a → x.css 是附件引用；a → .ts 是标签边 —— 后两者都不该出现
    expect(a.imports).toEqual([B]);
    expect(a.importedBy).toEqual([B]);

    const css = outline.attachments[0];
    expect(css).toBe(CSS);
    expect(outline.entries.some((entry) => entry.path === CSS)).toBe(false);
  });

  it('linkCount 只数依赖边（本 fixture 3 条：a→b、b→a、d→b）', () => {
    expect(buildCodeGraphOutline(fixture()).linkCount).toBe(3);
  });
});

describe('解析不到的引用', () => {
  it('列出说明符与引入它的文件（这项本来就公开 —— 它正是图上的幽灵节点）', () => {
    const outline = buildCodeGraphOutline(fixture());
    expect(outline.unresolved).toEqual([{ specifier: './gone', importers: [A] }]);
  });

  it('没有坏引用时为空数组', () => {
    const graph = buildCodeGraph({
      files: [{ path: A, created: '', lines: 1, imports: [] }],
    });
    expect(buildCodeGraphOutline(graph).unresolved).toEqual([]);
  });
});

describe('枢纽', () => {
  it('按被依赖数降序，取前 10；零入度的不出现在列表里', () => {
    const outline = buildCodeGraphOutline(fixture());
    // b 被 a、d 引用（2）；a 被 b 引用（1）；d 与 e 无人引用 → 不入列
    expect(outline.hubs).toEqual([
      { path: B, inDegree: 2 },
      { path: A, inDegree: 1 },
    ]);
    expect(outline.hubs.some((hub) => hub.path === E)).toBe(false);
  });
});

describe('确定性', () => {
  it('同一图两次构建结果完全一致（产物是入库文件，抖动会造成无意义 diff）', () => {
    const graph = fixture();
    expect(JSON.stringify(buildCodeGraphOutline(graph))).toBe(
      JSON.stringify(buildCodeGraphOutline(graph)),
    );
  });
});
