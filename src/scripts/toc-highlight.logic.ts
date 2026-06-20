export function resolveTocScrollContainer(toc: HTMLElement): HTMLElement {
  return toc.closest<HTMLElement>('.toc-sidebar-inner') ?? toc;
}
