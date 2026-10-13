import { useEffect, useRef, type Dispatch, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type Ref, type SetStateAction } from 'react';
import { isValidAssistantBody } from '@walker/shared';
import { Link } from 'react-router-dom';
import { getPostBySlug } from '../../content';
import { dualEntry } from '../../shared/dual-entry';
import { ASSISTANT_EXAMPLES, HIDDEN_HISTORY_ANSWER } from '../ui/AssistantThread';
import type { useHomeAssistant } from './useHomeAssistant';

type XiaoyingPanelProps = {
  assistant: ReturnType<typeof useHomeAssistant>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  onMeet: () => void;
  searchRef?: Ref<HTMLTextAreaElement>;
};

function isCoarsePhone() {
  return window.matchMedia?.('(max-width: 760px)')?.matches ?? window.innerWidth <= 760;
}

/** 问答气泡与输入框；影鳐位置、拖动和邀请状态由父组件管理。 */
export function XiaoyingPanel({ assistant, open, setOpen, draft, setDraft, onMeet, searchRef }: XiaoyingPanelProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const { manifest, manifestLoading, selectedMember, setSelectedMemberKey, messages, loading, streaming, error, send, stop } = assistant;
  const busy = loading || streaming;
  const draftOk = isValidAssistantBody(draft);
  const lastUserIndex = messages.map(message => message.role).lastIndexOf('user');
  const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : null;
  const lastAssistant = lastUserIndex >= 0
    ? messages.slice(lastUserIndex + 1).find(message => message.role === 'assistant')
    : null;
  const speaking = Boolean(lastAssistant?.text);
  const waiting = busy && !speaking;

  const input = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (typeof searchRef === 'function') searchRef(node);
    else if (searchRef) searchRef.current = node;
  };

  useEffect(() => {
    if (!open || isCoarsePhone()) return;
    const timer = window.setTimeout(() => innerRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  function ask(text: string) {
    if (!isValidAssistantBody(text) || busy || manifestLoading) return;
    onMeet();
    setDraft('');
    setOpen(true);
    void send(text);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    ask(draft.trim());
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <div
      id="xiaoying-home-panel"
      className="xiaoying-panel"
      data-open={open ? 'true' : 'false'}
      role="dialog"
      aria-label="问小影"
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <small className="xiaoying-panel-current" aria-live="polite">
        {manifestLoading ? '正在连接小影…' : manifest?.available && manifest.aiEnabled && selectedMember
          ? `当前由 ${selectedMember.name} · v${selectedMember.revision} 回答`
          : '当前使用固定回答'}
      </small>
      {manifest?.available && manifest.aiEnabled && manifest.members.length > 1 ? (
        <select
          className="xiaoying-panel-member"
          aria-label="选择回答成员"
          value={selectedMember?.key ?? ''}
          disabled={busy || manifestLoading}
          onChange={(event) => setSelectedMemberKey(event.target.value)}
        >
          {manifest.members.map((member) => (
            <option key={member.key} value={member.key}>{member.name} · v{member.revision}{member.isDefault ? ' · 默认' : ''}</option>
          ))}
        </select>
      ) : null}
      <div className="xiaoying-panel-log">
        {messages.length === 0 && !busy ? (
          <div className="xiaoying-panel-prompts">
            {ASSISTANT_EXAMPLES.map(prompt => (
              <button key={prompt} type="button" disabled={manifestLoading} onClick={() => ask(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          <>
            {lastUser ? <p className="xiaoying-panel-you">{lastUser.text}</p> : null}
            {waiting ? <p className="xiaoying-panel-wait" aria-live="polite">在想</p> : null}
            {lastAssistant && (speaking || lastAssistant.hidden) ? (
              <div className="xiaoying-panel-answer" data-streaming={streaming ? 'true' : 'false'} data-primary="true" data-has-text="true">
                <small className="xiaoying-panel-source">
                  {lastAssistant.hidden ? '历史回答不可用' : `${lastAssistant.restored ? '历史' : ''}${lastAssistant.aiUsedFlag ? 'AI 回答' : '固定回答'}`}
                </small>
                <p>{lastAssistant.hidden ? HIDDEN_HISTORY_ANSWER : lastAssistant.text}</p>
                {!lastAssistant.hidden && lastAssistant.citations.length ? (
                  <p className="xiaoying-panel-cites">
                    {lastAssistant.citations.map(slug => {
                      const post = getPostBySlug(slug);
                      return <Link key={slug} to={`${dualEntry.browse.path}/${encodeURIComponent(slug)}`}>{post?.title ?? slug}</Link>;
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
        {error ? <p className="xiaoying-panel-error" role="alert">{error}</p> : null}
      </div>
      <form className="xiaoying-panel-composer" onSubmit={submit}>
        <textarea
          ref={input}
          value={draft}
          rows={1}
          tabIndex={open ? 0 : -1}
          onChange={event => setDraft(event.target.value)}
          onFocus={() => { onMeet(); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="问我…"
          aria-label="问小影"
          enterKeyHint="send"
          disabled={busy || manifestLoading}
          aria-busy={manifestLoading}
        />
        {busy ? (
          <button type="button" className="xiaoying-panel-action" onClick={stop}>停</button>
        ) : (
          <button type="submit" className="xiaoying-panel-action" disabled={manifestLoading || !draftOk}>发送</button>
        )}
      </form>
    </div>
  );
}
