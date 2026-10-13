import {
  useEffect,
  useRef,
  useState,
  type Ref,
} from 'react';
import { getPetActivity } from './activity';
import { XiaoyingPanel } from './XiaoyingPanel';
import { XiaoyingPet } from './XiaoyingPet';
import { usePetDrag } from './usePetDrag';
import { useHomeAssistant } from './useHomeAssistant';
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

function keyboardOverlap() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - (viewport.offsetTop + viewport.height));
}

export function XiaoyingHome({ searchRef }: XiaoyingHomeProps) {
  const layerRef = useRef<HTMLElement>(null);
  const petButtonRef = useRef<HTMLButtonElement>(null);
  const liftRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(() => !hasMetPet());
  const [draft, setDraft] = useState('');
  const holdOpen = useRef(0);
  const assistant = useHomeAssistant();
  const { messages, loading, streaming, error } = assistant;
  const busy = loading || streaming;
  const activity = getPetActivity(loading, error, messages, open && Boolean(draft.trim()));
  usePetDrag(layerRef);

  useEffect(() => {
    if (!invite) return;
    const timer = window.setTimeout(() => setInvite(false), INVITE_MS);
    return () => window.clearTimeout(timer);
  }, [invite]);

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
      const panel = layerRef.current?.querySelector('.xiaoying-panel');
      const focusWasInside = panel?.contains(document.activeElement);
      setOpen(false);
      const outsideControl = target instanceof Element && target.closest('a,button,input,textarea,select,[tabindex]');
      if (focusWasInside && !outsideControl) {
        window.setTimeout(() => {
          if (document.activeElement === document.body || panel?.contains(document.activeElement)) {
            petButtonRef.current?.focus();
          }
        }, 0);
      }
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

  return (
    <section
      ref={layerRef}
      className="xiaoying-object"
      aria-label="小影，站内问答"
      data-panel={open ? 'open' : 'tucked'}
      data-invite={invite && !open ? 'true' : 'false'}
    >
      <div className="xiaoying-lift" ref={liftRef}>
      <XiaoyingPet activity={activity} onPetActivate={reveal} expanded={open} panelId="xiaoying-home-panel" touchRef={petButtonRef}>
        <XiaoyingPanel
          assistant={assistant}
          open={open}
          setOpen={setOpen}
          draft={draft}
          setDraft={setDraft}
          onMeet={meet}
          searchRef={searchRef}
        />
      </XiaoyingPet>
      </div>
    </section>
  );
}
