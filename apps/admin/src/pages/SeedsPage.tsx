import { useCallback, useEffect, useState } from 'react';
import { api, type Clue, type Seed } from '../api';

export function SeedsPage() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.seeds(), api.clues()]);
      setSeeds(s);
      setClues(c);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inPool = clues.filter((c) => c.poolStatus === 'in-pool');

  return (
    <div>
      <h1>题苗</h1>
      <div className="panel">
        <input
          placeholder="题苗标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await api.createSeed(title);
              setTitle('');
              await load();
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          新建
        </button>
        {err ? <p className="error">{err}</p> : null}
      </div>
      {seeds.map((s) => (
        <div className="panel" key={s.id}>
          <strong>{s.title}</strong>
          <div className="muted">
            primary: {s.primaryClueId ?? '无'} · links {s.links.length}
          </div>
          <div>
            {inPool.map((c) => (
              <button
                key={c.id}
                type="button"
                className="secondary"
                onClick={async () => {
                  try {
                    await api.promote(s.id, c.id);
                    await load();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                主选← {c.body.slice(0, 24)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
