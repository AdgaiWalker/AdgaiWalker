/**
 * 内容列表 — 调用管理 API 列出 content/log
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { adminApi, type ContentMeta } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';
import { ADMIN_ROUTES } from '../shared/routes';

export function ContentListPage() {
  const [list, setList] = useState<ContentMeta[]>([]);
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      setList(await adminApi.contentList());
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={22} aria-hidden />
        内容
      </h1>
      <div className="panel">
        <p className="muted">
          真相源：仓库 <code>content/log</code>。保存后请本地执行{' '}
          <code>pnpm content:gen</code>（或重新 build）刷新公开站。
        </p>
        {err ? <p className="error">{err}</p> : null}
        <button type="button" className="secondary" onClick={() => void load()}>
          刷新
        </button>
        <ul style={{ marginTop: '1rem', paddingLeft: '1.1rem' }}>
          {list.map((i) => (
            <li key={i.slug} style={{ marginBottom: 8 }}>
              <Link to={`${ADMIN_ROUTES.content}/${encodeURIComponent(i.slug)}`}>
                {i.title}
              </Link>
              <span className="muted">
                {' '}
                · {i.type} · {i.slug}
              </span>
            </li>
          ))}
        </ul>
        {list.length === 0 && !err ? (
          <p className="muted">暂无条目（或 API 未连上内容目录）</p>
        ) : null}
      </div>
    </div>
  );
}
