/**
 * 脉络（/graph）— 文章正文互引的力导向图 + 同源文字版。
 * ?focus=<slug>：从文章页进来时只展开这一篇和它的邻居。
 */
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { noteNodeId } from '@walker/shared';
import { getPostBySlug } from '../content';
import { getGraphBodies, getKnowledgeGraph } from '../graph';
import { KnowledgeGraph } from '../components/graph/KnowledgeGraph';
import { createContentGraphDomain } from '../components/graph/domains';
import { postHref } from '../components/paper/EntryList';
import { buildGraphOutline } from '../shared/graph-outline';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function GraphPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focus = getPostBySlug(params.get('focus') ?? '');
  const graph = useMemo(() => getKnowledgeGraph(), []);
  const bodies = useMemo(() => getGraphBodies(), []);
  const outline = useMemo(() => buildGraphOutline(graph), [graph]);
  const domain = useMemo(
    () => createContentGraphDomain({ browsePath: dualEntry.browse.path, bodies, navigate }),
    [bodies, navigate],
  );

  return (
    <div className="graph-page">
      <header className="measure page-head">
        <h1 className="page-title">脉络</h1>
        <p className="page-dek">
          {focus ? (
            <>
              《<Link to={postHref(focus.slug)}>{focus.title}</Link>》和它连着的文章 ·{' '}
              <Link to={WEB_ROUTES.graph}>看全部</Link>
            </>
          ) : (
            <>
              {outline.entries.length} 篇文章 · {outline.linkCount} 条正文互引 · {outline.isolated.length} 篇还没连上
            </>
          )}
        </p>
      </header>

      <div className="wrap graph-stage-wrap">
        <KnowledgeGraph
          key={focus?.slug ?? 'all'}
          graph={graph}
          domain={domain}
          height={focus ? 520 : 640}
          compact
          {...(focus ? { local: { centerId: noteNodeId(focus.slug) } } : {})}
        />
      </div>

      <details className="measure graph-outline">
        <summary>文字版（{outline.entries.length} 篇）</summary>
        <ul className="graph-outline-list">
          {outline.entries.map((entry) => (
            <li key={entry.slug}>
              <Link to={postHref(entry.slug)}>{entry.title}</Link>
              {entry.links.length > 0 ? (
                <span className="meta">
                  {' → '}
                  {entry.links.map((link, index) => (
                    <span key={link.slug}>
                      {index > 0 ? '、' : ''}
                      {link.resolved ? <Link to={postHref(link.slug)}>{link.title}</Link> : `${link.slug}（未成篇）`}
                    </span>
                  ))}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
