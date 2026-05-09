// Render-loop wire-up — Phase 0d batch 75.
//
// 178 lines of `RenderLoop.createRenderLoop({...})` deps-builder
// machinery moved out of legacy-app.js. This is the single biggest
// remaining shell-glue block; what's left after this fold is the
// thin per-frame `loop(timeMs)` thunk + the upstream factory call
// site that wires shell-locals to the deps.
//
// The `RenderLoop` factory composes four sub-module phases each
// frame (RenderFrame / MicPipeline / RenderMid / RenderLate) and
// self-rAFs while state.running. Each phase has its own builder
// thunk because per-frame fresh values (analyser, audioCtx, theme
// color list, particles count) need to be captured at call-time,
// not at factory-build time.
//
// The frame-drop watchdog is included here too — it lives in the
// same dep object as the render-loop factory, and its context
// snapshot reads from the same shell-locals.

import type * as RenderLoopModule from './render-loop';
import type * as RenderFrameModule from './render-frame';
import type * as MicPipelineModule from './mic-pipeline';
import type * as RenderMidModule from './render-mid';
import type * as RenderLateModule from './render-late';

export interface RenderLoopWireupDeps {
  // ── modules ──────────────────────────────────────────────────
  renderLoop: typeof RenderLoopModule;
  renderFrame: typeof RenderFrameModule;
  micPipeline: typeof MicPipelineModule;
  renderMid: typeof RenderMidModule;
  renderLate: typeof RenderLateModule;
  pianoCore: any;

  // ── live shell refs ──────────────────────────────────────────
  ctx: CanvasRenderingContext2D;
  state: any;
  /** Practice / midiInput are forward-declared in legacy-app.js after
   *  the wireup site — read fresh per builder call via getter. */
  getPractice: () => any;
  getMidiInput: () => any;
  config: any;
  /** Per-frame fresh dimensions. */
  getScreen: () => { W: number; H: number };
  /** Live AudioContext / analyser / arrays — pre-init values are
   *  null; the loop guards against them. */
  getAudioCtx: () => AudioContext | null;
  getAnalyser: () => AnalyserNode | null;
  getDataArray: () => Uint8Array<ArrayBuffer>;
  getFreqArray: () => Float32Array<ArrayBuffer>;

  // ── particle / ripple pools (shared) ────────────────────────
  particles: any[];
  ripples: any[];
  Particle: any;
  Ripple: any;

  // ── DOM bag (subset) ────────────────────────────────────────
  dom: {
    micMeter: HTMLElement;
    micMeterFill: HTMLElement;
    introHint: HTMLElement;
    noteDisplay: HTMLElement;
    startScreen: HTMLElement;
    songPanel: HTMLElement;
    sessionSummary: HTMLElement;
    sectionResult: HTMLElement;
  };

  // ── helper functions ────────────────────────────────────────
  drawBgStars: (timeMs: number) => void;
  drawAurora: (timeMs: number) => void;
  drawGroundFlowers: (timeMs: number) => void;
  detectPitchYIN: (...args: any[]) => any;
  updateAGC: (timeMs: number, postGainRms: number) => void;
  updateGameState: (...args: any[]) => any;
  hideIntroHint: () => void;
  /** updatePractice is forward-declared after the wireup. */
  getUpdatePractice: () => (...args: any[]) => any;
  freqToNote: (freq: number) => any;
  getNoteColor: (name: string) => string;
  spawnBurst: (...args: any[]) => any;
  spawnStream: (...args: any[]) => any;
  showNoteDisplay: (...args: any[]) => any;
  isFreeplayActive: () => boolean;
  drawMidiBeams: (timeMs: number) => void;
  drawMidiChordDisplay: (timeMs: number) => void;
  drawMidiKeyboard: () => void;
  drawPracticeLane: (timeMs: number) => void;
  updateQuestState: (timeMs: number) => void;
  updatePlayTime: (timeMs: number) => void;
  updateDebugOverlay: () => void;
  getEnergy: () => number;
  wufOpts: any;

  // ── frame-drop watchdog ─────────────────────────────────────
  /** When true, allocates the watchdog ring + emits drop logs.
   *  Production builds (REMOTE_LOG_ENABLED=false) pass false to
   *  pay nothing. */
  remoteLogEnabled: boolean;
  /** Optional Tone.js global ref — read inside the diag context
   *  builder. */
  getTone: () => any;
  /** Logger override — defaults to console.log. */
  log?: (msg: string) => void;
}

/** Build the render-loop. Returns the factory result so the shell
 *  can call its `tick()` from `loop(timeMs)`. */
export function wireRenderLoop(deps: RenderLoopWireupDeps): { tick: (timeMs: number) => void } {
  const log = deps.log ?? ((m: string) => console.log(m));
  return deps.renderLoop.createRenderLoop({
    state: deps.state,
    modules: {
      RenderFrame: deps.renderFrame,
      MicPipeline: deps.micPipeline,
      RenderMid: deps.renderMid,
      RenderLate: deps.renderLate,
    },
    builders: {
      buildFrameDeps: () => {
        const { W, H } = deps.getScreen();
        return {
          ctx: deps.ctx,
          state: deps.state,
          getScreen: () => ({ W, H }),
          themes: deps.config.THEMES,
          drawBgStars: deps.drawBgStars,
          drawAurora: deps.drawAurora,
          drawGroundFlowers: deps.drawGroundFlowers,
          decayWakeUpFlash: deps.pianoCore.decayWakeUpFlash,
          drawCenterGlow: deps.pianoCore.drawCenterGlow,
          wufOpts: deps.wufOpts,
          getEnergy: deps.getEnergy,
        };
      },
      buildMicPipelineDeps: (_timeMs: number, _dt: number, theme: any) => {
        const { W, H } = deps.getScreen();
        // analyser + audioCtx are non-null at loop-fire time (the
        // loop only ticks while state.running, which is set after
        // initAudio). Cast away the null union.
        return {
          analyser: deps.getAnalyser() as AnalyserNode,
          audioCtx: deps.getAudioCtx() as AudioContext,
          freqArray: deps.getFreqArray(),
          detectPitchYIN: deps.detectPitchYIN,
          updateAGC: deps.updateAGC,
          updateGameState: deps.updateGameState,
          state: deps.state,
          practice: deps.getPractice(),
          midiInput: deps.getMidiInput(),
          micMeter: deps.dom.micMeter,
          micMeterFill: deps.dom.micMeterFill,
          introHint: deps.dom.introHint,
          hideIntroHint: deps.hideIntroHint,
          updatePractice: deps.getUpdatePractice(),
          freqToNote: deps.freqToNote,
          getNoteColor: deps.getNoteColor,
          spawnBurst: deps.spawnBurst,
          spawnStream: deps.spawnStream,
          ripples: deps.ripples,
          Ripple: deps.Ripple,
          showNoteDisplay: deps.showNoteDisplay,
          triggerWakeUpFlash: deps.pianoCore.triggerWakeUpFlash,
          wufOpts: deps.wufOpts,
          theme,
          screen: { W, H },
          config: {
            MIN_NOTE_INTERVAL_MS: deps.config.MIN_NOTE_INTERVAL_MS,
            PITCH_MIN_HZ: deps.config.PITCH_MIN_HZ,
            PIANO_KEY_MIN: deps.config.PIANO_KEY_MIN,
            PIANO_KEY_COUNT: deps.config.PIANO_KEY_COUNT,
          },
        };
      },
      buildNoteFadeDeps: () => ({
        noteDisplayEl: deps.dom.noteDisplay,
        state: deps.state,
        noteDisplayDurationMs: deps.config.NOTE_DISPLAY_DURATION_MS,
      }),
      buildAmbientDeps: (theme: any) => {
        const { W, H } = deps.getScreen();
        return {
          state: deps.state,
          theme,
          screen: { W, H },
          particles: deps.particles,
          // [Issue 2 frame-drop fix 2026-05-09] During practice,
          // lower the cap to 200 so a note-hit burst can't chain
          // into a 600+ particle frame. The render layer also
          // disables shadowBlur during practice; the two together
          // halve per-frame paint cost on Canvas2D.
          maxParticles: deps.getPractice().enabled ? 200 : deps.config.MAX_PARTICLES,
          ambientChance: deps.getPractice().enabled ? 0 : deps.config.AMBIENT_PARTICLE_CHANCE,
          Particle: deps.Particle,
        };
      },
      buildSpectrumDeps: (theme: any) => {
        const analyser = deps.getAnalyser();
        const audioCtx = deps.getAudioCtx();
        if (!analyser || !audioCtx || !(deps.state.smoothEnergy > 0.03)) return null;
        const { W, H } = deps.getScreen();
        return {
          ctx: deps.ctx,
          dataArray: deps.getDataArray(),
          sampleRate: audioCtx.sampleRate,
          fftSize: analyser.fftSize,
          pianoFreqMin: deps.config.PIANO_FREQ_MIN,
          pianoFreqMax: deps.config.PIANO_FREQ_MAX,
          barCount: deps.config.BAR_COUNT,
          themeColors: theme.colors,
          flow: deps.state.flow,
          screen: { W, H },
          drawSpectrumBars: deps.pianoCore.drawSpectrumBars,
        };
      },
      buildLateDeps: () => ({
        ctx: deps.ctx,
        ripples: deps.ripples,
        particles: deps.particles,
        midiInput: deps.getMidiInput(),
        practice: deps.getPractice(),
        isFreeplayActive: deps.isFreeplayActive,
        maxParticles: deps.config.MAX_PARTICLES,
        drawMidiBeams: deps.drawMidiBeams,
        drawMidiChordDisplay: deps.drawMidiChordDisplay,
        drawMidiKeyboard: deps.drawMidiKeyboard,
        drawPracticeLane: deps.drawPracticeLane,
        updateQuestState: deps.updateQuestState,
        updatePlayTime: deps.updatePlayTime,
        updateDebugOverlay: deps.updateDebugOverlay,
      }),
    },
    // [DIAG-FRAME] Frame-drop watchdog. Only allocates the ring +
    // fires logs when remoteLogEnabled is true (dev / LAN HTTPS).
    // Threshold 33 ms ≈ 30 fps; cooldown 1 s prevents a long GC
    // pause from flooding the log. Context dump captures
    // particles / ripples count, audioCtx state, Tone Transport
    // position, practice mode + section, mic-suspended flag —
    // everything we need to root-cause stutter without re-deploy.
    frameDropWatch: deps.remoteLogEnabled
      ? {
          thresholdMs: 33,
          cooldownMs: 1000,
          ringLen: 60,
          getContext: () => {
            const audioCtx = deps.getAudioCtx();
            const Tone = deps.getTone();
            return {
              particles: deps.particles.length,
              ripples: deps.ripples.length,
              sectionNotes: deps.getPractice().sectionNotes
                ? deps.getPractice().sectionNotes.length
                : 0,
              currentNoteIdx: deps.getPractice().currentNoteIdx,
              practiceMode: deps.getPractice().mode,
              fullSongMode: deps.getPractice().fullSongMode,
              practiceEnabled: deps.getPractice().enabled,
              audioCtxState: audioCtx ? audioCtx.state : null,
              audioCtxSampleRate: audioCtx ? audioCtx.sampleRate : null,
              transportState: Tone && Tone.Transport ? Tone.Transport.state : null,
              transportPosition: Tone && Tone.Transport ? Tone.Transport.position : null,
              micSuspended: deps.state.micSuspended,
              flow: deps.state.flow,
              combo: deps.state.combo,
              sessionState: deps.state.sessionState,
            };
          },
          onDrop: (stats: any, ctx: any) => {
            log('[DIAG-FRAME] drop ' + JSON.stringify({ ...stats, ...ctx }));
          },
        }
      : undefined,
  });
}
