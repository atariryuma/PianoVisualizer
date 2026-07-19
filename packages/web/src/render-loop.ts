// Render loop orchestrator — Phase 0d batch 30.
//
// Glue layer that ties the render-pipeline phases together:
//
//   1. RenderFrame.runRenderFramePrelude — frame setup + atmospheric
//      layers (bg stars, aurora, ground flowers) + wake-up flash
//      decay + center glow + shimmer overlay. Returns the per-frame
//      dt + active theme.
//
//   2. MicPipeline.tickMicPipeline — YIN throttle + AGC + mic-meter
//      paint + game-state reducer + practice tick + mic-driven note
//      spawn. Returns `{ isGoodNote }` (currently unused — reserved
//      for future hooks).
//
//   3. RenderMid.{tickNoteDisplayFade, spawnAmbientParticle, runSpectrumBars}
//      — note-display fade + ambient particle spawn + spectrum bars
//      (gated by `state.smoothEnergy > 0.03` so silent frames skip
//      the spectrum work entirely).
//
//   4. RenderLate.runRenderLate — late-frame draw + tail (MIDI beams,
//      ripples + particles update/draw/cull, chord display, virtual
//      keyboard, practice lane, quest + playtime + debug HUD).
//
// The loop self-rAFs while `state.running` is true; the shell starts
// it once via `requestAnimationFrame(_renderLoop.tick)` after the
// title screen → game transition.

import type { RenderFrameDeps, RenderFrameStateRef, RenderFrameTheme } from './render-frame';
import type {
  MicPipelineDeps,
  MicPipelineMidiRef,
  MicPipelinePracticeRef,
  MicPipelineState,
} from './mic-pipeline';
import type {
  RenderMidAmbientDeps,
  RenderMidNoteDisplayDeps,
  RenderMidSpectrumDeps,
  RenderMidStateRef,
} from './render-mid';
import type { RenderLateDeps, RenderLateMidiRef, RenderLatePracticeRef } from './render-late';

/** A single state ref that satisfies every sub-module's slice. The
 *  shell hands its `state` object in once and we cast at the
 *  boundaries; this type union pins the actual fields each phase
 *  reads/writes. */
export type RenderLoopState = MicPipelineState &
  RenderFrameStateRef &
  RenderMidStateRef & { running: boolean };

/** Equivalent for `practice`. */
export type RenderLoopPracticeRef = MicPipelinePracticeRef & RenderLatePracticeRef;

/** Equivalent for `midiInput`. */
export type RenderLoopMidiRef = MicPipelineMidiRef & RenderLateMidiRef;

/** Sub-module surface bundles. Pulling them in by namespace keeps
 *  the deps bag readable + matches the legacy shell's PianoVizGlobal
 *  pinning. */
export interface RenderLoopModules {
  RenderFrame: {
    runRenderFramePrelude(
      timeMs: number,
      deps: RenderFrameDeps
    ): {
      dt: number;
      theme: RenderFrameTheme;
    };
  };
  MicPipeline: {
    tickMicPipeline(
      timeMs: number,
      dt: number,
      deps: MicPipelineDeps
    ): {
      isGoodNote: boolean;
    };
  };
  RenderMid: {
    tickNoteDisplayFade(timeMs: number, deps: RenderMidNoteDisplayDeps): void;
    spawnAmbientParticle(deps: RenderMidAmbientDeps, dtNorm?: number): void;
    runSpectrumBars(deps: RenderMidSpectrumDeps): void;
  };
  RenderLate: {
    runRenderLate(timeMs: number, deps: RenderLateDeps, dtNorm?: number): void;
  };
}

/** Builds a per-frame deps bag for each sub-module. The shell hands
 *  in factory functions instead of static deps so values that change
 *  between frames (analyser, audioCtx, theme color list) come in
 *  fresh — same pattern as `getScreen` / `getEnergy` in
 *  RenderFrame's existing deps. */
export interface RenderLoopDepsBuilders {
  buildFrameDeps: (timeMs: number) => RenderFrameDeps;
  buildMicPipelineDeps: (timeMs: number, dt: number, theme: RenderFrameTheme) => MicPipelineDeps;
  buildNoteFadeDeps: (timeMs: number) => RenderMidNoteDisplayDeps;
  buildAmbientDeps: (theme: RenderFrameTheme) => RenderMidAmbientDeps;
  /** Returns null when the spectrum should be skipped (silence
   *  gate). The shell's existing `analyser && state.smoothEnergy
   *  > 0.03` guard moves into this builder. */
  buildSpectrumDeps: (theme: RenderFrameTheme) => RenderMidSpectrumDeps | null;
  buildLateDeps: () => RenderLateDeps;
}

/** Frame-drop watchdog config. When provided, the loop tracks a
 *  ring of recent frame `dt` samples and fires `onDrop` whenever a
 *  single frame exceeds `thresholdMs`. The callback receives
 *  computed statistics + a free-form context object the shell
 *  composes (particles count, audio state, etc.) so a server-side
 *  log captures everything needed to root-cause stutter without a
 *  re-deploy. Production: leave undefined (zero overhead). */
export interface FrameDropWatchDeps {
  /** Single-frame dt above which the watchdog fires. 33 ms ≈ 30 fps. */
  thresholdMs: number;
  /** Cool-down between fires (ms wall-clock) — without this a long
   *  garbage-collection pause floods the log with one entry per
   *  frame for the rest of the spike. */
  cooldownMs: number;
  /** Ring length for the rolling stats. 60 frames ≈ 1 second @60fps. */
  ringLen: number;
  /** Caller-composed context dump (particles count, audio state,
   *  practice mode, etc.). Called only when the watchdog fires so
   *  the cost only lands on the bad frame. */
  getContext: () => Record<string, unknown>;
  /** Fired once per spike. Receives the watchdog's own stats first
   *  (dt, max60, p95_60), the caller's context second. Production
   *  binds this to `console.log('[DIAG-FRAME] ...')`. */
  onDrop: (stats: FrameDropStats, context: Record<string, unknown>) => void;
}

export interface FrameDropStats {
  dt: number;
  /** Wall-clock ms when the spike happened (rAF timestamp). */
  timeMs: number;
  /** Max dt across the recent ring. */
  maxRecent: number;
  /** Mean dt across the recent ring. */
  meanRecent: number;
  /** 95th percentile dt across the recent ring. */
  p95Recent: number;
  /** Number of ring samples used. */
  samples: number;
}

export interface RenderLoopDeps {
  state: { running: boolean };
  modules: RenderLoopModules;
  builders: RenderLoopDepsBuilders;
  /** Override for the rAF function — defaults to `requestAnimationFrame`.
   *  Tests inject a controllable shim. */
  raf?: (cb: (timeMs: number) => void) => unknown;
  /** Optional dev/HTTPS-only watchdog — see FrameDropWatchDeps. */
  frameDropWatch?: FrameDropWatchDeps;
  /** [R2-5] タイトル画面（不透明な startScreen）が前面のとき true を
   *  返す述語。true のフレームは「描画フェーズのみ」スキップする —
   *  マイク処理・状態更新・rAF は止めない（intro-hint のマイク反応と
   *  ▶ 復帰の即時性を保つ）。省略時は常に描画（従来挙動）。 */
  isTitleVisible?: () => boolean;
}

export interface RenderLoop {
  /** One frame of work. Self-rAFs while state.running is true. */
  tick(timeMs: number): void;
}

export function createRenderLoop(deps: RenderLoopDeps): RenderLoop {
  const raf = deps.raf ?? ((cb) => requestAnimationFrame(cb));

  // Frame-drop watchdog state — only allocated when configured. The
  // ring is a plain Float64Array sized to ringLen, so the per-tick
  // write is one indexed store + one mod increment. Zero-allocation
  // hot path.
  const watch = deps.frameDropWatch;
  const ring = watch ? new Float64Array(watch.ringLen) : null;
  let ringHead = 0;
  let ringSize = 0;
  let lastDropMs = -Infinity;

  function recordFrameDt(timeMs: number, dt: number): void {
    if (!watch || !ring) return;
    ring[ringHead] = dt;
    ringHead = (ringHead + 1) % ring.length;
    if (ringSize < ring.length) ringSize++;

    if (dt < watch.thresholdMs) return;
    if (timeMs - lastDropMs < watch.cooldownMs) return;
    lastDropMs = timeMs;

    // Compute mean / max / p95 from the populated portion of the ring.
    let max = 0;
    let sum = 0;
    const samples = ringSize;
    const tmp = new Float64Array(samples);
    for (let i = 0; i < samples; i++) {
      const v = ring[i];
      if (v > max) max = v;
      sum += v;
      tmp[i] = v;
    }
    tmp.sort();
    const p95 = tmp[Math.min(samples - 1, Math.floor(samples * 0.95))];
    const stats: FrameDropStats = {
      dt,
      timeMs,
      maxRecent: max,
      meanRecent: samples > 0 ? sum / samples : 0,
      p95Recent: p95,
      samples,
    };
    try {
      watch.onDrop(stats, watch.getContext());
    } catch {
      /* watchdog must never crash the loop */
    }
  }

  function tick(timeMs: number): void {
    if (!deps.state.running) return;
    raf(tick);

    // [R2-5] タイトル画面が前面のフレームは「描画フェーズのみ」スキップ
    // （電池・発熱対策）。オーディオ処理・状態更新・rAF は継続するので、
    // ▶ で戻った瞬間に正しい状態から描画が再開する。
    const titleVisible = deps.isTitleVisible ? deps.isTitleVisible() : false;

    // 1. Frame prelude — atmosphere + glow + dt computation.
    //    skipDraw 時も dt 計算・平滑・減衰は続く（render-frame.ts 参照）。
    const frameDeps = deps.builders.buildFrameDeps(timeMs);
    if (titleVisible) frameDeps.skipDraw = true;
    const { dt, theme } = deps.modules.RenderFrame.runRenderFramePrelude(timeMs, frameDeps);

    // dt 正規化係数（16.67ms = 60fps の1フレームを 1 とする）。パーティクル・
    // リップル物理とアンビエント湧き確率へ貫通させ、リフレッシュレート
    // 非依存にする（dt は prelude で 50ms クランプ済み → dtNorm ≤ 3）。
    const dtNorm = dt / 16.67;

    // Record dt + fire watchdog if this is a spike. Done immediately
    // after the prelude so the rest of the frame's work doesn't
    // skew the next sample's dt.
    recordFrameDt(timeMs, dt);

    // 2. Mic pipeline — YIN throttle + AGC + practice tick + spawn.
    //    タイトル中も止めない（intro-hint がマイク検出で自己消灯する
    //    経路と、復帰時の AGC / セッション状態の連続性を保つ）。
    const { isGoodNote } = deps.modules.MicPipeline.tickMicPipeline(
      timeMs,
      dt,
      deps.builders.buildMicPipelineDeps(timeMs, dt, theme)
    );
    void isGoodNote; // reserved for future hooks

    // 3. Mid-frame effects — note display fade, ambient spawn,
    // spectrum bars (silence-gated by the builder).
    // note-fade は DOM 状態のみなので常時。アンビエント湧き + スペクトラム
    // は純粋な描画系なのでタイトル中はスキップ。
    deps.modules.RenderMid.tickNoteDisplayFade(timeMs, deps.builders.buildNoteFadeDeps(timeMs));
    if (!titleVisible) {
      deps.modules.RenderMid.spawnAmbientParticle(deps.builders.buildAmbientDeps(theme), dtNorm);
      const spectrumDeps = deps.builders.buildSpectrumDeps(theme);
      if (spectrumDeps) {
        deps.modules.RenderMid.runSpectrumBars(spectrumDeps);
      }
    }

    // 4. Late-frame draw + HUD. skipDraw 時も update + cull は継続
    //    （タイトル中に湧いた要素の滞留防止 — render-late.ts 参照）。
    const lateDeps = deps.builders.buildLateDeps();
    if (titleVisible) lateDeps.skipDraw = true;
    deps.modules.RenderLate.runRenderLate(timeMs, lateDeps, dtNorm);
  }

  return { tick };
}
