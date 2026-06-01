/**
 * GSAP 页面过渡动画
 * 统一全站页面切换语言：淡入 + 微上移
 * 配合 Astro View Transitions
 */
import { gsap, mm } from './gsap-setup';
import { registerLifecycle } from './with-lifecycle';

function initPageTransitions() {
  mm.add(
    {
      isMotion: '(prefers-reduced-motion: no-preference)',
      reduceMotion: '(prefers-reduced-motion: reduce)',
    },
    (context) => {
      const { reduceMotion } = context.conditions;

      const main = document.querySelector('main');
      if (!main) return;

      if (reduceMotion) return; // 不播动画

      // 页面入场：从下方微移 + 淡入
      gsap.from(main, {
        y: 12,
        opacity: 0,
        duration: 0.35,
        ease: 'power2.out',
        delay: 0.05,
      });
    },
  );
}

registerLifecycle(initPageTransitions);
