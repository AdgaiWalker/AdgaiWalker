import { useEffect, type RefObject } from 'react';

const COPY_FEEDBACK_MS = 2_000;

/** 为渲染后的 Markdown `<pre>` 代码块自动注入「复制」按钮，并在卸载时清理定时器与监听器。 */
export function useCodeCopyButtons(
  containerRef: RefObject<HTMLElement | null>,
  contentKey: string,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const pres = container.querySelectorAll('pre');
    const cleanups: Array<() => void> = [];
    pres.forEach((pre) => {
      if (pre.querySelector('.code-copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', '复制代码');
      btn.textContent = '复制';
      let resetTimer: ReturnType<typeof setTimeout> | undefined;
      const onClick = () => {
        const code = pre.querySelector('code');
        const text = code?.innerText ?? code?.textContent ?? pre.innerText ?? pre.textContent ?? '';
        navigator.clipboard?.writeText(text).then(() => {
          btn.textContent = '已复制 √';
          btn.classList.add('copied');
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            btn.textContent = '复制';
            btn.classList.remove('copied');
            resetTimer = undefined;
          }, COPY_FEEDBACK_MS);
        }).catch(() => {});
      };
      btn.addEventListener('click', onClick);
      pre.appendChild(btn);
      cleanups.push(() => {
        if (resetTimer) clearTimeout(resetTimer);
        btn.removeEventListener('click', onClick);
        btn.remove();
      });
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [containerRef, contentKey]);
}
