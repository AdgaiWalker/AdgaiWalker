import { memo, useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Pause, Play } from 'lucide-react';
import type { PetMotion, PetRenderer } from './scene';
import { isPetWorking, type PetActivity } from './activity';
import { trackWebEvent } from '../../lib/web-telemetry';
import './xiaoying.css';

const captions: Record<PetMotion, string> = {
  idle: '点我，或直接问我一句',
  hello: '你好呀，很高兴见到你',
  joy: '接住你的好心情',
  sleep: '我歇一会儿，你慢慢看',
  listen: '你慢慢说，我在听',
  think: '让我想一想',
  speak: '把想到的，一点点告诉你',
};

const labels: Record<PetActivity, string> = {
  idle: '自在陪伴',
  listening: '认真倾听',
  searching: '正在找',
  thinking: '正在思考',
  speaking: '正在回应',
  complete: '回答好了',
  fallback: '基础回答',
  error: '遇到一点问题',
  stopped: '已停止',
};

const activityCaptions: Record<PetActivity, string> = {
  idle: captions.idle,
  listening: '你慢慢说，我在听',
  searching: '我在站里翻一翻',
  thinking: '给我一点时间，想想怎么回答你',
  speaking: '把想到的，一点点告诉你',
  complete: '回答好啦，我们接着聊',
  fallback: '这次是固定回答，你可以看看推荐内容',
  error: '这次没能回答，已为你附上站内相关文章',
  stopped: '已经停下了，等你下一句话',
};

const activityMotion: Record<PetActivity, PetMotion> = {
  idle: 'idle',
  listening: 'listen',
  searching: 'think',
  thinking: 'think',
  speaking: 'speak',
  complete: 'joy',
  fallback: 'listen',
  error: 'listen',
  stopped: 'idle',
};

const signals: Partial<Record<PetActivity | PetMotion, string>> = {
  sleep: 'z z Z',
  searching: '· · ·',
  thinking: '· · ·',
  speaking: 'ı ıı ı ıı',
};

export type XiaoyingPetProps = {
  activity?: PetActivity;
  variant?: 'stage' | 'companion';
  onPetActivate?: () => void;
  expanded?: boolean;
  panelId?: string;
  touchRef?: Ref<HTMLButtonElement>;
  children?: ReactNode;
};

type PetStatus = 'standby' | 'loading' | 'ready' | 'fallback';
type ActivationTrigger = 'hover' | 'click' | 'focus' | 'idle';

function canIdleUpgradeTo3D(): boolean {
  if (typeof window === 'undefined') return false;
  const desktop = window.matchMedia?.('(min-width: 1024px)')?.matches ?? false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const saveData = Boolean(
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
  );
  return desktop && !reduced && !saveData;
}

export const XiaoyingPet = memo(function XiaoyingPet({
  activity = 'idle',
  variant = 'stage',
  onPetActivate,
  expanded,
  panelId,
  touchRef,
  children,
}: XiaoyingPetProps) {
  const working = isPetWorking(activity);
  const host = useRef<HTMLSpanElement>(null);
  const pet = useRef<PetRenderer | null>(null);
  const cancelledRef = useRef(false);
  const mountStartedRef = useRef(false);
  const [status, setStatus] = useState<PetStatus>('standby');
  const [motion, setMotion] = useState<PetMotion>('idle');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const pendingJoyRef = useRef(false);
  const desiredMotion = activityMotion[activity];
  const desiredRef = useRef(desiredMotion);
  desiredRef.current = desiredMotion;

  const activate3D = useCallback((trigger: ActivationTrigger) => {
    if (mountStartedRef.current || cancelledRef.current) return;
    const target = host.current;
    if (!target) return;
    mountStartedRef.current = true;
    setStatus('loading');

    void import('./scene')
      .then(({ mountPet }) => {
        if (cancelledRef.current) return;
        const nextMotion: PetMotion =
          pendingJoyRef.current && !pausedRef.current ? 'joy' : desiredRef.current;
        pendingJoyRef.current = false;
        const renderer = mountPet(
          target,
          () => {
            if (cancelledRef.current) return;
            setStatus('ready');
            trackWebEvent('web.pet_3d_activated', { trigger });
          },
          () => {
            if (!cancelledRef.current) setStatus('fallback');
          },
          (next) => {
            if (!cancelledRef.current) setMotion(next);
          },
        );
        pet.current = renderer;
        renderer.pause(pausedRef.current);
        renderer.play(nextMotion);
      })
      .catch(() => {
        if (!cancelledRef.current) setStatus('fallback');
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      pet.current?.dispose();
      pet.current = null;
      mountStartedRef.current = false;
    };
  }, []);

  // 仅桌面非省流、非减弱动效下于浏览器空闲且进入视口后静默预热 3D 模型；首屏先秒出 20KB 静图。
  useEffect(() => {
    if (!canIdleUpgradeTo3D()) return;
    const target = host.current;
    if (!target) return;

    let idleHandle: number | null = null;
    let observer: IntersectionObserver | null = null;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const scheduleIdle = () => {
      if (win.requestIdleCallback) {
        idleHandle = win.requestIdleCallback(() => activate3D('idle'), { timeout: 2800 });
      } else {
        idleHandle = window.setTimeout(() => activate3D('idle'), 1600);
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      scheduleIdle();
    } else {
      observer = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return;
        observer?.disconnect();
        scheduleIdle();
      });
      observer.observe(target);
    }

    return () => {
      observer?.disconnect();
      if (idleHandle !== null) {
        if (win.cancelIdleCallback) win.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
    };
  }, [activate3D]);

  useEffect(() => {
    pet.current?.play(desiredMotion);
  }, [desiredMotion]);

  useEffect(() => {
    if (paused || activity !== 'idle' || motion === 'sleep') return;
    const timer = window.setTimeout(() => pet.current?.play('sleep'), 45000);
    return () => window.clearTimeout(timer);
  }, [paused, activity, motion]);

  function activate() {
    if (!paused && !working && status !== 'ready') {
      pendingJoyRef.current = true;
    }
    activate3D('click');
    onPetActivate?.();
    if (paused || status !== 'ready' || working) return;
    pet.current?.play(motion === 'sleep' ? 'hello' : 'joy');
  }

  function togglePause() {
    const next = !paused;
    setPaused(next);
    pet.current?.pause(next);
    trackWebEvent('web.pet_motion_toggled', { paused: next });
  }

  const signal = motion === 'sleep' ? signals.sleep : signals[activity];
  const caption =
    status === 'fallback'
      ? '小影暂时静静陪你，搜索照常可用'
      : status === 'loading'
        ? '小影正在唤醒 3D…'
        : activity !== 'idle'
          ? activityCaptions[activity]
          : captions[motion];

  return (
    <div
      className="xiaoying-stage"
      data-pet-status={status}
      data-pet-motion={motion}
      data-pet-activity={activity}
      data-pet-variant={variant}
      data-pet-paused={paused ? 'true' : 'false'}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') activate3D('hover');
      }}
    >
      <button
        type="button"
        className="xiaoying-motion-toggle"
        aria-label={paused ? '播放小影动效' : '暂停小影动效'}
        onClick={(e) => {
          e.stopPropagation();
          togglePause();
        }}
      >
        {paused ? <Play size={11} aria-hidden /> : <Pause size={11} aria-hidden />}
      </button>

      {variant === 'companion' ? (
        <div className="xiaoying-presence">
          <span />
          {labels[activity]}
          <small>小影陪着你</small>
        </div>
      ) : null}

      {variant === 'companion' ? (
        <div className="xiaoying-touch">
          {status !== 'ready' ? (
            <img className="xiaoying-poster" src="/xiaoying/poster.jpg" alt="毛茸茸的影鳐小影" />
          ) : null}
          <span className="xiaoying-aura" aria-hidden />
          <span className="xiaoying-signal" aria-hidden>{signal}</span>
          <span ref={host} className="xiaoying-canvas" />
        </div>
      ) : (
        <button
          ref={touchRef}
          type="button"
          className="xiaoying-touch"
          aria-label="摸摸小影"
          aria-expanded={expanded}
          aria-controls={panelId}
          onFocus={() => activate3D('focus')}
          onClick={activate}
        >
          {status !== 'ready' ? (
            <img className="xiaoying-poster" src="/xiaoying/poster.jpg" alt="毛茸茸的影鳐小影" />
          ) : null}
          <span className="xiaoying-aura" aria-hidden />
          <span className="xiaoying-signal" aria-hidden>{signal}</span>
          <span ref={host} className="xiaoying-canvas" />
        </button>
      )}
      {children}
      <p className="xiaoying-caption" aria-live="polite">{caption}</p>
    </div>
  );
});
