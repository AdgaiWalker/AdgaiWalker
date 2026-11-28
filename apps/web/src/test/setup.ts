import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const dialogs = Array.from(document.querySelectorAll('dialog[open]')) as HTMLDialogElement[];
    const top = dialogs[dialogs.length - 1];
    if (!top) return;
    const cancel = new Event('cancel', { cancelable: true });
    top.dispatchEvent(cancel);
    if (!cancel.defaultPrevented) {
      top.close();
    }
  });
}

if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});
