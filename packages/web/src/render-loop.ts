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
    spawnAmbientParticle(deps: RenderMidAmbientDeps): void;
    runSpectrumBars(deps: RenderMidSpectrumDeps): void;
  };
  RenderLate: {
    runRenderLate(timeMs: number, deps: RenderLateDeps): void;
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

export interface RenderLoopDeps {
  state: { running: boolean };
  modules: RenderLoopModules;
  builders: RenderLoopDepsBuilders;
  /** Override for the rAF function — defaults to `requestAnimationFrame`.
   *  Tests inject a controllable shim. */
  raf?: (cb: (timeMs: number) => void) => unknown;
}

export interface RenderLoop {
  /** One frame of work. Self-rAFs while state.running is true. */
  tick(timeMs: number): void;
}

export function createRenderLoop(deps: RenderLoopDeps): RenderLoop {
  const raf = deps.raf ?? ((cb) => requestAnimationFrame(cb));

  function tick(timeMs: number): void {
    if (!deps.state.running) return;
    raf(tick);

    // 1. Frame prelude — atmosphere + glow + dt computation.
    const { dt, theme } = deps.modules.RenderFrame.runRenderFramePrelude(
      timeMs,
      deps.builders.buildFrameDeps(timeMs)
    );

    // 2. Mic pipeline — YIN throttle + AGC + practice tick + spawn.
    const { isGoodNote } = deps.modules.MicPipeline.tickMicPipeline(
      timeMs,
      dt,
      deps.builders.buildMicPipelineDeps(timeMs, dt, theme)
    );
    void isGoodNote; // reserved for future hooks

    // 3. Mid-frame effects — note display fade, ambient spawn,
    // spectrum bars (silence-gated by the builder).
    deps.modules.RenderMid.tickNoteDisplayFade(timeMs, deps.builders.buildNoteFadeDeps(timeMs));
    deps.modules.RenderMid.spawnAmbientParticle(deps.builders.buildAmbientDeps(theme));
    const spectrumDeps = deps.builders.buildSpectrumDeps(theme);
    if (spectrumDeps) {
      deps.modules.RenderMid.runSpectrumBars(spectrumDeps);
    }

    // 4. Late-frame draw + HUD.
    deps.modules.RenderLate.runRenderLate(timeMs, deps.builders.buildLateDeps());
  }

  return { tick };
}
