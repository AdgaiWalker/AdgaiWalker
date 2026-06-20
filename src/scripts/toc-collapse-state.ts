const STORAGE_KEY = 'walker-toc-collapsed';

interface TocCollapseElements {
  sidebar: HTMLElement;
  collapseButton: { hidden: boolean };
  expandButton: { hidden: boolean };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readTocCollapsedState(storage: StorageLike): boolean {
  try {
    return storage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function applyTocCollapsedState(
  elements: TocCollapseElements,
  collapsed: boolean,
  storage: StorageLike,
): void {
  elements.sidebar.classList.toggle('is-collapsed', collapsed);
  elements.collapseButton.hidden = collapsed;
  elements.expandButton.hidden = !collapsed;

  try {
    storage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // UI preferences are optional; the interaction must keep working without storage.
  }
}
