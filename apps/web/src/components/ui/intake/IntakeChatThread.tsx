/**
 * IntakeChatThread — 卡口对话流：访客消息 + 回答（回答在对话内平铺）。
 * 纯展示：数据 in / 事件 out。失败如实显示原因，不假装成功。
 */
import type { IntakeChatTurn } from '../../../hooks/useIntakeChat';
import { IntakeAnswerCard } from './IntakeAnswerCard';

export type IntakeChatThreadProps = {
  turns: readonly IntakeChatTurn[];
};

export function IntakeChatThread({ turns }: IntakeChatThreadProps) {
  return (
    <div className="assistant-thread">
      {turns.map((turn, index) => {
        const isLast = index === turns.length - 1;
        return (
          <div key={turn.id} className="chat-turn">
            <p className="assistant-msg assistant-msg-user">{turn.body}</p>

            {turn.answer ? (
              <div className="assistant-msg assistant-msg-bot chat-answer">
                <IntakeAnswerCard
                  nextStep={turn.answer.nextStep}
                  bucketId={turn.answer.bucketId}
                  aiUsedFlag={turn.answer.aiUsedFlag}
                  clueId={turn.answer.clueId}
                  poolStatus={turn.answer.poolStatus}
                  suggestedSlug={turn.answer.suggestedSlug}
                  suggestedTitle={turn.answer.suggestedTitle}
                  submittedBody={turn.body}
                  animateNextStep={isLast}
                  variant="plain"
                />
              </div>
            ) : turn.error ? (
              <div className="assistant-msg assistant-msg-bot">
                <p className="alert-fail chat-error" role="alert">
                  {turn.error}
                </p>
              </div>
            ) : (
              <p className="meta chat-pending" aria-live="polite">
                正在整理下一步…（失败会说明原因，不假装成功）
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
