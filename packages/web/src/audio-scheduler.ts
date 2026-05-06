// Audio scheduler — Tone.js timeline + count-in scheduling, lifted out
// of legacy-app.js as a typed shell module (Phase 0c).
//
// Lives under packages/web/src/ rather than @piano/core because it
// directly touches the Tone.js Transport — that's a web-only dep
// (the future Capacitor build will also use it via the Vite bundle,
// but it's not platform-agnostic in the way @piano/core is).
//
// The scheduler doesn't own any Tone state itself; the caller passes
// in the synth/sampler instances it has already created. This keeps
// the module purely about "given these instruments and these notes,
// fire Tone.Transport.schedule the right way" — which is what the
// type-checker can guard.

import * as Tone from 'tone';

/** Minimal Tone instrument shape — abstract enough that a Synth, a
 *  Sampler, or a test stub all satisfy it. The actual Tone classes
 *  have wider surfaces; we only depend on triggerAttackRelease. */
export interface ToneInstrument {
  triggerAttackRelease(noteOrFreq: number | string, duration: number | string, time: number): void;
}

/** Instrument handles the scheduler relies on. Either may be null when
 *  the audio context didn't initialize (mic-only mode, headless test,
 *  embedded WebView without Web Audio) — the scheduler no-ops gracefully
 *  in those cases. */
export interface AudioSchedulerDeps {
  /** Click synth used for count-in beeps + practice metronome. */
  metronome: ToneInstrument | null;
  /** Sampler used for ghost-piano playback in Listen / rhythm-with-ghost. */
  piano: ToneInstrument | null;
}

export interface CountInOptions {
  /** Total count-in duration (ms). The "GO!" beep lands at this offset. */
  countInMs: number;
  /** Number of click beats inside the count-in. Legacy default: 4. */
  beats: number;
}

/**
 * Schedule the count-in: `beats` low-pitched clicks (660 Hz) at evenly
 * spaced positions starting from `startAudioTime`, plus a single high-
 * pitched (990 Hz) "GO!" beep at `startAudioTime + countInMs/1000`.
 *
 * No-op when `deps.metronome` is null. Wraps the schedule calls in a
 * try/catch — Tone occasionally throws when the AudioContext is
 * suspended at the moment of scheduling and a robust no-op is more
 * useful than a crashed practice mode.
 */
export function scheduleCountInBeeps(
  deps: AudioSchedulerDeps,
  startAudioTime: number,
  opts: CountInOptions
): void {
  if (!deps.metronome) return;
  const beatSec = opts.countInMs / opts.beats / 1000;
  try {
    for (let i = 0; i < opts.beats; i++) {
      deps.metronome.triggerAttackRelease(660, 0.05, startAudioTime + i * beatSec);
    }
    deps.metronome.triggerAttackRelease(990, 0.08, startAudioTime + opts.countInMs / 1000);
  } catch {
    // Suspended AudioContext, instrument disposed mid-schedule, etc.
    // Practice still works — the kid loses the count-in click but the
    // section starts on time.
  }
}

/** A note for ghost-piano playback — only the timing-relevant fields. */
export interface SchedulerNote {
  midi: number;
  /** Onset relative to Transport=0, in ms. */
  timeMs: number;
  /** Sustained duration in ms. */
  durMs: number;
}

export interface SectionPlaybackOptions {
  /** The section's notes. Pass an empty array to skip ghost scheduling
   *  entirely (e.g. rhythm mode with ghost OFF). */
  notes: ReadonlyArray<SchedulerNote>;
  /** When true, schedule the practice metronome (3-beat strong / weak
   *  pattern) starting after the count-in window. */
  metronomeOn: boolean;
  /** Beat duration in ms at the user's chosen tempoPct. */
  beatMs: number;
  /** Count-in duration in ms — the practice metronome starts after this
   *  offset so it doesn't double up with the count-in clicks. */
  countInMs: number;
}

/**
 * Schedule the rhythm- / listen-mode timeline on Tone.Transport. The
 * caller is responsible for `Tone.Transport.start(startAudioTime)`
 * afterward — this function only enqueues; it doesn't transport-start
 * (decoupling lets the caller choose between absolute and relative
 * start times).
 *
 * Ghost playback is gated by `deps.piano` non-null AND `notes.length`
 * > 0. The metronome side is gated by `opts.metronomeOn` AND
 * `deps.metronome` non-null.
 */
export function scheduleSectionPlayback(
  deps: AudioSchedulerDeps,
  opts: SectionPlaybackOptions
): void {
  if (deps.piano && opts.notes.length > 0) {
    const piano = deps.piano;
    for (const n of opts.notes) {
      const dur = Math.max(0.1, (n.durMs / 1000) * 0.85);
      Tone.Transport.schedule((time) => {
        piano.triggerAttackRelease(midiToFreq(n.midi), dur, time);
      }, n.timeMs / 1000);
    }
  }
  if (opts.metronomeOn && deps.metronome && opts.notes.length > 0) {
    const metronome = deps.metronome;
    const last = opts.notes[opts.notes.length - 1];
    const totalMs = last.timeMs + last.durMs + 1000;
    for (let t = opts.countInMs, beat = 0; t < totalMs; t += opts.beatMs, beat++) {
      const freq = beat % 3 === 0 ? 880 : 660;
      Tone.Transport.schedule((time) => {
        metronome.triggerAttackRelease(freq, 0.04, time);
      }, t / 1000);
    }
  }
}

/** A4 = 440 Hz = MIDI 69. Inlined here so the scheduler doesn't have
 *  to reach back into legacy-app.js for the helper. */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
