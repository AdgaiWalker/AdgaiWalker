/**
 * Pretext-based justified tag cloud layout.
 * Usage: call `watchJustifyTags('container-id')` on load.
 */
export async function justifyTags(containerId: string) {
  try {
    const { prepareWithSegments, measureNaturalWidth } = await import('@chenglou/pretext');
    const container = document.getElementById(containerId);
    if (!container) return;

    const buttons = Array.from(container.querySelectorAll('.filter-btn')) as HTMLElement[];
    const containerWidth = container.clientWidth;
    if (!containerWidth || buttons.length === 0) return;

    const gap = 8;
    const computedStyle = getComputedStyle(document.body);
    const fontBody = computedStyle.getPropertyValue('--font-body') || 'Inter, sans-serif';
    const font = `12px ${fontBody}`;

    const items = buttons.map(btn => {
      const text = btn.textContent?.trim() || '';
      const prepared = prepareWithSegments(text, font);
      const textWidth = measureNaturalWidth(prepared);
      const totalWidth = textWidth + 26;
      return { btn, width: totalWidth };
    });

    let rows: { items: typeof items; width: number }[] = [];
    let currentRow: typeof items = [];
    let currentWidth = 0;

    for (const item of items) {
      if (currentRow.length > 0 && currentWidth + gap + item.width > containerWidth) {
        rows.push({ items: currentRow, width: currentWidth });
        currentRow = [item];
        currentWidth = item.width;
      } else {
        currentRow.push(item);
        currentWidth += (currentRow.length === 1 ? 0 : gap) + item.width;
      }
    }
    if (currentRow.length > 0) {
      rows.push({ items: currentRow, width: currentWidth });
    }

    rows.forEach((row, i) => {
      const isLast = i === rows.length - 1;
      row.items.forEach(item => {
        if (!isLast && row.width > containerWidth * 0.5) {
          item.btn.style.flexGrow = '1';
          item.btn.style.textAlign = 'center';
          item.btn.style.justifyContent = 'center';
        } else {
          item.btn.style.flexGrow = '0';
        }
      });
    });
  } catch (e) {
    console.error('Pretext justified layout failed', e);
  }
}

const activeWatchers = new Map<string, () => void>();

// Clear stale watchers on View Transitions
document.addEventListener('astro:before-swap', () => {
  for (const [, cleanup] of activeWatchers) {
    cleanup();
  }
  activeWatchers.clear();
});

export function watchJustifyTags(containerId: string) {
  if (activeWatchers.has(containerId)) return;

  justifyTags(containerId);
  let resizeTimer: ReturnType<typeof setTimeout>;

  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => justifyTags(containerId), 150);
  };

  window.addEventListener('resize', onResize);
  activeWatchers.set(containerId, () => window.removeEventListener('resize', onResize));
}
