import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from 'react';
import { Link } from 'react-router-dom';
import { isValidAssistantBody } from '@walker/shared';
import { getPostBySlug } from '../../content';
import { useAssistant } from '../../hooks/useAssistant';
import { dualEntry } from '../../shared/dual-entry';
import { ASSISTANT_EXAMPLES } from '../ui/AssistantThread';
import { getPetActivity } from './activity';
import { XiaoyingPet } from './XiaoyingPet';
import { usePetDrag } from './usePetDrag';
import './xiaoying.css';

export type XiaoyingHomeProps = {
  searchRef?: Ref<HTMLTextAreaElement>;
};

const MET_KEY = 'walker:xiaoying-met';
const INVITE_MS = 4000;

function hasMetPet() {
  try {
    return sessionStorage.getItem(MET_KEY) === '1';
  } catch {
    return true;
  }
}

function markMetPet() {
  try {
    sessionStorage.setItem(MET_KEY, '1');
  } catch {
    /* private mode */
  }
}

function isCoarsePhone() {
  return window.matchMedia?.('(max-width: 760px)')?.matches ?? window.innerWidth <= 760;
}

function keyboardOverlap() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height));
}

export function XiaoyingHome({ searchRef }: XiaoyingHomeProps) {
  const layerRef = useRef<HTMLElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(() => !hasMetPet());
  const [draft, setDraft] = useState('');
  const holdOpen = useRef(0);
  const { messages, loading, streaming, error, send, stop } = useAssistant();
  const busy = loading || streaming;
  const draftOk = isValidAssistantBody(draft);
  const activity = getPetActivity(loading, error, messages, open && Boolean(draft.trim()));
  const lastUser = [...messages].reverse().find(message => message.role === 'user');
  const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant');
  const speaking = Boolean(lastAssistant?.text);
  const waiting = busy && !speaking;
  usePetDrag(layerRef);

  const input = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (typeof searchRef === 'function') searchRef(node);
    else if (searchRef) searchRef.current = node;
  };

  useEffect(() => {
    if (!invite) return;
    const timer = window.setTimeout(() => setInvite(false), INVITE_MS);
    return () => window.clearTimeout(timer);
  }, [invite]);

  useEffect(() => {
    if (!open) return;
    if (isCoarsePhone()) return;
    const timer = window.setTimeout(() => innerRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const lift = liftRef.current;
    if (!lift) return;
    const viewport = window.visualViewport;
    const apply = () => {
      const rise = open ? keyboardOverlap() : 0;
      lift.style.setProperty('--xiaoying-kb', `${Math.round(rise)}px`);
    };
    apply();
    viewport?.addEventListener('resize', apply);
    viewport?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      viewport?.removeEventListener('resize', apply);
      viewport?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      lift.style.setProperty('--xiaoying-kb', '0px');
    };
  }, [open]);

  useEffect(() => {
    if (!open || busy) return;
    const onPointerDown = (event: PointerEvent) => {
      if (performance.now() < holdOpen.current) return;
      const target = event.target;
      if (target instanceof Node && layerRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open, busy]);

  function meet() {
    setInvite(false);
    markMetPet();
  }

  function reveal() {
    if (busy) return;
    meet();
    holdOpen.current = performance.now() + 500;
    setOpen(current => !current);
  }

  function ask(text: string) {
    if (!isValidAssistantBody(text) || busy) return;
    meet();
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
    <section
      ref={layerRef}
      className="xiaoying-object"
      aria-label="小影，站内问答"
      data-panel={open ? 'open' : 'tucked'}
      data-invite={invite && !open ? 'true' : 'false'}
    >
      <div className="xiaoying-lift" ref={liftRef}>
      <XiaoyingPet activity={activity} onPetActivate={reveal}>
        <div
          className="xiaoying-panel"
          data-open={open ? 'true' : 'false'}
          role="dialog"
          aria-label="问小影"
          aria-hidden={open ? undefined : true}
        >
          <div className="xiaoying-panel-log" ref={logRef}>
            {messages.length === 0 && !busy ? (
              <div className="xiaoying-panel-prompts">
                {ASSISTANT_EXAMPLES.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => ask(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {lastUser ? <p className="xiaoying-panel-you">{lastUser.text}</p> : null}
                {waiting ? (
                  <p className="xiaoying-panel-wait" aria-live="polite">
                    在想
                  </p>
                ) : null}
                {lastAssistant && speaking ? (
                  <div
                    className="xiaoying-panel-answer"
                    data-streaming={streaming ? 'true' : 'false'}
                    data-primary="true"
                    data-has-text="true"
                  >
                    <p>{lastAssistant.text}</p>
                    {lastAssistant.citations.length ? (
                      <p className="xiaoying-panel-cites">
                        {lastAssistant.citations.map(slug => {
                          const post = getPostBySlug(slug);
                          return (
                            <Link
                              key={slug}
                              to={`${dualEntry.browse.path}/${encodeURIComponent(slug)}`}
                            >
                              {post?.title ?? slug}
                            </Link>
                          );
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
            {error ? (
              <p className="xiaoying-panel-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <form className="xiaoying-panel-composer" onSubmit={submit}>
            <textarea
              ref={input}
              value={draft}
              rows={1}
              tabIndex={open ? 0 : -1}
              onChange={event => setDraft(event.target.value)}
              onFocus={() => {
                meet();
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              placeholder="问我…"
              aria-label="问小影"
              enterKeyHint="send"
              disabled={busy}
            />
            {busy ? (
              <button type="button" className="xiaoying-panel-action" onClick={stop}>
                停
              </button>
            ) : (
              <button
                type="submit"
                className="xiaoying-panel-action"
                disabled={!draftOk}
              >
                发送
              </button>
            )}
          </form>
        </div>
      </XiaoyingPet>
      </div>
    </section>
  );
}
