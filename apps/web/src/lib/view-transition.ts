/**
 * view-transition — 原生同文档视图过渡，含唯一 view-transition-name 清理与无障碍焦点移交。
 */
import { flushSync } from 'react-dom';
import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

type DocumentWithVT = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export function navigateWithViewTransition(
  navigate: NavigateFunction,
  to: To,
  options?: NavigateOptions & { sourceElement?: HTMLElement | null },
): void {
  const { sourceElement, ...navOptions } = options ?? {};
  const doc = typeof document !== 'undefined' ? (document as DocumentWithVT) : undefined;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  if (!doc?.startViewTransition || reduced) {
    navigate(to, navOptions);
    window.setTimeout(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }, 0);
    return;
  }

  if (sourceElement) {
    sourceElement.style.viewTransitionName = 'walker-active-title';
  }

  const transition = doc.startViewTransition(() => {
    flushSync(() => {
      navigate(to, navOptions);
    });
  });

  void transition.finished.finally(() => {
    if (sourceElement) {
      sourceElement.style.viewTransitionName = '';
    }
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  });
}
