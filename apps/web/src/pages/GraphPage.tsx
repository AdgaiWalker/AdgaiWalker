/**
 * 图谱（/graph）— Obsidian 力导向星图全舞台 + 同源文字版结构兜底。
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getGraphBodies, getKnowledgeGraph } from '../graph';
import { KnowledgeGraph } from '../components/graph/KnowledgeGraph';
import { createContentGraphDomain } from '../components/graph/domains';
import { buildGraphOutline } from '../shared/graph-outline';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function GraphPage() {
  const navigate = useNavigate();
  const graph = useMemo(() => getKnowledgeGraph(), []);
  const bodies = useMemo(() => getGraphBodies(), []);
  const outline = useMemo(() => buildGraphOutline(graph), [graph]);
  const domain = useMemo(
    () => createContentGraphDomain({ browsePath: dualEntry.browse.path, bodies, navigate }),
    [bodies, navigate],
  );

  return (
    <div className="graph-page">
      <header className="graph-page-head">
        <div>
          <h1 className="graph-page-title">结构</h1>
          <p className="graph-page-lead meta">
            {outline.entries.length} 篇文章 · {outline.linkCount} 条正文互引 ·{' '}
            {outline.isolated.length} 篇孤岛 · {outline.tagCount} 个标签 ·{' '}
            {outline.ghosts.length} 个未成篇引用
          </p>
        </div>
        <Link to={dualEntry.browse.path} className="graph-back">
          <ArrowLeft size={14} aria-hidden />
          回到{dualEntry.browse.label}
        </Link>
      </header>

      <div className="graph-stage-wrap">
        <KnowledgeGraph graph={graph} domain={domain} height={680} />
      </div>

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
                <span className="meta">
                  {' '}
                  {series.slugs.length} 篇：{series.slugs.join('、')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="meta">
          附件 {outline.attachmentCount} 个；使用说明见{' '}
          <Link to={WEB_ROUTES.about}>关于本站</Link>。
        </p>
      </details>
    </div>
  );
}
