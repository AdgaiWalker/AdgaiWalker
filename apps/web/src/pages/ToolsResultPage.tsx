/**
 * 问的结果页（/tools/result）— 呈现某一条 nextStep 与依据。
 *
 * 数据来源优先级：路由 state（刚生成）→ sessionStorage（刷新兜底）。
 * 主路径是对话式（/tools 原地呈现），这里保留深链与刷新还原；
 * 都没有时按空态诚实说明——没有后端查询接口，链接分享不出结果。
 */
import { Link, useLocation } from 'react-router-dom';
import { IntakeAnswerCard } from '../components/ui/intake/IntakeAnswerCard';
import { readIntakeResult, type IntakeResultView } from '../lib/intake-result-store';
import { dualEntry } from '../shared/dual-entry';
import { intakeTypeById } from '../shared/intake-types';

function describeBody(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * 刷新会保留 history state：用 Navigation Timing 区分，
 * 保证「刷新还原」直出文本，而不是让人以为又生成了一次。
 */
function isPageReload(): boolean {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return false;
  }
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry?.type === 'reload';
}

export function ToolsResultPage() {
  const location = useLocation();
  const fromNav = (location.state ?? null) as IntakeResultView | null;
  const data = fromNav ?? readIntakeResult();
  const copy = dualEntry.ask.result;

  if (!data) {
    return (
      <div className="measure page-head">
        <h1 className="page-title">{copy.emptyTitle}</h1>
        <p className="page-dek">{copy.emptyLead}</p>
        <p className="inline-actions">
          <Link to={dualEntry.ask.path}>回提问页再问一次</Link>
          <Link to={dualEntry.browse.path}>先去{dualEntry.browse.label}</Link>
        </p>
      </div>
    );
  }

  const { result, body, typeId } = data;

  return (
    <div className="measure ask-page">
      <header className="page-head">
        <h1 className="page-title">{copy.title}</h1>
        <p className="page-dek">{copy.lead}</p>
      </header>

      <p className="result-echo">
        {typeId ? <span className="result-echo-type">{intakeTypeById(typeId).label}</span> : null}
        <span className="result-echo-body">{describeBody(body)}</span>
        <Link to={dualEntry.ask.path}>换个卡点</Link>
      </p>

      <IntakeAnswerCard
        nextStep={result.nextStep}
        bucketId={result.bucketId}
        aiUsedFlag={result.aiUsedFlag}
        clueId={result.clueId}
        poolStatus={result.poolStatus}
        suggestedSlug={result.suggestedSlug}
        suggestedTitle={result.suggestedTitle}
        submittedBody={body}
        animateNextStep={Boolean(fromNav) && !isPageReload()}
      />
    </div>
  );
}
