// Mic-driven note pipeline — Phase 0d batch 18.
//
// One frame's worth of "what does the microphone tell us right now":
//
//   1. Pull time-domain samples from the analyser.
//   2. Run YIN pitch detection (full autocorrelation every 3rd frame,
//      RMS-only on the other two — saves ~6ms / frame on low-tier
//      hardware, the cached pitch is reused).
//   3. Update the software AGC + the on-screen mic meter.
//   4. Hand the pitch + RMS to the game-state reducer (`updateGameState`)
//      and grab the resulting `isGoodNote` flag.
//   5. Tick the practice timeline (only when guided practice is on).
//   6. If MIDI is NOT actively driving (no event in the last 2 s),
//      the mic owns visuals — spawn a burst, ripple, optional
//      synesthesia color, and the note-display label.
//
// The else-branch (mic suspended OR no analyser) still ticks practice
// once on each frame so the falling-notes timeline + miss detection
// keeps running while a MIDI keyboard is the active input.
//
// The shell (legacy-app.js) calls `tickMicPipeline(timeMs, dt, deps)`
// once per frame and reads the returned `{ isGoodNote }`. All state
// lives in the caller's `state` / `practice` / `midiInput` refs so the
// loop body still sees the same values it always did.

import type { WakeUpFlashState, WakeUpFlashOptions } from '@piano/core';

/** YIN-style pitch detection result. The mic-RMS-only path returns the
 *  same shape but with the previous pitch + conf reused. */
export interface PitchResult {
  pitch: number;
  conf: number;
  rms: number;
}

/** Slice of state mutated by this phase. Closed over (the legacy
 *  shell's `state` object), so changes flow back automatically.
 *
 *  Extends `WakeUpFlashState` because the wake-up flash trigger also
 *  receives this same `state` ref — the legacy shell merges the wake-
 *  up state's `inputFlash` field into the global `state` object at
 *  init. */
export interface MicPipelineState extends WakeUpFlashState {
  yinSkipCounter: number;
  cachedPitchResult: PitchResult;
  micSuspended: boolean;
  useSynesthesiaMode: boolean;
  smoothEnergy: number;
  flow: number;
  combo: number;
  lastNoteTimeMs: number;
}

/** Practice-mode flag bag — when `enabled`, `updatePractice` runs
 *  every frame regardless of the mic gating. */
export interface MicPipelinePracticeRef {
  enabled: boolean;
}

/** MIDI input ref — when a port is attached, the mic-derived note
 *  spawn is skipped entirely to avoid double-spawn / fight YIN's
 *  octave guesses. `lastEventTime` lingers as a field for telemetry
 *  but the gating used to read it with a 2 s window, which let
 *  mic-derived visuals slip in during gaps between presses; we now
 *  trust the attach/detach invariant in midi-ports.ts instead. */
export interface MicPipelineMidiRef {
  enabled: boolean;
  lastEventTime: number;
}

/** Note record the renderer reads via `midiState.activeNotes`. Mic-
 *  pipeline tags its entries `source: 'mic'` so the per-frame prune
 *  below can expire them after MIC_NOTE_TTL_MS (mic doesn't emit
 *  note-off events). MIDI-driven entries either omit the field or
 *  set it to 'midi'; they live until midi-handlers.ts removes them
 *  via the MIDI note-off / sustain-release path. */
export interface MicPipelineActiveNote {
  velocity: number;
  onTimeMs: number;
  synColor?: string | null;
  source?: 'mic' | 'midi';
}

/** Subset of midiState the mic-pipeline writes when it owns visuals.
 *  Same shape as the chord-window state — `applyOnsetToWindow`
 *  accepts it directly. */
export interface MicPipelineMidiState {
  activeNotes: Map<number, MicPipelineActiveNote>;
  recentOnsets: Array<{ midi: number; timeMs: number }>;
  lastChordName: string;
  lastChordTimeMs: number;
}

/** How long a mic-detected note stays in `activeNotes` after its last
 *  refresh. YIN runs every 3rd frame, so at 60 fps a sustained note
 *  refreshes ~20× per second. 300 ms is comfortably longer than a
 *  single YIN gap, and short enough that a released note clears the
 *  keyboard highlight within a few hundred ms of silence. */
export const MIC_NOTE_TTL_MS = 300;

/** Note descriptor returned by `freqToNote`. */
export interface NoteDescriptor {
  name: string;
  octave: number;
  noteNum: number;
  freq: number;
}

/** Theme — only `colors` is used (note ripple fallback). */
export interface MicPipelineTheme {
  colors: readonly string[];
}

/** Ripple ctor — the legacy shell's `Ripple = PianoCore.Ripple`. We
 *  only need the 4-arg new(). */
export type RippleCtor = new (x: number, y: number, color: string, size: number) => unknown;

/** Ripples bag — push-only here. */
export interface RipplesArray {
  push(r: unknown): void;
}

export interface MicPipelineDeps {
  // ─── Audio I/O ────────────────────────────────────────────────────
  analyser: AnalyserNode | null;
  audioCtx: { sampleRate: number };
  /** Time-domain sample buffer reused frame-to-frame. The
   *  `<ArrayBuffer>` generic matches what `new Float32Array(n)` returns
   *  in TS 5.7+ (it tightened the default ArrayBufferLike). */
  freqArray: Float32Array<ArrayBuffer>;

  // ─── Pure pipeline ────────────────────────────────────────────────
  detectPitchYIN: (data: Float32Array, sampleRate: number) => PitchResult;
  updateAGC: (timeMs: number, rms: number) => void;
  updateGameState: (timeMs: number, dt: number, pitchResult: PitchResult) => boolean;

  // ─── State refs ───────────────────────────────────────────────────
  state: MicPipelineState;
  practice: MicPipelinePracticeRef;
  midiInput: MicPipelineMidiRef;
  /** Shared midiState — mic-pipeline writes `activeNotes` entries
   *  (with TTL) + drives the chord-window detector when MIDI is
   *  off. Optional so existing test fixtures that don't care about
   *  the keyboard/beam/chord side effects can omit it. */
  midiState?: MicPipelineMidiState;
  /** PianoCore `applyOnsetToWindow`. Pure reducer over the same
   *  `recentOnsets / lastChordName / lastChordTimeMs` fields the
   *  MIDI handlers feed. When set together with midiState, the mic
   *  contributes onsets to chord detection too. Optional in tests. */
  applyOnsetToWindow?: (
    state: MicPipelineMidiState,
    midi: number,
    timeMs: number,
    opts: unknown
  ) => { emitted: string | null };
  /** Chord-window options bag (CONFIG.cwOpts). Opaque pass-through. */
  cwOpts?: unknown;

  // ─── DOM (mic meter, intro hint) ──────────────────────────────────
  micMeter: HTMLElement | null;
  micMeterFill: HTMLElement | null;
  introHint: HTMLElement | null;
  hideIntroHint: () => void;

  // ─── Practice tick (fallback path also calls this) ───────────────
  updatePractice: (timeMs: number, isGoodNote: boolean, pitch: number) => void;

  // ─── Note spawn (mic-driven only) ─────────────────────────────────
  freqToNote: (freq: number) => NoteDescriptor | null;
  getNoteColor: (noteName: string) => string | null | undefined;
  spawnBurst: (x: number, y: number, count: number, energy: number, overrideColor?: string) => void;
  spawnStream: (x: number, y: number, energy: number, overrideColor?: string) => void;
  ripples: RipplesArray;
  Ripple: RippleCtor;
  showNoteDisplay: (
    displayText: string,
    changeKey: string,
    color: string | null,
    timeMs: number
  ) => void;
  triggerWakeUpFlash: (state: WakeUpFlashState, opts: WakeUpFlashOptions) => void;
  wufOpts: WakeUpFlashOptions;

  // ─── Frame-time inputs ────────────────────────────────────────────
  theme: MicPipelineTheme;
  screen: { W: number; H: number };

  // ─── Tunables ─────────────────────────────────────────────────────
  config: {
    MIN_NOTE_INTERVAL_MS: number;
    PITCH_MIN_HZ: number;
    PIANO_KEY_MIN: number;
    PIANO_KEY_COUNT: number;
  };
}

/** 直近に描いたマイクメーター幅（%）— 同値スキップ用のモジュール状態。
 *  メーターは単一 DOM 要素なのでモジュールスコープで十分。 */
let lastMeterPct = -1;

/** Tick one frame's mic pipeline. Returns `{ isGoodNote }` so the
 *  caller can route follow-up work (e.g. hide intro hint, log).
 *
 *  Side effects (in order):
 *    - Mutates `state.yinSkipCounter`, `state.cachedPitchResult`,
 *      `state.lastNoteTimeMs`, plus everything `updateGameState` /
 *      `updateAGC` / `updatePractice` / `spawnBurst` / `spawnStream`
 *      mutate (smoothEnergy, flow, combo, particles[], ripples[]).
 *    - Updates `micMeterFill.style.width` when the mic-meter is
 *      visible.
 *    - Calls `hideIntroHint()` once on the first good note.
 *    - DOM-paints via `showNoteDisplay`. */
export function tickMicPipeline(
  timeMs: number,
  dt: number,
  deps: MicPipelineDeps
): { isGoodNote: boolean } {
  let isGoodNote = false;

  // Per-frame prune of mic-derived `activeNotes` entries. Mic doesn't
  // emit note-off, so each entry auto-expires after MIC_NOTE_TTL_MS
  // since its last refresh. Runs regardless of mic-suspended state so
  // a fresh MIDI attach (which suspends the mic) clears lingering mic
  // entries within one TTL window.
  if (deps.midiState) {
    deps.midiState.activeNotes.forEach((note, midi) => {
      if (note.source === 'mic' && timeMs - note.onTimeMs > MIC_NOTE_TTL_MS) {
        deps.midiState!.activeNotes.delete(midi);
      }
    });
  }

  // v13: Skip the entire mic processing pipeline when the mic is
  // suspended (MIDI is the active input). YIN, FFT consumption, AGC
  // and game-state updates are mic-derived; running them on a torn-
  // down stream wastes CPU and would also fight the MIDI-driven state.
  if (deps.analyser && !deps.state.micSuspended) {
    deps.analyser.getFloatTimeDomainData(deps.freqArray);

    // YIN throttle: full autocorrelation every 3rd frame, RMS-only
    // on the other two.
    let pitchResult: PitchResult;
    if (++deps.state.yinSkipCounter % 3 === 0) {
      pitchResult = deps.detectPitchYIN(deps.freqArray, deps.audioCtx.sampleRate);
      deps.state.cachedPitchResult = pitchResult;
    } else {
      let rms = 0;
      const len = deps.freqArray.length;
      for (let i = 0; i < len; i++) rms += deps.freqArray[i] * deps.freqArray[i];
      rms = Math.sqrt(rms / len);
      pitchResult = {
        pitch: deps.state.cachedPitchResult.pitch,
        conf: deps.state.cachedPitchResult.conf,
        rms,
      };
    }

    deps.updateAGC(timeMs, pitchResult.rms);

    // Mic level meter — visible feedback that audio is being captured.
    if (deps.micMeter && deps.micMeter.classList.contains('visible') && deps.micMeterFill) {
      // 1% 量子化 + 同値スキップ（flow ゲージと同パターン）— 毎フレームの
      // style.width 書き込みを実変化時のみに落とす。
      const lvlPct = Math.round(Math.min(1, pitchResult.rms * 25) * 100);
      if (lvlPct !== lastMeterPct) {
        lastMeterPct = lvlPct;
        deps.micMeterFill.style.width = lvlPct + '%';
      }
    }

    isGoodNote = deps.updateGameState(timeMs, dt, pitchResult);
    if (isGoodNote && deps.introHint && deps.introHint.classList.contains('visible')) {
      deps.hideIntroHint();
    }

    // v12: Practice mode tick (must run before particle work so flow
    // boost applies in the same frame).
    if (deps.practice.enabled) {
      deps.updatePractice(timeMs, isGoodNote, pitchResult.pitch);
    }

    // v13: When a MIDI keyboard is attached, MIDI events drive visuals
    // (polyphonic, velocity-aware). Skip the mic-derived single-pitch
    // path so we don't double-spawn or fight YIN's octave guesses.
    // Plain `enabled` check — the old "active within 2 s" window let
    // mic-derived visuals slip in during silent gaps between presses,
    // which is exactly when the user expects the visualization to be
    // quiet too.
    if (!deps.midiInput.enabled && isGoodNote && pitchResult.pitch > deps.config.PITCH_MIN_HZ) {
      const note = deps.freqToNote(pitchResult.pitch);
      if (note) {
        // v10: Synesthesia mode color.
        let noteColor: string | null = null;
        if (deps.state.useSynesthesiaMode) {
          noteColor = deps.getNoteColor(note.name) ?? null;
        }

        const noteX =
          ((note.noteNum - deps.config.PIANO_KEY_MIN) / deps.config.PIANO_KEY_COUNT) *
          deps.screen.W;
        const noteY = deps.screen.H * 0.45 + (Math.random() - 0.5) * deps.screen.H * 0.25;

        if (timeMs - deps.state.lastNoteTimeMs > deps.config.MIN_NOTE_INTERVAL_MS) {
          // v10: Bass notes (< 100Hz) get extra burst weight.
          const isBass = note.freq < 100;
          const bassBoost = isBass ? 1.5 : 1.0;

          const burstSize = Math.floor(
            (10 + deps.state.smoothEnergy * 25 + deps.state.flow * 0.2) * bassBoost
          );

          deps.spawnBurst(
            noteX,
            noteY,
            burstSize,
            deps.state.smoothEnergy * (1 + deps.state.flow * 0.02),
            noteColor ?? undefined
          );

          // v10: Ensure minimum ripple size + bass boost.
          const rippleSize =
            Math.max(200, 150 + deps.state.flow * 3 + deps.state.combo * 0.5) * bassBoost;

          // Use noteColor if active, else theme color.
          const rippleColor =
            noteColor || deps.theme.colors[note.noteNum % deps.theme.colors.length];
          deps.ripples.push(new deps.Ripple(noteX, noteY, rippleColor, rippleSize));

          deps.state.lastNoteTimeMs = timeMs;

          // Wake-up flash — clear confirmation at low flow.
          if (deps.state.flow < 10) deps.triggerWakeUpFlash(deps.state, deps.wufOpts);
        }
        deps.spawnStream(
          noteX,
          deps.screen.H * 0.65,
          deps.state.smoothEnergy,
          noteColor ?? undefined
        );

        deps.showNoteDisplay(note.name, note.name + note.octave, noteColor, timeMs);

        // Light up the virtual keyboard for the detected pitch + feed
        // the chord-window detector. Both used to only run for MIDI
        // input — leaving mic-only users with no key highlight and no
        // chord readout when they played arpeggios. The refresh of an
        // existing entry simply pushes `onTimeMs` forward, keeping the
        // TTL prune from expiring it during sustained playing.
        if (deps.midiState) {
          deps.midiState.activeNotes.set(note.noteNum, {
            // Mic doesn't expose true velocity. Map smoothEnergy
            // (already AGC-normalized to ~[0..1]) to a 1..127 range so
            // the beam width / keyboard highlight intensity reflects
            // loudness instead of always pegging to max.
            velocity: Math.max(1, Math.min(127, Math.round(deps.state.smoothEnergy * 127))),
            onTimeMs: timeMs,
            synColor: noteColor,
            source: 'mic',
          });
          if (deps.applyOnsetToWindow && deps.cwOpts !== undefined) {
            deps.applyOnsetToWindow(deps.midiState, note.noteNum, timeMs, deps.cwOpts);
          }
        }
      }
    }
  } else if (deps.practice.enabled) {
    // v13: MIDI-only practice — the mic isn't running, but the falling-
    // notes timeline (miss detection, section completion) must still
    // tick. Pass zero-valued mic inputs; MIDI matches happen out-of-band
    // in onMidiNoteOn.
    deps.updatePractice(timeMs, false, 0);
  }

  return { isGoodNote };
}
