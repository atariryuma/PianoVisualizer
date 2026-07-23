// Device performance tier — drives particle caps, shadowBlur, ambient density.
//
// Apple Forum #768404 (2024): iPad 10's Canvas 2D is roughly half the throughput
// of iPad Air 4. shadowBlur forces software rendering on Safari (web.dev guidance,
// Konva #1182). The tier system avoids both pitfalls without manual tuning.
//
// Detection signals:
//   - navigator.deviceMemory  (Chrome/Edge; missing on Safari → falls back)
//   - navigator.hardwareConcurrency
//   - userAgent (iPad-as-Mac heuristic for M-series devices)
//
// Manual override: localStorage.pianoViz_perfTier = 'low' | 'mid' | 'high'.

export type PerfTier = 'low' | 'mid' | 'high';

export interface PerfProfile {
  /** Soft cap on the 3D particle pool. The combined 2D+3D cap is +200 above this. */
  maxParticles3D: number;
  /** Whether per-particle/ripple shadowBlur is enabled. Disable on low-tier
   *  Safari to prevent software-rendering fallback. */
  shadowBlur: boolean;
  /** Per-frame chance of spawning an ambient (idle) particle. */
  ambientChance: number;
  /** Background star count for the title-state field. */
  bgStarCount: number;
}

export const PERF_PROFILES: Record<PerfTier, PerfProfile> = {
  low: { maxParticles3D: 400, shadowBlur: false, ambientChance: 0.015, bgStarCount: 50 },
  mid: { maxParticles3D: 600, shadowBlur: true, ambientChance: 0.03, bgStarCount: 80 },
  high: { maxParticles3D: 1200, shadowBlur: true, ambientChance: 0.045, bgStarCount: 120 },
};

/** True when the OS/browser requests reduced motion. The canvas visualizer
 *  (falling notes, particles, glow) is JS-driven and doesn't see the CSS
 *  media query, so callers apply `reduceProfile()` to thin the particle
 *  pool + kill ambient spawns + shadowBlur. Safe on SSR/happy-dom (returns
 *  false when matchMedia is unavailable). */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** Tone a profile down for reduced-motion: hard-cap the particle pool, drop
 *  ambient idle spawns to zero, and disable shadowBlur halos. Keeps the app
 *  usable (notes still fall) while removing the heavy, sustained animation a
 *  vestibular/photosensitive user opted out of. */
export function reduceProfile(p: PerfProfile): PerfProfile {
  return {
    maxParticles3D: Math.min(p.maxParticles3D, 120),
    shadowBlur: false,
    ambientChance: 0,
    bgStarCount: Math.min(p.bgStarCount, 30),
  };
}

export function detectPerfTier(): PerfTier {
  if (typeof navigator === 'undefined') return 'mid';
  // Manual override wins.
  try {
    const override =
      typeof localStorage !== 'undefined' ? localStorage.getItem('pianoViz_perfTier') : null;
    if (override === 'low' || override === 'mid' || override === 'high') return override;
  } catch (_) {
    /* localStorage may throw in private mode */
  }

  const mem = (navigator as any).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const ua = navigator.userAgent || '';
  // Modern iPadOS reports as Macintosh + has touch points. M-series threshold.
  const isAppleSilicon = /Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1;
  // Older iPads have <=4 cores; Pro models always have >=4 + 'iPad Pro' string.
  const isOlderIPad = /iPad/.test(ua) && !/iPad.*Pro/.test(ua) && cores <= 4;

  if (isAppleSilicon || cores >= 8 || mem >= 8) return 'high';
  if (isOlderIPad || mem <= 2 || cores <= 2) return 'low';
  return 'mid';
}
