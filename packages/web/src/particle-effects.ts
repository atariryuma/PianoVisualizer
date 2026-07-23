// Particle + Ripple shell adapters — Phase 0d batch 71.
//
// All the closure-glue that lives between legacy callsites and the
// pure @piano/core particle / ripple / encouragement-effect APIs.
// Five clusters folded into one factory:
//
//   1. Prototype monkey-patches — both `PianoCore.Particle.prototype.draw`
//      and `PianoCore.Ripple.prototype.draw` (+ `.update`) get the
//      legacy positional `(ctx)` signature back so existing call sites
//      across the shell keep working without rewrite. The patches close
//      over the dimensions getter (W/H), the live particles/ripples
//      arrays, the practice-enabled gate, and the SHADOW_BLUR_ENABLED
//      perf-tier flag.
//
//   2. PERF_TIER override — applies the auto-detected device tier
//      (low/mid/high) to CONFIG.MAX_PARTICLES + .SHADOW_BLUR_ENABLED +
//      .AMBIENT_PARTICLE_CHANCE so existing reads pick up the right
//      cap. Returns the resolved 3D-particle cap so spawn adapters can
//      hard-cap at burst time.
//
//   3. spawnBurst / spawnStream wrappers — closure-bind W/H/themeColors/
//      flow/maxParticles into the @piano/core spawn API so legacy
//      positional callsites (`spawnBurst(x, y, n, e, color?)`) stay
//      unchanged. The 200-particle hard cap during practice (Issue 2
//      frame-drop fix, 2026-05-09) lives here.
//
//   4. 9 encouragement-effect adapters — every effectXxx() takes a
//      shared deps bag built each call, so a mid-session theme flip /
//      flow change is picked up immediately. `triggerEffect(name)` is
//      the i18n-key dispatcher.
//
//   5. getNoteColor wrapper — closure-binds CONFIG.NOTE_COLORS so
//      legacy `getNoteColor(noteName)` callsites keep their positional
//      signature.
//
// All side effects (prototype mutation, CONFIG mutation) flow through
// deps; the test suite stubs PianoCore + verifies the prototype patch
// installs the new draw signature once + the spawn opts close over the
// right dimensions.

/** Particle shape returned by @piano/core's spawn API. Opaque to this
 *  module — we only push them into the `particles` array. */
export interface ParticleLike {
  [k: string]: unknown;
}

/** Ripple shape — same opaqueness. */
export interface RippleLike {
  [k: string]: unknown;
}

/** Subset of @piano/core's prototype-bearing types we touch. */
export interface PianoCoreLike {
  Particle: { prototype: { draw: (this: any, ctx: any, opts?: any) => unknown } };
  Ripple: {
    prototype: {
      /** core 実体は update(opts, dtNorm?) — dtNorm は 16.67ms=1 の正規化係数。 */
      update: (this: any, opts?: any, dtNorm?: number) => unknown;
      draw: (this: any, ctx: any, opts?: any) => unknown;
    };
  };
  detectPerfTier: () => keyof PianoCoreLike['PERF_PROFILES'];
  PERF_PROFILES: Record<
    string,
    { maxParticles3D: number; shadowBlur: boolean; ambientChance: number }
  >;
  getNoteColor: (noteName: string, palette: Record<string, string>) => string;
  spawnBurst: (
    particles: ParticleLike[],
    x: number,
    y: number,
    count: number,
    energy: number,
    opts: SpawnOpts
  ) => unknown;
  spawnStream: (
    particles: ParticleLike[],
    x: number,
    y: number,
    energy: number,
    opts: SpawnOpts
  ) => unknown;
  effectGlowPulse: (deps: EffectDeps) => unknown;
  effectGlowParticles: (deps: EffectDeps) => unknown;
  effectColorWave: (deps: EffectDeps) => unknown;
  effectStarShower: (deps: EffectDeps, count?: number) => unknown;
  effectFlowerBurst: (deps: EffectDeps) => unknown;
  effectShimmer: (deps: EffectDeps) => unknown;
  effectRadiance: (deps: EffectDeps) => unknown;
  effectGoldenBurst: (deps: EffectDeps) => unknown;
  triggerEffect: (name: string, deps: EffectDeps) => unknown;
}

/** Theme entry — just the slice the spawn / effect adapters read. */
export interface ParticleEffectsTheme {
  colors: string[];
}

/** CONFIG slice — only the few fields the adapters mutate or read. */
export interface ParticleEffectsConfig {
  THEMES: ParticleEffectsTheme[];
  NOTE_COLORS: Record<string, string>;
  SHADOW_BLUR_ENABLED: boolean;
  MAX_PARTICLES: number;
  AMBIENT_PARTICLE_CHANCE: number;
}

/** Game-state slice — the adapters read currentTheme + flow at every
 *  spawn, plus the EffectGameState fields the effects mutate. */
export interface ParticleEffectsState {
  currentTheme: number;
  flow: number;
  glowPulseIntensity: number;
  shimmerPhase: number;
  shimmerStartMs: number;
  inputFlash: number;
}

/** Practice slice — the gate for the per-practice 200-cap + shadow-off. */
export interface ParticleEffectsPracticeRef {
  enabled: boolean;
}

export interface ParticleEffectsDeps {
  pianoCore: PianoCoreLike;
  /** Read each render so a mid-session resize is picked up. */
  getScreen: () => { W: number; H: number };
  /** Mutated by the perf-tier override + read by spawn/effect adapters. */
  config: ParticleEffectsConfig;
  state: ParticleEffectsState;
  practice: ParticleEffectsPracticeRef;
  /** Live particle pool — the spawn adapters push into this array. */
  particles: ParticleLike[];
  /** Live ripple pool — analogous to particles. */
  ripples: RippleLike[];
  /** Pre-resolved PERF_TIER name (low/mid/high). The shell detects this
   *  early at boot so canvas-resize can also read PERF_PROFILE.bgStarCount
   *  before this factory runs. Required so the factory doesn't run a
   *  duplicate detection pass. */
  perfTier: string;
  /** PERF_TIER override gate. Default true (apply override at boot).
   *  Tests may pass false to skip the CONFIG mutation. */
  applyPerfTier?: boolean;
  /** a11y: when the OS requests reduced motion, thin the particle pool +
   *  kill ambient spawns + shadowBlur (the canvas is JS-driven and doesn't
   *  see the CSS media query). Default false. */
  reducedMotion?: boolean;
  /** Optional logger override. Default console.log. */
  log?: (msg: string) => void;
}

/** Opts the legacy spawn callsites hand to @piano/core. */
export interface SpawnOpts {
  screenW: number;
  screenH: number;
  themeColors: string[];
  flow: number;
  maxParticles: number;
  overrideColor?: string;
}

/** Effect-deps bag built fresh every call. */
export interface EffectDeps {
  particles: ParticleLike[];
  ripples: RippleLike[];
  themeColors: string[];
  screenW: number;
  screenH: number;
  maxParticles: number;
  state: ParticleEffectsState;
}

export interface ParticleEffects {
  /** Auto-detected perf tier (low/mid/high). Read by the shell to log
   *  + by anything that wants to scale a sub-system. */
  PERF_TIER: string;
  /** Resolved 3D particle cap from the perf tier. */
  MAX_PARTICLES_3D: number;
  /** Full PERF_PROFILE for the resolved tier — exposed so the shell's
   *  canvas-resize wire-up can read `.bgStarCount` without re-running
   *  detectPerfTier. */
  PERF_PROFILE: PianoCoreLike['PERF_PROFILES'][string];

  Particle: PianoCoreLike['Particle'];
  Ripple: PianoCoreLike['Ripple'];

  /** Closure-bound CONFIG.NOTE_COLORS-aware wrapper. */
  getNoteColor(noteName: string): string;
  /** Closure-bound spawnBurst — call positionally, no opts. */
  spawnBurst(
    screenX: number,
    screenY: number,
    count: number,
    energy: number,
    overrideColor?: string
  ): unknown;
  spawnStream(screenX: number, screenY: number, energy: number, overrideColor?: string): unknown;

  // Encouragement effects
  effectGlowPulse(): unknown;
  effectGlowParticles(): unknown;
  effectColorWave(): unknown;
  effectStarShower(count?: number): unknown;
  effectFlowerBurst(): unknown;
  effectShimmer(): unknown;
  effectRadiance(): unknown;
  effectGoldenBurst(): unknown;
  triggerEffect(name: string): unknown;
}

export function createParticleEffects(deps: ParticleEffectsDeps): ParticleEffects {
  const { pianoCore, config, state, practice, particles, ripples } = deps;
  const log = deps.log ?? ((m: string) => console.log(m));

  // ─── PERF_TIER override ───────────────────────────────────────────
  // The shell hands in `perfTier` so the canvas-resize factory (which
  // also needs PERF_PROFILE.bgStarCount and runs earlier in boot) can
  // share the lookup. The detection itself is idempotent but
  // duplicating it complicates the test surface.
  const PERF_TIER = deps.perfTier;
  const baseProfile = pianoCore.PERF_PROFILES[PERF_TIER];
  // a11y: reduced-motion thins the pool + drops ambient/shadowBlur so a
  // vestibular/photosensitive kid gets the game without the sustained storm.
  const PERF_PROFILE = deps.reducedMotion
    ? {
        ...baseProfile,
        maxParticles3D: Math.min(baseProfile.maxParticles3D, 120),
        shadowBlur: false,
        ambientChance: 0,
      }
    : baseProfile;
  log(
    '[PERF] tier=' +
      PERF_TIER +
      (deps.reducedMotion ? ' (reduced-motion)' : '') +
      ' particles=' +
      PERF_PROFILE.maxParticles3D +
      ' shadowBlur=' +
      PERF_PROFILE.shadowBlur
  );

  if (deps.applyPerfTier !== false) {
    config.SHADOW_BLUR_ENABLED = PERF_PROFILE.shadowBlur;
    config.MAX_PARTICLES = PERF_PROFILE.maxParticles3D + 200; // 2D + 3D combined cap
    config.AMBIENT_PARTICLE_CHANCE = PERF_PROFILE.ambientChance;
  }
  const MAX_PARTICLES_3D = PERF_PROFILE.maxParticles3D;

  // ─── Particle prototype monkey-patch ──────────────────────────────
  // [Bug fix 2026-05-09 — Issue 2 frame drops]
  //
  // useShadow gate has three conditions:
  //   1. SHADOW_BLUR_ENABLED (perf-tier flag, true for high/mid).
  //   2. particles.length < 300 (auto-disable above the cap).
  //   3. !practice.enabled — disable shadowBlur during active practice.
  //      Server.log [DIAG-FRAME] analysis revealed dt=33-50ms spikes
  //      during listen-mode playback with particles=159-380; shadowBlur
  //      on per-particle ctx is the dominant Canvas2D cost. Practice
  //      drives the kid's audio focus — they need stutter-free playback,
  //      not shadow halos. Free-play / title screen keep the halos
  //      because the particle effects are the visual draw there.
  // GC 圧対策: draw はパーティクル毎×毎フレーム呼ばれる最深ホットパス。
  // 以前は draw ごとに getScreen()（新オブジェクト）+ opts リテラルを生成し
  // 最大 1200個 × 3オブジェクト × 60fps ≈ 21万個/秒の短命アロケーションに
  // なっていた。opts はモジュール寿命の scratch を使い回し、W/H/useShadow は
  // フレーム内では実質不変なので draw ごとの再計算は同値上書きのみ（安価）。
  const _particleDrawOpts = { screenW: 0, screenH: 0, useShadow: false };
  const _coreParticleDraw = pianoCore.Particle.prototype.draw;
  pianoCore.Particle.prototype.draw = function (this: any, c: any) {
    const s = deps.getScreen();
    _particleDrawOpts.screenW = s.W;
    _particleDrawOpts.screenH = s.H;
    _particleDrawOpts.useShadow =
      config.SHADOW_BLUR_ENABLED && particles.length < 300 && !practice.enabled;
    return _coreParticleDraw.call(this, c, _particleDrawOpts);
  };

  // ─── Ripple prototype monkey-patches (update + draw) ─────────────
  // パッチ後のシグネチャは update(dtNorm?) — render-late が渡す dt 正規化
  // 係数（16.67ms=1）を core の update(opts, dtNorm) 第2引数へ貫通させる。
  // undefined ならデフォルト 1（従来の per-frame と同値）。
  const _rippleUpdateOpts = { flow: 0 };
  const _coreRippleUpdate = pianoCore.Ripple.prototype.update;
  pianoCore.Ripple.prototype.update = function (this: any, dtNorm?: number) {
    _rippleUpdateOpts.flow = state.flow;
    return _coreRippleUpdate.call(this, _rippleUpdateOpts, dtNorm);
  };
  const _rippleDrawOpts = { flow: 0, useShadow: false };
  const _coreRippleDraw = pianoCore.Ripple.prototype.draw;
  pianoCore.Ripple.prototype.draw = function (this: any, c: any) {
    // Same shadowBlur gate as Particle.draw above. Ripples spawn 1-3
    // per note hit; with shadowBlur on each ripple costs 2-4ms;
    // multi-ripple frames push past the 16.7ms budget.
    _rippleDrawOpts.flow = state.flow;
    _rippleDrawOpts.useShadow =
      config.SHADOW_BLUR_ENABLED && ripples.length < 15 && !practice.enabled;
    return _coreRippleDraw.call(this, c, _rippleDrawOpts);
  };

  // ─── getNoteColor wrapper ─────────────────────────────────────────
  function getNoteColor(noteName: string): string {
    return pianoCore.getNoteColor(noteName, config.NOTE_COLORS);
  }

  // ─── spawnBurst / spawnStream wrappers ───────────────────────────
  function _spawnOpts(overrideColor?: string): SpawnOpts {
    const { W, H } = deps.getScreen();
    return {
      screenW: W,
      screenH: H,
      themeColors: config.THEMES[state.currentTheme].colors,
      flow: state.flow,
      // [Issue 2 frame drops fix] Hard-cap the burst pool at 200
      // during practice. Each note-hit spawns 5-30 particles; without
      // the cap, a 4-hits/sec listen run chains to 600+ resident
      // particles within 5 seconds and every render frame pushes
      // 30-50ms.
      maxParticles: practice.enabled ? 200 : MAX_PARTICLES_3D,
      overrideColor,
    };
  }
  function spawnBurst(
    screenX: number,
    screenY: number,
    count: number,
    energy: number,
    overrideColor?: string
  ): unknown {
    return pianoCore.spawnBurst(
      particles,
      screenX,
      screenY,
      count,
      energy,
      _spawnOpts(overrideColor)
    );
  }
  function spawnStream(
    screenX: number,
    screenY: number,
    energy: number,
    overrideColor?: string
  ): unknown {
    return pianoCore.spawnStream(particles, screenX, screenY, energy, _spawnOpts(overrideColor));
  }

  // ─── 9 encouragement-effect adapters ──────────────────────────────
  function _effectDeps(): EffectDeps {
    const { W, H } = deps.getScreen();
    return {
      particles,
      ripples,
      themeColors: config.THEMES[state.currentTheme].colors,
      screenW: W,
      screenH: H,
      // [Issue 2 frame drops fix] Same 200-cap during practice. Effects
      // (golden-burst, shimmer, etc.) fire on combos and would otherwise
      // burst 30-100 particles into an already-saturated pool.
      maxParticles: practice.enabled ? 200 : MAX_PARTICLES_3D,
      state,
    };
  }
  return {
    PERF_TIER,
    MAX_PARTICLES_3D,
    PERF_PROFILE,
    Particle: pianoCore.Particle,
    Ripple: pianoCore.Ripple,
    getNoteColor,
    spawnBurst,
    spawnStream,
    effectGlowPulse: () => pianoCore.effectGlowPulse(_effectDeps()),
    effectGlowParticles: () => pianoCore.effectGlowParticles(_effectDeps()),
    effectColorWave: () => pianoCore.effectColorWave(_effectDeps()),
    effectStarShower: (count?: number) => pianoCore.effectStarShower(_effectDeps(), count),
    effectFlowerBurst: () => pianoCore.effectFlowerBurst(_effectDeps()),
    effectShimmer: () => pianoCore.effectShimmer(_effectDeps()),
    effectRadiance: () => pianoCore.effectRadiance(_effectDeps()),
    effectGoldenBurst: () => pianoCore.effectGoldenBurst(_effectDeps()),
    triggerEffect: (name: string) => pianoCore.triggerEffect(name, _effectDeps()),
  };
}
