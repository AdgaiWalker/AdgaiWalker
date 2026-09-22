/**
 * 代码图谱领域 —— 接缝的另一半。
 *
 * 这里要证明的是**引擎真的能驱动代码图**，而不只是「类型对得上」：
 * Obsidian 的检索语法（`path:` / `tag:` / `[prop:>n]`）必须作用在代码节点的投影上，
 * 方向、过滤、顺序三件事与内容图谱同一套代码路径。
 */
import { describe, expect, it } from 'vitest';
import {
  buildCodeGraph,
  type CodeGraph,
  type CodeGraphNode,
  type CodeImport,
  type CodeSourceFile,
} from '@walker/shared';
import {
  applyGraphSettings,
  createDefaultGraphSettings,
  type GraphSettings,
} from './graph-view-model';
import { codeQueryDoc, createCodeGraphDomain } from './domains';

function imp(
  specifier: string,
  outcome: CodeImport['outcome'],
  target: string | null = null,
): CodeImport {
  return { specifier, form: 'static', outcome, target };
}

const A = 'apps/web/src/a.ts';
const B = 'apps/web/src/b.tsx';
const D = 'apps/api/src/d.ts';
const CSS = 'apps/web/src/styles/x.css';

function fixture() {
  const files: CodeSourceFile[] = [
    {
      path: A,
      created: '2026-02-01T00:00:00Z',
      lines: 600,
      imports: [imp('./b', 'code', B), imp('./styles/x.css', 'attachment', CSS), imp('./gone', 'unresolved')],
    },
    { path: B, created: '2026-01-01T00:00:00Z', lines: 10, imports: [] },
    // 未入库的新文件：git 拿不到首次提交时间
    { path: D, created: '', lines: 800, imports: [] },
    { path: CSS, created: '2026-01-15T00:00:00Z', lines: 5, imports: [] },
  ];
  return buildCodeGraph({ files, now: '2026-01-01T00:00:00Z' });
}

const withSettings = (patch: {
  filters?: Partial<GraphSettings['filters']>;
  groups?: GraphSettings['groups'];
}): GraphSettings => {
  const base = createDefaultGraphSettings();
  return { ...base, ...patch, filters: { ...base.filters, ...patch.filters } };
};

/** 按路径取节点（union 上并非每个分支都有 path，故用 `in` 收窄） */
function fileNode(graph: CodeGraph, path: string): CodeGraphNode {
  const node = graph.nodes.find(
    (candidate) => 'path' in candidate && candidate.path === path,
  );
  if (!node) throw new Error(`missing ${path}`);
  return node;
}

const domain = createCodeGraphDomain({ onSelect: () => {} });

describe('节点呈现', () => {
  it('标签取节点自带的 label；文件不带扩展名，附件带', () => {
    const graph = fixture();
    const labels = graph.nodes
      .filter((node) => node.kind === 'note' || node.kind === 'attachment')
      .map((node) => domain.label(node));
    expect(labels).toEqual(expect.arrayContaining(['a', 'b', 'd', 'x.css']));
  });

  it('代码文件没有站内页面可跳，href 恒为 null（菜单因此不出现「在新标签打开」）', () => {
    const graph = fixture();
    for (const node of graph.nodes) expect(domain.href(node)).toBeNull();
  });

  it('复制链接给的是仓库相对路径（代码图谱里路径才是标识）', () => {
    const graph = fixture();
    const node = fileNode(graph, A);
    expect(domain.copyText?.(node)).toBe(A);
  });
});

describe('检索文档投影', () => {
  it('路径同时进 slug 与 path：裸词、file:、path: 都能按路径命中', () => {
    const graph = fixture();
    const node = fileNode(graph, A);
    const doc = codeQueryDoc(node);
    expect(doc.slug).toBe(A);
    expect(doc.path).toBe(A);
    expect(doc.title).toBe('a');
  });

  it('文件类型进 tags（tag: 操作符可用），正文恒为空（产物不含文件内容）', () => {
    const graph = fixture();
    const node = fileNode(graph, B);
    expect(codeQueryDoc(node).tags).toEqual(['.tsx']);
    expect(codeQueryDoc(node).body).toBe('');
  });

  it('度数、行数、所属单元进 props（属性查询可用）', () => {
    const graph = fixture();
    const node = fileNode(graph, A);
    const doc = codeQueryDoc(node);
    // a 出去 4 条边：→ b（link）、→ x.css（附件）、→ ./gone（幽灵，也是 link）、→ 标签 .ts
    expect(doc.props).toMatchObject({
      app: 'apps/web',
      extension: '.ts',
      lines: 600,
      created: '2026-02-01T00:00:00Z',
      inDegree: 0,
      outDegree: 4,
      linkDegree: 3,
    });
  });
});

describe('用 Obsidian 检索语法查代码图（同一套引擎，无代码分支）', () => {
  const view = (
    search: string,
    patch: { filters?: Partial<GraphSettings['filters']> } = {},
  ) =>
    applyGraphSettings(
      fixture(),
      withSettings({ ...patch, filters: { ...patch.filters, search } }),
      domain,
    );

  /** 结果按路径排序（实现保证确定性，这里也按排序断言） */
  const paths = (
    search: string,
    patch: { filters?: Partial<GraphSettings['filters']> } = {},
  ) =>
    view(search, patch)
      .nodes.map((node) => ('path' in node ? node.path : ''))
      .filter(Boolean)
      .sort();

  it('path: 按仓库路径过滤', () => {
    expect(paths('path:apps/api')).toEqual([D]);
  });

  it('tag: 按文件类型过滤（附件需先打开附件开关）', () => {
    expect(paths('tag:.css', { filters: { search: '', attachments: true } })).toEqual([CSS]);
  });

  it('[lines:>500] 能找到超大文件（图上一眼看不出，检索能）', () => {
    // 按路径排序：apps/api 在 apps/web 之前
    expect(paths('[lines:>500]')).toEqual([D, A]);
  });

  it('[app:apps/web] 按工作区单元过滤', () => {
    expect(paths('[app:apps/web]', { filters: { search: '', attachments: true } })).toEqual([
      A,
      B,
      CSS,
    ]);
  });

  it('file: 按文件名或路径过滤', () => {
    expect(paths('file:d')).toEqual([D]);
  });

  it('语法错误时不过滤但如实报错（画布不崩）', () => {
    const broken = view('((a');
    expect(broken.queryError).not.toBeNull();
    expect(broken.nodes.length).toBe(view('').nodes.length);
  });

  it('颜色组按同一套语法给代码节点上色', () => {
    const colored = applyGraphSettings(
      fixture(),
      withSettings({
        groups: [{ id: 'g', query: '[lines:>500]', color: '#dc2626' }],
      }),
      domain,
    );
    expect(colored.colors.get(`note:${A}`)).toBe('#dc2626');
    expect(colored.colors.has(`note:${B}`)).toBe(false);
  });
});

describe('出场顺序（Animate）', () => {
  it('只排代码文件（附件不参与生长），按 git 首次提交时间升序，拿不到时间的排最后', () => {
    const graph = fixture();
    const order = domain
      .order(graph.nodes)
      .map((node) => ('path' in node ? node.path : ''));
    expect(order).toEqual([B, A, D]);
  });
});

describe('点击与筛选', () => {
  it('点文件交给宿主展示详情，不写筛选框', () => {
    const selected: string[] = [];
    const local = createCodeGraphDomain({ onSelect: (node) => selected.push(node.id) });
    const graph = fixture();
    const node = fileNode(graph, A);
    const searches: string[] = [];
    local.activate(node, { setSearch: (query) => searches.push(query) });
    expect(selected).toEqual([`note:${A}`]);
    expect(searches).toEqual([]);
  });

  it('点标签节点写进筛选框（标签没有详情可看）', () => {
    const graph = fixture();
    const tag = graph.nodes.find((node) => node.kind === 'tag' && node.tag === '.ts')!;
    const searches: string[] = [];
    createCodeGraphDomain({ onSelect: () => {} }).activate(tag, {
      setSearch: (query) => searches.push(query),
    });
    expect(searches).toEqual(['tag:.ts']);
  });

  it('「以它为起点筛选」写入路径', () => {
    const graph = fixture();
    const node = fileNode(graph, D);
    const searches: string[] = [];
    domain.filterFrom(node, { setSearch: (query) => searches.push(query) });
    expect(searches).toEqual([D]);
  });
});
