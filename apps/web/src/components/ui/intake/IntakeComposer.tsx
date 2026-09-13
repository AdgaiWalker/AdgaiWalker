/**
 * IntakeComposer — 卡口底部输入条：Enter 发送、Shift+Enter 换行，输入法组词不误发。
 * 数据 in / 事件 out。
 */
export type IntakeComposerProps = {
  draft: string;
  draftOk: boolean;
  remaining: number;
  minLength: number;
  loading: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
};

export function IntakeComposer({
  draft,
  draftOk,
  remaining,
  minLength,
  loading,
  onDraftChange,
  onSend,
}: IntakeComposerProps) {
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
          {draftOk ? `字数 OK（≥${minLength}）` : `还差约 ${remaining} 字`}
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
