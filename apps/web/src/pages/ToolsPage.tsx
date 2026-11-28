/**
 * 问（/tools）— 对话式拿下一步；从回邮卡带来的原话直接发送一次。
 * 失败时无声附带站内相关文章兜底。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { IntakeChatThread } from '../components/ui/intake/IntakeChatThread';
import { IntakeComposer } from '../components/ui/intake/IntakeComposer';
import type { AskNavigationState } from '../components/paper/AskPostcard';
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
  const location = useLocation();
  const navigate = useNavigate();
  const chat = useIntakeChat();
  const { turns, loading, onDraftChange, send } = chat;
  const consumedAskRef = useRef(false);

  const q = params.get('q');
  useEffect(() => {
    if (q) onDraftChange(q);
  }, [q, onDraftChange]);

  // 回邮卡寄来的原话：只发一次，随即清掉 history state，刷新不会重发
  // 用 0ms 宏任务避开 StrictMode 初次模拟卸载触发 stop() 自中断
  const carried = (location.state as AskNavigationState | null)?.ask?.trim();
  useEffect(() => {
    if (!carried || consumedAskRef.current) return;
    const timer = window.setTimeout(() => {
      consumedAskRef.current = true;
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
      onDraftChange(carried);
      void send(carried);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [carried, location.pathname, location.search, navigate, onDraftChange, send]);

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
    trackWebEvent('web.ai_graceful_degraded', { surface: 'tools', code: 'intake-error' });
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
    <div className="measure ask-page">
      <header className="page-head">
        <div className="page-head-row">
          <h1 className="page-title">{dualEntry.ask.title}</h1>
          {turns.length > 0 ? (
            <button type="button" className="quiet-btn" onClick={chat.reset}>
              重新开始
            </button>
          ) : null}
        </div>
        <p className="page-dek">{dualEntry.ask.lead}</p>
      </header>

      <div className="ask-log">
        {turns.length === 0 ? (
          <p className="ask-examples">
            <span>试试：</span>
            {EXAMPLE_CHIPS.map((example) => (
              <button
                key={example}
                type="button"
                className="text-chip"
                disabled={loading}
                onClick={() => chat.onDraftChange(example)}
              >
                {example}
              </button>
            ))}
          </p>
        ) : (
          <>
            <IntakeChatThread turns={turns} onSendQuickReply={handleQuickReply} loading={loading} />
            {latestFailedTurn && fallbackHits.length > 0 ? (
              <aside className="ask-fallback" aria-label="站内相关阅读">
                <p className="rail-label">先读这几篇</p>
                <ul className="entry-list">
                  {fallbackHits.map((hit) => (
                    <li key={hit.url}>
                      <Link to={hit.url} className="entry">
                        <span className="entry-title">{hit.title}</span>
                      </Link>
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

      <p className="meta ask-footnote">{formatGuestQuotaHint(chat.config.guestQuota)}</p>
    </div>
  );
}
