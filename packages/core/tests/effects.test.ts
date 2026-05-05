import { describe, it, expect, beforeEach } from 'vitest';
import {
  effectGlowPulse,
  effectGlowParticles,
  effectColorWave,
  effectStarShower,
  effectFlowerBurst,
  effectShimmer,
  effectRadiance,
  effectGoldenBurst,
  triggerEffect,
  type EffectDeps,
  type EffectGameState,
} from '../src/render/effects';
import { Particle } from '../src/render/particles';
import { Ripple } from '../src/render/ripples';

let state: EffectGameState;
let deps: EffectDeps;

beforeEach(() => {
  state = { glowPulseIntensity: 0, shimmerPhase: -1, shimmerStartMs: 0, flow: 50 };
  deps = {
    particles: [],
    ripples: [],
    themeColors: ['#aaa', '#bbb', '#ccc', '#ddd', '#eee', '#fff'],
    screenW: 800,
    screenH: 600,
    maxParticles: 100,
    state,
    now: () => 1000,
  };
});

describe('effectGlowPulse', () => {
  it('sets glowPulseIntensity to 0.4', () => {
    effectGlowPulse(deps);
    expect(state.glowPulseIntensity).toBe(0.4);
    // No particle/ripple side effects.
    expect(deps.particles).toHaveLength(0);
    expect(deps.ripples).toHaveLength(0);
  });
});

describe('effectGlowParticles', () => {
  it('sets glow + spawns 5 particles near upper-center', () => {
    effectGlowParticles(deps);
    expect(state.glowPulseIntensity).toBe(0.5);
    expect(deps.particles.length).toBe(5);
  });
});

describe('effectColorWave', () => {
  it('sets glow + pushes 8 ripples around (W/2, H*0.4)', () => {
    effectColorWave(deps);
    expect(state.glowPulseIntensity).toBe(0.6);
    expect(deps.ripples).toHaveLength(8);
    // Ripple radius scales with flow.
    for (const r of deps.ripples) {
      expect(r.maxRadius).toBe(250 + 50 * 2); // flow=50
    }
  });
});

describe('effectStarShower', () => {
  it('default count = 12 stars with type=star', () => {
    effectStarShower(deps);
    expect(deps.particles.length).toBe(12);
    for (const p of deps.particles) {
      expect(p.type).toBe('star');
    }
  });

  it('honors custom count', () => {
    effectStarShower(deps, 25);
    expect(deps.particles.length).toBe(25);
  });

  it('respects maxParticles cap', () => {
    deps.maxParticles = 5;
    effectStarShower(deps, 30);
    expect(deps.particles.length).toBe(5);
  });
});

describe('effectFlowerBurst', () => {
  it('sets glow + spawns 15 flowers', () => {
    effectFlowerBurst(deps);
    expect(state.glowPulseIntensity).toBe(0.7);
    expect(deps.particles.length).toBe(15);
    for (const p of deps.particles) {
      expect(p.type).toBe('flower');
    }
  });
});

describe('effectShimmer', () => {
  it('sets shimmer state + spawns burst (~20) and star shower (8)', () => {
    effectShimmer(deps);
    expect(state.shimmerPhase).toBe(0);
    expect(state.shimmerStartMs).toBe(1000); // injected now()
    expect(state.glowPulseIntensity).toBe(0.8);
    // 20 burst + 8 stars = 28 particles
    expect(deps.particles.length).toBe(28);
  });
});

describe('effectRadiance', () => {
  it('sets glow + spawns 15 stars + pushes 12 ripples', () => {
    effectRadiance(deps);
    expect(state.glowPulseIntensity).toBe(1.0);
    expect(deps.particles.length).toBe(15);
    expect(deps.ripples).toHaveLength(12);
  });
});

describe('effectGoldenBurst', () => {
  it('sets full glow + spawns 30 gold particles + 10-star shower', () => {
    effectGoldenBurst(deps);
    expect(state.glowPulseIntensity).toBe(1.0);
    expect(state.shimmerStartMs).toBe(1000);
    // 30 gold + 10 stars = 40
    expect(deps.particles.length).toBe(40);
    // First 30 should be from goldColors, only star or circle types.
    for (let i = 0; i < 30; i++) {
      expect(['star', 'circle']).toContain(deps.particles[i].type);
      expect(deps.particles[i].color).toMatch(/^#/);
    }
  });

  it('respects maxParticles cap on the gold burst', () => {
    deps.maxParticles = 5;
    effectGoldenBurst(deps);
    expect(deps.particles.length).toBeLessThanOrEqual(5);
  });
});

describe('triggerEffect dispatcher', () => {
  it('returns true for known effect names', () => {
    expect(triggerEffect('glowPulse', deps)).toBe(true);
    expect(state.glowPulseIntensity).toBe(0.4);
  });

  it('returns false for unknown names (no-op)', () => {
    expect(triggerEffect('nonexistent', deps)).toBe(false);
    expect(state.glowPulseIntensity).toBe(0);
  });

  it('starShower via dispatcher uses the default count (12)', () => {
    triggerEffect('starShower', deps);
    expect(deps.particles.length).toBe(12);
  });

  it('routes all 8 known names', () => {
    const names = [
      'glowPulse',
      'glowParticles',
      'colorWave',
      'starShower',
      'flowerBurst',
      'shimmer',
      'radiance',
      'goldenBurst',
    ];
    for (const n of names) {
      // Reset to isolate.
      state.glowPulseIntensity = 0;
      deps.particles.length = 0;
      deps.ripples.length = 0;
      expect(triggerEffect(n, deps), `name ${n}`).toBe(true);
    }
  });
});

describe('purity / determinism', () => {
  it('does not modify dependency lists when no spawn happens (cap = 0)', () => {
    deps.maxParticles = 0;
    effectStarShower(deps, 50);
    effectFlowerBurst(deps);
    effectGoldenBurst(deps);
    expect(deps.particles).toHaveLength(0);
  });

  it('asserting Particle/Ripple types instantiated correctly', () => {
    effectColorWave(deps);
    effectFlowerBurst(deps);
    expect(deps.ripples[0]).toBeInstanceOf(Ripple);
    expect(deps.particles[0]).toBeInstanceOf(Particle);
  });
});
