function initScrollFade() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;

          // data-stagger 级联动画
          const staggerParent = el.closest('[data-stagger]');
          if (staggerParent) {
            const children = staggerParent.querySelectorAll('.reveal');
            children.forEach((child, i) => {
              (child as HTMLElement).style.transitionDelay = `${i * 80}ms`;
              child.classList.add('visible');
            });
          } else {
            el.classList.add('visible');
          }

          observer.unobserve(el);
        }
      });
    },
    {
      threshold: 0.05,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

document.addEventListener('astro:page-load', initScrollFade);
