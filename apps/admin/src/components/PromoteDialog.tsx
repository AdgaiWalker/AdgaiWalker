/**
 * PromoteDialog — 主选弹层：选目标线索 + 采集选题五问（与 shared ContentBrief 一一对应）。
 * SeedsPage 与 PipelinePage 共用；后端强制 brief，缺即 content-brief-incomplete。
 * 预填 whyNow：转题苗时带入的依据（evidence）在这里自然落位。
 */
import { useState } from 'react';
import { adminApi, type Clue, type Seed } from '../api/admin-api';

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

export function PromoteDialog({
  seed,
  clues,
  onDone,
  onCancel,
}: {
  seed: Seed;
  /** 已入池线索（主选候选） */
  clues: Clue[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [brief, setBrief] = useState<BriefDraft>(EMPTY_BRIEF);
  const [whyNow, setWhyNow] = useState(seed.whyNow ?? '');
  const [targetId, setTargetId] = useState<string>(clues[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const target = clues.find((c) => c.id === targetId);
    if (!target) {
      setErr('先选择一条已入池线索');
      return;
    }
    if (Object.values(brief).some((v) => !v.trim())) {
      setErr('选题五问都要填：写给谁 / 场景 / 卡点 / 关键问题 / 读完做什么');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.promote(seed.id, target.id, brief, whyNow.trim() || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ borderColor: 'rgba(96,165,250,.4)' }}>
      <strong>主选确认：{seed.title}</strong>
      {clues.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          暂无已入池线索——先在「池」段入池，或去线索页入池。
        </p>
      ) : (
        <>
          <label style={{ display: 'block', marginTop: 8 }}>
            主选线索
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ marginLeft: 8 }}>
              {clues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.body.slice(0, 40)}
                </option>
              ))}
            </select>
          </label>
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
        </>
      )}
      {err ? <p className="error">{err}</p> : null}
      <button type="button" disabled={busy || clues.length === 0} onClick={() => void submit()}>
        {busy ? '提交中…' : '确认主选并进入执行'}
      </button>{' '}
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
        取消
      </button>
    </div>
  );
}
