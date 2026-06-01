/**
 * GSAP ScrollTrigger — 滚动触发入场动画
 * 替代原 CSS IntersectionObserver 版本
 */
import { gsap, ScrollTrigger, mm } from './gsap-setup';
import { registerLifecycle } from './with-lifecycle';

function initScrollFade() {
  // reduced-motion 时不播放动画
  mm.add(
    {
      isMotion: '(prefers-reduced-motion: no-preference)',
      reduceMotion: '(prefers-reduced-motion: reduce)',
    },
    (context) => {
      const { isMotion, reduceMotion } = context.conditions;

      // 如果用户偏好减少动画，直接显示所有元素
      if (reduceMotion) {
        document.querySelectorAll('.reveal').forEach((el) => {
          (el as HTMLElement).style.opacity = '1';
          (el as HTMLElement).style.transform = 'none';
        });
        return;
      }

      // 带动效的入场
      const reveals = document.querySelectorAll('.reveal');

      // 检查是否有 stagger 容器
      const staggerParents = new Set<Element>();
      reveals.forEach((el) => {
        const parent = el.closest('[data-stagger]');
        if (parent) staggerParents.add(parent);
      });

      // stagger 容器内的元素统一处理
      staggerParents.forEach((parent) => {
        const children = parent.querySelectorAll('.reveal');
        gsap.from(children, {
          y: 24,
          opacity: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: parent,
            start: 'top 90%',
            once: true,
          },
        });
      });

      // 独立元素
      reveals.forEach((el) => {
        if (el.closest('[data-stagger]')) return; // 已在 stagger 中处理
        gsap.from(el, {
          y: 20,
          opacity: 0,
          duration: 0.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 92%',
            once: true,
          },
        });
      });
    },
  );

  return () => {
    ScrollTrigger.getAll().forEach((st) => st.kill());
  };
}

registerLifecycle(initScrollFade);
