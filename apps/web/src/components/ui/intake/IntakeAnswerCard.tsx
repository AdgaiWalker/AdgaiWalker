/**
 * IntakeAnswerCard — 下一步回答卡（对话式呈现：逐字 + 结构化 + 依据折叠）。
 *
 * 纯展示：数据 in / 事件 out。
 * 诚实边界：正文逐字只是呈现层动画（nextStep 由一次性 POST 返回完整文本）；
 * 「依据」只列服务端返回的真实字段，不展示、不模拟模型内部推理。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import {
  matchedNextStepTrigger,
  nextStepBucketLabel,
  type NextStepBucketId,
} from '@walker/shared';
import { useTypewriter } from '../../../hooks/useTypewriter';
import { outlineNextStep, splitInlineMarkup } from '../../../lib/next-step-outline';
import { dualEntry } from '../../../shared/dual-entry';
import { cluePoolStatusLabel } from '../../../shared/rules-ui';

const COPY_RESET_MS = 2200;

export type IntakeAnswerCardProps = {
  nextStep: string;
  bucketId: string;
  aiUsedFlag: boolean;
  clueId: string;
  poolStatus: string;
  suggestedSlug?: string | null;
  suggestedTitle?: string | null;
  /** 本次提交的原始描述：规则版用它核对命中触发词（同源于 shared 规则） */
  submittedBody: string;
  /** 新生成时逐字呈现；刷新还原时直出，避免误以为又生成了一次 */
  animateNextStep?: boolean;
  /** card = 独立页卡片（默认）；plain = 对话流内平铺，不再叠一层卡片材质 */
  variant?: 'card' | 'plain';
};

function InlineText({ text }: { text: string }) {
  return (
    <>
      {splitInlineMarkup(text).map((piece, index) => {
        if (piece.kind === 'code') return <code key={index}>{piece.text}</code>;
        if (piece.kind === 'strong') return <strong key={index}>{piece.text}</strong>;
        return <span key={index}>{piece.text}</span>;
      })}
    </>
  );
}

export function IntakeAnswerCard({
  nextStep,
  bucketId,
  aiUsedFlag,
  clueId,
  poolStatus,
  suggestedSlug,
  suggestedTitle,
  submittedBody,
  animateNextStep = false,
  variant = 'card',
}: IntakeAnswerCardProps) {
  const { visible, done } = useTypewriter(nextStep, { enabled: animateNextStep });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const steps = outlineNextStep(nextStep);
  const bucketKey = bucketId as NextStepBucketId;
  const typing = animateNextStep && !done;
  const sourceLabel = aiUsedFlag
    ? 'AI 生成 · 服务端已校验'
    : '规则兜底 · 关掉 AI 也成立';
  const triggerHit = aiUsedFlag ? null : matchedNextStepTrigger(submittedBody);
  const matchedTrigger =
    triggerHit && triggerHit.bucketId === bucketId ? triggerHit.trigger : null;

  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(nextStep);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(
        () => setCopied(false),
        COPY_RESET_MS,
      );
    } catch (error) {
      console.error('[intake] 复制失败，剪贴板不可用', error);
      setCopyFailed(true);
    }
  }, [nextStep]);

  return (
    <article className={`answer-card${variant === 'plain' ? ' is-plain' : ''}`}>
      <div className="answer-head">
        <span className={`answer-source${aiUsedFlag ? ' is-ai' : ''}`}>
          {sourceLabel}
        </span>
        <span className="answer-bucket">{nextStepBucketLabel(bucketKey)}</span>
      </div>

      <p className="answer-label">下一步</p>

      {typing ? (
        <p className="answer-typing">
          {visible}
          <span className="answer-caret" aria-hidden />
        </p>
      ) : steps.length > 1 ? (
        <ol className="answer-steps" aria-live="polite">
          {steps.map((step, index) => (
            <li key={`${index}-${step}`}>
              <InlineText text={step} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="answer-single" aria-live="polite">
          <InlineText text={nextStep} />
        </p>
      )}

      <div className="answer-actions">
        <button type="button" className="btn-secondary" onClick={handleCopy}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          <span>{copied ? '已复制' : '复制结论'}</span>
        </button>
        {copyFailed ? (
          <span className="meta">复制失败：剪贴板不可用，请手动选中文字</span>
        ) : null}
      </div>

      {suggestedSlug ? (
        <p className="success-meta">
          相关阅读：
          <Link to={`${dualEntry.browse.path}/${encodeURIComponent(suggestedSlug)}`}>
            {suggestedTitle || suggestedSlug}
          </Link>
        </p>
      ) : null}

      <details className="answer-basis">
        <summary>这份结论是怎么来的？</summary>
        <dl>
          <dt>结论来源</dt>
          <dd>
            {aiUsedFlag
              ? '模型生成，经服务端结构校验：桶必须在白名单内，推荐的引用必须来自站内可引用文章。'
              : '规则兜底：按关键词命中固定桶，关掉 AI 时会给出同样的下一步。'}
          </dd>
          <dt>判断桶</dt>
          <dd>
            {nextStepBucketLabel(bucketKey)}（<code>{bucketId}</code>）
          </dd>
          {matchedTrigger ? (
            <>
              <dt>命中触发词</dt>
              <dd>
                <code>{matchedTrigger}</code>
              </dd>
            </>
          ) : null}
          <dt>线索落库</dt>
          <dd>
            <code>{clueId}</code> · {cluePoolStatusLabel(poolStatus)}
          </dd>
        </dl>
        <p className="meta">
          只列服务端真实返回的字段：不展示模型内部推理，也不替你判断对错。
        </p>
      </details>
    </article>
  );
}
