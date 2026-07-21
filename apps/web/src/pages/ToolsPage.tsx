import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isValidClueBody } from '@walker/shared';
import { ApiError } from '../api/http';
import { publicApi, type IntakeResult } from '../api/public-api';
import { dualEntry } from '../shared/dual-entry';
import {
  CLUE_BODY_MIN_LENGTH,
  INTAKE_RULE_HINTS,
  explainErrorCode,
} from '../shared/rules-ui';

const EXAMPLES = [
  '想学 AI，从哪开始？',
  '公众号文章写不出来，卡在选题',
  '改页面有 bug，不知道怎么排查',
  '要做一个报名表单收集信息',
  '每天重复加班，想提效',
  '周报总是拖到最后一刻',
] as const;

export function ToolsPage() {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResult | null>(null);

  const bodyOk = useMemo(() => isValidClueBody(body), [body]);
  const remaining = Math.max(0, CLUE_BODY_MIN_LENGTH - body.trim().length);

  async function submit(text: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await publicApi.intake(text);
      setResult(data);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(explainErrorCode(e.code, e.message));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="instrument-page">
      <h1 className="page-title">{dualEntry.ask.title}</h1>
      <p className="page-lead">
        {dualEntry.ask.lead} 资源见 <Link to="/tools/resources">资源列表</Link>。
      </p>

      <div className="surface-quiet instrument-rules">
        <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-parchment)' }}>
          规则
        </div>
        <ul>
          {INTAKE_RULE_HINTS.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>

      <div className="surface-l2 instrument-panel">
        <label htmlFor="need">描述你的场景或卡点</label>
        <textarea
          id="need"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="例如：想学 AI 做周报，但不知道第一步做什么…"
          disabled={loading}
          style={{ marginTop: 8 }}
        />
        <p className="meta">
          {bodyOk
            ? `字数 OK（≥${CLUE_BODY_MIN_LENGTH}）`
            : `还差约 ${remaining} 字（trim 后 ≥${CLUE_BODY_MIN_LENGTH}）`}
        </p>
        <div className="examples" aria-label="场景示例">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setBody(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <div className="instrument-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !bodyOk}
            onClick={() => void submit(body)}
          >
            {loading ? '提交中…' : '获取下一步'}
          </button>
          <Link to={dualEntry.browse.path} className="btn-ghost">
            先去{dualEntry.browse.label}
          </Link>
        </div>

        {error ? (
          <div className="alert-fail" role="alert">
            {error}
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="success-hero" aria-live="polite">
          <p className="success-hero-label">下一步</p>
          <p className="next-step">{result.nextStep}</p>
          <p className="success-meta">
            已收到 · 桶 {result.bucketId}
            {result.aiUsedFlag ? ' · AI' : ' · 规则'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
