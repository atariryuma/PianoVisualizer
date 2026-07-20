// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { installNoZoomGuards } from '../src/no-zoom-guard';

describe('installNoZoomGuards', () => {
  it('prevents iOS pinch gesture events (gesturestart)', () => {
    const uninstall = installNoZoomGuards(document);
    const ev = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    uninstall();
  });

  it('after uninstall, no longer prevents', () => {
    const uninstall = installNoZoomGuards(document);
    uninstall();
    const ev = new Event('gesturechange', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('is idempotent — a second install returns a no-op that cannot remove the real guard', () => {
    const first = installNoZoomGuards(document);
    const secondNoop = installNoZoomGuards(document); // already installed → no-op
    secondNoop(); // must NOT tear down the real listeners
    const ev = new Event('gestureend', { cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    first(); // real cleanup
  });
});
