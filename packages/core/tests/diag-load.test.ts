import { describe, it, expect } from 'vitest';
import {
  dumpLoadDiagnostics,
  type DiagPayload,
  type DiagNote,
  type DiagSong,
} from '../src/library/diag-load';
import type { ScoreTiming } from '../src/library/score-timing';

const song = (over: Partial<DiagSong> = {}): DiagSong => ({
  id: 'test_song',
  bpm: 72,
  sections: [
    { id: 'A1', startSec: 0, endSec: 5 },
    { id: 'B', startSec: 5, endSec: 10 },
    { id: 'A2', startSec: 10, endSec: 15 },
  ],
  ...over,
});

const note = (over: Partial<DiagNote> = {}): DiagNote => ({
  midi: 60,
  hand: 'L',
  timeSec: 0,
  durSec: 0.5,
  measureIdx: 0,
  inBarQuarters: 0,
  ...over,
});

const scoreTiming = (over: Partial<ScoreTiming> = {}): ScoreTiming => ({
  measures: [
    {
      tempoEvents: [],
      timeSig: { beats: 4, beatType: 4 },
      divisions: 4,
      implicit: false,
      durationDiv: 16,
      actualDiv: 16,
    },
  ],
  leadingQuarterBpm: 72,
  leadingSource: 'test',
  ...over,
});

const baseline = (over: Partial<DiagPayload> = {}): DiagPayload => ({
  song: song(),
  extractRet: { _diag: { totalSteps: 10, skippedNotes: 0, tieReport: { merged: 0, samples: [] } } },
  scoreTiming: scoreTiming(),
  measures: [{}],
  expanded: [note(), note({ timeSec: 1, midi: 64, hand: 'R' })],
  baseNotes: [{}, {}],
  measureStartSec: [0],
  measureBpm: [72],
  order: [0],
  totalSec: 4.0,
  ...over,
});

const collect = (): { lines: string[]; log: (s: string) => void } => {
  const lines: string[] = [];
  return { lines, log: (s) => lines.push(s) };
};

describe('dumpLoadDiagnostics — song line', () => {
  it('emits a [DIAG/song] line with summary fields', () => {
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline(), log);
    const songLine = lines.find((l) => l.startsWith('[DIAG/song]'));
    expect(songLine).toBeDefined();
    expect(songLine).toContain('id=test_song');
    expect(songLine).toContain('measures=1');
    expect(songLine).toContain('expanded=2');
    expect(songLine).toContain('R=1');
    expect(songLine).toContain('L=1');
    expect(songLine).toContain('midi=60..64');
  });

  it('marks user songs with src=user, bundled with src=bundled', () => {
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ song: song({ _isUser: true }) }), log);
    expect(lines.find((l) => l.startsWith('[DIAG/song]'))).toContain('src=user');

    const c2 = collect();
    dumpLoadDiagnostics(baseline(), c2.log);
    expect(c2.lines.find((l) => l.startsWith('[DIAG/song]'))).toContain('src=bundled');
  });

  it('reports +N for repeated playback order, -N for shorter, 0 otherwise', () => {
    const c = collect();
    dumpLoadDiagnostics(baseline({ measures: [{}, {}], order: [0, 1, 0, 1] }), c.log);
    expect(c.lines.find((l) => l.startsWith('[DIAG/song]'))).toContain('repeats=+2');
  });
});

describe('dumpLoadDiagnostics — measure line', () => {
  it('emits a [DIAG/measure] line for each sampled measure', () => {
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline(), log);
    const measureLines = lines.filter((l) => l.startsWith('[DIAG/measure]'));
    expect(measureLines.length).toBeGreaterThan(0);
    expect(measureLines[0]).toContain('m=0');
    expect(measureLines[0]).toContain('div=4');
    expect(measureLines[0]).toContain('time=4/4');
  });

  it('flags implicit (anacrusis) measures', () => {
    const st = scoreTiming();
    st.measures[0].implicit = true;
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ scoreTiming: st }), log);
    expect(lines.find((l) => l.startsWith('[DIAG/measure]'))).toContain('impl');
  });

  it('emits a tempo=[…] suffix when the measure has tempo events', () => {
    const st = scoreTiming();
    st.measures[0].tempoEvents = [
      { inBarDiv: 0, qBpm: 60, src: 'test' },
      { inBarDiv: 8, qBpm: 90, src: 'test' },
    ];
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ scoreTiming: st }), log);
    expect(lines.find((l) => l.startsWith('[DIAG/measure]'))).toMatch(/tempo=\[60\.0,90\.0\]/);
  });
});

describe('dumpLoadDiagnostics — note line', () => {
  it('emits up to 12 head-of-list note lines', () => {
    const expanded = Array.from({ length: 8 }, (_, i) =>
      note({ timeSec: i, midi: 60 + i, measureIdx: i })
    );
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ expanded }), log);
    const noteLines = lines.filter((l) => l.startsWith('[DIAG/note]'));
    expect(noteLines).toHaveLength(8); // all under 12, no elision
  });

  it('elides middle notes when total > 16', () => {
    const expanded = Array.from({ length: 50 }, (_, i) =>
      note({ timeSec: i * 0.1, midi: 60 + (i % 12) })
    );
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ expanded }), log);
    const noteLines = lines.filter((l) => l.startsWith('[DIAG/note]'));
    expect(noteLines.some((l) => l.includes('elided'))).toBe(true);
    expect(noteLines.length).toBe(12 + 1 + 4); // 12 head + elision + 4 tail
  });

  it('annotates cursorJump when the note is a back-jump', () => {
    const { lines, log } = collect();
    dumpLoadDiagnostics(
      baseline({
        expanded: [note({ cursorJump: 5 })],
      }),
      log
    );
    expect(lines.find((l) => l.startsWith('[DIAG/note]'))).toContain('jump→m=5');
  });
});

describe('dumpLoadDiagnostics — tie line', () => {
  it('emits no tie lines when there are no samples', () => {
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline(), log);
    expect(lines.filter((l) => l.startsWith('[DIAG/tie]'))).toHaveLength(0);
  });

  it('emits one line per sample plus an "elided" tail when merged > samples', () => {
    const { lines, log } = collect();
    dumpLoadDiagnostics(
      baseline({
        extractRet: {
          _diag: {
            totalSteps: 10,
            tieReport: {
              merged: 8,
              samples: [
                { midi: 60, hand: 'L', t0: 0, chain: 2, durBefore: 1, durAfter: 1.5, m: 0 },
                { midi: 64, hand: 'R', t0: 1, chain: 2, durBefore: 1, durAfter: 1.5, m: 1 },
              ],
            },
          },
        },
      }),
      log
    );
    const tieLines = lines.filter((l) => l.startsWith('[DIAG/tie]'));
    expect(tieLines).toHaveLength(3); // 2 samples + 1 elision
    expect(tieLines[2]).toContain('6 more ties merged');
  });
});

describe('dumpLoadDiagnostics — section line', () => {
  it('emits one section line per section with note bucket counts', () => {
    const expanded = [
      note({ timeSec: 1, measureIdx: 0 }), // in A1
      note({ timeSec: 2, measureIdx: 0 }), // in A1
      note({ timeSec: 6, measureIdx: 5 }), // in B
      note({ timeSec: 12, measureIdx: 10 }), // in A2
    ];
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ expanded }), log);
    const sectionLines = lines.filter((l) => l.startsWith('[DIAG/section]'));
    expect(sectionLines).toHaveLength(3);
    expect(sectionLines[0]).toContain('id=A1');
    expect(sectionLines[0]).toContain('notes=2');
    expect(sectionLines[1]).toContain('id=B');
    expect(sectionLines[1]).toContain('notes=1');
    expect(sectionLines[2]).toContain('id=A2');
    expect(sectionLines[2]).toContain('notes=1');
  });

  it('flags BOSS sections', () => {
    const s = song();
    s.sections = [{ id: 'final', startSec: 0, endSec: 5, isBoss: true }];
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ song: s }), log);
    expect(lines.find((l) => l.startsWith('[DIAG/section]'))).toContain('BOSS');
  });

  it('marks empty sections as (empty)', () => {
    const s = song();
    s.sections = [{ id: 'A1', startSec: 100, endSec: 200 }];
    const { lines, log } = collect();
    dumpLoadDiagnostics(baseline({ song: s }), log);
    expect(lines.find((l) => l.startsWith('[DIAG/section]'))).toContain('(empty)');
  });
});

describe('dumpLoadDiagnostics — exception isolation', () => {
  it('a throw in one log call does not stop later sections', () => {
    const calls: string[] = [];
    let throwOnNext = true;
    const log = (s: string): void => {
      if (throwOnNext && s.startsWith('[DIAG/song]')) {
        throwOnNext = false;
        throw new Error('boom');
      }
      calls.push(s);
    };
    dumpLoadDiagnostics(baseline(), log);
    // The song line threw, but later sections still emitted.
    expect(calls.some((l) => l.startsWith('[DIAG/measure]'))).toBe(true);
    expect(calls.some((l) => l.startsWith('[DIAG/section]'))).toBe(true);
    // The exception itself was logged with a [DIAG/song] EXCEPTION wrapper.
    // (It comes through `log` too, which is the test's stub — but our stub
    // re-throws once on the FIRST [DIAG/song] line, so the wrapper landed.)
    expect(calls.some((l) => l.includes('EXCEPTION: boom'))).toBe(true);
  });
});
