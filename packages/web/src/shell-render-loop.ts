// Render-loop shell — Phase 0d batch 112.
//
// Bundles the per-frame rAF loop wireup. The deps surface is wide
// (every render layer + per-frame reducer + audio bag + bg/midi
// drawers) but cohesive — once the loop kicks off, everything reads
// from this single dep object.
//
// All forward-declared shell-locals (practice, midiInput,
// updatePractice + the various draw* / show* / is* helpers) flow in
// by getter thunk so the factory can be built before those are
// declared in the shell IIFE.

import * as RenderLoopWireup from './render-loop-wireup';
import * as RenderLoop from './render-loop';
import * as RenderFrame from './render-frame';
import * as MicPipeline from './mic-pipeline';
import * as RenderMid from './render-mid';
import * as RenderLate from './render-late';
import * as DomBag from './dom-bag';

 
export interface ShellRenderLoopDeps {
  ctx: CanvasRenderingContext2D;
  state: any;
  config: any;
  dom: any;
  /** practice / midiInput / updatePractice all forward-declared in
   *  the shell — getter thunks defer the read to fire-time. */
  getPractice: () => any;
  getMidiInput: () => any;
  getUpdatePractice: () => (...args: any[]) => any;
  /** Live screen geometry. */
  getScreen: () => { W: number; H: number };
  /** Audio bag — analyser / dataArray / freqArray / audioCtx. */
  audio: any;
  /** Particles / ripples shared pools + types. */
  particles: any[];
  ripples: any[];
  Particle: any;
  Ripple: any;
  /** Background drawers. */
  drawBgStars: (timeMs: number) => void;
  drawAurora: (timeMs: number) => void;
  drawGroundFlowers: (timeMs: number) => void;
  /** Per-frame reducers. */
  detectPitchYIN: any;
  freqToNote: any;
  updateAGC: any;
  updateGameState: any;
  updateQuestState: any;
  updatePlayTime: any;
  updateDebugOverlay: any;
  getEnergy: any;
  /** MIDI handlers — these are forward-declared function declarations
   *  in legacy-app.js. Pass thunks for safety. */
  getDrawMidiBeams: () => (timeMs: number) => void;
  getDrawMidiChordDisplay: () => (timeMs: number) => void;
  getDrawMidiKeyboard: () => () => void;
  getDrawPracticeLane: () => (timeMs: number) => void;
  getShowNoteDisplay: () => (...args: any[]) => any;
  getNoteColor: any;
  spawnBurst: any;
  spawnStream: any;
  hideIntroHint: () => void;
  isFreeplayActive: () => boolean;
  wufOpts: any;
  remoteLogEnabled: boolean;
  /** Tone — read at frame-drop watchdog time. */
  getTone: () => any;
  pianoCore: any;
}

export interface ShellRenderLoop {
  loop: (timeMs: number) => void;
}

export function createShellRenderLoop(deps: ShellRenderLoopDeps): ShellRenderLoop {
  const _renderLoop = RenderLoopWireup.wireRenderLoop({
    renderLoop: RenderLoop,
    renderFrame: RenderFrame,
    micPipeline: MicPipeline,
    renderMid: RenderMid,
    renderLate: RenderLate,
    pianoCore: deps.pianoCore,
    ctx: deps.ctx,
    state: deps.state,
    getPractice: deps.getPractice,
    getMidiInput: deps.getMidiInput,
    config: deps.config,
    getScreen: deps.getScreen,
    getAudioCtx: deps.audio.getAudioCtx,
    getAnalyser: deps.audio.getAnalyser,
    getDataArray: deps.audio.getDataArray,
    getFreqArray: deps.audio.getFreqArray,
    particles: deps.particles,
    ripples: deps.ripples,
    Particle: deps.Particle,
    Ripple: deps.Ripple,
    dom: DomBag.pickDom(
      deps.dom,
      'micMeter',
      'micMeterFill',
      'introHint',
      'noteDisplay',
      'startScreen',
      'songPanel',
      'sessionSummary',
      'sectionResult'
    ) as any,
    drawBgStars: deps.drawBgStars,
    drawAurora: deps.drawAurora,
    drawGroundFlowers: deps.drawGroundFlowers,
    detectPitchYIN: deps.detectPitchYIN,
    updateAGC: deps.updateAGC,
    updateGameState: deps.updateGameState,
    hideIntroHint: deps.hideIntroHint,
    getUpdatePractice: deps.getUpdatePractice,
    freqToNote: deps.freqToNote,
    getNoteColor: deps.getNoteColor,
    spawnBurst: deps.spawnBurst,
    spawnStream: deps.spawnStream,
    // [TDZ workaround 2026-05-09] Vite/esbuild minification converts the
    // bundled `function showNoteDisplay` declaration to a `let`-style
    // binding, so the shorthand reference lands inside its temporal dead
    // zone. Forwarding through a getter defers the lookup to call time.
    showNoteDisplay: (a: any, b: any, c: any, d: any) => deps.getShowNoteDisplay()(a, b, c, d),
    isFreeplayActive: deps.isFreeplayActive,
    drawMidiBeams: (timeMs: number) => deps.getDrawMidiBeams()(timeMs),
    drawMidiChordDisplay: (timeMs: number) => deps.getDrawMidiChordDisplay()(timeMs),
    drawMidiKeyboard: () => deps.getDrawMidiKeyboard()(),
    drawPracticeLane: (timeMs: number) => deps.getDrawPracticeLane()(timeMs),
    updateQuestState: deps.updateQuestState,
    updatePlayTime: deps.updatePlayTime,
    updateDebugOverlay: deps.updateDebugOverlay,
    getEnergy: deps.getEnergy,
    wufOpts: deps.wufOpts,
    remoteLogEnabled: deps.remoteLogEnabled,
    getTone: deps.getTone,
  } as any);

  return {
    loop: (timeMs: number) => _renderLoop.tick(timeMs),
  };
}
