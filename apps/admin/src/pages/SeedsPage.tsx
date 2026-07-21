import { useCallback, useEffect, useState } from 'react';
import { adminApi, type Clue, type Seed } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

export function SeedsPage() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [title, setTitle] = useState('');
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      const [s, c] = await Promise.all([adminApi.seeds(), adminApi.clues()]);
      setSeeds(s);
      setClues(c);
    });
  }, [run]);

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
          onClick={() =>
            void run(async () => {
              await adminApi.createSeed(title);
              setTitle('');
              const [s, c] = await Promise.all([adminApi.seeds(), adminApi.clues()]);
              setSeeds(s);
              setClues(c);
            })
          }
        >
          新建
        </button>
        {err ? <p className="error">{err}</p> : null}
      </div>
      {seeds.map((s) => (
        <div className="panel" key={s.id}>
          <strong>{s.title}</strong>
          <div className="muted">
            主选：{s.primaryClueId ? `${s.primaryClueId.slice(0, 10)}…` : '无'} · 关联{' '}
            {s.links.length}
          </div>
          <div>
            {inPool.length === 0 ? (
              <p className="muted">暂无已入池线索，请先在「线索」入池</p>
            ) : (
              inPool.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void run(async () => {
                      await adminApi.promote(s.id, c.id);
                      const [ns, nc] = await Promise.all([
                        adminApi.seeds(),
                        adminApi.clues(),
                      ]);
                      setSeeds(ns);
                      setClues(nc);
                    })
                  }
                >
                  主选 ← {c.body.slice(0, 24)}
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
