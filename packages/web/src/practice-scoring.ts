// Practice-mode scoring + timing — Phase 0d batch 36.
//
// Five concerns the practice flow uses every time the kid presses a
// key (or fails to):
//
//   1. medianRecentPitch() — neutralizes YIN's single-frame octave
//      errors at the moment of onset by taking the median of the
//      recent high-confidence pitches the mic-pipeline accumulates.
//
//   2. matchNoteOnset(detectedMidi, isExact) — the funnel point for
//      both mic onsets (isExact=false) and MIDI presses (isExact=true).
//      STRICT match: only the currentNoteIdx (the very next expected
//      note) is considered. Wrong-note → MISS rather than skipping
//      ahead in the score and accidentally crediting a same-pitch-
//      class note further along the timeline. Chord cluster matching
//      (notes within ±CHORD_MATE_TOLERANCE_MS of cur) lets the kid
//      play chord notes in any order without strict left-to-right
//      bias.
//
//   3. finalizeNoteHold(detectedMidi) — rhythm-mode only. On key
//      release, compare the physical hold time to the written
//      durMs; score = 1 at exact, 0 at full tolerance off. Guided
//      mode freezes the cursor on the current note so there's no
//      audio clock to compare against — finalize is a no-op.
//
//   4. practiceRealElapsedMs() — sample-accurate audio time. Uses
//      Tone.context.currentTime (NOT Tone.now() — that includes
//      lookAhead and would shift the visual countdown ahead of the
//      audible beeps). Offsets by audioOffsetMs ≈ outputLatency so
//      an on-the-beat press judges PERFECT.
//
//   5. practiceElapsedMs() — guided-mode aware time. Real time during
//      count-in so the 4-3-2-1 animates; after count-in, frozen at
//      the current note's timeMs so the lane parks the next-up note
//      at the hit line waiting for the kid. Rhythm/listen always use
//      real time (the song moves on its own).

/** Subset of the shell `state` we read/write. */
export interface PracticeScoringStateRef {
  /** Mic-onset pitch ring buffer the median walks. */
  recentPitches?: number[];
  flow: number;
  combo: number;
  bestCombo: number;
}

/** A single note in the section timeline. Same fields the legacy
 *  OsmdLikeNote carries with the resolution flags the practice loop
 *  mutates. */
export interface PracticeNote {
  midi: number;
  hand?: string;
  timeMs?: number;
  durMs?: number;
  measureIdx?: number;
  inBarQuarters?: number;
  hit?: boolean;
  missed?: boolean;
  holdStartMs?: number;
  _filtered?: boolean;
}

/** Subset of the practice ref the scoring functions mutate. */
export interface PracticeScoringRef {
  enabled: boolean;
  mode: 'guided' | 'rhythm' | 'listen';
  sectionNotes: PracticeNote[];
  currentNoteIdx: number;
  hits: number;
  sectionCombo: number;
  sectionBestCombo: number;
  timingScoreSum: number;
  durationScoreSum: number;
  durationScoredCount: number;
  pendingHolds: Map<number, PracticeNote>;
  startAudioTime: number;
  audioOffsetMs?: number | null;
}

/** Tunables — passed in so the scoring is testable without pulling
 *  the whole CONFIG bag. Default values match the legacy CONFIG. */
export interface PracticeScoringTuning {
  hitWindowEarlyMs: number;
  hitWindowMs: number;
  perfectMs: number;
  chordMateToleranceMs: number;
  durationMinTolMs: number;
  durationTolFraction: number;
  countInMs: number;
}

/** Subset of the Tone surface practiceRealElapsedMs reads. */
export interface PracticeScoringToneRef {
  context?: { currentTime: number };
}

export interface PracticeScoringDeps {
  state: PracticeScoringStateRef;
  practice: PracticeScoringRef;
  tuning: PracticeScoringTuning;
  /** Pass `Tone` (the npm package / global). Undefined when Tone
   *  isn't loaded — fall back to performance.now() relative to
   *  startAudioTime treated as ms-from-epoch. */
  Tone: PracticeScoringToneRef | undefined;

  /** Visual feedback hooks. */
  showHitChip: (kind: string, text: string) => void;
  spawnBurst: (x: number, y: number, count: number, energy: number) => void;
  /** Read fresh each call — the canvas could resize mid-section. */
  getScreen: () => { W: number; H: number };

  /** Bilingual translator. Reads 'youPlayedFmt', 'perfect', 'nice',
   *  'tooShort', 'tooLong'. */
  t: (key: string, vars?: Record<string, string>) => string;
  /** MIDI number → display name (e.g. 'C4'). */
  midiToName: (midi: number) => string;
  /** Diagnostic logger — receives one-line strings. Defaults to a
   *  no-op when omitted. */
  remoteLog?: (line: string) => void;
}

export interface PracticeScoring {
  medianRecentPitch(): number;
  /** Returns true on a hit (any chord mate match), false on miss. */
  matchNoteOnset(detectedMidi: number, isExact: boolean): boolean;
  /** Rhythm-mode duration scoring on key release. */
  finalizeNoteHold(detectedMidi: number): void;
  /** Sample-accurate audio time, offset-corrected. */
  practiceRealElapsedMs(): number;
  /** Guided-mode-aware elapsed (frozen at current note in guided
   *  past count-in). Used by the lane drawer + matchNoteOnset itself. */
  practiceElapsedMs(): number;
}

export function createPracticeScoring(deps: PracticeScoringDeps): PracticeScoring {
  const log = deps.remoteLog ?? ((_l: string) => {});

  function medianRecentPitch(): number {
    const arr = deps.state.recentPitches;
    if (!arr || arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function practiceRealElapsedMs(): number {
    const tone = deps.Tone;
    const raw = tone?.context
      ? (tone.context.currentTime - deps.practice.startAudioTime) * 1000
      : performance.now() - deps.practice.startAudioTime * 1000;
    return raw - (deps.practice.audioOffsetMs || 0);
  }

  function practiceElapsedMs(): number {
    const realElapsed = practiceRealElapsedMs();
    if (deps.practice.mode === 'guided') {
      if (realElapsed < deps.tuning.countInMs) return realElapsed;
      const cur = deps.practice.sectionNotes[deps.practice.currentNoteIdx];
      return cur && cur.timeMs != null ? cur.timeMs : deps.tuning.countInMs;
    }
    return realElapsed;
  }

  function matchNoteOnset(detectedMidi: number, isExact: boolean): boolean {
    if (!deps.practice.enabled) return false;
    // Listen mode: the song plays itself, the kid is just watching/
    // listening. Don't judge or score; let any incidental key-presses
    // create free-play visuals (handled outside this function).
    if (deps.practice.mode === 'listen') return false;

    const elapsed = practiceElapsedMs();
    const notes = deps.practice.sectionNotes;
    // Eagerly skip past any already-resolved notes. The per-frame
    // skip-past loop normally advances currentNoteIdx, but a chord
    // played within a single frame would otherwise leave subsequent
    // presses pointing at the already-hit cur and drop them silently.
    let idx = deps.practice.currentNoteIdx;
    while (idx < notes.length && (notes[idx].hit || notes[idx].missed)) idx++;
    deps.practice.currentNoteIdx = idx;
    if (idx >= notes.length) return false;
    const cur = notes[idx];
    if (!cur || cur.timeMs == null) return false;

    const dtSigned = elapsed - cur.timeMs; // +late, -early
    // Guided has no late ceiling — the note waits — but blocks early
    // presses so count-in taps don't pre-credit a hit.
    const inWindow =
      deps.practice.mode === 'guided'
        ? dtSigned >= -deps.tuning.hitWindowEarlyMs
        : dtSigned >= -deps.tuning.hitWindowEarlyMs && dtSigned <= deps.tuning.hitWindowMs;

    // Find the played note inside the current chord cluster (cur and
    // any simultaneous notes within ±CHORD_MATE_TOLERANCE_MS). Order
    // within a chord is free — but each note must be physically
    // pressed (no auto-credit).
    let matched: PracticeNote | null = null;
    if (inWindow) {
      if (cur.midi === detectedMidi) {
        matched = cur;
      } else {
        for (let i = idx + 1; i < notes.length; i++) {
          const m = notes[i];
          if (m.timeMs == null) break;
          const diff = m.timeMs - cur.timeMs;
          if (diff > deps.tuning.chordMateToleranceMs) break;
          if (m.hit || m.missed) continue;
          if (m.midi === detectedMidi) {
            matched = m;
            break;
          }
        }
      }
    }

    log(
      '[Match] in=' +
        detectedMidi +
        (isExact ? ' (midi)' : ' (mic)') +
        ' expected=' +
        cur.midi +
        '@' +
        Math.round((cur.timeMs ?? 0) - elapsed) +
        'ms' +
        ' mode=' +
        deps.practice.mode +
        ' result=' +
        (matched ? (matched === cur ? 'HIT' : 'HIT(chord-mate)') : 'wrong-note')
    );

    if (!matched) {
      if (deps.practice.mode === 'guided') {
        deps.showHitChip('miss', deps.t('youPlayedFmt', { v: deps.midiToName(detectedMidi) }));
      }
      return false;
    }

    const dtSignedMatched = elapsed - (matched.timeMs ?? 0);
    const dt = Math.abs(dtSignedMatched);
    matched.hit = true;
    matched.holdStartMs = performance.now();
    deps.practice.pendingHolds.set(detectedMidi, matched);
    deps.practice.hits++;
    deps.practice.sectionCombo++;
    if (deps.practice.sectionCombo > deps.practice.sectionBestCombo) {
      deps.practice.sectionBestCombo = deps.practice.sectionCombo;
    }
    // Guided mode: every onset is "perfect" (timing not graded).
    // Rhythm mode: score linearly, but use the asymmetric window so
    // an early press is judged against the smaller early window
    // (steeper penalty).
    const window = dtSignedMatched < 0 ? deps.tuning.hitWindowEarlyMs : deps.tuning.hitWindowMs;
    const ts = deps.practice.mode === 'guided' ? 1 : Math.max(0, 1 - dt / window);
    deps.practice.timingScoreSum += ts;
    const isPerfect = deps.practice.mode === 'guided' || dt < deps.tuning.perfectMs;
    deps.showHitChip(
      isPerfect ? 'perfect' : 'good',
      isPerfect ? deps.t('perfect') : deps.t('nice')
    );
    deps.state.flow = Math.min(100, deps.state.flow + 6 + ts * 4);
    deps.state.combo++;
    if (deps.state.combo > deps.state.bestCombo) deps.state.bestCombo = deps.state.combo;
    const screen = deps.getScreen();
    deps.spawnBurst(screen.W * 0.5, screen.H * 0.55, 8, 0.7 + ts * 0.5);
    // OSMD cursor advancement is driven by the per-frame skip-past
    // loop in updatePracticeFrame.
    return true;
  }

  function finalizeNoteHold(detectedMidi: number): void {
    const matched = deps.practice.pendingHolds.get(detectedMidi);
    if (!matched) return;
    deps.practice.pendingHolds.delete(detectedMidi);
    if (deps.practice.mode !== 'rhythm') return;
    if (!matched.holdStartMs || !matched.durMs) return;
    const heldMs = performance.now() - matched.holdStartMs;
    const expected = matched.durMs;
    const tol = Math.max(deps.tuning.durationMinTolMs, expected * deps.tuning.durationTolFraction);
    const score = Math.max(0, 1 - Math.abs(heldMs - expected) / tol);
    deps.practice.durationScoreSum += score;
    deps.practice.durationScoredCount++;
    if (score < 0.4) {
      deps.showHitChip('miss', heldMs < expected ? deps.t('tooShort') : deps.t('tooLong'));
    }
  }

  return {
    medianRecentPitch,
    matchNoteOnset,
    finalizeNoteHold,
    practiceRealElapsedMs,
    practiceElapsedMs,
  };
}
