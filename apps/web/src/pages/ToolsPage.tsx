import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isValidClueBody } from '@walker/shared';
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
];

interface IntakeOk {
  clueId: string;
  nextStep: string;
  bucketId: string;
  aiUsedFlag: boolean;
}

export function ToolsPage() {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeOk | null>(null);

  const bodyOk = useMemo(() => isValidClueBody(body), [body]);
  const remaining = Math.max(0, CLUE_BODY_MIN_LENGTH - body.trim().length);

  async function submit(text: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body: text, source: 'tools-visitor' }),
      });
      const data = (await res.json()) as {
        code?: string;
        message?: string;
        nextStep?: string;
        clueId?: string;
        bucketId?: string;
        aiUsedFlag?: boolean;
      };
      if (!res.ok) {
        setError(explainErrorCode(data.code, data.message ?? `HTTP ${res.status}`));
        return;
      }
      setResult({
        clueId: data.clueId!,
        nextStep: data.nextStep!,
        bucketId: data.bucketId!,
        aiUsedFlag: Boolean(data.aiUsedFlag),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">你卡在哪？</h1>
      <p className="page-lead">
        用场景描述困扰或目标。无需登录即可试一次；成功后重点看「下一步」。资源见{' '}
        <Link to="/tools/resources">资源列表</Link>。
      </p>

      <div
        className="panel-glass"
        style={{ padding: '1rem 1.15rem', borderRadius: 20, marginBottom: 14 }}
      >
        <div className="meta" style={{ fontWeight: 600, marginBottom: 6 }}>
          规则（与后端一致）
        </div>
        <ul className="meta" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          {INTAKE_RULE_HINTS.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>

      <div className="panel-glass" style={{ padding: '1.25rem', borderRadius: 28 }}>
        <label htmlFor="need" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
          描述你的场景或卡点
        </label>
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
        <button
          type="button"
          className="btn-primary"
          disabled={loading || !bodyOk}
          onClick={() => void submit(body)}
        >
          {loading ? '提交中…' : '获取下一步'}
        </button>
        {error ? (
          <p className="meta" role="alert" style={{ marginTop: 12, color: 'var(--color-brand)' }}>
            {error}
          </p>
        ) : null}
        {result ? (
          <div style={{ marginTop: 16 }}>
            <p className="meta">
              已收到 · 桶 {result.bucketId}
              {result.aiUsedFlag ? ' · AI' : ' · 规则 nextStep'}
            </p>
            <p className="next-step">下一步：{result.nextStep}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
