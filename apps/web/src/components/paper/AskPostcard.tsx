/**
 * AskPostcard — 回邮卡：不写解释文案，只靠「纸卡 + 齿孔邮票 + 信纸横线 + 寄出」让场景自明。
 * 传 onSend 时在当前页（例如文末原地展开问答）；未传时带着原话进 /tools 直接发送。
 */
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { isValidClueBody } from '@walker/shared';
import { trackWebEvent } from '../../lib/web-telemetry';
import { dualEntry } from '../../shared/dual-entry';

export type AskNavigationState = { ask?: string };

export function AskPostcard({ onSend }: { onSend?: (text: string) => void } = {}) {
  const navigate = useNavigate();
  const fieldId = useId();
  const [draft, setDraft] = useState('');
  const ok = isValidClueBody(draft.trim());

  const send = () => {
    if (!ok) return;
    const text = draft.trim();
    trackWebEvent('web.postcard_sent', { queryLength: text.length });
    if (onSend) {
      onSend(text);
      return;
    }
    const state: AskNavigationState = { ask: text };
    navigate(dualEntry.ask.path, { state });
  };

  return (
    <section className="postcard" aria-label="提问回邮卡">
      <form
        className="postcard-face"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <span className="postcard-stamp" aria-hidden="true">
          <Mail size={16} strokeWidth={1.8} />
        </span>
        <label htmlFor={fieldId} className="sr-only">
          写下你卡在哪
        </label>
        <textarea
          id={fieldId}
          className="postcard-input"
          rows={2}
          value={draft}
          placeholder="写下你卡在哪…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="postcard-foot">
          <button type="submit" className="postcard-send" disabled={!ok}>
            寄出
          </button>
        </div>
      </form>
    </section>
  );
}
