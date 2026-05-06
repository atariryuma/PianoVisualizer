// Tiny formatting + math helpers shared between the legacy app and any future
// shell. Kept dependency-free so they can be imported from any layer without
// pulling in the rest of @piano/core.

/**
 * Format a duration in milliseconds as `M:SS` (zero-padded seconds).
 *
 * Negative durations are clamped to 0; non-finite values render as `0:00`.
 * Hours are not split out — `2h 03m 04s` would render as `123:04`. That's
 * intentional for the only current caller (free-play session timer, capped
 * far below an hour by typical kid sessions).
 */
export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/** Clamp `v` into `[lo, hi]`. Replaces the `Math.max(lo, Math.min(hi, v))`
 *  idiom that appeared at a dozen call sites. NaN propagates (callers
 *  validate input first if they need a finite default). */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
