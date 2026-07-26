// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { installTouchFeedback, setButtonBusy } from '../src/touch-feedback';

describe('installTouchFeedback', () => {
  it('registers a PASSIVE touchstart listener (non-passive would kill fast-tap)', () => {
    const target = document.createElement('div');
    const spy = vi.spyOn(target, 'addEventListener');
    const uninstall = installTouchFeedback(target);
    expect(spy).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true });
    uninstall();
  });

  it('never prevents the touch — click synthesis and scrolling stay intact', () => {
    const target = document.createElement('div');
    const uninstall = installTouchFeedback(target);
    const ev = new Event('touchstart', { cancelable: true });
    target.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    uninstall();
  });

  it('is idempotent — a second install returns a no-op disposer', () => {
    const target = document.createElement('div');
    const first = installTouchFeedback(target);
    const removeSpy = vi.spyOn(target, 'removeEventListener');
    installTouchFeedback(target)(); // second install's disposer must do nothing
    expect(removeSpy).not.toHaveBeenCalled();
    first();
    expect(removeSpy).toHaveBeenCalled();
  });
});

describe('setButtonBusy', () => {
  it('toggles the .is-busy class both ways', () => {
    const btn = document.createElement('button');
    setButtonBusy(btn, true);
    expect(btn.classList.contains('is-busy')).toBe(true);
    setButtonBusy(btn, false);
    expect(btn.classList.contains('is-busy')).toBe(false);
  });

  it('tolerates a missing element (optional DOM callers)', () => {
    expect(() => setButtonBusy(null, true)).not.toThrow();
    expect(() => setButtonBusy(undefined, false)).not.toThrow();
  });
});
