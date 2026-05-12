/**
 * toc-tracker.ts — TOC 滚动跟随高亮
 * 使用 IntersectionObserver 检测当前可见的章节
 * 高亮对应的 TOC 链接
 */

function initTocTracker(): void {
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

  let activeSlug = '';

  const setActive = (slug: string): void => {
    if (slug === activeSlug) return;
    activeSlug = slug;
    tocLinks.forEach((link) => {
      if (link.dataset.tocSlug === slug) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  };

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

// 初始化
initTocTracker();
document.addEventListener('astro:page-load', initTocTracker);
