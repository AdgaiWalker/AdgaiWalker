import { gsap } from './gsap-setup';

const fragmentPositions = [
  { x: -310, y: -130, r: -18, s: 1.05 },
  { x: 260, y: -150, r: 16, s: 1.1 },
  { x: -220, y: 160, r: 24, s: 1 },
  { x: 320, y: 130, r: -12, s: 1.12 },
  { x: -410, y: 10, r: 8, s: 0.95 },
  { x: 390, y: -12, r: -20, s: 1 },
  { x: -90, y: -230, r: -8, s: 0.9 },
  { x: 70, y: 235, r: 14, s: 0.92 },
  { x: -150, y: -80, r: 28, s: 1.06 },
  { x: 170, y: 78, r: -24, s: 1.02 },
  { x: 30, y: -180, r: 6, s: 0.9 },
  { x: -30, y: 190, r: -10, s: 0.88 },
];

function setFinalState(root: HTMLElement) {
  const q = gsap.utils.selector(root);
  gsap.set(q('.dianzi-paper-space'), { autoAlpha: 0, rotateX: 0, rotateY: 0, scale: 1 });
  gsap.set(q('.dianzi-hand'), { autoAlpha: 0 });
  gsap.set(q('.dianzi-implant-dot'), { autoAlpha: 0 });
  gsap.set(q('.dianzi-collapse-ring'), { autoAlpha: 0 });
  gsap.set(q('.dianzi-fragment'), { autoAlpha: 0 });
  gsap.set(q('.dianzi-final-system'), { autoAlpha: 1, y: 0, scale: 1, rotateX: 0, rotateY: 0 });
  gsap.set(q('.dianzi-wordmark-image'), { autoAlpha: 0.46, y: 0 });
  gsap.set(q('.dianzi-path-line'), { autoAlpha: 0.42, scaleX: 1 });
  gsap.set(q('.dianzi-copy'), { autoAlpha: 1, y: 0 });
  gsap.to(q('.dianzi-small-dot'), {
    y: -3,
    duration: 2.4,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

function initDianziOpening() {
  const root = document.getElementById('dianzi-opening');
  if (!root) return;

  const abort = new AbortController();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = gsap.utils.selector(root);
  let timeline: gsap.core.Timeline | null = null;

  const reset = () => {
    timeline?.kill();
    gsap.killTweensOf(root.querySelectorAll('*'));

    gsap.set(q('.dianzi-paper-space'), {
      autoAlpha: 1,
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      scale: 1,
      transformPerspective: 1200,
      transformOrigin: '50% 50%',
    });
    gsap.set(q('.dianzi-paper-back, .dianzi-membrane'), {
      rotateX: 9,
      rotateY: -8,
      scale: 1,
      transformOrigin: '50% 50%',
    });
    gsap.set(q('.dianzi-hand'), {
      autoAlpha: 0.18,
      xPercent: 12,
      yPercent: -22,
      scale: 1.04,
      filter: 'blur(7px) grayscale(0.2) contrast(0.9)',
    });
    gsap.set(q('.dianzi-pressure'), { autoAlpha: 0, scale: 0.12 });
    gsap.set(q('.dianzi-implant-dot'), { autoAlpha: 0, scale: 0.35, xPercent: -50, yPercent: -50 });
    gsap.set(q('.dianzi-collapse-ring'), { autoAlpha: 0, scale: 1.7, xPercent: -50, yPercent: -50 });
    gsap.set(q('.dianzi-fragment'), {
      autoAlpha: 0,
      x: 0,
      y: 0,
      z: 0,
      scale: 0.65,
      rotate: 0,
      xPercent: -50,
      yPercent: -50,
    });
    gsap.set(q('.dianzi-final-system'), {
      autoAlpha: 0,
      y: 18,
      scale: 0.96,
      rotateX: 18,
      rotateY: -24,
      transformPerspective: 1000,
    });
    gsap.set(q('.dianzi-wordmark-image'), { autoAlpha: 0, y: 10 });
    gsap.set(q('.dianzi-path-line'), { autoAlpha: 0, scaleX: 0, transformOrigin: '50% 50%' });
    gsap.set(q('.dianzi-copy'), { autoAlpha: 0, y: 20 });
  };

  const play = () => {
    reset();

    if (reduceMotion) {
      setFinalState(root);
      return;
    }

    const fragments = gsap.utils.toArray<HTMLElement>(q('.dianzi-fragment'));

    timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

    timeline
      .to(q('.dianzi-hand'), {
        autoAlpha: 0.32,
        xPercent: -2,
        yPercent: 1,
        scale: 0.98,
        filter: 'blur(3px) grayscale(0.15) contrast(0.98)',
        duration: 1.15,
      })
      .to(q('.dianzi-paper-back, .dianzi-membrane'), {
        rotateX: 6,
        rotateY: -4,
        scale: 0.994,
        duration: 0.38,
        ease: 'power2.inOut',
      }, '-=0.18')
      .to(q('.dianzi-pressure'), {
        autoAlpha: 0.85,
        scale: 1,
        duration: 0.18,
        ease: 'power4.out',
      })
      .to(q('.dianzi-implant-dot'), {
        autoAlpha: 1,
        scale: 1,
        duration: 0.22,
        ease: 'back.out(2.2)',
      }, '<')
      .to({}, { duration: 0.16 })
      .to(q('.dianzi-collapse-ring'), {
        autoAlpha: 0.72,
        scale: 0.42,
        duration: 0.82,
        stagger: 0.08,
        ease: 'power3.in',
      })
      .to(q('.dianzi-paper-back, .dianzi-membrane'), {
        scale: 0.92,
        rotateX: 14,
        rotateY: -13,
        duration: 0.82,
        ease: 'power3.inOut',
      }, '<')
      .to(q('.dianzi-pressure'), {
        scale: 1.4,
        autoAlpha: 0.18,
        duration: 0.72,
      }, '<')
      .to(fragments, {
        autoAlpha: 1,
        scale: (index) => fragmentPositions[index]?.s ?? 1,
        x: (index) => fragmentPositions[index]?.x ?? 0,
        y: (index) => fragmentPositions[index]?.y ?? 0,
        z: (index) => (index % 3) * 42,
        rotate: (index) => fragmentPositions[index]?.r ?? 0,
        duration: 0.62,
        stagger: 0.022,
        ease: 'expo.out',
      }, '-=0.16')
      .to({}, { duration: 0.3 })
      .to(q('.dianzi-paper-space'), {
        rotateY: 178,
        rotateX: -5,
        scale: 1.06,
        duration: 1.08,
        ease: 'power3.inOut',
      }, '+=0.04')
      .to(fragments, {
        x: (index) => (index - fragments.length / 2) * 7,
        y: (index) => ((index % 4) - 1.5) * 10,
        z: 0,
        scale: 0.22,
        autoAlpha: 0,
        rotate: (index) => (index % 2 ? 120 : -120),
        duration: 0.82,
        stagger: 0.012,
        ease: 'power4.inOut',
      }, '-=0.84')
      .to(q('.dianzi-paper-space'), {
        autoAlpha: 0,
        scale: 0.98,
        duration: 0.32,
      }, '-=0.28')
      .to(q('.dianzi-final-system'), {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        rotateX: 0,
        rotateY: 0,
        duration: 0.78,
        ease: 'power3.out',
      }, '-=0.18')
      .fromTo(q('.dianzi-mark-dot'), {
        scale: 0.82,
      }, {
        scale: 1,
        duration: 0.46,
        ease: 'back.out(1.8)',
      }, '<')
      .fromTo(q('.dianzi-orbit'), {
        rotate: -26,
        autoAlpha: 0,
      }, {
        rotate: 18,
        autoAlpha: 0.82,
        duration: 0.82,
      }, '-=0.48')
      .fromTo(q('.dianzi-small-dot'), {
        x: -60,
        y: 34,
        scale: 0.35,
        autoAlpha: 0,
      }, {
        x: 0,
        y: 0,
        scale: 1,
        autoAlpha: 1,
        duration: 0.88,
        ease: 'power3.out',
      }, '-=0.52')
      .to(q('.dianzi-path-line'), {
        autoAlpha: 0.42,
        scaleX: 1,
        duration: 0.72,
        stagger: 0.12,
      }, '-=0.48')
      .to(q('.dianzi-wordmark-image'), {
        autoAlpha: 0.46,
        y: 0,
        duration: 0.92,
        ease: 'power2.out',
      }, '-=0.18')
      .to(q('.dianzi-copy'), {
        autoAlpha: 1,
        y: 0,
        duration: 0.82,
      }, '-=0.45')
      .to(q('.dianzi-small-dot'), {
        y: -3,
        duration: 2.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
  };

  root.querySelector<HTMLElement>('[data-dianzi-replay]')?.addEventListener('click', play, {
    signal: abort.signal,
  });

  play();

  return () => {
    abort.abort();
    timeline?.kill();
    gsap.killTweensOf(root.querySelectorAll('*'));
  };
}

let activeCleanup: (() => void) | void;

function bootDianziOpening() {
  activeCleanup?.();
  activeCleanup = initDianziOpening();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootDianziOpening, { once: true });
} else {
  queueMicrotask(bootDianziOpening);
}

document.addEventListener('astro:page-load', bootDianziOpening);
document.addEventListener('astro:before-swap', () => {
  activeCleanup?.();
  activeCleanup = undefined;
});
