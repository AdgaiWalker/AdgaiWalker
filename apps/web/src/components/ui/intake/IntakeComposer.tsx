/**
 * IntakeComposer — 卡口底部输入条：Enter 发送、Shift+Enter 换行，输入法组词不误发。
 * 数据 in / 事件 out。
 */
export type IntakeComposerProps = {
  draft: string;
  draftOk: boolean;
  remaining: number;
  minLength: number;
  quotaMinLength?: number;
  loading: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
};

export function IntakeComposer({
  draft,
  draftOk,
  remaining,
  minLength,
  quotaMinLength = 4,
  loading,
  onDraftChange,
  onSend,
  onStop,
}: IntakeComposerProps) {
  const trimmedLength = draft.trim().length;
  let counterText = '';
  if (trimmedLength > 0 && trimmedLength < quotaMinLength) {
    counterText = `${quotaMinLength} 字以下不消耗体验次数`;
  } else if (trimmedLength >= quotaMinLength) {
    counterText = `${trimmedLength} 字`;
  }
  return (
    <div className="assistant-composer chat-composer">
      <label htmlFor="need" className="sr-only">
        描述你的卡点
      </label>
      <textarea
        id="need"
        rows={2}
        value={draft}
        disabled={loading}
        placeholder={
          loading
            ? '正在整理下一步，可点击打断或按 Esc 停止…'
            : '说清你卡在哪…（Enter 发送，Shift+Enter 换行）'
        }
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && loading) {
            e.preventDefault();
            onStop?.();
            return;
          }
          if (
            e.key === 'Enter' &&
            !e.shiftKey &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            if (draftOk && !loading) onSend();
          }
        }}
      />
      <div className="chat-composer-side">
        <span className="meta chat-counter">
          {counterText}
        </span>
        {loading ? (
          <button
            type="button"
            className="btn-ghost assistant-stop chat-stop-btn"
            onClick={onStop}
            title="打断当前回答（按 Esc 键亦可）"
          >
            打断
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary assistant-send"
            disabled={!draftOk}
            onClick={onSend}
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
