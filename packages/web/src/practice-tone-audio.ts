// Practice-mode Tone.js audio — Phase 0d batch 33.
//
// Three concerns wrapping the Tone.js Transport + the two synths
// the practice flow uses:
//
//   1. ensureInstruments() — lazy-instantiate the PolySynth (ghost
//      piano playback for listen/rhythm modes) and MembraneSynth
//      (count-in metronome). Idempotent: subsequent calls reuse the
//      cached instances. Tunings (oscillator type, envelope, volume)
//      mirror the legacy values; changing them needs an A/B against
//      a real iPad to stay kid-friendly.
//
//   2. scheduleCountInBeeps(startAudioTime) — delegates to
//      AudioScheduler.scheduleCountInBeeps, packing the lazy synths
//      into the deps bag. Used by startPracticeSection's count-in.
//
//   3. stopPracticeAudio() — Transport.stop + Transport.cancel +
//      cursor.hide + clearHighlights. Called from the section-stop
//      paths (quit, restart, completion) so a paused/ended section
//      doesn't leave a stale highlighted note glowing.
//
// The synth instances stay live across sections (creating a
// PolySynth + MembraneSynth has measurable startup cost on iPad) so
// the factory holds them in closure state. `getInstruments()` exposes
// them so other shell code (startPracticeSection's
// scheduleSectionPlayback call) can hand them to the audio-scheduler.

/** Subset of the Tone.js surface we touch. Pass `Tone` directly
 *  (the npm import / global) in production, or a mock in tests. */
export interface ToneLibRef {
  PolySynth: new (voice: ToneSynthCtor, opts?: ToneSynthOptions) => ToneInstrument;
  Synth: ToneSynthCtor;
  MembraneSynth: new (opts?: ToneMembraneOptions) => ToneInstrument;
  Transport: {
    stop(): void;
    cancel(): void;
  };
}

export type ToneSynthCtor = any;

export type ToneSynthOptions = any;

export type ToneMembraneOptions = any;

/** Minimal instrument surface — covers the ctor methods we use here
 *  (`toDestination`, `volume`) plus `triggerAttackRelease` so the
 *  same instance can be handed to AudioScheduler.scheduleSectionPlayback
 *  without a wider `as any` cast. The AudioScheduler module declares
 *  its own ToneInstrument with the same shape; keeping them
 *  structurally compatible avoids the cross-module mismatch.
 *
 *  // eslint-disable-next-line @typescript-eslint/no-explicit-any */
export interface ToneInstrument {
  toDestination(): ToneInstrument;
  volume: { value: number };

  triggerAttackRelease(...args: any[]): unknown;
}

/** Practice-tone-audio's view of the AudioScheduler module. */
export interface AudioSchedulerRef {
  scheduleCountInBeeps(
    instruments: { metronome: ToneInstrument | null; piano: ToneInstrument | null },
    startAudioTime: number,
    opts: { countInMs: number; beats: number }
  ): void;
}

/** Cursor surface stopPracticeAudio touches. Matches the
 *  hideCursor + clearHighlights subset of OsmdAdapter. */
export interface PracticeAudioCursor {
  hideCursor(): void;
  clearHighlights(): void;
}

export interface PracticeToneAudioDeps {
  /** Pass `Tone` (the npm package / global). Undefined when Tone
   *  isn't available (test envs / boot-before-load) — every method
   *  no-ops gracefully. */
  Tone: ToneLibRef | undefined;
  /** AudioScheduler module surface. Pulled in via deps so the shell
   *  can hand its existing import. */
  audioScheduler: AudioSchedulerRef;
  /** OSMD cursor adapter — only hideCursor + clearHighlights are
   *  used here (stop path). */
  cursor: PracticeAudioCursor;
  /** Read at call time so a tempo change between section starts
   *  uses the fresh count-in length. */
  getCountInMs: () => number;
  /** Beats per count-in. Default 4 ("4, 3, 2, 1, GO!"). */
  beats?: number;
}

export interface PracticeToneAudio {
  /** Idempotently build the PolySynth + MembraneSynth pair. */
  ensureInstruments(): void;
  /** Schedule the audible "4, 3, 2, 1, GO!" preceding section start. */
  scheduleCountIn(startAudioTime: number): void;
  /** Tone.Transport stop + cancel, hide cursor + clear notehead
   *  highlights. */
  stopPracticeAudio(): void;
  /** Read-only access to the lazy-built instruments. The shell hands
   *  these to AudioScheduler.scheduleSectionPlayback. */
  getInstruments(): { piano: ToneInstrument | null; metronome: ToneInstrument | null };
}

const DEFAULT_BEATS = 4;

export function createPracticeToneAudio(deps: PracticeToneAudioDeps): PracticeToneAudio {
  let piano: ToneInstrument | null = null;
  let metronome: ToneInstrument | null = null;
  const beats = deps.beats ?? DEFAULT_BEATS;

  function ensureInstruments(): void {
    if (piano || !deps.Tone) return;
    piano = new deps.Tone.PolySynth(deps.Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.25, release: 0.6 },
    }).toDestination();
    piano.volume.value = -14;
    metronome = new deps.Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
    }).toDestination();
    metronome.volume.value = -10;
  }

  function scheduleCountIn(startAudioTime: number): void {
    if (!deps.Tone) return;
    deps.audioScheduler.scheduleCountInBeeps({ metronome, piano }, startAudioTime, {
      countInMs: deps.getCountInMs(),
      beats,
    });
  }

  function stopPracticeAudio(): void {
    try {
      if (deps.Tone) {
        deps.Tone.Transport.stop();
        deps.Tone.Transport.cancel();
      }
    } catch {
      /* Transport.stop can throw on a never-started Transport */
    }
    deps.cursor.hideCursor();
    // Drop the active notehead pink so a paused/ended section
    // doesn't leave a stale highlighted note glowing in the score.
    deps.cursor.clearHighlights();
  }

  return {
    ensureInstruments,
    scheduleCountIn,
    stopPracticeAudio,
    getInstruments: () => ({ piano, metronome }),
  };
}
