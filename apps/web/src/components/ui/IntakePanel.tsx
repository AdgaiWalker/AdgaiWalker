/**
 * IntakePanel — 卡口展示块：数据 in / 事件 out，无 API
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type IntakeResultView = {
  nextStep: string;
  bucketId: string;
  aiUsedFlag: boolean;
};

export type IntakePanelProps = {
  title: string;
  lead: ReactNode;
  ruleHints: readonly string[];
  examples: readonly string[];
  body: string;
  bodyOk: boolean;
  remaining: number;
  minLength: number;
  loading: boolean;
  error: string | null;
  result: IntakeResultView | null;
  browsePath: string;
  browseLabel: string;
  resourcesHref?: string;
  /** 诚实说明：公网/本地服务边界（非错误） */
  serviceNote?: string | null;
  onBodyChange: (body: string) => void;
  onPickExample: (example: string) => void;
  onSubmit: () => void;
};

export function IntakePanel({
  title,
  lead,
  ruleHints,
  examples,
  body,
  bodyOk,
  remaining,
  minLength,
  loading,
  error,
  result,
  browsePath,
  browseLabel,
  resourcesHref = '/tools/resources',
  serviceNote = null,
  onBodyChange,
  onPickExample,
  onSubmit,
}: IntakePanelProps) {
  return (
    <div className="instrument-page">
      <h1 className="page-title">{title}</h1>
      <p className="page-lead">
        {lead} 资源见 <Link to={resourcesHref}>资源列表</Link>。
      </p>

      {serviceNote ? (
        <p className="instrument-service-note meta" role="note">
          {serviceNote}
        </p>
      ) : null}

      <div className="surface-quiet instrument-rules">
        <div
          style={{
            fontWeight: 600,
            marginBottom: 4,
            color: 'var(--color-parchment)',
          }}
        >
          规则
        </div>
        <ul>
          {ruleHints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>

      <div className="surface-l2 instrument-panel">
        <label htmlFor="need">描述你的场景或卡点</label>
        <textarea
          id="need"
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="例如：想学 AI 做周报，但不知道第一步做什么…"
          disabled={loading}
          style={{ marginTop: 8 }}
        />
        <p className="meta">
          {bodyOk
            ? `字数 OK（≥${minLength}）`
            : `还差约 ${remaining} 字（trim 后 ≥${minLength}）`}
        </p>
        <div className="examples" aria-label="场景示例">
          {examples.map((ex) => (
            <button key={ex} type="button" onClick={() => onPickExample(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <div className="instrument-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={loading || !bodyOk}
            onClick={onSubmit}
          >
            {loading ? '提交中…' : '获取下一步'}
          </button>
          <Link to={browsePath} className="btn-ghost">
            先去{browseLabel}
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
