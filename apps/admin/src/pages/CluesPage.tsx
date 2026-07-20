import { useCallback, useEffect, useState } from 'react';
import { api, type Clue } from '../api';

export function CluesPage() {
  const [list, setList] = useState<Clue[]>([]);
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.clues());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>线索</h1>
      <div className="panel">
        <h3>热记 / 手动入库</h3>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        <button
          type="button"
          onClick={async () => {
            try {
              await api.createClue(body);
              setBody('');
              await load();
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
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
                <td>{c.source}</td>
                <td>{c.poolStatus}</td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      await api.setPool(c.id, 'in-pool');
                      await load();
                    }}
                  >
                    入池
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      await api.setPool(c.id, 'discarded');
                      await load();
                    }}
                  >
                    丢弃
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
