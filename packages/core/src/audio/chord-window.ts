// Chord aggregation window — collects MIDI note-on events that arrive within
// a short tolerance (legacy: 80 ms) and emits a chord name at most once per
// fresh combination.
//
// The window is implemented as a sliding deque. On each onset:
//   1. Evict entries older than `windowMs` from the front.
//   2. Append the new onset to the back.
//   3. If the window now holds at least `minNotes`, ask the injected
//      `detectChord` to identify the simultaneity.
//   4. Emit the result iff it's a fresh chord, OR the same chord but the
//      `repeatCooldownMs` has elapsed since its last emission.
//
// The chord-name detector is injected (rather than imported here) because
// `audio/chord` is its own pure module with its own NOTE_NAMES / CHORD_DICT
// — keeping this reducer free of that table lets it test cleanly with a
// stub detector.
//
// Pure: no globals, no DOM. State is mutated in place to preserve the
// `recentOnsets` array reference (legacy app.js assigns it once at module
// init and the renderer expects identity).

export interface ChordWindowEvent {
  /** MIDI note number (0–127). */
  midi: number;
  /** Wall-clock ms when the onset arrived. */
  timeMs: number;
}

export interface ChordWindowState {
  /** Sliding deque of onsets currently inside the window. Oldest first. */
  recentOnsets: ChordWindowEvent[];
  /** Most recent chord name that was emitted; '' if none yet this session. */
  lastChordName: string;
  /** Wall-clock ms of the last emission. Used for the same-chord cooldown. */
  lastChordTimeMs: number;
}

export interface ChordWindowOptions {
  /** Onsets older than this many ms are evicted before detection. Legacy: 80. */
  windowMs: number;
  /** Minimum onsets the window must hold before detection runs. Legacy: 3. */
  minNotes: number;
  /** A repeat of the same chord name must wait this long to re-emit. The
   *  cooldown does not block a *different* chord — that emits immediately.
   *  Legacy: 600. */
  repeatCooldownMs: number;
  /** Injected pure chord identifier — typically `audio/chord.detectChord`.
   *  Returns the chord name (e.g. 'Cmaj7') or null when the simultaneity
   *  doesn't match a known chord. */
  detectChord: (midis: readonly number[]) => string | null;
}

export interface ChordWindowResult {
  /** The chord name to surface this tick, or null when nothing fresh
   *  emerged (window too small, no chord match, or repeat cooldown). */
  emitted: string | null;
}

/** Build a fresh state — empty deque, no prior chord. */
export function initChordWindowState(): ChordWindowState {
  return {
    recentOnsets: [],
    lastChordName: '',
    lastChordTimeMs: 0,
  };
}

/** Reset a populated state in place. Preserves the `recentOnsets` array
 *  reference so renderers caching it keep working. */
export function resetChordWindowState(state: ChordWindowState): void {
  state.recentOnsets.length = 0;
  state.lastChordName = '';
  state.lastChordTimeMs = 0;
}

/**
 * Apply one MIDI onset to the window. Mutates state in place. Returns
 * `{ emitted: string | null }`; the caller drives downstream UI (chord
 * label, glow effect) when `emitted` is non-null.
 */
export function applyOnsetToWindow(
  state: ChordWindowState,
  midi: number,
  timeMs: number,
  opts: ChordWindowOptions
): ChordWindowResult {
  const recents = state.recentOnsets;
  // Evict from the front (oldest first); array.shift() is O(n) but n is
  // tiny (rarely >5 — only what fits in 80ms of typing).
  while (recents.length > 0 && timeMs - recents[0].timeMs >= opts.windowMs) {
    recents.shift();
  }
  recents.push({ midi, timeMs });

  if (recents.length < opts.minNotes) {
    return { emitted: null };
  }

  const midis = recents.map((e) => e.midi);
  const chord = opts.detectChord(midis);
  if (!chord) {
    return { emitted: null };
  }

  // Same chord re-detected → require cooldown. Different chord → emit
  // immediately (the kid resolved the simultaneity into a new shape).
  if (chord === state.lastChordName && timeMs - state.lastChordTimeMs <= opts.repeatCooldownMs) {
    return { emitted: null };
  }

  state.lastChordName = chord;
  state.lastChordTimeMs = timeMs;
  return { emitted: chord };
}
