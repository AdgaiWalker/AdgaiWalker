/**
 * 代码结构（页）— 把代码库自己当成一个 vault 来看。
 *
 * 与 `/graph` 的关系：同一个图谱组件、同一套 Obsidian 设置与检索语法，
 * 只是领域换成了代码（节点 = 源文件，边 = 真实 import）。差异全部收在 domains.ts。
 *
 * 三条边界（PRD-CODE-GRAPH §公开面边界）：
 * - 只输出相对路径与依赖边，**不出文件内容**
 * - 不出体检违规明细（环 / 死文件 / 基线只在门禁与 admin 内部面）
 * - 产物动态引入，不让全部页面替这一页背体积
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { codeNeighbors, type CodeGraph, type CodeGraphNode } from '@walker/shared';
import { loadCodeGraph } from '../code-graph';
import { KnowledgeGraph } from '../components/graph/KnowledgeGraph';
import { createCodeGraphDomain } from '../components/graph/domains';
import { buildCodeGraphOutline, type CodeOutline } from '../shared/code-graph-outline';
import { WEB_ROUTES } from '../shared/routes';

export function ArchitecturePage() {
  const [graph, setGraph] = useState<CodeGraph | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<CodeGraphNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCodeGraph().then(
      (loaded) => {
        if (!cancelled) setGraph(loaded);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const outline = useMemo(() => (graph ? buildCodeGraphOutline(graph) : null), [graph]);
  const domain = useMemo(
    () => createCodeGraphDomain({ onSelect: (node) => setSelected(node) }),
    [],
  );

  return (
    <div className="graph-page code-page">
      <header className="graph-page-head">
        <h1 className="graph-page-title">代码结构</h1>
        {outline ? (
          <p className="graph-page-lead meta">
            {outline.counts.files} 个文件 · {outline.linkCount} 条内部引用 ·{' '}
            {outline.counts.attachments} 个附件 · {outline.extensions.length} 种文件类型 ·{' '}
            {outline.unresolved.length} 个解析不到的引用
          </p>
        ) : null}
        <p className="graph-page-note">
          这张图只画一件事：文件之间真实写下的 import（含动态导入与 worker 引用）。
          没有人工推断，也没有模型补充；外部依赖包不算边。圆越大说明被依赖越多，
          虚线空心圈是指向不存在文件的引用。整张图由构建期从编译器语法树抽出。
        </p>
        <Link to={WEB_ROUTES.graph} className="graph-back">
          <ArrowLeft size={14} aria-hidden />
          看内容结构（文章互引）
        </Link>
      </header>

      {failed ? (
        <p className="meta">代码图谱数据没能加载。刷新一次；若仍不行，说明产物未生成。</p>
      ) : !graph ? (
        <p className="meta">正在加载代码图谱…</p>
      ) : (
        <>
          <KnowledgeGraph graph={graph} domain={domain} height={620} />
          <CodeLegend />
          {selected ? (
            <CodeDetail graph={graph} node={selected} onClose={() => setSelected(null)} />
          ) : null}
          {outline ? <CodeOutlineSection outline={outline} /> : null}
        </>
      )}
    </div>
  );
}

/** 图例：四类节点与三种边型（与 renderer 的实际画法一一对应） */
function CodeLegend() {
  return (
    <section className="code-legend">
      <h2>图例</h2>
      <ul>
        <li>
          <span className="code-dot code-dot-note" aria-hidden />
          代码文件（圆越大被依赖越多）
        </li>
        <li>
          <span className="code-dot code-dot-attachment" aria-hidden />
          附件（css / json 等被引用的非代码文件）
        </li>
        <li>
          <span className="code-dot code-dot-tag" aria-hidden />
          文件类型标签（.ts / .tsx / .css …）
        </li>
        <li>
          <span className="code-dot code-dot-ghost" aria-hidden />
          解析不到的引用（import 指向的文件不存在）
        </li>
        <li>
          <span className="code-line code-line-link" aria-hidden />
          静态 import
        </li>
        <li>
          <span className="code-line code-line-embed" aria-hidden />
          动态 import()
        </li>
        <li>
          <span className="code-line code-line-attachment" aria-hidden />
          引用附件
        </li>
      </ul>
    </section>
  );
}

/** 选中文件的详情：路径、规模、直接依赖与被依赖（都用 shared 里已测的查询函数算） */
function CodeDetail({
  graph,
  node,
  onClose,
}: {
  graph: CodeGraph;
  node: CodeGraphNode;
  onClose: () => void;
}) {
  const path = 'path' in node ? node.path : node.label;
  const outgoing = codeNeighbors(graph, node.id, { direction: 'out', depth: 1 });
  const incoming = codeNeighbors(graph, node.id, { direction: 'in', depth: 1 });

  return (
    <section className="code-detail">
      <header>
        <h2>{path}</h2>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      {'lines' in node ? (
        <p className="meta">
          {node.app} · {node.lines} 行 · 依赖 {outgoing.paths.length} 个 · 被{' '}
          {incoming.paths.length} 个依赖
        </p>
      ) : null}
      {outgoing.paths.length > 0 ? (
        <p>
          <strong>它依赖：</strong>
          {outgoing.paths.join('、')}
        </p>
      ) : null}
      {incoming.paths.length > 0 ? (
        <p>
          <strong>被依赖：</strong>
          {incoming.paths.join('、')}
        </p>
      ) : null}
    </section>
  );
}

/**
 * 文字版结构：无 JS 与爬虫读得到的同一份事实（图形对它们不可见）。
 * 只出清单与结构要点；逐条边交给图形（本页正文里如实说明，不假装全文都有）。
 */
function CodeOutlineSection({ outline }: { outline: CodeOutline }) {
  // 一次建表：清单有几百条，逐条 find 会退化成 O(n²)
  const byPath = useMemo(
    () => new Map(outline.entries.map((entry) => [entry.path, entry])),
    [outline],
  );

  return (
    <details className="graph-outline">
      <summary>文字版结构（{outline.counts.files} 个文件）</summary>

      <section>
        <h2>按工作区单元</h2>
        {outline.groups.map((group) => (
          <div key={group.app}>
            <h3>
              {group.app}（{group.paths.length} 个文件）
            </h3>
            <ul>
              {group.paths.map((path) => {
                const entry = byPath.get(path);
                return (
                  <li key={path}>
                    <code>{path}</code>
                    <span className="meta">
                      {' '}
                      {entry?.lines ?? 0} 行 · 依赖 {entry?.imports.length ?? 0} 个 · 被{' '}
                      {entry?.importedBy.length ?? 0} 个依赖
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2>被依赖最多</h2>
        <ul>
          {outline.hubs.map((hub) => (
            <li key={hub.path}>
              <code>{hub.path}</code>
              <span className="meta">
                {' '}
                被 {hub.inDegree} 个文件引用：
                {(byPath.get(hub.path)?.importedBy ?? []).join('、')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {outline.unresolved.length > 0 ? (
        <section>
          <h2>解析不到的引用</h2>
          <p className="meta">这些 import 指向的文件在仓库里不存在，多半是路径写错或文件被删。</p>
          <ul>
            {outline.unresolved.map((item) => (
              <li key={item.specifier}>
                <code>{item.specifier}</code>
                <span className="meta"> ← {item.importers.join('、')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>文件类型</h2>
        <ul>
          {outline.extensions.map((item) => (
            <li key={item.extension}>
              <code>{item.extension}</code>
              <span className="meta"> {item.count} 个</span>
            </li>
          ))}
        </ul>
        <p className="meta">附件 {outline.counts.attachments} 个（css / json）。</p>
      </section>

      <p className="meta">
        图形与这份清单来自同一份 codegraph.json；逐条依赖边在图上（可搜索、可看局部图）。
        内容侧的结构见 <Link to={WEB_ROUTES.graph}>内容结构</Link>。
      </p>
    </details>
  );
}
