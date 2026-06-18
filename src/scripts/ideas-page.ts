import { gsap } from 'gsap';

export function mountIdeasPage(root: HTMLElement) {
  let ideasAbort: AbortController | null = null;
  let deepLinkTimer: ReturnType<typeof setTimeout> | null = null;
  let deepLinkFrame: number | null = null;

  const validStatuses = new Set(['all', 'active', 'thinking', 'validating', 'building', 'verified', 'archived']);

  function getRequestedStatus() {
    const requested = new URLSearchParams(location.search).get('status');
    if (!requested || !validStatuses.has(requested)) return 'all';
    if (['thinking', 'validating', 'building'].includes(requested)) return 'active';
    return requested;
  }

  function updateIdeasFilter() {
    const activeStatus = getRequestedStatus();
    const cards = [...root.querySelectorAll('.card-container')] as HTMLElement[];
    let visibleCount = 0;

    // 过滤卡牌
    for (const card of cards) {
      const cardStatus = card.getAttribute('data-status') ?? 'thinking';
      const activeStatuses = activeStatus === 'active'
        ? ['thinking', 'validating', 'building']
        : [activeStatus];
      const isVisible = activeStatus === 'all' || activeStatuses.includes(cardStatus);
      
      if (isVisible) {
        visibleCount += 1;
        card.removeAttribute('hidden');
        gsap.killTweensOf(card);
        gsap.fromTo(card,
          { opacity: 0, scale: 0.85 },
          { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.15)', clearProps: 'opacity,scale' }
        );
      } else {
        gsap.killTweensOf(card);
        gsap.to(card, {
          opacity: 0,
          scale: 0.85,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            card.setAttribute('hidden', '');
          }
        });
      }
    }

    // 更新 Tab 按钮的激活状态
    const tabButtons = root.querySelectorAll('.filter-tab');
    tabButtons.forEach(btn => {
      const btnStatus = btn.getAttribute('data-status');
      const isActive = btnStatus === activeStatus;
      btn.classList.toggle('is-active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.removeAttribute('aria-current');
      }
    });

    // 计数更新
    const countEl = document.querySelector('#log-count');
    if (countEl) {
      countEl.textContent = `${visibleCount} 个`;
    }

    // 空状态提示
    const emptyState = root.querySelector('#ideas-empty');
    if (emptyState) {
      emptyState.toggleAttribute('hidden', visibleCount > 0);
    }
  }

  function setupCardGSAP(signal: AbortSignal) {
    const cards = [...root.querySelectorAll('.card-container')] as HTMLElement[];
    
    cards.forEach((card) => {
      const id = card.dataset.id || '';
      
      // Calculate a stable pseudo-random rotation angle based on the card's ID hash
      let hash = 0;
      for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
      }
      const rotateZ = (hash % 5) / 2; // Stable pseudorandom tilt between -2.5 and +2.5 degrees
      
      // Store the stable random rotation on the element to reference later
      card.dataset.stableRotate = rotateZ.toString();
      
      // Set the initial tilt
      gsap.set(card, { rotateZ });
      
      // 1. Mouse Enter / Focus - Hover纠偏并轻微拉起
      const onEnter = () => {
        if (card.classList.contains('is-flipped')) return;
        
        gsap.killTweensOf(card);
        gsap.to(card, {
          rotateZ: 0,
          y: -12,
          scale: 1.025,
          boxShadow: '0 20px 40px -8px var(--color-brand-glow)',
          duration: 0.35,
          ease: 'power2.out'
        });
      };
      
      // 2. Mouse Leave / Blur - 随机倾斜还原
      const onLeave = () => {
        if (card.classList.contains('is-flipped')) return;
        
        gsap.killTweensOf(card);
        gsap.to(card, {
          rotateZ: parseFloat(card.dataset.stableRotate || '0'),
          y: 0,
          scale: 1.0,
          boxShadow: 'none',
          duration: 0.4,
          ease: 'power2.out'
        });
      };
      
      card.addEventListener('mouseenter', onEnter, { signal });
      card.addEventListener('focus', onEnter, { signal });
      card.addEventListener('mouseleave', onLeave, { signal });
      card.addEventListener('blur', onLeave, { signal });
    });

    const grid = root.querySelector('#ideas-grid');
    if (!grid) return;

    // 3. 点击翻转 (Front -> Back & Back -> Front)
    grid.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const container = target.closest('.card-container') as HTMLElement | null;
      if (!container) return;

      // 如果处于模糊锁定状态，点击任意前端解锁
      if (container.classList.contains('is-blurred')) {
        const revealBtn = target.closest('.reveal-btn');
        const clickFront = target.closest('.card-front');
        if (revealBtn || clickFront) {
          container.classList.remove('is-blurred');
          container.focus();
          e.stopPropagation();
          return;
        }
      }

      const flipAction = target.closest('.flip-btn-action');
      const clickBody = target.closest('.card-front');
      const isUnblurred = !container.classList.contains('is-blurred');
      const isInteractiveChild = target.closest('.card-tag') || target.closest('.status-badge') || target.closest('a');
      const wantsFlip = flipAction || (clickBody && !isInteractiveChild);
      const inner = container.querySelector('.card-inner') as HTMLElement;

      // 翻到背面 (Front -> Back)
      if (isUnblurred && wantsFlip && !container.classList.contains('is-flipped')) {
        container.classList.add('is-flipped');
        container.setAttribute('aria-expanded', 'true');

        gsap.killTweensOf([container, inner]);
        const tl = gsap.timeline();
        
        // 磁性抬升 + rotateY + 落桌反弹
        tl.to(container, {
          z: 50,
          y: -15,
          scale: 1.05,
          rotateZ: 0,
          boxShadow: '0 25px 50px -12px rgba(var(--color-shadow-rgb), 0.25)',
          duration: 0.25,
          ease: 'power2.out'
        })
        .to(inner, {
          rotateY: 180,
          duration: 0.5,
          ease: 'back.out(1.1)'
        }, 0)
        .to(container, {
          z: 0,
          y: 0,
          scale: 1.0,
          boxShadow: 'none',
          duration: 0.35,
          ease: 'power2.inOut'
        }, 0.25);

        e.stopPropagation();
        return;
      }

      // 翻回正面 (Back -> Front)
      const flipBackBtn = target.closest('.flip-back-btn');
      if (container && flipBackBtn && container.classList.contains('is-flipped')) {
        container.classList.remove('is-flipped');
        container.setAttribute('aria-expanded', 'false');

        gsap.killTweensOf([container, inner]);
        const tl = gsap.timeline();
        const originalRotate = parseFloat(container.dataset.stableRotate || '0');

        tl.to(container, {
          z: 50,
          y: -15,
          scale: 1.05,
          rotateZ: originalRotate,
          boxShadow: '0 25px 50px -12px rgba(var(--color-shadow-rgb), 0.25)',
          duration: 0.25,
          ease: 'power2.out'
        })
        .to(inner, {
          rotateY: 0,
          duration: 0.5,
          ease: 'back.out(1.1)'
        }, 0)
        .to(container, {
          z: 0,
          y: 0,
          scale: 1.0,
          boxShadow: 'none',
          duration: 0.35,
          ease: 'power2.inOut'
        }, 0.25);

        e.stopPropagation();
        return;
      }
    }, { signal });

    // 键盘无障碍交互
    grid.addEventListener('keydown', (e) => {
      const keyboardEvent = e as KeyboardEvent;
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        const container = keyboardEvent.target as HTMLElement;
        if (container && container.classList.contains('card-container')) {
          keyboardEvent.preventDefault();
          
          if (container.classList.contains('is-blurred')) {
            container.classList.remove('is-blurred');
            return;
          }

          const inner = container.querySelector('.card-inner') as HTMLElement;
          const isFlipped = container.classList.contains('is-flipped');
          gsap.killTweensOf([container, inner]);
          const tl = gsap.timeline();

          if (isFlipped) {
            container.classList.remove('is-flipped');
            container.setAttribute('aria-expanded', 'false');
            const originalRotate = parseFloat(container.dataset.stableRotate || '0');

            tl.to(container, {
              z: 50,
              y: -15,
              scale: 1.05,
              rotateZ: originalRotate,
              duration: 0.25,
              ease: 'power2.out'
            })
            .to(inner, {
              rotateY: 0,
              duration: 0.5,
              ease: 'back.out(1.1)'
            }, 0)
            .to(container, {
              z: 0,
              y: 0,
              scale: 1.0,
              duration: 0.35,
              ease: 'power2.inOut'
            }, 0.25);
          } else {
            container.classList.add('is-flipped');
            container.setAttribute('aria-expanded', 'true');

            tl.to(container, {
              z: 50,
              y: -15,
              scale: 1.05,
              rotateZ: 0,
              duration: 0.25,
              ease: 'power2.out'
            })
            .to(inner, {
              rotateY: 180,
              duration: 0.5,
              ease: 'back.out(1.1)'
            }, 0)
            .to(container, {
              z: 0,
              y: 0,
              scale: 1.0,
              duration: 0.35,
              ease: 'power2.inOut'
            }, 0.25);
          }
        }
      }
    }, { signal });
  }

  function setupFilterRouting(signal: AbortSignal) {
    const tabsWrapper = root.querySelector('.filter-tabs-wrapper');
    if (!tabsWrapper) return;

    tabsWrapper.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.filter-tab');
      if (!btn) return;

      const status = btn.getAttribute('data-status');
      if (status) {
        const url = new URL(location.href);
        if (status === 'all') {
          url.searchParams.delete('status');
        } else {
          url.searchParams.set('status', status);
        }
        history.pushState(null, '', url.toString());
        updateIdeasFilter();
      }
    }, { signal });
  }

  // === 深链接：从 Spark 盲盒跳转，自动定位+翻开卡牌 ===
  function handleDeepLink() {
    const raw = location.hash.slice(1);
    if (!raw) return;

    let slug;
    try { slug = decodeURIComponent(raw); } catch { slug = raw; }

    const card = [...root.querySelectorAll<HTMLElement>('.card-container')].find((item) => item.dataset.id === slug) ?? null;
    if (!card) return;

    // 确保可见：移除模糊锁定，确保未被过滤隐藏
    card.classList.remove('is-blurred');
    card.removeAttribute('hidden');

    // 滚动到卡牌位置
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 等滚动完成后翻开卡牌
    if (deepLinkTimer !== null) clearTimeout(deepLinkTimer);
    deepLinkTimer = setTimeout(() => {
      deepLinkTimer = null;
      if (card.classList.contains('is-flipped')) return;

      const inner = card.querySelector('.card-inner') as HTMLElement;
      if (!inner) return;

      card.classList.add('is-flipped');
      card.setAttribute('aria-expanded', 'true');

      const tl = gsap.timeline();
      tl.to(card, {
        z: 50, y: -15, scale: 1.05, rotateZ: 0,
        boxShadow: '0 25px 50px -12px rgba(var(--color-shadow-rgb), 0.25)',
        duration: 0.25, ease: 'power2.out'
      })
      .to(inner, {
        rotateY: 180, duration: 0.5, ease: 'back.out(1.1)'
      }, 0)
      .to(card, {
        z: 0, y: 0, scale: 1.0, boxShadow: 'none',
        duration: 0.35, ease: 'power2.inOut'
      }, 0.25);
    }, 600);

    // 清除 hash，避免刷新页面时重复触发
    history.replaceState(null, '', location.pathname);
  }

  // 挂载初始与生命周期
  function setup() {
    ideasAbort?.abort();
    ideasAbort = new AbortController();
    const { signal } = ideasAbort;
    if (deepLinkFrame !== null) {
      cancelAnimationFrame(deepLinkFrame);
      deepLinkFrame = null;
    }

    updateIdeasFilter();
    setupCardGSAP(signal);
    setupFilterRouting(signal);
    window.addEventListener('popstate', updateIdeasFilter, { signal });

    // 深链接定位（从 Spark 跳转过来时触发）
    deepLinkFrame = requestAnimationFrame(() => {
      deepLinkFrame = null;
      handleDeepLink();
    });
  }

  setup();
  return () => {
    ideasAbort?.abort();
    ideasAbort = null;
    if (deepLinkTimer !== null) {
      clearTimeout(deepLinkTimer);
      deepLinkTimer = null;
    }
    if (deepLinkFrame !== null) {
      cancelAnimationFrame(deepLinkFrame);
      deepLinkFrame = null;
    }
  };
}


