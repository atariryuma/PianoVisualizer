// OSMD-iterator note extractor — Phase 0c typed shell module.
//
// Walks the OSMD cursor's iterator once, producing a flat note array
// with per-note (midi, hand, timeSec, durSec, measureIdx,
// inBarQuarters) and tie metadata. Lives in packages/web/ because it
// directly touches the OSMD object graph; the timing primitives it
// uses (computeLeadingMeasureBpms / timeAtInBarQuarters) live in
// @piano/core where they're pure-testable.
//
// === Timing model ===
//
// We use the XML-derived measure timing (xmlMeasureTiming) as the
// source of truth when available — that's the only way to handle
// <metronome beat-unit> correctly and to honor mid-measure tempo
// changes. OSMD is only consulted for the iterator state (cursor step
// → measure mapping, in-bar offset).
//
// The OSMD `length.realValue` for each note is in WHOLE-NOTE units;
// that's a pure score-relative quantity (how many quarter notes the
// note occupies), independent of tempo. We multiply by the local
// quarter-BPM (from the XML tempo segment that contains this note) to
// get duration in seconds.
//
// When XML parsing fails entirely we fall back to OSMD's TempoInBPM.

import { computeLeadingMeasureBpms, mergeTiedNotes, timeAtInBarQuarters } from '@piano/core';
import type { MeasureTimingResult, ScoreTiming } from '@piano/core';

/** A single extracted note. */
export interface ExtractedNote {
  midi: number;
  hand: 'L' | 'R';
  timeSec: number;
  durSec: number;
  measureIdx: number;
  inBarQuarters: number;
  tieStart: boolean;
  tieEnd: boolean;
}

/** Per-extraction telemetry attached to the return when telemetry is on. */
export interface ExtractDiag {
  totalSteps: number;
  skippedNotes: number;
  tieReport: ReturnType<typeof mergeTiedNotes>;
}

export interface ExtractResult {
  notes: ExtractedNote[];
  measureStartSec: number[];
  measureBpm: number[];
  /** Optional telemetry — undefined (not null) so the field is omittable
   *  when collectDiag=false, and the diag-load consumer's
   *  `_diag?: DiagExtractInfo` typing accepts the result directly. */
  _diag?: ExtractDiag;
}

export interface ExtractOptions {
  /** XML-derived per-measure timing — when present + length matches
   *  OSMD's measure count, used as the source of truth (handles
   *  <metronome beat-unit> + mid-bar tempo changes). */
  xmlMeasureTiming?: MeasureTimingResult | null;
  /** Same coverage check as `xmlMeasureTiming` — both must be
   *  consistent with OSMD's measure count to enable the XML path. */
  scoreTiming?: ScoreTiming | null;
  /** Collect telemetry (totalSteps / skippedNotes / tieReport) into
   *  the `_diag` field. Default false; production keeps it off. */
  collectDiag?: boolean;
}

/** OSMD iterator surface — the few properties we actually read. The
 *  full OSMD types are wide and unstable across versions; we depend
 *  only on the legacy-tested subset. */
interface OsmdIteratorLike {
  endReached: boolean;
  CurrentMeasureIndex: number;
  currentTimeStamp: { realValue: number };
  CurrentVoiceEntries: ReadonlyArray<{
    parentSourceStaffEntry?: { parentStaff?: { idInMusicSheet?: number } };
    Notes?: ReadonlyArray<unknown>;
    notes?: ReadonlyArray<unknown>;
  }> | null;
  moveToNext(): void;
}

/** OSMD instance surface — same minimal-subset principle. */
interface OsmdLike {
  cursor: {
    iterator: OsmdIteratorLike;
    reset(): void;
  } | null;
  Sheet?: {
    SourceMeasures?: ReadonlyArray<{
      AbsoluteTimestamp?: { realValue: number };
      Duration?: { realValue: number };
      TempoInBPM?: number;
    }>;
  };
}

/** Read a note from OSMD's voice-entry note list. The shape varies
 *  across OSMD versions; we touch only the fields the legacy walker
 *  used. */
interface OsmdNoteLike {
  isRest?(): boolean;
  halfTone?: number;
  length?: { realValue: number };
  NoteTie?: OsmdTieLike;
  Tie?: OsmdTieLike;
  notetie?: OsmdTieLike;
}

interface OsmdTieLike {
  StartNote?: unknown;
  startNote?: unknown;
  EndNote?: unknown;
  endNote?: unknown;
}

/**
 * Walk OSMD's iterator once, producing the flat note timeline ready
 * for the practice-state engine. Tied notes are coalesced via
 * `mergeTiedNotes` before return.
 *
 * Safety: the outer loop has a 20,000-step counter so a misbehaving
 * iterator can't infinite-loop. Per-note try/catch increments
 * `skippedNotes` when an OSMD-version-specific shape mismatch throws.
 */
export function extractNotesFromOsmd(osmd: OsmdLike, opts: ExtractOptions = {}): ExtractResult {
  if (!osmd || !osmd.cursor) {
    return { notes: [], measureStartSec: [], measureBpm: [] };
  }

  const sourceMeasures = osmd.Sheet?.SourceMeasures ?? [];
  const measureCount = sourceMeasures.length;
  const measureStartSec = new Array<number>(measureCount).fill(0);
  const measureBpm = new Array<number>(measureCount).fill(72);
  const xmlMeasureTiming = opts.xmlMeasureTiming ?? null;
  const scoreTiming = opts.scoreTiming ?? null;
  const collectDiag = opts.collectDiag ?? false;

  const haveXml =
    !!xmlMeasureTiming &&
    !!scoreTiming &&
    xmlMeasureTiming.startSec.length === measureCount &&
    scoreTiming.measures.length === measureCount;

  if (haveXml) {
    const leadingBpms = computeLeadingMeasureBpms(scoreTiming!);
    for (let i = 0; i < measureCount; i++) {
      measureBpm[i] = leadingBpms[i];
      measureStartSec[i] = xmlMeasureTiming!.startSec[i];
    }
  } else {
    for (let i = 0; i < measureCount; i++) {
      const m = sourceMeasures[i];
      const bpm = m?.TempoInBPM || measureBpm[i - 1] || 72;
      measureBpm[i] = bpm;
      if (i > 0) {
        const prev = sourceMeasures[i - 1];
        const prevDurWhole = prev?.Duration?.realValue || 0.25;
        const prevDurSec = (prevDurWhole * 4 * 60) / measureBpm[i - 1];
        measureStartSec[i] = measureStartSec[i - 1] + prevDurSec;
      }
    }
  }

  const localTime = (
    measureIdx: number,
    inBarQuarters: number
  ): { offsetSec: number; localQBpm: number } => {
    if (!haveXml) {
      const bpm = measureBpm[measureIdx];
      return { offsetSec: (inBarQuarters * 60) / bpm, localQBpm: bpm };
    }
    return timeAtInBarQuarters(
      scoreTiming!.measures[measureIdx],
      measureBpm[measureIdx],
      inBarQuarters
    );
  };

  const notes: ExtractedNote[] = [];
  osmd.cursor.reset();
  const it = osmd.cursor.iterator;
  let cursorStep = 0;
  let skippedNotes = 0;

  while (!it.endReached && cursorStep < 20000) {
    try {
      const measureIdx = it.CurrentMeasureIndex;
      const measure = sourceMeasures[measureIdx];
      const measureStartTs = measure?.AbsoluteTimestamp?.realValue || 0;
      // OSMD timestamps are in WHOLE-NOTE units. Convert to quarter notes.
      const inBarQuarters = Math.max(0, it.currentTimeStamp.realValue - measureStartTs) * 4;
      const { offsetSec, localQBpm } = localTime(measureIdx, inBarQuarters);
      const timeSec = measureStartSec[measureIdx] + offsetSec;
      const voiceEntries = it.CurrentVoiceEntries;
      if (voiceEntries) {
        for (const ve of voiceEntries) {
          let hand: 'L' | 'R' | undefined;
          try {
            const idx = ve.parentSourceStaffEntry?.parentStaff?.idInMusicSheet;
            if (typeof idx === 'number') hand = idx === 0 ? 'R' : 'L';
          } catch {
            /* pitch fallback below */
          }
          const noteList: ReadonlyArray<unknown> = ve.Notes ?? ve.notes ?? [];
          for (const rawNote of noteList) {
            try {
              const note = rawNote as OsmdNoteLike;
              if (!note) continue;
              if (note.isRest && note.isRest()) continue;
              if (note.halfTone == null) continue;
              const midi = note.halfTone + 12;
              if (!hand) hand = midi >= 60 ? 'R' : 'L';
              const lengthQuarters = (note.length?.realValue ?? 0.25) * 4;
              const durSec = Math.max(0.05, (lengthQuarters * 60) / localQBpm);
              let tieStart = false;
              let tieEnd = false;
              try {
                const tie = note.NoteTie || note.Tie || note.notetie;
                if (tie) {
                  const isStart = tie.StartNote === rawNote || tie.startNote === rawNote;
                  const isEnd = tie.EndNote === rawNote || tie.endNote === rawNote;
                  if (isStart && !isEnd) tieStart = true;
                  else if (isEnd && !isStart) tieEnd = true;
                  else {
                    tieStart = true;
                    tieEnd = true;
                  }
                }
              } catch {
                /* OSMD version differences */
              }
              notes.push({
                midi,
                hand,
                timeSec,
                durSec,
                measureIdx,
                inBarQuarters,
                tieStart,
                tieEnd,
              });
            } catch {
              skippedNotes++;
            }
          }
        }
      }
    } catch {
      skippedNotes++;
    }
    try {
      it.moveToNext();
    } catch {
      break;
    }
    cursorStep++;
  }
  try {
    osmd.cursor.reset();
  } catch {
    /* ignore */
  }

  notes.sort((a, b) => a.timeSec - b.timeSec || a.midi - b.midi);

  if (skippedNotes > 0 && typeof console !== 'undefined') {
    console.warn('[OSMD] skipped ' + skippedNotes + ' unformattable note(s)');
  }

  // Coalesce tied notes so the kid doesn't have to re-strike a held pitch.
  const tieReport = mergeTiedNotes(notes, { collectSamples: collectDiag });

  return {
    notes,
    measureStartSec,
    measureBpm,
    ...(collectDiag ? { _diag: { totalSteps: cursorStep, skippedNotes, tieReport } } : {}),
  };
}
