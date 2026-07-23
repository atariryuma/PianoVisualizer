// Tests for packages/web/src/particle-effects.ts — Ripple prototype
// パッチの dtNorm 貫通（R2-5 dt 正規化）を固定する。
//
// パッチ後のシグネチャは update(dtNorm?) で、core の
// update(opts, dtNorm) 第2引数へそのまま渡ること・flow が opts へ
// 注入されることを、スパイ化した pianoCore スタブで検証する。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParticleEffects, type ParticleEffectsDeps } from '../src/particle-effects';

function makeFixture() {
  // this の捕捉は vitest のバージョン差（mock.contexts / instances）に
  // 依存しないよう自前で行う。
  const captured: { updateThis: unknown } = { updateThis: null };
  const coreRippleUpdate = vi.fn(function (this: unknown) {
    captured.updateThis = this;
  });
  const coreRippleDraw = vi.fn();
  const coreParticleDraw = vi.fn();

  // プロトタイプパッチ対象の pianoCore スタブ。ファクトリが触る面だけ実装。
  const pianoCore = {
    Particle: { prototype: { draw: coreParticleDraw } },
    Ripple: { prototype: { update: coreRippleUpdate, draw: coreRippleDraw } },
    detectPerfTier: () => 'mid' as const,
    PERF_PROFILES: {
      mid: { maxParticles3D: 600, shadowBlur: true, ambientChance: 0.02 },
    },
    getNoteColor: vi.fn(),
    spawnBurst: vi.fn(),
    spawnStream: vi.fn(),
    effectGlowPulse: vi.fn(),
    effectGlowParticles: vi.fn(),
    effectColorWave: vi.fn(),
    effectStarShower: vi.fn(),
    effectFlowerBurst: vi.fn(),
    effectShimmer: vi.fn(),
    effectRadiance: vi.fn(),
    effectGoldenBurst: vi.fn(),
    triggerEffect: vi.fn(),
  };

  const deps: ParticleEffectsDeps = {
    pianoCore: pianoCore as never,
    getScreen: () => ({ W: 800, H: 600 }),
    config: {
      THEMES: [{ colors: ['#fff'] }],
      NOTE_COLORS: {},
      SHADOW_BLUR_ENABLED: true,
      MAX_PARTICLES: 600,
      AMBIENT_PARTICLE_CHANCE: 0.02,
    },
    state: {
      currentTheme: 0,
      flow: 42,
      glowPulseIntensity: 0,
      shimmerPhase: -1,
      shimmerStartMs: 0,
      inputFlash: 0,
    },
    practice: { enabled: false },
    particles: [],
    ripples: [],
    perfTier: 'mid',
    applyPerfTier: false,
    log: vi.fn(),
  };

  const fx = createParticleEffects(deps);
  return { fx, pianoCore, deps, coreRippleUpdate, coreRippleDraw, coreParticleDraw, captured };
}

describe('Ripple.prototype.update パッチ — dtNorm 貫通', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('パッチ後の update(dtNorm) が core の第2引数へ dtNorm を貫通させる', () => {
    const { pianoCore, coreRippleUpdate, captured } = makeFixture();
    const self = { radius: 0 };
    pianoCore.Ripple.prototype.update.call(self, 2);
    expect(coreRippleUpdate).toHaveBeenCalledTimes(1);
    const [opts, dtNorm] = coreRippleUpdate.mock.calls[0];
    expect(dtNorm).toBe(2);
    // this も維持される（プロトタイプ経由の呼び出し）
    expect(captured.updateThis).toBe(self);
    expect((opts as { flow: number }).flow).toBe(42);
  });

  it('引数なし呼び出しでは dtNorm=undefined → core 側デフォルト 1 に委ねる', () => {
    const { pianoCore, coreRippleUpdate } = makeFixture();
    pianoCore.Ripple.prototype.update.call({});
    const [, dtNorm] = coreRippleUpdate.mock.calls[0];
    expect(dtNorm).toBeUndefined();
  });

  it('state.flow の変化が呼び出しごとに opts へ反映される', () => {
    const { pianoCore, deps, coreRippleUpdate } = makeFixture();
    pianoCore.Ripple.prototype.update.call({}, 1);
    expect((coreRippleUpdate.mock.calls[0][0] as { flow: number }).flow).toBe(42);
    deps.state.flow = 90;
    pianoCore.Ripple.prototype.update.call({}, 1);
    expect((coreRippleUpdate.mock.calls[1][0] as { flow: number }).flow).toBe(90);
  });
});

describe('reduced-motion (a11y)', () => {
  it('caps particles + kills ambient + shadowBlur when reducedMotion is set', () => {
    const { deps } = makeFixture();
    deps.applyPerfTier = true;
    deps.reducedMotion = true;
    // Fresh config object so we observe the mutation.
    const config = {
      THEMES: [{ colors: ['#fff'] }],
      NOTE_COLORS: {},
      SHADOW_BLUR_ENABLED: true,
      MAX_PARTICLES: 600,
      AMBIENT_PARTICLE_CHANCE: 0.02,
    };
    createParticleEffects({ ...deps, config: config as never });
    // mid tier caps 600 → 120; combined cap = 120 + 200.
    expect(config.MAX_PARTICLES).toBe(320);
    expect(config.AMBIENT_PARTICLE_CHANCE).toBe(0);
    expect(config.SHADOW_BLUR_ENABLED).toBe(false);
  });

  it('leaves the full profile when reducedMotion is false', () => {
    const { deps } = makeFixture();
    deps.applyPerfTier = true;
    deps.reducedMotion = false;
    const config = {
      THEMES: [{ colors: ['#fff'] }],
      NOTE_COLORS: {},
      SHADOW_BLUR_ENABLED: true,
      MAX_PARTICLES: 600,
      AMBIENT_PARTICLE_CHANCE: 0.02,
    };
    createParticleEffects({ ...deps, config: config as never });
    expect(config.MAX_PARTICLES).toBe(800); // 600 + 200
    expect(config.SHADOW_BLUR_ENABLED).toBe(true);
  });
});

describe('Ripple.prototype.draw パッチ — 既存挙動の確認（回帰ガード）', () => {
  it('draw(ctx) が flow + useShadow を opts に詰めて core へ委譲する', () => {
    const { pianoCore, coreRippleDraw } = makeFixture();
    const ctx = {} as CanvasRenderingContext2D;
    pianoCore.Ripple.prototype.draw.call({}, ctx);
    expect(coreRippleDraw).toHaveBeenCalledTimes(1);
    const [passedCtx, opts] = coreRippleDraw.mock.calls[0];
    expect(passedCtx).toBe(ctx);
    expect((opts as { flow: number }).flow).toBe(42);
    expect(typeof (opts as { useShadow: boolean }).useShadow).toBe('boolean');
  });
});
