/**
 * 首页卡片 GSAP stagger 入场动画
 * 替代 CSS pop-in，用 GSAP 实现更自然的弹入效果
 */
import { gsap, mm } from './gsap-setup';
import { registerLifecycle } from './with-lifecycle';

function initHomeEntrance() {
  mm.add(
    {
      isMotion: '(prefers-reduced-motion: no-preference)',
      reduceMotion: '(prefers-reduced-motion: reduce)',
    },
    (context) => {
      const { reduceMotion } = context.conditions as Record<string, boolean>;

      const cards = document.querySelectorAll<HTMLElement>('.draggable-card');
      if (!cards.length) return;

      if (reduceMotion) {
        // 直接显示
        cards.forEach((card) => {
          card.style.opacity = '1';
          card.style.transform = 'none';
        });
        return;
      }

      // 初始状态：全部隐藏
      gsap.set(cards, {
        opacity: 0,
        y: 30,
        scale: 0.94,
      });

      // stagger 弹入
      gsap.to(cards, {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        stagger: 0.1,
        ease: 'back.out(1.4)',
        delay: 0.15,
      });
    },
  );
}

registerLifecycle(initHomeEntrance);

/**
 * 首次访问首页时，身份条 ghost nav 一次性引导脉冲
 * 告诉新访客「这里有导航」
 */
function initHomeNavHint() {
  if (localStorage.getItem('walker-home-nav-hint-seen')) return;

  setTimeout(() => {
    const card = document.querySelector<HTMLElement>('.directory-card');
    if (!card) return;

    // 边框脉冲 + ghost nav 闪现
    card.classList.add('is-hinting');
    setTimeout(() => {
      card.classList.remove('is-hinting');
      card.classList.add('hint-done');
      setTimeout(() => card.classList.remove('hint-done'), 600);
      localStorage.setItem('walker-home-nav-hint-seen', '1');
    }, 800);
  }, 1500);
}

registerLifecycle(initHomeNavHint);
