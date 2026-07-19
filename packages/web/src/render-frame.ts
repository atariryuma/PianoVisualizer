// Render-loop phase A — frame prelude (setup + atmospheric layers).
// Phase 0d batch 9a extraction from legacy-app.js.
//
// First ~55 lines of the per-frame `loop()`: everything from
// frame-time calc through center-glow + shimmer overlay. Cohesive
// because it's all "paint the canvas before the input/game-state
// work runs" — pure rendering side-effects, no audio or MIDI
// reads, no practice-tick coupling.
//
// Order matters (depth-sorted back-to-front):
//   1. dt calc (clamped at 50ms to absorb tab-switch frame jumps)
//   2. theme + energy smoothing (15% lerp, frame-rate independent)
//   3. Background fade — theme bg color × fadeRate (higher when flow
//      is low so trails dissolve faster on quiet sections)
//   4. drawBgStars + drawAurora + drawGroundFlowers — three full-
//      screen atmospheric layers (closures own their own state)
//   5. Wake-up flash overlay (white wash on first onset post-silence)
//      + frame-rate-independent decay via PianoCore.decayWakeUpFlash
//   6. Glow pulse decay (encouragement-driven center halo boost)
//   7. Center radial halo via PianoCore.drawCenterGlow
//   8. Shimmer overlay (sine-modulated white wash for 1.5s after a
//      shimmerPhase trigger)
//
// Returns `{ dt, theme, glowExtra }` for the rest of the frame to
// consume (downstream phases need the dt and theme to do their own
// work without recomputing).

/** Game-state slice the prelude reads + writes. */
export interface RenderFrameStateRef {
  lastFrameTimeMs: number;
  currentTheme: number;
  smoothEnergy: number;
  flow: number;
  inputFlash: number;
  glowPulseIntensity: number;
  shimmerPhase: number;
  shimmerStartMs: number;
}

/** Theme shape used by background fade + center-glow color prefix.
 *  Carries the full theme object — downstream loop phases also read
 *  `colors[]` (note → ripple/particle palette) so the prelude returns
 *  the same theme reference for them to consume without a re-lookup. */
export interface RenderFrameTheme {
  bg: readonly [number, number, number];
  glow: string;
  colors: readonly string[];
}

/** PianoCore wake-up-flash options shape — passed through opaquely. */
export type WakeUpFlashOpts = unknown;

export interface RenderFrameDeps {
  ctx: CanvasRenderingContext2D;
  state: RenderFrameStateRef;
  /** Live screen dimensions — re-read each frame in case of resize. */
  getScreen(): { W: number; H: number };
  /** Theme palette (CONFIG.THEMES). */
  themes: ReadonlyArray<RenderFrameTheme>;
  /** Atmospheric layers — own their own state via closures.
   *  第2引数 dtNorm（16.67ms=1 の正規化係数）は星の twinkle 前進を
   *  リフレッシュレート非依存にするための seam — 既存ラッパーは
   *  1引数のままでも代入互換（余剰引数は無視される）。 */
  drawBgStars(timeMs: number, dtNorm?: number): void;
  drawAurora(timeMs: number): void;
  drawGroundFlowers(timeMs: number): void;
  /** PianoCore helpers. */
  decayWakeUpFlash(state: RenderFrameStateRef, dtSec: number, opts: WakeUpFlashOpts): void;
  drawCenterGlow(
    ctx: CanvasRenderingContext2D,
    opts: {
      screenW: number;
      screenH: number;
      smoothEnergy: number;
      flow: number;
      glowExtra: number;
      glowPrefix: string;
    }
  ): void;
  /** Wake-up flash decay options (PianoCore.WUF_OPTS / equivalent). */
  wufOpts: WakeUpFlashOpts;
  /** Mic / energy probe — typically `getEnergy()` from the audio
   *  module. Returns the current frame's onset-relative energy in [0..1]. */
  getEnergy(): number;
  /** [R2-5] タイトル画面が前面のとき true — canvas への描画だけを
   *  スキップする（dt 計算・エネルギー平滑・各種減衰などの状態更新は
   *  継続）。復帰した瞬間に正しい状態から描画再開できる。省略時 false。 */
  skipDraw?: boolean;
}

/** Per-frame return value — downstream loop phases consume these. */
export interface RenderFrameResult {
  dt: number;
  theme: RenderFrameTheme;
  glowExtra: number;
}

/** Run the prelude. Mutates `state.lastFrameTimeMs`,
 *  `state.smoothEnergy`, `state.glowPulseIntensity`,
 *  `state.shimmerPhase`. Returns `{ dt, theme, glowExtra }` for the
 *  rest of the loop. */
export function runRenderFramePrelude(timeMs: number, deps: RenderFrameDeps): RenderFrameResult {
  // [R2-5] タイトル表示中は描画のみスキップ（状態更新は全て継続）。
  const skipDraw = deps.skipDraw === true;

  // 1. dt — clamp at 50ms so a returning-from-tab-switch huge
  //    frame doesn't blow particle integrators apart.
  const dt =
    deps.state.lastFrameTimeMs > 0 ? Math.min(timeMs - deps.state.lastFrameTimeMs, 50) : 16;
  deps.state.lastFrameTimeMs = timeMs;

  // dt 正規化係数（16.67ms = 60fps の1フレームを 1 とする）。120Hz 端末で
  // 平滑・減衰が2倍速になるのを防ぐ。60fps では従来と同値。
  const dtNorm = dt / 16.67;

  // 2. Theme + energy smoothing — 15%/frame(60fps) 相当の lerp。
  //    係数は 1-(1-0.15)^dtNorm でリフレッシュレート非依存化
  //    （dtNorm=1 でちょうど 0.15）。
  const theme = deps.themes[deps.state.currentTheme];
  const energy = deps.getEnergy();
  deps.state.smoothEnergy += (energy - deps.state.smoothEnergy) * (1 - Math.pow(0.85, dtNorm));

  // 3. Background fade. fadeRate is higher when flow is low so old
  //    trails dissolve faster on quiet sections (more "blank canvas"
  //    feel when the kid hasn't been playing).
  const { W, H } = deps.getScreen();
  if (!skipDraw) {
    const [br, bg2, bb] = theme.bg;
    const fadeRate = 0.08 + 0.06 * (1 - deps.state.flow / 100);
    deps.ctx.fillStyle = 'rgba(' + br + ',' + bg2 + ',' + bb + ',' + fadeRate + ')';
    deps.ctx.fillRect(0, 0, W, H);

    // 4. Atmospheric layers (closures own their own state).
    deps.drawBgStars(timeMs, dtNorm);
    deps.drawAurora(timeMs);
    deps.drawGroundFlowers(timeMs);
  }

  // 5. Wake-up flash overlay + decay.
  if (!skipDraw && deps.state.inputFlash > 0.01) {
    deps.ctx.fillStyle = `rgba(255, 255, 255, ${deps.state.inputFlash})`;
    deps.ctx.fillRect(0, 0, W, H);
  }
  deps.decayWakeUpFlash(deps.state, dt / 1000, deps.wufOpts);

  // 6. Glow pulse decay (encouragement-driven center halo boost).
  //    0.96/frame(60fps) 相当 — 0.96^dtNorm で正規化（dtNorm=1 で 0.96）。
  const glowExtra = deps.state.glowPulseIntensity;
  if (glowExtra > 0.01) {
    deps.state.glowPulseIntensity *= Math.pow(0.96, dtNorm);
  }

  // 7. Center radial halo.
  if (!skipDraw) {
    deps.drawCenterGlow(deps.ctx, {
      screenW: W,
      screenH: H,
      smoothEnergy: deps.state.smoothEnergy,
      flow: deps.state.flow,
      glowExtra,
      glowPrefix: theme.glow,
    });
  }

  // 8. Shimmer overlay (sine-modulated white wash, 1.5s lifetime).
  //    寿命の進行（timeMs 基準）と失効フラグはスキップ中も更新する。
  if (deps.state.shimmerPhase >= 0) {
    const shimmerAge = timeMs - deps.state.shimmerStartMs;
    if (shimmerAge < 1500) {
      const shimmerAlpha = 0.08 * Math.sin(shimmerAge * 0.02) * (1 - shimmerAge / 1500);
      if (!skipDraw && shimmerAlpha > 0) {
        deps.ctx.fillStyle = 'rgba(255,255,255,' + shimmerAlpha + ')';
        deps.ctx.fillRect(0, 0, W, H);
      }
    } else {
      deps.state.shimmerPhase = -1;
    }
  }

  return { dt, theme, glowExtra };
}
