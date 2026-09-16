// MIDI note handlers — Phase 0d batch 19.
//
// "What happens when a MIDI key is pressed/released or sustain CC
// changes." Three event handlers (note-on, note-off, CC) plus the
// pure visual-spawn helper they share. Mirrors the mic-pipeline
// extraction (batch 18) — same closure-over-deps factory pattern,
// same JSDoc cast bridge from legacy-app.js's loose state types.
//
//   onMidiNoteOn:
//     - record the active note + drop the sustain copy
//     - in free-play: bump session confidence (mic-suspended path),
//       spawn visuals, feed quality histories, advance pitch
//       stability, reset silence timer
//     - run chord-window detection; emit glow-pulse on a fresh chord
//       (free-play only — practice keeps the lane uncluttered)
//
//   onMidiNoteOff:
//     - if sustain pedal down → move to sustainedNotes (visuals
//       linger), else evict from activeNotes
//     - in practice: anchor duration scoring to physical key release
//
//   onMidiCC (cc=64 only):
//     - track sustain-pedal state; on release, drop every sustained
//       key with a soft fade ripple
//
//   spawnMidiNoteVisuals (internal):
//     - burst + ripple + stream + intro-hint hide
//     - flow/combo bookkeeping (drives scoring even with headphones)
//     - low-flow wake-up flash trigger
//     - showNoteDisplay (skipped when practice owns the lane)
//
// All state references (state, midiState, practice) are passed by
// reference — the legacy shell's globals — so the loop body still
// reads the same values it always did.

import type {
  WakeUpFlashState,
  WakeUpFlashOptions,
  FlowState,
  FlowEvent,
  FlowMeterOptions,
} from '@piano/core';

// ─── State refs ─────────────────────────────────────────────────────

/** Per-MIDI-note record stored in midiState.activeNotes. */
export interface MidiActiveNote {
  velocity: number;
  onTimeMs: number;
  synColor?: string;
}

/** Mic-pipeline state shape extended with the fields these handlers
 *  read/write. Composing with WakeUpFlashState so we can hand the
 *  same `state` ref to `triggerWakeUpFlash`. */
export interface MidiHandlersState extends WakeUpFlashState, FlowState {
  running: boolean;
  lastNoteTimeMs: number;
  // For showNoteDisplay (re-entered through deps):
  noteShowTimeMs: number;
  lastDetectedNote: string;
}

/** midiState: per-port aggregate the renderer + chord detector share. */
export interface MidiHandlersMidiState {
  activeNotes: Map<number, MidiActiveNote>;
  sustainOn: boolean;
  sustainedNotes: Set<number>;
  recentOnsets: Array<{ midi: number; timeMs: number }>;
  lastChordName: string;
  lastChordTimeMs: number;
}

export interface MidiHandlersPracticeRef {
  enabled: boolean;
}

/** Ripple ctor — same shape as in mic-pipeline.ts. */
export type RippleCtor = new (x: number, y: number, color: string, size: number) => unknown;

/** Ripples bag — push-only here. */
export interface RipplesArray {
  push(r: unknown): void;
}

// ─── handlers deps ──────────────────────────────────────────────────
//
// The reducer-options bags (qhOptsMidi / psOpts / cwOpts) are passed
// through opaquely — the legacy shell builds them once at startup
// from PianoCore types and our handlers just hand them back to the
// reducers. Keeping them `unknown` here avoids re-declaring upstream
// interfaces that would drift from @piano/core.

export interface MidiHandlersDeps {
  // ─── State refs ───────────────────────────────────────────────────
  state: MidiHandlersState;
  midiState: MidiHandlersMidiState;
  practice: MidiHandlersPracticeRef;

  // ─── Layout / rendering hooks ─────────────────────────────────────
  midiToScreenX: (midiNum: number) => number;
  noteThemeColor: (midiNum: number) => string;
  synColorFor: (midiNum: number) => string | null | undefined;
  spawnBurst: (x: number, y: number, count: number, energy: number, overrideColor?: string) => void;
  spawnStream: (x: number, y: number, energy: number, overrideColor?: string) => void;
  ripples: RipplesArray;
  Ripple: RippleCtor;

  // ─── Side-effects called by the handlers ─────────────────────────
  /** 一期一会演出（フリープレイのみ）。旧シェル互換のため optional。 */
  freeplayMoments?: { onNote(midi: number, x: number, y: number, color: string, t: number): void };
  hideIntroHint: () => void;
  showNoteDisplay: (
    displayText: string,
    changeKey: string,
    color: string | null | undefined,
    timeMs: number
  ) => void;
  effectGlowPulse: () => void;
  finalizeNoteHold: (midiNum: number) => void;

  // ─── Pure reducers from @piano/core ──────────────────────────────
  applyOnsetToHistory: (state: unknown, timeMs: number, amplitude: number, opts: unknown) => void;
  applyOnsetPitch: (state: unknown, midi: number, opts: unknown) => void;
  applyOnsetToWindow: (
    state: unknown,
    midiNum: number,
    timeMs: number,
    opts: unknown
  ) => { emitted: string | null };
  triggerWakeUpFlash: (state: WakeUpFlashState, opts: WakeUpFlashOptions) => void;
  /** The one flow / combo reducer (PianoCore.applyFlowEvent), shared with the
   *  mic path. */
  applyFlowEvent: (state: FlowState, event: FlowEvent, opts: FlowMeterOptions) => void;

  // ─── Reducer options + tunables ──────────────────────────────────
  qhOptsMidi: unknown;
  psOpts: unknown;
  cwOpts: unknown;
  wufOpts: WakeUpFlashOptions;
  config: {
    NOTE_NAMES: readonly string[];
  };
  /** Flow / combo rules — built by the same `buildFlowMeterOptions` the mic
   *  reducer uses. */
  flowOpts: FlowMeterOptions;
  /** Notation-aware note-name table for the on-screen note DISPLAY only
   *  (shares shell-practice's activeNoteNames: prefs.noteNaming + lang).
   *  Falls back to config.NOTE_NAMES (English). Color lookups elsewhere
   *  keep using the English table — NOTE_COLORS is keyed by C/C#/…  */
  getDisplayNoteNames?: () => readonly string[];
  // ─── Frame-time inputs (the loop hands these in fresh each event). ──
  /** Screen height — used to put bass note visuals lower than treble. */
  getHeight: () => number;
}

// ─── handlers ───────────────────────────────────────────────────────

/** Spawn the per-note visuals + flow/combo bookkeeping for a free-play
 *  MIDI note. Called by `onMidiNoteOn` only; practice uses the cursor +
 *  lane instead. */
export function spawnMidiNoteVisuals(
  midiNum: number,
  velocity: number,
  synColor: string | undefined,
  deps: MidiHandlersDeps
): void {
  const H = deps.getHeight();
  deps.hideIntroHint();
  const v = Math.max(0.15, velocity / 127);
  const color = synColor || deps.noteThemeColor(midiNum);

  const isLow = midiNum < 60;
  const noteX = deps.midiToScreenX(midiNum);
  const baseY = isLow ? H * 0.65 : H * 0.35;
  const noteY = baseY + (Math.random() - 0.5) * H * 0.08;

  const burstCount = Math.floor(8 + v * 32 + deps.state.flow * 0.15);
  deps.spawnBurst(noteX, noteY, burstCount, v * (1.1 + deps.state.flow * 0.012), color);
  deps.ripples.push(new deps.Ripple(noteX, noteY, color, 100 + v * 280 + deps.state.flow * 1.2));
  deps.spawnStream(noteX, isLow ? H * 0.78 : H * 0.22, v, color);

  // Flow + combo through the SAME reducer the mic uses. This was a hand copy
  // that had drifted: a >3 s gap reset the combo to 1 here and kept 60 % on
  // the mic, so the number on screen meant different things per input. The
  // velocity is passed floored, matching the burst size above.
  const now = performance.now();
  deps.applyFlowEvent(
    deps.state,
    { type: 'midiNote', timeMs: now, velocity: v * 127 },
    deps.flowOpts
  );
  deps.state.lastNoteTimeMs = now;

  const displayNames = deps.getDisplayNoteNames?.() ?? deps.config.NOTE_NAMES;
  const noteName = displayNames[midiNum % 12];
  deps.showNoteDisplay(noteName, noteName + (Math.floor(midiNum / 12) - 1), synColor, now);
  if (deps.state.flow < 10) deps.triggerWakeUpFlash(deps.state, deps.wufOpts);

  // 一期一会演出 — 通常のバースト/リップルと同じ位置・色に上乗せする。
  deps.freeplayMoments?.onNote(midiNum, noteX, noteY, color, now);
}

/** Note-on entry point. Split into two phases:
 *
 *    1. Visual reflection — always runs, even before ▶ Start. The
 *       keyboard renderer reads `midiState.activeNotes` every frame,
 *       so a kid who presses a key on the title screen still sees
 *       it light up. Chord-window detection also runs here so the
 *       overlay appears on pre-session noodling.
 *
 *    2. Score / flow / particle visuals — gated on `state.running`.
 *       These belong to an active session and would corrupt the
 *       quality histories or spawn off-screen bursts if fired
 *       outside one.
 *
 *  Without the split, the badge would pulse (from midi-dispatch) on a
 *  pre-start press but no key would light up — the most-reported
 *  "MIDI is connected but nothing happens" symptom. */
export function onMidiNoteOn(midiNum: number, velocity: number, deps: MidiHandlersDeps): void {
  const now = performance.now();
  const synColor = deps.synColorFor(midiNum) ?? undefined;

  // Phase 1 — always-on visual reflection.
  deps.midiState.activeNotes.set(midiNum, { velocity, onTimeMs: now, synColor });
  deps.midiState.sustainedNotes.delete(midiNum);
  const cw = deps.applyOnsetToWindow(deps.midiState, midiNum, now, deps.cwOpts);

  // Phase 2 — session-only scoring + particle visuals.
  if (!deps.state.running) return;

  if (!deps.practice.enabled) {
    // No session-state override here any more. This used to force
    // `performing` and bump the confidence on every press, because the
    // session-confidence machine never ran without a mic. It runs every frame
    // now (updateGameStateWithoutMic), so a keyboard player goes through the
    // same waiting → warm-up → performing progression — and, unlike before,
    // falls back out of it when they stop.
    spawnMidiNoteVisuals(midiNum, velocity, synColor, deps);

    // Feed MIDI into quality histories so radar/quest reflect the
    // real performance — mic may be silent (headphones) or noisy.
    // CV is scale-invariant, so velocity/127 in [0,1] is comparable
    // to mic RMS.
    deps.applyOnsetToHistory(deps.state, now, velocity / 127, deps.qhOptsMidi);

    deps.applyOnsetPitch(deps.state, midiNum, deps.psOpts);
  }

  // Free-play also runs the glow effect; practice just shows the name
  // quietly.
  if (cw.emitted && !deps.practice.enabled) deps.effectGlowPulse();
}

/** Note-off entry point. Sustain pedal swallows physical key release for
 *  visuals (the note moves to sustainedNotes). When the pedal is DOWN the
 *  note keeps sounding, so note-length scoring is DEFERRED to pedal release
 *  (onMidiCC) — finalizing here would mis-score correct pedaling (release
 *  the key, hold with the pedal) as "too short". When the pedal is up, the
 *  physical release IS the sounding end, so finalize immediately. */
export function onMidiNoteOff(midiNum: number, deps: MidiHandlersDeps): void {
  if (deps.midiState.sustainOn) {
    deps.midiState.sustainedNotes.add(midiNum);
    // 音長の確定はペダル解放まで先送り（pendingHolds に残す）。
  } else {
    deps.midiState.activeNotes.delete(midiNum);
    if (deps.practice.enabled) deps.finalizeNoteHold(midiNum);
  }
}

/** Release every lit key (held + sustained) with a soft fade ripple.
 *  The recovery path for a dropped note-off — BLE-MIDI can lose a packet,
 *  and the keyboard's own "panic" (All Notes/Sound Off) is the standard
 *  way to unstick. Visual-only: mirrors the section-transition clear,
 *  doesn't fabricate a scored release. Pedal state (`sustainOn`) is left
 *  as-is so a still-depressed pedal keeps working for the next notes. */
function releaseAllMidiNotes(deps: MidiHandlersDeps): void {
  const H = deps.getHeight();
  const lit = new Set<number>([
    ...deps.midiState.activeNotes.keys(),
    ...deps.midiState.sustainedNotes,
  ]);
  lit.forEach((midiNum) => {
    const x = deps.midiToScreenX(midiNum);
    const y = midiNum < 60 ? H * 0.7 : H * 0.3;
    deps.ripples.push(new deps.Ripple(x, y, deps.noteThemeColor(midiNum), 60));
  });
  deps.midiState.activeNotes.clear();
  deps.midiState.sustainedNotes.clear();
}

/** Sustain-pedal + panic CC handler. CC #64 (sustain) is the piano-
 *  relevant continuous controller; CC #120 (All Sound Off) / #123 (All
 *  Notes Off) are the stuck-note recovery path (see releaseAllMidiNotes).
 *  Every other CC is a no-op. On pedal release, drop every sustained key
 *  with a soft fade ripple so the kid sees the "let go" visual. */
export function onMidiCC(cc: number, value: number, deps: MidiHandlersDeps): void {
  if (cc === 120 || cc === 123) {
    releaseAllMidiNotes(deps);
    return;
  }
  if (cc !== 64) return;
  const wasOn = deps.midiState.sustainOn;
  deps.midiState.sustainOn = value >= 64;
  if (wasOn && !deps.midiState.sustainOn) {
    const H = deps.getHeight();
    deps.midiState.sustainedNotes.forEach((midiNum) => {
      // ペダル解放 = この音の実際の発音終端。先送りしていた音長をここで
      // 確定することで、「鍵を離してペダルで伸ばす」正しいペダリングが
      // 物理離鍵の早さではなく実際に鳴っていた長さで正当に評価される。
      if (deps.practice.enabled) deps.finalizeNoteHold(midiNum);
      const x = deps.midiToScreenX(midiNum);
      const y = midiNum < 60 ? H * 0.7 : H * 0.3;
      deps.ripples.push(new deps.Ripple(x, y, deps.noteThemeColor(midiNum), 60));
      deps.midiState.activeNotes.delete(midiNum);
    });
    deps.midiState.sustainedNotes.clear();
  }
}
