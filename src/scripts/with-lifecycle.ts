export function registerLifecycle(init: () => (() => void) | void) {
  let cleanup: (() => void) | void;

  function runCleanup() {
    cleanup?.();
    cleanup = undefined;
  }

  document.addEventListener('astro:page-load', () => {
    runCleanup();
    cleanup = init();
  });

  document.addEventListener('astro:before-swap', () => {
    runCleanup();
  });
}
