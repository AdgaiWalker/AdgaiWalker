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
        placeholder="说清你卡在哪…（Enter 发送，Shift+Enter 换行）"
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
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
        <button
          type="button"
          className="btn-primary assistant-send"
          disabled={loading || !draftOk}
          onClick={onSend}
        >
          {loading ? '回答中…' : '发送'}
        </button>
      </div>
    </div>
  );
}
