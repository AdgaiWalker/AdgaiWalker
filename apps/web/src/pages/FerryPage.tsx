/**
 * Ferry 项目页 — 聚合 series=Ferry 的笔记与外链说明
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Ship } from 'lucide-react';
import { getPostsBySeries } from '../content';
import { dualEntry } from '../shared/dual-entry';

export function FerryPage() {
  const posts = getPostsBySeries('Ferry');

  return (
    <div>
      <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Ship size={28} aria-hidden />
        Ferry
      </h1>
      <p className="page-lead">
        人机协作世界协议：从差距到行动（f(x)=y）、做减法、螺旋进化。以下为本站
        Ferry 主题线公开笔记。
      </p>
      <div className="surface-l2" style={{ padding: '1rem 1.25rem' }}>
        {posts.length === 0 ? (
          <p className="meta">暂无归入 Ferry 线的公开文</p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            {posts.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`${dualEntry.browse.path}/${encodeURIComponent(p.slug)}`}
                >
                  {p.seriesOrder != null ? `${p.seriesOrder}. ` : ''}
                  {p.title}
                </Link>
                {p.summary ? (
                  <span className="meta"> — {p.summary.slice(0, 80)}</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        <p style={{ marginTop: '1.25rem' }}>
          <Link
            to={dualEntry.browse.path}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            去逛按主题线筛选
            <ArrowRight size={14} />
          </Link>
        </p>
      </div>
    </div>
  );
}
