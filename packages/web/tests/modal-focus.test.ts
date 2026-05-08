// @vitest-environment happy-dom
// Tests for packages/web/src/modal-focus.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEscRouter,
  createModalFocus,
  FOCUSABLE_SELECTOR,
  type EscRoute,
} from '../src/modal-focus';

function makeModal(buttonsCount: number = 3): HTMLElement {
  const modal = document.createElement('div');
  for (let i = 0; i < buttonsCount; i++) {
    const btn = document.createElement('button');
    btn.textContent = 'btn' + i;
    modal.appendChild(btn);
  }
  document.body.appendChild(modal);
  return modal;
}

function makeFixture() {
  const rafFn = vi.fn((cb: () => void) => cb()); // run synchronously for tests
  const focus = createModalFocus({
    document,
    requestAnimationFrame: rafFn,
  });
  return { focus, rafFn };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createModalFocus — open()', () => {
  it('focuses the first focusable element via requestAnimationFrame', () => {
    const fx = makeFixture();
    const modal = makeModal(3);
    fx.focus.open(modal);
    const buttons = modal.querySelectorAll('button');
    expect(document.activeElement).toBe(buttons[0]);
    expect(fx.rafFn).toHaveBeenCalled();
  });

  it('no-ops when modalEl is null', () => {
    const fx = makeFixture();
    expect(() => fx.focus.open(null)).not.toThrow();
    expect(fx.rafFn).not.toHaveBeenCalled();
  });

  it('handles modal with no focusables (rAF still scheduled, no throw)', () => {
    const fx = makeFixture();
    const modal = document.createElement('div'); // no buttons
    document.body.appendChild(modal);
    expect(() => fx.focus.open(modal)).not.toThrow();
  });
});

describe('createModalFocus — Tab trap', () => {
  it('Shift+Tab on first wraps to last', () => {
    const fx = makeFixture();
    const modal = makeModal(3);
    const buttons = modal.querySelectorAll('button');
    fx.focus.open(modal);

    // Force focus on first button (open() already does this, but be explicit).
    (buttons[0] as HTMLButtonElement).focus();

    const ev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    modal.dispatchEvent(ev);

    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Tab on last wraps to first', () => {
    const fx = makeFixture();
    const modal = makeModal(3);
    const buttons = modal.querySelectorAll('button');
    fx.focus.open(modal);

    (buttons[buttons.length - 1] as HTMLButtonElement).focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    modal.dispatchEvent(ev);

    expect(document.activeElement).toBe(buttons[0]);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Tab in the middle: handler does not preventDefault', () => {
    const fx = makeFixture();
    const modal = makeModal(3);
    const buttons = modal.querySelectorAll('button');
    fx.focus.open(modal);

    (buttons[1] as HTMLButtonElement).focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    modal.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(false);
  });

  it('non-Tab key: handler ignores', () => {
    const fx = makeFixture();
    const modal = makeModal(3);
    fx.focus.open(modal);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    modal.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('zero focusables: Tab is ignored', () => {
    const fx = makeFixture();
    const modal = document.createElement('div');
    document.body.appendChild(modal);
    fx.focus.open(modal);
    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    modal.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('createModalFocus — close() restore', () => {
  it('restores focus to the previously-focused element', () => {
    const fx = makeFixture();
    // Element outside the modal that had focus first.
    const trigger = document.createElement('button');
    trigger.textContent = 'opener';
    document.body.appendChild(trigger);
    trigger.focus();

    const modal = makeModal(3);
    fx.focus.open(modal);
    fx.focus.close(modal);

    expect(document.activeElement).toBe(trigger);
  });

  it('non-LIFO close: matches by element, not stack-top order', () => {
    const fx = makeFixture();
    const t1 = document.createElement('button');
    t1.textContent = 't1';
    document.body.appendChild(t1);
    t1.focus();

    const m1 = makeModal(2);
    fx.focus.open(m1);

    const t2 = document.createElement('button');
    t2.textContent = 't2';
    document.body.appendChild(t2);
    t2.focus();

    const m2 = makeModal(2);
    fx.focus.open(m2);

    // Close m1 first (the bottom of the stack). Should still restore
    // to t1 because that's the prev we pushed for m1.
    fx.focus.close(m1);
    expect(document.activeElement).toBe(t1);

    // m2 still in the stack — close it now restores to t2.
    fx.focus.close(m2);
    expect(document.activeElement).toBe(t2);
  });

  it('removes the keydown listener on close (Tab no longer trapped)', () => {
    const fx = makeFixture();
    const modal = makeModal(3);
    const buttons = modal.querySelectorAll('button');
    fx.focus.open(modal);
    fx.focus.close(modal);

    (buttons[buttons.length - 1] as HTMLButtonElement).focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    modal.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('close() is a no-op for a modal that was never opened', () => {
    const fx = makeFixture();
    const stranger = document.createElement('div');
    document.body.appendChild(stranger);
    expect(() => fx.focus.close(stranger)).not.toThrow();
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  it('matches the legacy selector char-for-char', () => {
    expect(FOCUSABLE_SELECTOR).toBe(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  });
});

// ─── createEscRouter (Phase 0d batch 61) ──────────────────────────

interface RouteSpy extends EscRoute {
  closeSpy: ReturnType<typeof vi.fn>;
  openFlag: { value: boolean };
}

function makeRoute(priority: number, openInitially = false): RouteSpy {
  const closeSpy = vi.fn();
  const openFlag = { value: openInitially };
  return {
    priority,
    isOpen: () => openFlag.value,
    close: closeSpy,
    closeSpy,
    openFlag,
  };
}

function fireEsc(target?: HTMLElement | null): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
  // happy-dom respects the dispatch path; set target by dispatching from the element.
  (target ?? document).dispatchEvent(e);
  return e;
}

describe('createEscRouter — basic routing', () => {
  it('install() registers the keydown listener; uninstall() detaches it', () => {
    const r = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    fireEsc();
    expect(r.closeSpy).toHaveBeenCalledOnce();
    router.uninstall();
    fireEsc();
    expect(r.closeSpy).toHaveBeenCalledOnce(); // unchanged after uninstall
  });

  it('second install() is a no-op (no double-fire)', () => {
    const r = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    router.install();
    fireEsc();
    expect(r.closeSpy).toHaveBeenCalledOnce();
    router.uninstall();
  });

  it('fires the highest-priority open route', () => {
    const lo = makeRoute(10, true);
    const hi = makeRoute(50, true);
    const mid = makeRoute(30, true);
    const router = createEscRouter({ document, routes: [lo, hi, mid] });
    router.install();
    fireEsc();
    expect(hi.closeSpy).toHaveBeenCalledOnce();
    expect(mid.closeSpy).not.toHaveBeenCalled();
    expect(lo.closeSpy).not.toHaveBeenCalled();
    router.uninstall();
  });

  it('skips closed routes; fires the next-priority open one', () => {
    const r1 = makeRoute(50, false);
    const r2 = makeRoute(30, true);
    const r3 = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r1, r2, r3] });
    router.install();
    fireEsc();
    expect(r2.closeSpy).toHaveBeenCalledOnce();
    expect(r3.closeSpy).not.toHaveBeenCalled();
    router.uninstall();
  });

  it('non-Escape keys are ignored', () => {
    const r = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(r.closeSpy).not.toHaveBeenCalled();
    router.uninstall();
  });

  it('all routes closed → no-op', () => {
    const r1 = makeRoute(50, false);
    const r2 = makeRoute(30, false);
    const router = createEscRouter({ document, routes: [r1, r2] });
    router.install();
    fireEsc();
    expect(r1.closeSpy).not.toHaveBeenCalled();
    expect(r2.closeSpy).not.toHaveBeenCalled();
    router.uninstall();
  });

  it('isOpen is read fresh each ESC (not snapshotted at install)', () => {
    const r = makeRoute(10, false);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    fireEsc();
    expect(r.closeSpy).not.toHaveBeenCalled();
    r.openFlag.value = true; // synchronous flip
    fireEsc();
    expect(r.closeSpy).toHaveBeenCalledOnce();
    router.uninstall();
  });
});

describe('createEscRouter — input-typing exception', () => {
  it('ESC inside <input> with content → swallowed (browser native clear runs)', () => {
    const r = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    const input = document.createElement('input');
    input.value = 'half-typed text';
    document.body.appendChild(input);
    input.focus();
    fireEsc(input);
    expect(r.closeSpy).not.toHaveBeenCalled();
    router.uninstall();
  });

  it('ESC inside empty <input> → still closes the modal', () => {
    const r = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    const input = document.createElement('input');
    input.value = '';
    document.body.appendChild(input);
    fireEsc(input);
    expect(r.closeSpy).toHaveBeenCalledOnce();
    router.uninstall();
  });

  it('ESC inside <textarea> with content → swallowed', () => {
    const r = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    const ta = document.createElement('textarea');
    ta.value = 'long\ndraft\nhere';
    document.body.appendChild(ta);
    fireEsc(ta);
    expect(r.closeSpy).not.toHaveBeenCalled();
    router.uninstall();
  });

  it('ESC outside any input → fires close even if a (different) input had value', () => {
    const r = makeRoute(10, true);
    const router = createEscRouter({ document, routes: [r] });
    router.install();
    const input = document.createElement('input');
    input.value = 'still typed';
    document.body.appendChild(input);
    // Dispatch from <body> instead of input itself — handler reads
    // event.target, not document.activeElement.
    fireEsc(document.body);
    expect(r.closeSpy).toHaveBeenCalledOnce();
    router.uninstall();
  });
});
