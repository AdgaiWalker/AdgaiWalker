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
      const { reduceMotion } = context.conditions as Record<string, boolean>;

      const main = document.querySelector('main');
      if (!main) return;

      if (reduceMotion) return; // 不播动画

      // 页面入场：从下方微移 + 淡入（fromTo 明确起止状态）
      gsap.fromTo(main,
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out', delay: 0.05 },
      );
    },
  );
}

registerLifecycle(initPageTransitions);

/**
 * 页面切换顶部进度条
 * astro:before-preparation 时显示，astro:after-swap 时隐藏
 */
function initTransitionBar() {
  document.addEventListener('astro:before-preparation', () => {
    let bar = document.getElementById('transition-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'transition-progress-bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;height:2px;z-index:9999;pointer-events:none;background:var(--color-brand);opacity:0;transition:opacity 0.15s ease,width 0.3s ease;';
      document.body.appendChild(bar);
    }
    bar.style.width = '0%';
    bar.style.opacity = '1';
    requestAnimationFrame(() => {
      if (bar) bar.style.width = '60%';
    });
  });

  document.addEventListener('astro:after-swap', () => {
    const bar = document.getElementById('transition-progress-bar');
    if (bar) {
      bar.style.width = '100%';
      bar.style.opacity = '0';
    }
  });
}

initTransitionBar();
