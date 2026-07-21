import { useCallback, useEffect, useState } from 'react';
import { adminApi, type Clue } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';
import { labelPool, labelSource, poolActions } from '../shared/labels';

const SOURCE_OPTIONS = [
  { value: 'manual-self', label: '站主热记' },
  { value: 'wechat', label: '微信外贴' },
  { value: 'live', label: '直播外贴' },
  { value: 'other-external', label: '其他外贴' },
] as const;

export function CluesPage() {
  const [list, setList] = useState<Clue[]>([]);
  const [body, setBody] = useState('');
  const [source, setSource] = useState<string>('manual-self');
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      setList(await adminApi.clues());
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>线索</h1>
      <div className="panel">
        <h3>热记 / 手动入库</h3>
        <label htmlFor="clue-source">来源（A11）</label>
        <select
          id="clue-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              await adminApi.createClue(body, source);
              setBody('');
              setList(await adminApi.clues());
            })
          }
        >
          入库
        </button>
        <button type="button" className="secondary" onClick={() => void load()}>
          刷新
        </button>
        {err ? <p className="error">{err}</p> : null}
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>正文</th>
              <th>来源</th>
              <th>池</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.body}
                  <div className="muted">{c.id.slice(0, 10)}…</div>
                </td>
                <td>{labelSource(c.source)}</td>
                <td>{labelPool(c.poolStatus)}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await adminApi.setPool(c.id, poolActions.intoPool.status);
                        setList(await adminApi.clues());
                      })
                    }
                  >
                    {poolActions.intoPool.label}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        await adminApi.setPool(c.id, poolActions.discard.status);
                        setList(await adminApi.clues());
                      })
                    }
                  >
                    {poolActions.discard.label}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
