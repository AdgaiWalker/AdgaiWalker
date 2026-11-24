/**
 * 提问（/tools）— 对话式拆解下一步；去除多余解释废话；失败时无声附带站内相关文章兜底。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IntakeChatThread } from '../components/ui/intake/IntakeChatThread';
import { IntakeComposer } from '../components/ui/intake/IntakeComposer';
import { getAllItems } from '../content';
import { useIntakeChat } from '../hooks/useIntakeChat';
import { trackWebEvent } from '../lib/web-telemetry';
import { dualEntry } from '../shared/dual-entry';
import { INTAKE_TYPES } from '../shared/intake-types';
import { formatGuestQuotaHint } from '../shared/rules-ui';
import { searchContentItems } from '../shared/search-content';

const EXAMPLE_CHIPS = INTAKE_TYPES.map((type) => type.examples[0]);

export function ToolsPage() {
  const [params] = useSearchParams();
  const chat = useIntakeChat();
  const { turns, loading, onDraftChange } = chat;
  const logRef = useRef<HTMLDivElement>(null);

  const q = params.get('q');
  useEffect(() => {
    if (q) onDraftChange(q);
  }, [q, onDraftChange]);

  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [turns, loading]);

  const latestFailedTurn = useMemo(() => {
    const last = turns[turns.length - 1];
    return last && last.error ? last : null;
  }, [turns]);

  const fallbackHits = useMemo(() => {
    if (!latestFailedTurn) return [];
    return searchContentItems(getAllItems(), latestFailedTurn.body, 3);
  }, [latestFailedTurn]);

  useEffect(() => {
    if (!latestFailedTurn) return;
    trackWebEvent('web.ai_graceful_degraded', {
      surface: 'tools',
      code: 'intake-error',
    });
  }, [latestFailedTurn]);

  const handleSend = useCallback(() => {
    void chat.send();
  }, [chat]);

  const handleQuickReply = useCallback(
    (replyText: string) => {
      void chat.send(replyText);
    },
    [chat],
  );

  return (
    <div className="chat-page">
      <header className="chat-head">
        <div className="chat-head-row">
          <h1 className="page-title">{dualEntry.ask.title}</h1>
          {turns.length > 0 ? (
            <button
              type="button"
              className="btn-ghost chat-reset"
              onClick={chat.reset}
            >
              重新开始
            </button>
          ) : null}
        </div>
        <p className="page-lead">{dualEntry.ask.lead}</p>
      </header>

      <div className="assistant-log chat-log" ref={logRef}>
        {turns.length === 0 ? (
          <div className="assistant-empty">
            <div className="assistant-examples">
              {EXAMPLE_CHIPS.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="assistant-example-chip"
                  disabled={loading}
                  onClick={() => chat.onDraftChange(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <IntakeChatThread
              turns={turns}
              onSendQuickReply={handleQuickReply}
              loading={loading}
            />
            {latestFailedTurn && fallbackHits.length > 0 ? (
              <aside className="chat-degrade-box" aria-label="站内相关阅读">
                <p className="meta">可以先参考这几篇站内记录：</p>
                <ul>
                  {fallbackHits.map((hit) => (
                    <li key={hit.url}>
                      <Link to={hit.url}>{hit.title}</Link>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </>
        )}
      </div>

      <IntakeComposer
        draft={chat.draft}
        draftOk={chat.draftOk}
        remaining={chat.remaining}
        minLength={chat.minLength}
        quotaMinLength={chat.quotaMinLength}
        loading={chat.loading}
        onDraftChange={chat.onDraftChange}
        onSend={handleSend}
        onStop={chat.stop}
      />

      <p className="meta chat-footnote">
        {formatGuestQuotaHint(chat.config.guestQuota)}
      </p>
    </div>
  );
}
