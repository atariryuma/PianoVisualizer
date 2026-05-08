// @vitest-environment happy-dom
// Tests for packages/web/src/modal-focus.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createModalFocus, FOCUSABLE_SELECTOR } from '../src/modal-focus';

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
