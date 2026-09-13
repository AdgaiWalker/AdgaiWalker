/**
 * 卡（/tools）— 对话式：说清卡点，原地拿到下一步。
 * 路径与文案读 dualEntry / WEB_ROUTES / INTAKE_TYPES，页面不硬编码。
 */
import { useCallback, useEffect, useRef } from 'react';
import { IntakeChatThread } from '../components/ui/intake/IntakeChatThread';
import { IntakeComposer } from '../components/ui/intake/IntakeComposer';
import { useIntakeChat } from '../hooks/useIntakeChat';
import { dualEntry } from '../shared/dual-entry';
import { INTAKE_TYPES } from '../shared/intake-types';
import { INTAKE_RULE_HINTS } from '../shared/rules-ui';

const SERVICE_NOTE =
  '站点处理服务在公网已可用：提交后写入线索并返回下一步建议；失败会说明原因，不会假装成功。';

/** 空态示例：每个卡点类型取一条，点击即发送 */
const EXAMPLE_CHIPS = INTAKE_TYPES.map((type) => type.examples[0]);

export function ToolsPage() {
  const chat = useIntakeChat();
  const { turns, loading } = chat;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // jsdom 等环境无 Element.scrollTo，可选调用兜底
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight });
  }, [turns, loading]);

  const handleSend = useCallback(() => {
    void chat.send();
  }, [chat]);

  return (
    <div className="chat-page">
      <header className="chat-head">
        <h1 className="page-title">{dualEntry.ask.title}</h1>
        <p className="page-lead">{dualEntry.ask.lead}</p>
        <p className="meta chat-service-note" role="note">
          {SERVICE_NOTE}
        </p>
        {turns.length > 0 ? (
          <button
            type="button"
            className="btn-ghost chat-reset"
            onClick={chat.reset}
          >
            重新开始
          </button>
        ) : null}
      </header>

      <div className="assistant-log chat-log" ref={logRef}>
        {turns.length === 0 ? (
          <div className="assistant-empty">
            <p className="meta chat-empty-lead">
              把卡点写清楚就行：谁、在什么情况下、想达成什么、现在卡在哪。
            </p>
            <div className="assistant-examples">
              {EXAMPLE_CHIPS.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="assistant-example-chip"
                  disabled={loading}
                  onClick={() => void chat.send(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <IntakeChatThread turns={turns} />
        )}
      </div>

      <IntakeComposer
        draft={chat.draft}
        draftOk={chat.draftOk}
        remaining={chat.remaining}
        minLength={chat.minLength}
        loading={chat.loading}
        onDraftChange={chat.onDraftChange}
        onSend={handleSend}
      />

      <p className="meta chat-footnote">
        {INTAKE_RULE_HINTS[1]} · {INTAKE_RULE_HINTS[3]}
      </p>
    </div>
  );
}
