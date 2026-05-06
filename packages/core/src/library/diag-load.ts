// Comprehensive load-time DIAG dump for the file → notes pipeline:
//
//   MusicXML
//     → parseScoreTimingFromXml      — raw XML model
//     → buildMeasureTimingFromXml    — per-measure (start, dur) sec
//     → extractNotesFromOsmd         — OSMD-iterator-driven extract
//     → mergeTiedNotes               — tie coalesce
//     → parsePlaybackOrderFromXml    — repeat / D.C. / volta unfold
//     → expandNotesByPlaybackOrder   — final note timeline
//     → buildSectionsFromDefs        — section windows
//
// Each transformation gets its own DIAG line so we can pinpoint exactly
// where a note is dropped, mis-timed, or hand-mis-assigned. Shell calls
// it once per song-load when REMOTE_LOG_ENABLED is on.
//
// Pure: takes a payload + log function, no globals. The log fn is
// injected so the legacy shell (remoteLog) and tests (a recording
// stub) can both drive it.

import type { ScoreTiming } from './score-timing';
import type { MergeTiedSample } from './merge-tied-notes';

/** Section window from `buildSectionsFromDefs`. */
export interface DiagSection {
  id: string;
  startSec: number;
  endSec: number;
  isBoss?: boolean;
}

/** Song record subset the diag dump consumes. */
export interface DiagSong {
  id: string;
  _isUser?: boolean;
  bpm?: number;
  _bpmRescaled?: boolean;
  sections: ReadonlyArray<DiagSection>;
}

/** Per-extraction telemetry attached to extractNotesFromOsmd's return. */
export interface DiagExtractInfo {
  totalSteps?: number;
  skippedNotes?: number;
  tieReport?: { merged: number; samples: MergeTiedSample[] };
}

/** Note shape consumed by the diag dump (timeline + per-section bucket). */
export interface DiagNote {
  midi: number;
  hand: 'L' | 'R' | string;
  timeSec: number;
  durSec: number;
  measureIdx: number;
  inBarQuarters?: number;
  cursorJump?: number | null;
}

export interface DiagPayload {
  song: DiagSong;
  extractRet: { _diag?: DiagExtractInfo } | undefined;
  scoreTiming: ScoreTiming | null;
  /** OSMD-shaped measure list — only `length` is used at the top
   *  level; the per-measure dump reads from `scoreTiming.measures`. */
  measures: ReadonlyArray<unknown>;
  expanded: ReadonlyArray<DiagNote>;
  baseNotes: ReadonlyArray<unknown>;
  measureStartSec: ReadonlyArray<number>;
  measureBpm: ReadonlyArray<number>;
  order: ReadonlyArray<number>;
  totalSec: number;
}

/** Logger function — `console.log`, `remoteLog`, or a recording stub. */
export type DiagLogger = (line: string) => void;

/**
 * Emit the full load-time DIAG dump. Wraps each section in a try/catch
 * so a throw in one block (e.g. corrupt note metadata in section 2)
 * doesn't suppress the rest of the dump.
 */
export function dumpLoadDiagnostics(payload: DiagPayload, log: DiagLogger): void {
  const { song, expanded, scoreTiming, measures, measureStartSec, measureBpm } = payload;
  const ext = payload.extractRet?._diag ?? {};
  const tieReport = ext.tieReport ?? { merged: 0, samples: [] as MergeTiedSample[] };

  const safeSection = (label: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      log('[DIAG/' + label + '] EXCEPTION: ' + ((e as Error)?.message ?? String(e)));
    }
  };

  // ---------- 1. song-level summary ----------
  safeSection('song', () => {
    const handCounts = expanded.reduce<Record<string, number>>((c, n) => {
      c[n.hand] = (c[n.hand] || 0) + 1;
      return c;
    }, {});
    const midiRange = expanded.reduce(
      (r, n) => {
        if (n.midi < r.lo) r.lo = n.midi;
        if (n.midi > r.hi) r.hi = n.midi;
        return r;
      },
      { lo: 200, hi: 0 }
    );
    const repeatDelta = payload.order.length - measures.length;
    log(
      '[DIAG/song] id=' +
        song.id +
        ' src=' +
        (song._isUser ? 'user' : 'bundled') +
        ' measures=' +
        measures.length +
        ' osmdSteps=' +
        ext.totalSteps +
        ' baseNotes=' +
        payload.baseNotes.length +
        ' expanded=' +
        expanded.length +
        ' R=' +
        (handCounts.R || 0) +
        ' L=' +
        (handCounts.L || 0) +
        ' midi=' +
        midiRange.lo +
        '..' +
        midiRange.hi +
        ' totalSec=' +
        payload.totalSec.toFixed(2) +
        ' bpm=' +
        (song.bpm || 0).toFixed(2) +
        ' bpmSrc=' +
        (scoreTiming?.leadingSource || 'osmd') +
        ' bpmRescaled=' +
        (song._bpmRescaled === true) +
        ' repeats=' +
        (repeatDelta > 0 ? '+' + repeatDelta : repeatDelta) +
        ' tied=' +
        tieReport.merged +
        ' skipped=' +
        (ext.skippedNotes || 0)
    );
  });

  // ---------- 2. per-measure layout ----------
  // First 8 measures + every measure with a tempo change + last measure.
  safeSection('measure', () => {
    const tempoChanges = new Set<number>();
    if (scoreTiming) {
      let prevQ = scoreTiming.leadingQuarterBpm;
      for (let i = 0; i < scoreTiming.measures.length; i++) {
        const evs = scoreTiming.measures[i].tempoEvents || [];
        for (const ev of evs) {
          if (Math.abs(ev.qBpm - prevQ) > 0.01) tempoChanges.add(i);
          prevQ = ev.qBpm;
        }
      }
    }
    const measureSamples = new Set<number>();
    for (let i = 0; i < Math.min(8, measures.length); i++) measureSamples.add(i);
    tempoChanges.forEach((i) => measureSamples.add(i));
    if (measures.length > 0) measureSamples.add(measures.length - 1);
    const sortedMeasures = Array.from(measureSamples).sort((a, b) => a - b);

    // Pre-tally note counts per measure once. The previous in-loop
    // expanded.filter was O(measures × notes) — for la Campanella
    // that's 168 × 3000 = 500k iterations on every song-load.
    const notesByMeasure = new Map<number, number>();
    for (const n of expanded) {
      notesByMeasure.set(n.measureIdx, (notesByMeasure.get(n.measureIdx) || 0) + 1);
    }
    for (const i of sortedMeasures) {
      const sm = scoreTiming?.measures?.[i];
      const evs = sm?.tempoEvents?.length
        ? ' tempo=[' + sm.tempoEvents.map((e) => Number(e.qBpm).toFixed(1)).join(',') + ']'
        : '';
      const notesInM = notesByMeasure.get(i) || 0;
      log(
        '[DIAG/measure] m=' +
          i +
          ' start=' +
          (measureStartSec[i] || 0).toFixed(3) +
          's' +
          ' bpm=' +
          (measureBpm[i] || 0).toFixed(1) +
          (sm
            ? ' div=' +
              sm.divisions +
              ' time=' +
              sm.timeSig.beats +
              '/' +
              sm.timeSig.beatType +
              (sm.implicit ? ' impl' : '') +
              ' nominalDiv=' +
              sm.durationDiv +
              ' actualDiv=' +
              sm.actualDiv
            : '') +
          ' notes=' +
          notesInM +
          evs
      );
    }
  });

  // ---------- 3. note timeline (first 12 + last 4) ----------
  safeSection('note', () => {
    const fmtNote = (n: DiagNote, i: number): string =>
      'idx=' +
      i +
      ' t=' +
      n.timeSec.toFixed(3) +
      ' dur=' +
      n.durSec.toFixed(3) +
      ' midi=' +
      n.midi +
      ' ' +
      n.hand +
      ' m=' +
      n.measureIdx +
      ' q=' +
      (n.inBarQuarters ?? 0).toFixed(2) +
      (n.cursorJump != null ? ' jump→m=' + n.cursorJump : '');
    const head = Math.min(12, expanded.length);
    for (let i = 0; i < head; i++) {
      log('[DIAG/note] ' + fmtNote(expanded[i], i));
    }
    if (expanded.length > head + 4) {
      log('[DIAG/note] ... (' + (expanded.length - head - 4) + ' notes elided) ...');
    }
    for (let i = Math.max(head, expanded.length - 4); i < expanded.length; i++) {
      log('[DIAG/note] ' + fmtNote(expanded[i], i));
    }
  });

  // ---------- 4. tie merge report ----------
  safeSection('tie', () => {
    if (!tieReport.samples || !tieReport.samples.length) return;
    for (const s of tieReport.samples) {
      log(
        '[DIAG/tie] midi=' +
          s.midi +
          ' ' +
          s.hand +
          ' m=' +
          s.m +
          ' t=' +
          s.t0 +
          ' chain=' +
          s.chain +
          ' dur=' +
          s.durBefore +
          '->' +
          s.durAfter +
          's'
      );
    }
    if (tieReport.merged > tieReport.samples.length) {
      log(
        '[DIAG/tie] ... (' +
          (tieReport.merged - tieReport.samples.length) +
          ' more ties merged, not shown)'
      );
    }
  });

  // ---------- 5. sections ----------
  // `expanded` is already sorted by timeSec, so a single linear sweep
  // with a section cursor classifies every note in O(N + S). The
  // earlier per-section filter was O(S × N) and the even-earlier
  // per-note scan was O(N × S).
  safeSection('section', () => {
    const sectionBuckets: Array<{ count: number; first: DiagNote | null; last: DiagNote | null }> =
      song.sections.map(() => ({ count: 0, first: null, last: null }));
    let secIdx = 0;
    for (const n of expanded) {
      while (secIdx < song.sections.length && n.timeSec >= song.sections[secIdx].endSec) {
        secIdx++;
      }
      if (secIdx >= song.sections.length) break;
      const sec = song.sections[secIdx];
      if (n.timeSec < sec.startSec) continue; // gap between sections
      const b = sectionBuckets[secIdx];
      b.count++;
      if (!b.first) b.first = n;
      b.last = n;
    }
    for (let i = 0; i < song.sections.length; i++) {
      const sec = song.sections[i];
      const b = sectionBuckets[i];
      log(
        '[DIAG/section] i=' +
          i +
          ' id=' +
          sec.id +
          ' start=' +
          sec.startSec.toFixed(3) +
          ' end=' +
          sec.endSec.toFixed(3) +
          ' span=' +
          (sec.endSec - sec.startSec).toFixed(2) +
          's' +
          ' notes=' +
          b.count +
          (b.first
            ? ' first{m=' +
              b.first.measureIdx +
              ' t=' +
              b.first.timeSec.toFixed(3) +
              ' midi=' +
              b.first.midi +
              '}'
            : ' (empty)') +
          (b.last && b.last !== b.first
            ? ' last{m=' +
              b.last.measureIdx +
              ' t=' +
              b.last.timeSec.toFixed(3) +
              ' midi=' +
              b.last.midi +
              '}'
            : '') +
          (sec.isBoss ? ' BOSS' : '')
      );
    }
  });
}
