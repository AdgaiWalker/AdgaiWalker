import { describe, expect, it, vi } from 'vitest';

import { resolveTocScrollContainer } from './toc-highlight.logic';

describe('resolveTocScrollContainer', () => {
  it('uses the canonical ContentShell TOC scroll container', () => {
    const container = {} as HTMLElement;
    const toc = {
      closest: vi.fn((selector: string) => selector === '.toc-sidebar-inner' ? container : null),
    } as unknown as HTMLElement;

    expect(resolveTocScrollContainer(toc)).toBe(container);
    expect(toc.closest).toHaveBeenCalledWith('.toc-sidebar-inner');
  });

  it('falls back to the TOC element when no shell container exists', () => {
    const toc = { closest: vi.fn(() => null) } as unknown as HTMLElement;

    expect(resolveTocScrollContainer(toc)).toBe(toc);
  });
});
