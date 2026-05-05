// Encouragement effects — celebration feedback fired at combo milestones.
//
// Each effect is a thin wrapper over particles + ripples + game-state
// toggles (glow pulse intensity, shimmer phase). The legacy free functions
// read globals directly (W, H, state.flow, state.glowPulseIntensity,
// CONFIG.THEMES[state.currentTheme].colors). Here they take an explicit
// `EffectDeps` bag so the same code runs against any canvas size + state
// shape — same-shape mocks make tests trivial.
//
// Side effects (state mutation) are small and predictable. We expose a
// `triggerEffect(name, deps)` dispatcher mirroring the legacy switch.

import { Particle, type ParticleType, spawnBurst, type SpawnOptions } from './particles';
import { Ripple } from './ripples';

/** Game-state slice the effects touch. Caller passes in a reference; effects mutate. */
export interface EffectGameState {
  /** 0..1, set by glow-emitting effects. The render loop fades it down. */
  glowPulseIntensity: number;
  /** -1 = inactive, 0 = just started. Set by shimmer / golden-burst. */
  shimmerPhase: number;
  /** Wall-clock ms when shimmer started (for the render loop's animation). */
  shimmerStartMs: number;
  /** Current flow (0..100) — used by colorWave / radiance / starShower spawn math. */
  flow: number;
}

export interface EffectDeps {
  /** The shared particles[] array. Effects push into this. */
  particles: Particle[];
  /** The shared ripples[] array. Effects push into this. */
  ripples: Ripple[];
  /** Theme color palette. */
  themeColors: readonly string[];
  /** Canvas dimensions. */
  screenW: number;
  screenH: number;
  /** Hard ceiling on the particles array. */
  maxParticles: number;
  /** Game-state slice the effects can mutate. */
  state: EffectGameState;
  /** Wall-clock supplier (defaults to performance.now()). Injectable for tests. */
  now?: () => number;
}

const GOLDEN_BURST_COLORS = ['#ffd700', '#ffec8b', '#fff8dc', '#ffe4b5', '#ffc125', '#eec900'];

const DEFAULT_STAR_SHOWER_COUNT = 12;

/** Helper: build the SpawnOptions bag from EffectDeps + optional override color. */
function spawnOpts(deps: EffectDeps, overrideColor?: string | null): SpawnOptions {
  return {
    screenW: deps.screenW,
    screenH: deps.screenH,
    themeColors: deps.themeColors,
    flow: deps.state.flow,
    maxParticles: deps.maxParticles,
    overrideColor: overrideColor ?? null,
  };
}

// =====================================================================
// Individual effects
// =====================================================================

export function effectGlowPulse(deps: EffectDeps): void {
  deps.state.glowPulseIntensity = 0.4;
}

export function effectGlowParticles(deps: EffectDeps): void {
  deps.state.glowPulseIntensity = 0.5;
  spawnBurst(deps.particles, deps.screenW / 2, deps.screenH * 0.3, 5, 0.6, spawnOpts(deps));
}

export function effectColorWave(deps: EffectDeps): void {
  deps.state.glowPulseIntensity = 0.6;
  for (let i = 0; i < 8; i++) {
    const ang = (Math.PI * 2 * i) / 8;
    const dist = 80;
    deps.ripples.push(
      new Ripple(
        deps.screenW / 2 + Math.cos(ang) * dist,
        deps.screenH * 0.4 + Math.sin(ang) * dist,
        deps.themeColors[i % deps.themeColors.length],
        250 + deps.state.flow * 2
      )
    );
  }
}

export function effectStarShower(deps: EffectDeps, count = DEFAULT_STAR_SHOWER_COUNT): void {
  const n = count;
  for (let i = 0; i < n; i++) {
    if (deps.particles.length >= deps.maxParticles) break;
    // Spawn high above, deep in Z, falling forward toward the camera.
    const startX = (Math.random() - 0.5) * deps.screenW * 1.5;
    const startY = -deps.screenH / 2 - 50;
    const startZ = 200 + Math.random() * 400;
    const color = deps.themeColors[Math.floor(Math.random() * deps.themeColors.length)];
    deps.particles.push(
      new Particle(
        startX,
        startY,
        startZ,
        color,
        4 + Math.random() * 8,
        (Math.random() - 0.5) * 1.5,
        1 + Math.random() * 2,
        -4 - Math.random() * 2, // negative Z = forward
        180 + Math.random() * 80,
        'star'
      )
    );
  }
}

export function effectFlowerBurst(deps: EffectDeps): void {
  deps.state.glowPulseIntensity = 0.7;
  for (let i = 0; i < 15; i++) {
    if (deps.particles.length >= deps.maxParticles) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 3;
    const zSpd = (Math.random() - 0.5) * 10;
    const color = deps.themeColors[Math.floor(Math.random() * deps.themeColors.length)];
    deps.particles.push(
      new Particle(
        0,
        -deps.screenH * 0.1,
        0,
        color,
        5 + Math.random() * 10,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd - 1.5,
        zSpd,
        100 + Math.random() * 80,
        'flower'
      )
    );
  }
}

export function effectShimmer(deps: EffectDeps): void {
  const now = deps.now ?? (() => performance.now());
  deps.state.shimmerPhase = 0;
  deps.state.shimmerStartMs = now();
  deps.state.glowPulseIntensity = 0.8;
  spawnBurst(deps.particles, deps.screenW / 2, deps.screenH * 0.4, 20, 1.0, spawnOpts(deps));
  effectStarShower(deps, 8);
}

export function effectRadiance(deps: EffectDeps): void {
  deps.state.glowPulseIntensity = 1.0;
  effectStarShower(deps, 15);
  for (let i = 0; i < 12; i++) {
    if (deps.particles.length >= deps.maxParticles) break;
    deps.ripples.push(
      new Ripple(
        deps.screenW / 2,
        deps.screenH * 0.4,
        deps.themeColors[i % deps.themeColors.length],
        300 + i * 30
      )
    );
  }
}

export function effectGoldenBurst(deps: EffectDeps): void {
  const now = deps.now ?? (() => performance.now());
  deps.state.glowPulseIntensity = 1.0;
  deps.state.shimmerPhase = 0;
  deps.state.shimmerStartMs = now();
  for (let i = 0; i < 30; i++) {
    if (deps.particles.length >= deps.maxParticles) break;
    const ang = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 4;
    const zSpd = (Math.random() - 0.5) * 15;
    const color = GOLDEN_BURST_COLORS[Math.floor(Math.random() * GOLDEN_BURST_COLORS.length)];
    const type: ParticleType = Math.random() > 0.5 ? 'star' : 'circle';
    deps.particles.push(
      new Particle(
        0,
        -deps.screenH * 0.15,
        0,
        color,
        4 + Math.random() * 12,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd - 2,
        zSpd,
        100 + Math.random() * 100,
        type
      )
    );
  }
  effectStarShower(deps, 10);
}

// =====================================================================
// Dispatcher
// =====================================================================

export type EffectName =
  | 'glowPulse'
  | 'glowParticles'
  | 'colorWave'
  | 'starShower'
  | 'flowerBurst'
  | 'shimmer'
  | 'radiance'
  | 'goldenBurst';

const EFFECT_REGISTRY: Record<EffectName, (deps: EffectDeps) => void> = {
  glowPulse: effectGlowPulse,
  glowParticles: effectGlowParticles,
  colorWave: effectColorWave,
  starShower: (d) => effectStarShower(d),
  flowerBurst: effectFlowerBurst,
  shimmer: effectShimmer,
  radiance: effectRadiance,
  goldenBurst: effectGoldenBurst,
};

/**
 * Look up an effect by name and run it. No-op for unknown names (legacy
 * matches the same forgive-on-unknown behavior).
 */
export function triggerEffect(name: string, deps: EffectDeps): boolean {
  const fn = EFFECT_REGISTRY[name as EffectName];
  if (!fn) return false;
  fn(deps);
  return true;
}
