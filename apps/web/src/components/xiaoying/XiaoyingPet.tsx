import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PetMotion, PetRenderer } from './scene';
import { isPetWorking, type PetActivity } from './activity';
import './xiaoying.css';

const captions: Record<PetMotion, string> = {
  idle: '点我搜，或问我一句', hello: '你好呀，很高兴见到你',
  joy: '接住你的好心情', sleep: '我歇一会儿，你慢慢看',
  listen: '你慢慢说，我在听', think: '让我想一想', speak: '把想到的，一点点告诉你',
};
const labels: Record<PetActivity, string> = {
  idle: '自在陪伴', listening: '认真倾听', searching: '正在找', thinking: '正在思考', speaking: '正在回应',
  complete: '回答好了', fallback: '基础回答', error: '遇到一点问题', stopped: '已停止',
};
const activityCaptions: Record<PetActivity, string> = {
  idle: captions.idle, listening: '你慢慢说，我在听', searching: '我在站里翻一翻',
  thinking: '给我一点时间，想想怎么回答你', speaking: '把想到的，一点点告诉你',
  complete: '回答好啦，我们接着聊', fallback: '这次是固定回答，你可以看看推荐内容',
  error: '这次没能回答，具体原因见下方', stopped: '已经停下了，等你下一句话',
};
const activityMotion: Record<PetActivity, PetMotion> = {
  idle: 'idle', listening: 'listen', searching: 'think', thinking: 'think', speaking: 'speak',
  complete: 'joy', fallback: 'listen', error: 'listen', stopped: 'idle',
};
const signals: Partial<Record<PetActivity | PetMotion, string>> = {
  sleep: 'z z Z', searching: '· · ·', thinking: '· · ·', speaking: 'ı ıı ı ıı',
};

export type XiaoyingPetProps = {
  activity?: PetActivity;
  variant?: 'stage' | 'companion';
  onPetActivate?: () => void;
  children?: ReactNode;
};

export const XiaoyingPet = memo(function XiaoyingPet({
  activity = 'idle',
  variant = 'stage',
  onPetActivate,
  children,
}: XiaoyingPetProps) {
  const working = isPetWorking(activity);
  const host = useRef<HTMLSpanElement>(null);
  const pet = useRef<PetRenderer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [motion, setMotion] = useState<PetMotion>('idle');
  const desiredMotion = activityMotion[activity];
  const desiredRef = useRef(desiredMotion);
  desiredRef.current = desiredMotion;

  useEffect(() => {
    let cancelled = false;
    let renderer: PetRenderer | undefined;
    const target = host.current;
    if (!target) return;

    const mount = () => {
      void import('./scene').then(({ mountPet }) => {
        if (cancelled) return;
        renderer = mountPet(
          target,
          () => { if (!cancelled) setStatus('ready'); },
          () => { if (!cancelled) setStatus('fallback'); },
          next => { if (!cancelled) setMotion(next); },
        );
        pet.current = renderer;
        renderer.play(desiredRef.current);
      }).catch(() => { if (!cancelled) setStatus('fallback'); });
    };

    if (typeof IntersectionObserver === 'undefined') {
      mount();
      return () => { cancelled = true; renderer?.dispose(); pet.current = null; };
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      mount();
    });
    observer.observe(target);
    return () => { cancelled = true; observer.disconnect(); renderer?.dispose(); pet.current = null; };
  }, []);

  useEffect(() => { pet.current?.play(desiredMotion); }, [desiredMotion]);
  useEffect(() => {
    if (activity !== 'idle' || motion === 'sleep') return;
    const timer = window.setTimeout(() => pet.current?.play('sleep'), 45000);
    return () => window.clearTimeout(timer);
  }, [activity, motion]);

  function play(next: PetMotion) { pet.current?.play(next); }
  function activate() {
    onPetActivate?.();
    if (status !== 'ready' || working) return;
    play(motion === 'sleep' ? 'hello' : 'joy');
  }

  const signal = motion === 'sleep' ? signals.sleep : signals[activity];
  const caption = status === 'fallback'
    ? '小影暂时静静陪你，搜索照常可用'
    : status === 'loading'
      ? '小影马上就来…'
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
    >
      {variant === 'companion' ? (
        <div className="xiaoying-presence">
          <span />
          {labels[activity]}
          <small>小影陪着你</small>
        </div>
      ) : null}
      {variant === 'companion' ? (
        <div className="xiaoying-touch">
          {status === 'fallback' ? (
            <img className="xiaoying-poster" src="/xiaoying/poster.jpg" alt="毛茸茸的影鳐小影" />
          ) : null}
          <span className="xiaoying-aura" aria-hidden />
          <span className="xiaoying-signal" aria-hidden>{signal}</span>
          <span ref={host} className="xiaoying-canvas" />
        </div>
      ) : (
        <button type="button" className="xiaoying-touch" aria-label="摸摸小影" onClick={activate}>
          {status === 'fallback' ? (
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
