import { describe, expect, it, vi } from 'vitest';

import { applyTocCollapsedState, readTocCollapsedState } from './toc-collapse-state';

function createElements() {
  return {
    sidebar: { classList: { toggle: vi.fn() } } as unknown as HTMLElement,
    collapseButton: { hidden: false } as HTMLButtonElement,
    expandButton: { hidden: true } as HTMLButtonElement,
  };
}

describe('TOC collapsed state', () => {
  it('projects one collapsed value to the sidebar and both buttons', () => {
    const elements = createElements();
    const storage = { getItem: vi.fn(), setItem: vi.fn() };

    applyTocCollapsedState(elements, true, storage);

    expect(elements.sidebar.classList.toggle).toHaveBeenCalledWith('is-collapsed', true);
    expect(elements.collapseButton.hidden).toBe(true);
    expect(elements.expandButton.hidden).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith('walker-toc-collapsed', 'true');
  });

  it('keeps the UI usable when storage is unavailable', () => {
    const elements = createElements();
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    };

    expect(readTocCollapsedState(storage)).toBe(false);
    expect(() => applyTocCollapsedState(elements, true, storage)).not.toThrow();
    expect(elements.collapseButton.hidden).toBe(true);
    expect(elements.expandButton.hidden).toBe(false);
  });
});
