/**
 * 图谱（页）— Obsidian Graph View 对齐的全局知识图谱。
 * 职责：全局图 + 文字版结构兜底（canvas 对爬虫不可见，兜底正文必须真实存在）。
 * 依赖：graph.getKnowledgeGraph/getGraphBodies、KnowledgeGraph、graph-outline
 * 触发：WEB_ROUTES.graph
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getGraphBodies, getKnowledgeGraph } from '../graph';
import { KnowledgeGraph } from '../components/graph/KnowledgeGraph';
import { buildGraphOutline } from '../shared/graph-outline';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function GraphPage() {
  const graph = useMemo(() => getKnowledgeGraph(), []);
  const bodies = useMemo(() => getGraphBodies(), []);
  const outline = useMemo(() => buildGraphOutline(graph), [graph]);

  return (
    <div className="graph-page">
      <header className="graph-page-head">
        <h1 className="graph-page-title">结构</h1>
        <p className="graph-page-lead meta">
          {outline.entries.length} 篇文章 · {outline.linkCount} 条正文互引 ·{' '}
          {outline.isolated.length} 篇孤岛 · {outline.tagCount} 个标签 ·{' '}
          {outline.ghosts.length} 个坏链
        </p>
        <p className="graph-page-note">
          这张图只画一件事：文章正文之间的互相引用。没有模型推断，没有被引用不算数的边。
          圆越大说明被引用越多；虚线空心圈是被引用但还不存在的笔记。
        </p>
        <Link to={dualEntry.browse.path} className="graph-back">
          <ArrowLeft size={14} aria-hidden />
          回到{dualEntry.browse.label}
        </Link>
      </header>

      <KnowledgeGraph
        graph={graph}
        bodies={bodies}
        browsePath={dualEntry.browse.path}
        height={620}
      />

      {/*
        文字版结构：既是无 JS / 爬虫的兜底正文，也是真实可用的降级视图。
        它必须与图同源（同一份 graph.json），不做第二套说法。
      */}
      <details className="graph-outline">
        <summary>文字版结构（{outline.entries.length} 篇）</summary>

        <section>
          <h2>互引关系</h2>
          <ul>
            {outline.entries.map((entry) => (
              <li key={entry.slug}>
                <Link to={`${dualEntry.browse.path}/${encodeURIComponent(entry.slug)}`}>
                  {entry.title}
                </Link>
                {entry.links.length > 0 ? (
                  <>
                    {' '}
                    →{' '}
                    {entry.links.map((link, index) => (
                      <span key={link.slug}>
                        {index > 0 ? '、' : ''}
                        {link.resolved ? (
                          <Link
                            to={`${dualEntry.browse.path}/${encodeURIComponent(link.slug)}`}
                          >
                            {link.title}
                          </Link>
                        ) : (
                          <span className="graph-outline-ghost">{link.slug}（尚不存在）</span>
                        )}
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="meta"> — 正文里还没有引用任何文章</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {outline.ghosts.length > 0 ? (
          <section>
            <h2>被引用但尚不存在的笔记</h2>
            <ul>
              {outline.ghosts.map((ghost) => (
                <li key={ghost.slug}>
                  <code>{ghost.slug}</code>
                  <span className="meta"> 被 {ghost.referencedBy.join('、')} 引用</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2>孤岛（{outline.isolated.length} 篇）</h2>
          <p className="meta">
            这些文章在正文里没有与任何文章互相引用。孤立不是错误，但意味着读者很难从别处走到它们。
          </p>
          <ul>
            {outline.isolated.map((entry) => (
              <li key={entry.slug}>
                <Link to={`${dualEntry.browse.path}/${encodeURIComponent(entry.slug)}`}>
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>主题线</h2>
          <ul>
            {outline.series.map((series) => (
              <li key={series.name}>
                <strong>{series.name}</strong>
                <span className="meta"> {series.slugs.length} 篇：{series.slugs.join('、')}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="meta">
          附件 {outline.attachmentCount} 个。图形与这份清单来自同一份 graph.json；图谱使用说明见{' '}
          <Link to={WEB_ROUTES.about}>关于本站</Link>。
        </p>
      </details>
    </div>
  );
}
