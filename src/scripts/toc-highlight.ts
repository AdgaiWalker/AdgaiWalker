import { gsap } from 'gsap';

/**
 * toc-highlight.ts — TOC 滚动跟随高亮
 * 使用 IntersectionObserver 检测当前可见的章节
 * 高亮对应的 TOC 链接
 */

function initTocHighlight(): void {
  const tocLinks = document.querySelectorAll<HTMLAnchorElement>('[data-toc-slug]');
  if (tocLinks.length === 0) return;

  // 收集所有锚点对应的标题元素
  const headingMap = new Map<string, HTMLElement>();
  tocLinks.forEach((link) => {
    const slug = link.dataset.tocSlug;
    if (!slug) return;
    const heading = document.getElementById(slug);
    if (heading) headingMap.set(slug, heading);
  });

  if (headingMap.size === 0) return;

  const indicator = document.getElementById('toc-indicator') as HTMLElement | null;
  let activeSlug = '';

  const setActive = (slug: string): void => {
    if (slug === activeSlug) return;
    activeSlug = slug;
    
    let activeLink: HTMLElement | null = null;
    tocLinks.forEach((link) => {
      if (link.dataset.tocSlug === slug) {
        link.classList.add('active');
        activeLink = link;
      } else {
        link.classList.remove('active');
      }
    });

    // 联动 Liquid Indicator 平滑粘弹性滑移动效 (Metaball Stretch & Snap)
    if (indicator && activeLink) {
      const target = activeLink as HTMLElement;
      const prevTop = parseFloat(indicator.style.top) || target.offsetTop;
      const diff = target.offsetTop - prevTop;

      if (Math.abs(diff) > 4) {
        const direction = Math.sign(diff); // +1 往下移，-1 往上移
        const stretch = Math.min(24, Math.abs(diff) * 0.22); // 计算粘性拉伸长度

        gsap.killTweensOf(indicator);
        gsap.timeline()
          .to(indicator, {
            top: direction > 0 ? prevTop : target.offsetTop - stretch,
            height: target.offsetHeight + stretch,
            opacity: 1,
            duration: 0.18,
            ease: 'power1.out',
          })
          .to(indicator, {
            top: target.offsetTop,
            height: target.offsetHeight,
            duration: 0.32,
            ease: 'back.out(1.5)',
          });
      } else {
        gsap.killTweensOf(indicator);
        gsap.to(indicator, {
          top: target.offsetTop,
          height: target.offsetHeight,
          opacity: 1,
          duration: 0.25,
          ease: 'power2.out',
        });
      }
    }
  };

  // 1. 初始化高亮位置
  if (indicator) {
    setTimeout(() => {
      const activeLink = document.querySelector('[data-toc-slug].active') as HTMLElement | null;
      if (activeLink && indicator) {
        gsap.set(indicator, {
          top: activeLink.offsetTop,
          height: activeLink.offsetHeight,
          opacity: 1,
        });
      }
    }, 100);
  }

  // IntersectionObserver：检测哪些标题进入视口
  const observer = new IntersectionObserver(
    (entries) => {
      // 找到最靠近顶部的可见标题
      const visibleEntries = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visibleEntries.length > 0) {
        setActive(visibleEntries[0].target.id);
      }
    },
    {
      rootMargin: '-80px 0px -60% 0px',
      threshold: [0, 0.5, 1],
    }
  );

  headingMap.forEach((heading) => observer.observe(heading));

  // 滚动到底部时，激活最后一个标题
  const handleScroll = (): void => {
    const scrollBottom = window.innerHeight + window.scrollY;
    const docHeight = document.documentElement.scrollHeight;
    if (docHeight - scrollBottom < 100) {
      const slugs = Array.from(headingMap.keys());
      if (slugs.length > 0) {
        setActive(slugs[slugs.length - 1]);
      }
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });

  // 清理
  const cleanup = () => {
    observer.disconnect();
    window.removeEventListener('scroll', handleScroll);
    document.removeEventListener('astro:before-swap', cleanup);
  };
  document.addEventListener('astro:before-swap', cleanup);
}

document.addEventListener('astro:page-load', initTocHighlight);
