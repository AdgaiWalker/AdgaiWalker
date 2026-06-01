interface TiltOptions {
  perspective: number;
  maxRotation: number;
  scale: number;
}

export function setupTilt(selector: string, options: TiltOptions) {
  const abort = new AbortController();
  const frameIds = new Map<HTMLElement, number>();
  const { signal } = abort;
  const cards = document.querySelectorAll<HTMLElement>(selector);

  cards.forEach(card => {
    card.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -options.maxRotation;
      const rotateY = ((x - centerX) / centerX) * options.maxRotation;

      const activeFrame = frameIds.get(card);
      if (activeFrame) cancelAnimationFrame(activeFrame);

      const frameId = requestAnimationFrame(() => {
        frameIds.delete(card);
        card.style.transform = `perspective(${options.perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${options.scale}, ${options.scale}, ${options.scale})`;
      });
      frameIds.set(card, frameId);
    }, { signal });

    card.addEventListener('mouseleave', () => {
      const activeFrame = frameIds.get(card);
      if (activeFrame) {
        cancelAnimationFrame(activeFrame);
        frameIds.delete(card);
      }
      card.style.transform = `perspective(${options.perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    }, { signal });
  });

  return () => {
    abort.abort();
    frameIds.forEach(frameId => cancelAnimationFrame(frameId));
    frameIds.clear();
  };
}
