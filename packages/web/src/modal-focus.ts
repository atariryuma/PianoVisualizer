// Modal focus management — Phase 0d batch 47.
//
// Two pieces of cross-modal focus hygiene that the legacy shell
// stitched together:
//
//   1. Tab-cycling guard — trap focus inside the active modal so a
//      keyboard / assistive-tech user can't accidentally tab into the
//      (visually obscured) page beneath. Shift+Tab past the first
//      focusable wraps to the last; Tab past the last wraps to the
//      first.
//
//   2. Restore-on-close — remember which element had focus before
//      `open()` and return focus to it on `close()`. Modals don't
//      always close in strict LIFO (e.g. section-edit can spawn from
//      add-song), so we walk the stack from the top and pop the
//      entry that matches the closed modal element rather than
//      assuming the topmost entry.
//
// Pure helper, document is held by deps so vitest can drive it
// against happy-dom without binding to a global at module-init.

export interface ModalFocusDeps {
  /** Production: `document`. */
  document: {
    activeElement: Element | null;
  };
  /** Production: `window.requestAnimationFrame`. Tests can pass a
   *  synchronous shim. */
  requestAnimationFrame: (cb: () => void) => unknown;
}

export interface ModalFocus {
  open(modalEl: HTMLElement | null): void;
  close(modalEl: HTMLElement | null): void;
}

/** Selector matching everything we'll allow focus to land on inside a
 *  modal. Mirrors the legacy string char-for-char. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface StackEntry {
  el: HTMLElement;
  prev: Element | null;
  onKey: (e: KeyboardEvent) => void;
}

export function createModalFocus(deps: ModalFocusDeps): ModalFocus {
  const stack: StackEntry[] = [];

  function trapHandler(modalEl: HTMLElement) {
    return (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = modalEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && deps.document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && deps.document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
  }

  return {
    open(modalEl) {
      if (!modalEl) return;
      const prev = deps.document.activeElement;
      const onKey = trapHandler(modalEl);
      modalEl.addEventListener('keydown', onKey as EventListener);
      stack.push({ el: modalEl, prev, onKey });
      // Defer focus until the modal is laid out (display flips happen
      // synchronously but querySelector inside a hidden tree is fine).
      deps.requestAnimationFrame(() => {
        const first = modalEl.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (first) first.focus();
      });
    },
    close(modalEl) {
      // Pop the topmost matching entry — modals don't always close in
      // strict LIFO (e.g. a section-edit modal can spawn from
      // add-song) but the prev focus we want to restore is always the
      // one we pushed for this specific modalEl.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].el === modalEl) {
          const entry = stack[i];
          stack.splice(i, 1);
          entry.el.removeEventListener('keydown', entry.onKey as EventListener);
          const prev = entry.prev as HTMLElement | null;
          if (prev && typeof prev.focus === 'function') {
            try {
              prev.focus();
            } catch {
              /* prev was detached — best-effort restore */
            }
          }
          return;
        }
      }
    },
  };
}
