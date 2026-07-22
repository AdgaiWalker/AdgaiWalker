/**
 * 内容编辑 — 读写 raw markdown（含 frontmatter）
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { adminApi } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';
import { ADMIN_ROUTES } from '../shared/routes';

export function ContentEditPage() {
  const { slug = '' } = useParams();
  const [raw, setRaw] = useState('');
  const [title, setTitle] = useState('');
  const { err, run } = useAdminAction();
  const [savedAt, setSavedAt] = useState('');

  const load = useCallback(async () => {
    if (!slug) return;
    await run(async () => {
      const doc = await adminApi.contentGet(slug);
      setRaw(doc.raw);
      setTitle(doc.title);
      setSavedAt('');
    });
  }, [run, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <p>
        <Link to={ADMIN_ROUTES.content} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <ArrowLeft size={16} aria-hidden />
          返回列表
        </Link>
      </p>
      <h1>{title || slug}</h1>
      <p className="muted">
        slug: <code>{slug}</code>
      </p>
      <div className="panel">
        {err ? <p className="error">{err}</p> : null}
        {savedAt ? <p className="muted">已保存 {savedAt}</p> : null}
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={28}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const doc = await adminApi.contentSave(slug, raw);
              setRaw(doc.raw);
              setTitle(doc.title);
              setSavedAt(new Date().toLocaleString('zh-CN'));
            })
          }
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}
        >
          <Save size={16} aria-hidden />
          保存到 content/log
        </button>
      </div>
    </div>
  );
}
