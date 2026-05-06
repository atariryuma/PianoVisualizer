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

/** Acquire (or re-acquire) the screen wake lock. Idempotent — repeat calls
 *  while a sentinel is held are a no-op. Failures are non-fatal: the API is
 *  not universal (older Safari, embedded WebViews) and a missing wake lock
 *  just lets the screen dim faster — never breaks practice. */
export async function requestWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return;
  if (_sentinel) return;
  try {
    _sentinel = await navigator.wakeLock.request('screen');
    _sentinel.addEventListener('release', () => {
      _sentinel = null;
    });
    console.log('[WakeLock] acquired');
  } catch (e) {
    console.warn('[WakeLock] request failed:', e instanceof Error ? e.message : String(e));
  }
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
