/**
 * 图谱结构体检（站主面）。
 *
 * 与访客面 `/graph` 同一份数据、同一套判定（shared computeGraphIssues），
 * 但形式是**清单**不是第二张图：图给人看形状，清单给人动手。
 * 每行直接链到内容编辑器，看到问题就能当场补链接。
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type GraphHealth, type GraphIssue } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';
import { ADMIN_ROUTES } from '../shared/routes';

const ISSUE_LABEL: Record<GraphIssue['kind'], string> = {
  orphan: '孤岛（正文里没有任何互引）',
  'broken-link': '坏链（被引用但文章不存在）',
  'one-way-link': '单向链接（对方没有回引）',
  'series-without-links': '只有主题线、成员之间没有互引',
  'attachment-orphan': '附件孤岛（没有任何正文引用）',
};

const ISSUE_ORDER: GraphIssue['kind'][] = [
  'broken-link',
  'orphan',
  'one-way-link',
  'series-without-links',
  'attachment-orphan',
];

function editorHref(slug: string): string {
  return ADMIN_ROUTES.contentEdit.replace(':slug', encodeURIComponent(slug));
}

export function GraphHealthPage() {
  const [health, setHealth] = useState<GraphHealth | null>(null);
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      setHealth(await adminApi.graphHealth());
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) return <p className="error">{err}</p>;
  if (!health) return <p className="muted">加载中…</p>;

  const grouped = ISSUE_ORDER.map((kind) => ({
    kind,
    // 主题线类问题的 slug 为空，用标题兜底展示
    items: health.issues.filter((issue) => issue.kind === kind),
  })).filter((group) => group.items.length > 0);

  return (
    <div>
      <header className="page-head">
        <h1>结构体检</h1>
        <p className="page-lead">
          公开内容的互引结构问题清单；图谱只画正文内链，不含模型推断。
        </p>
      </header>

      <div className="panel">
        <div className="stat-row">
          <div className="stat-chip">
            <span className="stat-chip-label">文章</span>
            <span className="stat-chip-value">{health.totals.notes}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">正文互引</span>
            <span className="stat-chip-value">{health.totals.linkEdges}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">孤岛</span>
            <span className="stat-chip-value">{health.totals.isolatedNotes}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-label">标签节点</span>
            <span className="stat-chip-value">{health.nodeCounts.tag ?? 0}</span>
          </div>
        </div>
        <p className="muted">
          坏链 {health.issueCounts['broken-link'] ?? 0} · 单向链接{' '}
          {health.issueCounts['one-way-link'] ?? 0} · 附件孤岛{' '}
          {health.issueCounts['attachment-orphan'] ?? 0}
          {health.issueCounts.orphan
            ? ` · 孤岛 ${health.issueCounts.orphan}`
            : ''}
        </p>
        <p className="muted">数据时间：{health.generatedAt}</p>
      </div>

      {grouped.length === 0 ? (
        <div className="panel">
          <h3>没有发现问题</h3>
          <p className="muted">当前内容的所有文章都至少有一条正文互引，且没有坏链。</p>
        </div>
      ) : (
        grouped.map((group) => (
          <div className="panel" key={group.kind}>
            <h3>
              {ISSUE_LABEL[group.kind]} · {group.items.length}
            </h3>
            <table>
              <thead>
                <tr>
                  <th>文章</th>
                  <th>说明</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((issue) => (
                  <tr key={`${issue.kind}:${issue.nodeId || issue.title}`}>
                    <td>{issue.title}</td>
                    <td>{issue.detail}</td>
                    <td>
                      {issue.slug ? (
                        <Link to={editorHref(issue.slug)}>编辑</Link>
                      ) : (
                        <span className="muted">
                          {issue.members?.slice(0, 3).join(' / ') ?? '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <div className="panel">
        <h3>被引用最多的文章</h3>
        {health.hubs.length === 0 ? (
          <p className="muted">还没有任何被引用的文章。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>文章</th>
                <th>被引用次数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {health.hubs.map((hub) => (
                <tr key={hub.slug}>
                  <td>{hub.title}</td>
                  <td>{hub.inDegree}</td>
                  <td>
                    <Link to={editorHref(hub.slug)}>编辑</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
