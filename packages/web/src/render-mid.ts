// Render-loop phase B — mid-frame effects.
// Phase 0d batch 9b extraction from legacy-app.js.
//
// Three small but cohesive concerns that run after the input/game-state
// work and before the per-element ripple/particle update+draw loops:
//
//   1. Note-display fade — hides the centered note label after
//      `CONFIG.NOTE_DISPLAY_DURATION_MS` since the last spawn.
//
//   2. Ambient particle spawn — at low energy + low flow, randomly
//      seeds 3D-projected background particles to keep the canvas
//      from feeling dead during quiet moments. Honors
//      MAX_PARTICLES (so a long-running session doesn't accumulate
//      visual debt). 3D coords (px/py/pz) put particles deep behind
//      the focal plane; the perspective projection in
//      Particle.draw() handles the parallax.
//
//   3. Spectrum bars — frequency-axis bar render via
//      PianoCore.drawSpectrumBars. The shell still owns the silence
//      gate (smoothEnergy > 0.03 skips the work entirely on quiet
//      frames) + the analyser/dataArray references.
//
// All three are pure side-effects — no return value. The shell
// continues with ripple/particle update+draw + HUD work in phase C.

/** Game-state slice the phase reads. */
export interface RenderMidStateRef {
  noteShowTimeMs: number;
  smoothEnergy: number;
  flow: number;
}

/** Theme color palette used by the ambient spawn. */
export interface RenderMidTheme {
  colors: readonly string[];
}

/** Shape of the per-particle 3D ctor used by the ambient spawn.
 *  Mirrors @piano/core/render/particles `Particle` ctor signature
 *  (positional args: x, y, z, color, size, vx, vy, vz, life, kind). */
export type ParticleCtor = new (
  x: number,
  y: number,
  z: number,
  color: string,
  size: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  kind: string
) => unknown;

/** Particles array — push-only from this phase. The element type is
 *  opaque (the legacy code uses both core's Particle + a monkey-
 *  patched draw method); we just need the .length + .push surface. */
export interface ParticlesArray {
  length: number;
  push(p: unknown): void;
}

/** PianoCore.drawSpectrumBars opts — passed through. */
export interface SpectrumOpts {
  screenW: number;
  screenH: number;
  startBin: number;
  endBin: number;
  barCount: number;
  themeColors: readonly string[];
  flow: number;
}

/** Note display fade — call once per frame; hides the note label
 *  after the configured duration since the last note spawn. */
export interface RenderMidNoteDisplayDeps {
  noteDisplayEl: HTMLElement;
  state: RenderMidStateRef;
  noteDisplayDurationMs: number;
}

export function tickNoteDisplayFade(timeMs: number, deps: RenderMidNoteDisplayDeps): void {
  if (timeMs - deps.state.noteShowTimeMs > deps.noteDisplayDurationMs) {
    deps.noteDisplayEl.classList.remove('visible');
  }
}

/** Ambient particle spawn — push a single 3D-deep particle at low
 *  energy / flow, capped at MAX_PARTICLES. Pure side-effect (push
 *  + Math.random); no return value. */
export interface RenderMidAmbientDeps {
  state: RenderMidStateRef;
  theme: RenderMidTheme;
  screen: { W: number; H: number };
  particles: ParticlesArray;
  maxParticles: number;
  ambientChance: number;
  Particle: ParticleCtor;
}

export function spawnAmbientParticle(deps: RenderMidAmbientDeps, dtNorm: number = 1): void {
  if (deps.state.smoothEnergy >= 0.04) return;
  const roll = Math.random();
  // chance = base + flow-driven bonus (more flow → more ambient density)
  // 1フレームあたりの湧き確率 p を dtNorm 倍して単位時間あたりの湧き数を
  // リフレッシュレート非依存にする（1-(1-p)^dtNorm の一次近似 p*dtNorm。
  // p*dtNorm ≥ 1 のとき threshold が負になり常時スポーン = 自然にクランプ）。
  // dtNorm=1 のとき従来の threshold 式と完全同値。
  const threshold = 1 - (deps.ambientChance + deps.state.flow * 0.003) * dtNorm;
  if (roll <= threshold) return;
  if (deps.particles.length >= deps.maxParticles) return;

  const cols = deps.theme.colors;
  const { W, H } = deps.screen;
  const px = (Math.random() - 0.2) * W * 1.4 - W * 0.2;
  const py = H + 20;
  const pz = (Math.random() - 0.5) * 600; // deep field
  // size grows slightly with flow so denser sessions get bigger pulses
  const size = 1 + Math.random() * (1 + deps.state.flow * 0.03);
  const vx = (Math.random() - 0.5) * 0.3;
  const vy = -0.3 - Math.random() * 0.5 - deps.state.flow * 0.005;
  const vz = (Math.random() - 0.5) * 0.5;
  const life = 200 + Math.random() * 100;

  deps.particles.push(
    new deps.Particle(
      px,
      py,
      pz,
      cols[Math.floor(Math.random() * cols.length)],
      size,
      vx,
      vy,
      vz,
      life,
      'circle'
    )
  );
}

/** Spectrum-bars wrapper — the silence gate stays in the caller (the
 *  call-site already had `if (analyser && smoothEnergy > 0.03)` to
 *  skip the work entirely on quiet frames). This module just
 *  computes the bin range from the audio sampleRate + analyser
 *  fftSize and forwards everything to PianoCore.drawSpectrumBars. */
export interface RenderMidSpectrumDeps {
  ctx: CanvasRenderingContext2D;
  dataArray: Uint8Array<ArrayBuffer>;
  sampleRate: number;
  fftSize: number;
  pianoFreqMin: number;
  pianoFreqMax: number;
  barCount: number;
  themeColors: readonly string[];
  flow: number;
  screen: { W: number; H: number };
  drawSpectrumBars: (ctx: CanvasRenderingContext2D, data: Uint8Array, opts: SpectrumOpts) => void;
}

export function runSpectrumBars(deps: RenderMidSpectrumDeps): void {
  const binHz = deps.sampleRate / deps.fftSize;
  deps.drawSpectrumBars(deps.ctx, deps.dataArray, {
    screenW: deps.screen.W,
    screenH: deps.screen.H,
    startBin: Math.floor(deps.pianoFreqMin / binHz),
    endBin: Math.floor(deps.pianoFreqMax / binHz),
    barCount: deps.barCount,
    themeColors: deps.themeColors,
    flow: deps.flow,
  });
}
