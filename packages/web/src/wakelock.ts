// Screen Wake Lock — Phase 0d typed shell module.
//
// Keeps the device awake during practice. Browsers may release the lock when
// the page is hidden or backgrounded, so the legacy shell re-acquires on
// visibilitychange (see visibility.ts). Steam Deck / iPad Safari 16.4+ /
// Chrome / Edge all support this.
//
// Note: this only prevents *screen* sleep. Full system suspend still depends
// on the OS's power-management settings.

let _sentinel: WakeLockSentinel | null = null;
// In-flight request, shared so concurrent callers (visibility-resume +
// section-start, or a burst of `visible` events) don't each fire a request
// and leak all but the last sentinel. Mirrors the audio-recovery / mic-
// acquire in-flight-promise pattern.
let _pending: Promise<void> | null = null;

/** Acquire (or re-acquire) the screen wake lock. Idempotent — repeat calls
 *  while a sentinel is held, OR while a request is already in flight, are a
 *  no-op. Failures are non-fatal: the API is not universal (older Safari,
 *  embedded WebViews) and a missing wake lock just lets the screen dim
 *  faster — never breaks practice. */
export async function requestWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return;
  if (_sentinel) return;
  if (_pending) return _pending;
  _pending = (async () => {
    try {
      _sentinel = await navigator.wakeLock.request('screen');
      _sentinel.addEventListener('release', () => {
        _sentinel = null;
      });
      console.log('[WakeLock] acquired');
    } catch (e) {
      console.warn('[WakeLock] request failed:', e instanceof Error ? e.message : String(e));
    } finally {
      _pending = null;
    }
  })();
  return _pending;
}

/** Release the screen wake lock if held. Safe to call when no lock is
 *  active. Browser may have already auto-released on background; the
 *  internal sentinel-null path covers that case. */
export function releaseWakeLock(): void {
  if (_sentinel) {
    _sentinel.release().catch(() => {});
    _sentinel = null;
    console.log('[WakeLock] released');
  }
}

/** Check if the wake lock is currently held. Used by the visibility-recovery
 *  path to decide whether to re-acquire after the page comes back to
 *  foreground. */
export function isWakeLockActive(): boolean {
  return _sentinel !== null;
}
