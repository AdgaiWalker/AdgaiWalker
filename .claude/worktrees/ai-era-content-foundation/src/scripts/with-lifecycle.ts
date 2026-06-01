export function registerLifecycle(init: () => (() => void) | void) {
  let cleanup: (() => void) | void;

  document.addEventListener('astro:page-load', () => {
    cleanup?.();
    cleanup = init();
  });

  document.addEventListener('astro:before-swap', () => {
    cleanup?.();
  });
}
