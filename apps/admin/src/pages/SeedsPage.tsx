import { useCallback, useEffect, useState } from 'react';
import { adminApi, type Clue, type Seed } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

/** 主选必填的选题五问（与 shared ContentBrief 合同一一对应） */
const BRIEF_FIELDS: ReadonlyArray<{ key: keyof BriefDraft; label: string; placeholder: string }> = [
  { key: 'audience', label: '写给谁', placeholder: '例：被 AI 工具淹没的独立开发者' },
  { key: 'scenario', label: '什么场景', placeholder: '例：选型阶段不知道从哪开始' },
  { key: 'problem', label: '卡在哪', placeholder: '例：工具太多无法判断哪个适合自己' },
  { key: 'keyQuestion', label: '关键问题', placeholder: '例：按什么顺序评估 AI 工具？' },
  { key: 'intendedAction', label: '读完做什么', placeholder: '例：按清单跑通第一轮选型' },
];

type BriefDraft = { audience: string; scenario: string; problem: string; keyQuestion: string; intendedAction: string };

const EMPTY_BRIEF: BriefDraft = {
  audience: '',
  scenario: '',
  problem: '',
  keyQuestion: '',
  intendedAction: '',
};

export function SeedsPage() {
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [title, setTitle] = useState('');
  // 主选是两步操作：先点目标线索，补全选题五问后才能真正提交（后端强制 brief，缺即 content-brief-incomplete）
  const [promoteTarget, setPromoteTarget] = useState<{ seedId: string; seedTitle: string; clueId: string; clueBody: string } | null>(null);
  const [brief, setBrief] = useState<BriefDraft>(EMPTY_BRIEF);
  const [whyNow, setWhyNow] = useState('');
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

  const startPromote = (seed: Seed, clue: Clue) => {
    setPromoteTarget({ seedId: seed.id, seedTitle: seed.title, clueId: clue.id, clueBody: clue.body });
    setBrief(EMPTY_BRIEF);
    setWhyNow('');
  };

  const submitPromote = () =>
    void run(async () => {
      if (!promoteTarget) return;
      if (Object.values(brief).some((v) => !v.trim())) {
        throw new Error('选题五问都要填：写给谁 / 场景 / 卡点 / 关键问题 / 读完做什么');
      }
      await adminApi.promote(promoteTarget.seedId, promoteTarget.clueId, brief, whyNow.trim() || undefined);
      setPromoteTarget(null);
      const [s, c] = await Promise.all([adminApi.seeds(), adminApi.clues()]);
      setSeeds(s);
      setClues(c);
    });

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
        <div className="panel">
          <strong>主选确认：{promoteTarget.seedTitle}</strong>
          <p className="muted">主选线索：{promoteTarget.clueBody.slice(0, 48)}</p>
          <div className="workstation-brief-grid">
            {BRIEF_FIELDS.map(({ key, label, placeholder }) => (
              <label key={key}>
                {label}
                <input
                  value={brief[key]}
                  placeholder={placeholder}
                  onChange={(e) => setBrief((cur) => ({ ...cur, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label>
              为什么是现在（可选）
              <input value={whyNow} onChange={(e) => setWhyNow(e.target.value)} />
            </label>
          </div>
          <button type="button" onClick={submitPromote}>
            确认主选并进入执行
          </button>{' '}
          <button type="button" className="secondary" onClick={() => setPromoteTarget(null)}>
            取消
          </button>
        </div>
      ) : null}

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
                  onClick={() => startPromote(s, c)}
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
