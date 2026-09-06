import { useCallback, useEffect, useState } from 'react';
import { adminApi, type Clue, type Seed } from '../api/admin-api';
import { PromoteDialog } from '../components/PromoteDialog';
import { useAdminAction } from '../hooks/useAdminAction';

export function SeedsPage() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [title, setTitle] = useState('');
  const [promoteTarget, setPromoteTarget] = useState<Seed | null>(null);
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
      <header className="page-head">
        <h1>题苗</h1>
        <p className="page-lead">新建题苗 · 挂主线索 · 推进执行。</p>
      </header>
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

      {promoteTarget ? (
        <PromoteDialog
          seed={promoteTarget}
          clues={inPool}
          onDone={() => {
            setPromoteTarget(null);
            void load();
          }}
          onCancel={() => setPromoteTarget(null)}
        />
      ) : null}

      {seeds.map((s) => (
        <div className="panel" key={s.id}>
          <strong>{s.title}</strong>
          <div className="muted">
            主选：{s.primaryClueId ? `${s.primaryClueId.slice(0, 10)}…` : '无'} · 关联{' '}
            {s.links.length}
            {s.whyNow ? ` · 依据：${s.whyNow.slice(0, 40)}` : ''}
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
                  onClick={() => setPromoteTarget(s)}
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
