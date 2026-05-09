// MIDI handlers + render shell — Phase 0d batch 106.
//
// Bundles the input-side glue that translates an incoming MIDI note
// into visuals (color + ripple + glow + chord display) PLUS the
// per-frame MIDI rendering layer (keyboard + sustain beams + chord
// label). Together with shell-midi.ts these form the full MIDI
// pipeline:
//   ShellMidi    →  receives bytes, dispatches to onMidiNoteOn/Off/CC
//   ShellMidiHandlers → fires visuals + advances midiState
//   ShellMidiHandlers (per-frame) → draws keyboard + beams + chord

import * as MidiHandlers from './midi-handlers';
import * as MidiRender from './midi-render';

export interface ShellMidiHandlersDeps {
  state: any;
  /** practice forward-declared in shell — getter for hot-path read. */
  getPractice: () => any;
  ctx: CanvasRenderingContext2D;
  config: any;
  /** noteDisplay receives the just-played note's name on detection. */
  noteDisplayEl: HTMLElement;
  /** spawnBurst / spawnStream / Ripple — particle pool + types. */
  spawnBurst: any;
  spawnStream: any;
  ripples: any[];
  Ripple: any;
  hideIntroHint: () => void;
  effectGlowPulse: any;
  finalizeNoteHold: (midi: number) => void;
  /** Score-quality options + sustained-beam options (from shell core-opts). */
  qhOptsMidi: any;
  psOpts: any;
  cwOpts: any;
  wufOpts: any;
  shadowBlurEnabled: boolean;
  t: (key: string, vars?: any) => string;
  /** Live geometry — practice-lane + chord-display read W/H/kb at call time. */
  getScreen: () => { W: number; H: number };
  getKbHeight: () => number;
  getKbSafeBottom: () => number;
}

export interface ShellMidiHandlers {
  midiState: any;
  /** Pixel projection — used by particle effects + chord-cluster matcher. */
  midiToScreenX: (midi: number) => number;
  noteThemeColor: (midi: number) => string;
  synColorFor: (midi: number) => string;
  showNoteDisplay: (text: string, key: string, color: any, timeMs: number) => void;
  /** MIDI byte handlers — passed into ShellMidi as the dispatch callbacks. */
  onMidiNoteOn: (midi: number, velocity: number) => void;
  onMidiNoteOff: (midi: number) => void;
  onMidiCC: (cc: number, value: number) => void;
  /** Per-frame draws — invoked by render-loop. */
  drawMidiKeyboard: () => void;
  drawMidiBeams: (timeMs: number) => void;
  drawMidiChordDisplay: (timeMs: number) => void;
  /** langchange refresh — re-reads i18n labels. */
  refreshLabels: () => void;
}

export function createShellMidiHandlers(deps: ShellMidiHandlersDeps): ShellMidiHandlers {
  const { state, ctx, config, t } = deps;
  const PianoCore: any = (globalThis as any).PianoCore;

  const midiState: any = {
    activeNotes: new Map(), // midiNum → { velocity, onTimeMs, synColor }
    sustainOn: false,
    sustainedNotes: new Set(), // released keys held by pedal
    recentOnsets: [], // {midi, timeMs} within 80ms — chord candidate
    lastChordName: '',
    lastChordTimeMs: 0,
  };

  const midiToScreenX = (midiNum: number): number =>
    ((midiNum - config.PIANO_KEY_MIN) / config.PIANO_KEY_COUNT) * deps.getScreen().W;

  const noteThemeColor = (midiNum: number): string =>
    PianoCore.noteThemeColor(midiNum, config.THEMES[state.currentTheme]);

  const synColorFor = (midiNum: number): string =>
    PianoCore.synColorFor(midiNum, {
      enabled: state.useSynesthesiaMode,
      noteNames: config.NOTE_NAMES,
      colorMap: config.NOTE_COLORS,
    });

  function showNoteDisplay(
    displayText: string,
    changeKey: string,
    color: any,
    timeMs: number
  ): void {
    // In practice mode the falling lane already shows the just-played note,
    // so showing noteDisplay where it overlaps the score is visual noise.
    if (deps.getPractice().enabled) return;
    state.noteShowTimeMs = timeMs;
    if (state.lastDetectedNote === changeKey) return;
    state.lastDetectedNote = changeKey;
    deps.noteDisplayEl.textContent = displayText;
    deps.noteDisplayEl.style.color = color || '';
    deps.noteDisplayEl.style.textShadow = color ? '0 0 20px ' + color : '';
    deps.noteDisplayEl.classList.add('visible');
  }

  const _midiHandlerDeps: any = {
    state,
    midiState,
    practice: {
      get enabled() {
        return deps.getPractice().enabled;
      },
    },
    midiToScreenX,
    noteThemeColor,
    synColorFor,
    spawnBurst: deps.spawnBurst,
    spawnStream: deps.spawnStream,
    ripples: deps.ripples,
    Ripple: deps.Ripple,
    hideIntroHint: deps.hideIntroHint,
    showNoteDisplay,
    effectGlowPulse: deps.effectGlowPulse,
    finalizeNoteHold: deps.finalizeNoteHold,
    applyOnsetToHistory: PianoCore.applyOnsetToHistory,
    applyOnsetPitch: PianoCore.applyOnsetPitch,
    applyOnsetToWindow: PianoCore.applyOnsetToWindow,
    triggerWakeUpFlash: PianoCore.triggerWakeUpFlash,
    qhOptsMidi: deps.qhOptsMidi,
    psOpts: deps.psOpts,
    cwOpts: deps.cwOpts,
    wufOpts: deps.wufOpts,
    config: { NOTE_NAMES: config.NOTE_NAMES, COMBO_WINDOW_MS: config.COMBO_WINDOW_MS },
    getHeight: () => deps.getScreen().H,
  };

  // Hot-path: re-allocating these each note would churn the arena. Bound once.
  const onMidiNoteOn = (midi: number, velocity: number): void =>
    MidiHandlers.onMidiNoteOn(midi, velocity, _midiHandlerDeps);
  const onMidiNoteOff = (midi: number): void => MidiHandlers.onMidiNoteOff(midi, _midiHandlerDeps);
  const onMidiCC = (cc: number, value: number): void =>
    MidiHandlers.onMidiCC(cc, value, _midiHandlerDeps);

  // ── MIDI render layer ──
  const _midiRender = MidiRender.createMidiRender({
    ctx,
    midiState,
    practice: {
      get enabled() {
        return deps.getPractice().enabled;
      },
    } as any,
    getLayout: () => ({
      W: deps.getScreen().W,
      H: deps.getScreen().H,
      kbHeight: deps.getKbHeight(),
      kbSafeBottom: deps.getKbSafeBottom(),
    }),
    drawMidiKeyboard: PianoCore.drawMidiKeyboard,
    drawMidiBeams: PianoCore.drawMidiBeams,
    midiToScreenX,
    noteThemeColor,
    chordMateToleranceMs: PianoCore.CHORD_MATE_TOLERANCE_MS,
    shadowBlurEnabled: deps.shadowBlurEnabled,
    sustainLabel: t('sustainLabel'),
  });

  return {
    midiState,
    midiToScreenX,
    noteThemeColor,
    synColorFor,
    showNoteDisplay,
    onMidiNoteOn,
    onMidiNoteOff,
    onMidiCC,
    drawMidiKeyboard: () => _midiRender.drawKeyboard(),
    drawMidiBeams: (timeMs: number) => _midiRender.drawBeams(timeMs),
    drawMidiChordDisplay: (timeMs: number) => _midiRender.drawChordDisplay(timeMs),
    refreshLabels: () => _midiRender.setLabels({ sustainLabel: t('sustainLabel') }),
  };
}
