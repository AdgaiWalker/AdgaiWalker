import { gsap } from 'gsap';
import { resolveTocScrollContainer } from './toc-highlight.logic';

/**
 * toc-highlight.ts — TOC 滚动跟随高亮
 * 使用 IntersectionObserver 检测当前可见的章节
 * 高亮对应的 TOC 链接
 */

function initTocInstance(toc: HTMLElement): (() => void) | null {
  const tocLinks = toc.querySelectorAll<HTMLAnchorElement>('[data-toc-slug]');
  if (tocLinks.length === 0) return null;

  // 收集所有锚点对应的标题元素
  const headingMap = new Map<string, HTMLElement>();
  tocLinks.forEach((link) => {
    const slug = link.dataset.tocSlug;
    if (!slug) return;
    const heading = document.getElementById(slug);
    if (heading) headingMap.set(slug, heading);
  });

  if (headingMap.size === 0) return null;

  const indicator = toc.querySelector<HTMLElement>('[data-toc-indicator]');
  let activeSlug = '';
  let initTimer: ReturnType<typeof setTimeout> | null = null;

  const setActive = (slug: string): void => {
    if (slug === activeSlug) return;
    activeSlug = slug;
    
    const activeLink = Array.from(tocLinks).find((link) => link.dataset.tocSlug === slug) ?? null;
    tocLinks.forEach((link) => {
      if (link.dataset.tocSlug === slug) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // 滚动 TOC 容器，让活跃项保持在可见区内
    if (activeLink) {
      const container = resolveTocScrollContainer(toc);
      const linkTop = activeLink.offsetTop;
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const linkHeight = activeLink.offsetHeight;

      if (linkTop < scrollTop + 8) {
        container.scrollTop = linkTop - 8;
      } else if (linkTop + linkHeight > scrollTop + containerHeight - 8) {
        container.scrollTop = linkTop + linkHeight - containerHeight + 8;
      }
    }

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
    initTimer = setTimeout(() => {
      const activeLink = toc.querySelector<HTMLElement>('[data-toc-slug].active');
      if (activeLink && indicator) {
        gsap.set(indicator, {
          top: activeLink.offsetTop,
          height: activeLink.offsetHeight,
          opacity: 1,
        });
      }
    }, 100);
  }

  // 初始激活：IntersectionObserver 在首屏可能没有任何标题落入 rootMargin 区间，
  // 导致首屏无 active 项。按当前滚动位置找出最接近顶部的可见标题作为初始 active；
  // 若所有标题都在触发线下方（页面顶部），则激活第一个标题，保证"活跃目录项始终存在"（H0-01）。
  const resolveActiveByScroll = (): string | null => {
    const scrollY = window.scrollY;
    const triggerLine = scrollY + 120; // 略低于视口顶部，与 rootMargin -80px 区间一致
    let candidate: string | null = null;
    let firstSlug: string | null = null;
    headingMap.forEach((heading, slug) => {
      if (firstSlug === null) firstSlug = slug;
      if (heading.getBoundingClientRect().top + scrollY <= triggerLine) {
        candidate = slug;
      }
    });
    return candidate ?? firstSlug;
  };
  const initialActive = resolveActiveByScroll();
  if (initialActive) {
    setActive(initialActive);
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

  // 滚动时按真实滚动位置重算 active。滚动位置是可靠真相源，比 IntersectionObserver
  // 更能保证"活跃目录项始终存在且正确"（H0-01），尤其在即时滚动（instant）与标题间隙时。
  const handleScroll = (): void => {
    const scrollBottom = window.innerHeight + window.scrollY;
    const docHeight = document.documentElement.scrollHeight;
    // 接近文档底部，强制激活最后一个标题
    if (docHeight - scrollBottom < 100) {
      const slugs = Array.from(headingMap.keys());
      if (slugs.length > 0) {
        setActive(slugs[slugs.length - 1]);
      }
      return;
    }
    const candidate = resolveActiveByScroll();
    if (candidate) setActive(candidate);
  };

  window.addEventListener('scroll', handleScroll, { passive: true });

  // 清理
  return () => {
    if (initTimer) {
      clearTimeout(initTimer);
      initTimer = null;
    }
    observer.disconnect();
    window.removeEventListener('scroll', handleScroll);
    if (indicator) gsap.killTweensOf(indicator);
  };
}

function initTocHighlight(): void {
  const cleanups = Array.from(document.querySelectorAll<HTMLElement>('[data-toc-instance]'))
    .map(initTocInstance)
    .filter((cleanup): cleanup is () => void => Boolean(cleanup));

  if (cleanups.length === 0) return;

  const cleanup = () => {
    cleanups.forEach((fn) => fn());
    document.removeEventListener('astro:before-swap', cleanup);
  };
  document.addEventListener('astro:before-swap', cleanup);
}

document.addEventListener('astro:page-load', initTocHighlight);
