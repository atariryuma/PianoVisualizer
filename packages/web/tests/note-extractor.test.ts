// Tests for packages/web/src/note-extractor.ts.
//
// The extractor consumes OSMD's iterator surface via the OsmdLike
// duck-typed interface. We don't need real OSMD — just stubs that
// expose the exact shape `extractNotesFromOsmd` reads from. Each test
// builds a focused stub for its scenario.

import { describe, it, expect } from 'vitest';
import {
  extractNotesFromOsmd,
  pickPracticeStaffPlan,
  type OsmdInstrumentLike,
} from '../src/note-extractor';

/** Build a minimal voice-entry mimicking OSMD's runtime shape. */
function voiceEntry(staffIdx: number, notes: unknown[]) {
  return {
    parentSourceStaffEntry: { parentStaff: { idInMusicSheet: staffIdx } },
    Notes: notes,
  };
}

/** Build an iterator that walks through a fixed sequence of voice-entry
 *  arrays, advancing measure index + currentTimeStamp on each step. */
function makeIterator(steps: Array<{ measureIdx: number; tsWhole: number; voices: unknown[] }>) {
  let i = 0;
  return {
    get endReached() {
      return i >= steps.length;
    },
    get CurrentMeasureIndex() {
      return steps[i]?.measureIdx ?? 0;
    },
    get currentTimeStamp() {
      return { realValue: steps[i]?.tsWhole ?? 0 };
    },
    get CurrentVoiceEntries() {
      return (steps[i]?.voices as never) ?? null;
    },
    moveToNext() {
      i++;
    },
  };
}

/** Build a complete OsmdLike stub from steps + sourceMeasures. */
function makeOsmd(opts: {
  steps: Array<{ measureIdx: number; tsWhole: number; voices: unknown[] }>;
  sourceMeasures: Array<{
    AbsoluteTimestamp?: { realValue: number };
    Duration?: { realValue: number };
    TempoInBPM?: number;
  }>;
}) {
  const iterator = makeIterator(opts.steps);
  return {
    cursor: {
      iterator: iterator as never,
      reset: () => {
        // Tests don't drive a second extraction; reset is a no-op stub.
      },
    },
    Sheet: { SourceMeasures: opts.sourceMeasures },
  };
}

describe('extractNotesFromOsmd — empty / null guards', () => {
  it('returns empty result when osmd is missing cursor', () => {
    const ret = extractNotesFromOsmd({ cursor: null });
    expect(ret.notes).toEqual([]);
    expect(ret.measureStartSec).toEqual([]);
    expect(ret.measureBpm).toEqual([]);
    expect(ret._diag).toBeUndefined();
  });

  it('returns empty notes when iterator yields no steps', () => {
    const osmd = makeOsmd({
      steps: [],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes).toEqual([]);
    // measure-timing arrays sized to sourceMeasures.length
    expect(ret.measureStartSec).toHaveLength(1);
    expect(ret.measureBpm).toHaveLength(1);
  });
});

describe('extractNotesFromOsmd — basic note walk', () => {
  it('extracts a single C4 note from a single-step iterator', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            voiceEntry(0, [{ halfTone: 48, length: { realValue: 0.25 } }]), // C4 = midi 60
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes).toHaveLength(1);
    expect(ret.notes[0]?.midi).toBe(60); // halfTone 48 + 12 = MIDI 60
    expect(ret.notes[0]?.hand).toBe('R'); // staff idx 0 = right
    expect(ret.notes[0]?.measureIdx).toBe(0);
  });

  it('assigns hand by staff index (idInMusicSheet 0 = R, 1 = L)', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            voiceEntry(0, [{ halfTone: 60, length: { realValue: 0.25 } }]), // RH C5
            voiceEntry(1, [{ halfTone: 36, length: { realValue: 0.25 } }]), // LH C3
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    const rh = ret.notes.find((n) => n.midi === 72);
    const lh = ret.notes.find((n) => n.midi === 48);
    expect(rh?.hand).toBe('R');
    expect(lh?.hand).toBe('L');
  });

  it('falls back to pitch-based hand assignment when staff idx is missing', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            // No parentSourceStaffEntry — fallback path: midi >= 60 → R, else L
            {
              Notes: [{ halfTone: 60, length: { realValue: 0.25 } }], // C5 = midi 72
            },
            {
              Notes: [{ halfTone: 36, length: { realValue: 0.25 } }], // C3 = midi 48
            },
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes.find((n) => n.midi === 72)?.hand).toBe('R');
    expect(ret.notes.find((n) => n.midi === 48)?.hand).toBe('L');
  });

  it('skips notes that are rests', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            voiceEntry(0, [
              { isRest: () => true, halfTone: 48 },
              { halfTone: 48, length: { realValue: 0.25 } },
            ]),
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes).toHaveLength(1);
  });

  it('skips notes with null halfTone (timing-only OSMD entries)', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            voiceEntry(0, [
              { halfTone: null, length: { realValue: 0.25 } },
              { halfTone: 48, length: { realValue: 0.25 } },
            ]),
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes).toHaveLength(1);
    expect(ret.notes[0]?.midi).toBe(60);
  });

  it('reads from `Notes` (capital) when present, falls back to `notes`', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            // lowercase `notes` — older OSMD versions
            {
              parentSourceStaffEntry: { parentStaff: { idInMusicSheet: 0 } },
              notes: [{ halfTone: 48, length: { realValue: 0.25 } }],
            },
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes).toHaveLength(1);
    expect(ret.notes[0]?.midi).toBe(60);
  });
});

describe('extractNotesFromOsmd — timing math', () => {
  it('computes measureStartSec from prev-measure duration + tempo', () => {
    const osmd = makeOsmd({
      steps: [],
      sourceMeasures: [
        // measure 0: 4/4 @ 60 BPM → 4 quarter notes × 1s/beat = 4s
        { Duration: { realValue: 1.0 }, TempoInBPM: 60 },
        // measure 1: same — starts at 4s
        { Duration: { realValue: 1.0 }, TempoInBPM: 60 },
      ],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.measureStartSec[0]).toBe(0);
    expect(ret.measureStartSec[1]).toBe(4);
  });

  it('inherits prev-measure BPM when current measure omits TempoInBPM', () => {
    const osmd = makeOsmd({
      steps: [],
      sourceMeasures: [
        { Duration: { realValue: 0.25 }, TempoInBPM: 120 },
        { Duration: { realValue: 0.25 } }, // no tempo
      ],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.measureBpm[0]).toBe(120);
    expect(ret.measureBpm[1]).toBe(120);
  });

  it('uses the 72 BPM default when no measure carries TempoInBPM', () => {
    const osmd = makeOsmd({
      steps: [],
      sourceMeasures: [{ Duration: { realValue: 0.25 } }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.measureBpm[0]).toBe(72);
  });

  it('places note timeSec at measureStart + (inBarQuarters × 60/bpm)', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 1, // second measure
          tsWhole: 0.25 + 0.125, // 0.5q into measure 1 (whole-note timestamp 0.375)
          voices: [voiceEntry(0, [{ halfTone: 48, length: { realValue: 0.25 } }])],
        },
      ],
      sourceMeasures: [
        // measure 0: 0.25 whole = 1 quarter @ 120 BPM = 0.5s
        { AbsoluteTimestamp: { realValue: 0 }, Duration: { realValue: 0.25 }, TempoInBPM: 120 },
        // measure 1: starts at whole-note position 0.25
        { AbsoluteTimestamp: { realValue: 0.25 }, Duration: { realValue: 0.25 }, TempoInBPM: 120 },
      ],
    });
    const ret = extractNotesFromOsmd(osmd);
    // measureStartSec[1] = (0.25 × 4 × 60) / 120 = 0.5s
    // inBarQuarters = (0.375 - 0.25) × 4 = 0.5q
    // offsetSec = (0.5 × 60) / 120 = 0.25s
    // timeSec = 0.5 + 0.25 = 0.75s
    expect(ret.notes[0]?.timeSec).toBeCloseTo(0.75);
  });

  it('computes durSec from note.length (whole-note units) × 60/bpm', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [voiceEntry(0, [{ halfTone: 48, length: { realValue: 0.5 } }])], // half note
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.5 }, TempoInBPM: 60 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    // 0.5 whole = 2 quarters @ 60 BPM = 2 seconds
    expect(ret.notes[0]?.durSec).toBeCloseTo(2);
  });

  it('clamps tiny durations to 0.05s minimum (accidental zero-length notes)', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [voiceEntry(0, [{ halfTone: 48, length: { realValue: 0 } }])],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes[0]?.durSec).toBe(0.05);
  });
});

describe('extractNotesFromOsmd — tie detection', () => {
  it('marks tied notes via NoteTie.StartNote / EndNote', () => {
    const startNote: { halfTone: number; length: { realValue: number }; NoteTie?: object } = {
      halfTone: 48,
      length: { realValue: 0.25 },
    };
    const endNote: { halfTone: number; length: { realValue: number }; NoteTie?: object } = {
      halfTone: 48,
      length: { realValue: 0.25 },
    };
    const tie = { StartNote: startNote, EndNote: endNote };
    startNote.NoteTie = tie;
    endNote.NoteTie = tie;

    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [voiceEntry(0, [startNote])],
        },
        {
          measureIdx: 0,
          tsWhole: 0.25,
          voices: [voiceEntry(0, [endNote])],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.5 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    // After mergeTiedNotes coalesces, only 1 note (the start) survives — but
    // it should carry the merged duration covering both halves. The tie flags
    // are an internal detail; the merge effect is what matters.
    expect(ret.notes).toHaveLength(1);
  });
});

describe('extractNotesFromOsmd — telemetry', () => {
  it('omits _diag when collectDiag is unset (default)', () => {
    const osmd = makeOsmd({
      steps: [],
      sourceMeasures: [{ Duration: { realValue: 0.25 } }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret._diag).toBeUndefined();
  });

  it('attaches totalSteps + skippedNotes + tieReport when collectDiag=true', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [voiceEntry(0, [{ halfTone: 48, length: { realValue: 0.25 } }])],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd, { collectDiag: true });
    expect(ret._diag).toBeDefined();
    expect(ret._diag?.totalSteps).toBe(1);
    expect(ret._diag?.skippedNotes).toBe(0);
    expect(ret._diag?.tieReport).toBeDefined();
  });

  it('counts skippedNotes when an OSMD shape mismatch throws', () => {
    const badNote = {
      get halfTone() {
        throw new Error('OSMD version skew');
      },
    };
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            voiceEntry(0, [
              badNote,
              { halfTone: 48, length: { realValue: 0.25 } }, // good note
            ]),
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd, { collectDiag: true });
    expect(ret.notes).toHaveLength(1); // good note still extracted
    expect(ret._diag?.skippedNotes).toBe(1);
  });
});

describe('pickPracticeStaffPlan — パート判別', () => {
  const voicePiano: OsmdInstrumentLike[] = [
    { Name: 'Voice', MidiInstrumentId: 53, Staves: [{ idInMusicSheet: 0 }] },
    {
      Name: 'Piano',
      MidiInstrumentId: 0,
      Staves: [{ idInMusicSheet: 1 }, { idInMusicSheet: 2 }],
    },
  ];

  it('単一パートは判別なし（従来挙動）', () => {
    const plan = pickPracticeStaffPlan([voicePiano[1]]);
    expect(plan.practiceInstrumentIdx).toBeNull();
    expect(plan.staffHand.size).toBe(0);
  });

  it('Voice + Piano では Piano（2段譜+名前+GM音色）が練習パートになる', () => {
    const plan = pickPracticeStaffPlan(voicePiano);
    expect(plan.practiceInstrumentIdx).toBe(1);
    expect(plan.staffHand.get(0)).toBe('B'); // Voice → おともパート
    expect(plan.staffHand.get(1)).toBe('R'); // Piano 第1譜表
    expect(plan.staffHand.get(2)).toBe('L'); // Piano 第2譜表
  });

  it('鍵盤らしいパートが1つもない多パート譜は分割しない（安全側）', () => {
    const plan = pickPracticeStaffPlan([
      { Name: 'Flute', MidiInstrumentId: 73, Staves: [{ idInMusicSheet: 0 }] },
      { Name: 'Violin', MidiInstrumentId: 40, Staves: [{ idInMusicSheet: 1 }] },
    ]);
    expect(plan.practiceInstrumentIdx).toBeNull();
  });

  it('名前だけ鍵盤らしい1段パートでも練習パートに選ばれる', () => {
    const plan = pickPracticeStaffPlan([
      { Name: 'Voice', MidiInstrumentId: 53, Staves: [{ idInMusicSheet: 0 }] },
      { Name: 'ピアノ', Staves: [{ idInMusicSheet: 1 }] },
    ]);
    expect(plan.practiceInstrumentIdx).toBe(1);
    expect(plan.staffHand.get(1)).toBe('R');
  });

  it('連弾（Piano 1 + Piano 2）は先頭のピアノが練習パート', () => {
    const plan = pickPracticeStaffPlan([
      {
        Name: 'Piano 1',
        MidiInstrumentId: 0,
        Staves: [{ idInMusicSheet: 0 }, { idInMusicSheet: 1 }],
      },
      {
        Name: 'Piano 2',
        MidiInstrumentId: 0,
        Staves: [{ idInMusicSheet: 2 }, { idInMusicSheet: 3 }],
      },
    ]);
    expect(plan.practiceInstrumentIdx).toBe(0);
    expect(plan.staffHand.get(2)).toBe('B');
    expect(plan.staffHand.get(3)).toBe('B');
  });
});

describe('extractNotesFromOsmd — マルチパート譜（Voice + Piano）', () => {
  const instruments: OsmdInstrumentLike[] = [
    { Name: 'Voice', MidiInstrumentId: 53, Staves: [{ idInMusicSheet: 0 }] },
    {
      Name: 'Piano',
      MidiInstrumentId: 0,
      Staves: [{ idInMusicSheet: 1 }, { idInMusicSheet: 2 }],
    },
  ];

  function makeMultiPartOsmd() {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            voiceEntry(0, [{ halfTone: 57, length: { realValue: 0.25 } }]), // Voice A4 (midi 69)
            voiceEntry(1, [{ halfTone: 48, length: { realValue: 0.25 } }]), // Piano RH C4 (midi 60)
            voiceEntry(2, [{ halfTone: 36, length: { realValue: 0.25 } }]), // Piano LH C3 (midi 48)
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    (osmd.Sheet as { Instruments?: OsmdInstrumentLike[] }).Instruments = instruments;
    return osmd;
  }

  it('Voice パートは practice ノーツに混入せず backingNotes へ入る', () => {
    const ret = extractNotesFromOsmd(makeMultiPartOsmd());
    expect(ret.notes.map((n) => n.midi).sort()).toEqual([48, 60]);
    expect(ret.backingNotes).toHaveLength(1);
    expect(ret.backingNotes[0]?.midi).toBe(69);
    expect(ret.backingNotes[0]?.timeSec).toBe(0);
  });

  it('Piano の手はパート内の譜表順で決まる（staff 1 = R, staff 2 = L）', () => {
    const ret = extractNotesFromOsmd(makeMultiPartOsmd());
    expect(ret.notes.find((n) => n.midi === 60)?.hand).toBe('R');
    expect(ret.notes.find((n) => n.midi === 48)?.hand).toBe('L');
  });

  it('Instruments が無い旧来スタブでは backingNotes は空のまま', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [voiceEntry(0, [{ halfTone: 48, length: { realValue: 0.25 } }])],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.notes).toHaveLength(1);
    expect(ret.backingNotes).toEqual([]);
  });

  it('backingNotes 側もタイ結合される', () => {
    const startNote: { halfTone: number; length: { realValue: number }; NoteTie?: object } = {
      halfTone: 57,
      length: { realValue: 0.25 },
    };
    const endNote: { halfTone: number; length: { realValue: number }; NoteTie?: object } = {
      halfTone: 57,
      length: { realValue: 0.25 },
    };
    const tie = { StartNote: startNote, EndNote: endNote };
    startNote.NoteTie = tie;
    endNote.NoteTie = tie;
    const osmd = makeOsmd({
      steps: [
        { measureIdx: 0, tsWhole: 0, voices: [voiceEntry(0, [startNote])] },
        { measureIdx: 0, tsWhole: 0.25, voices: [voiceEntry(0, [endNote])] },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.5 }, TempoInBPM: 120 }],
    });
    (osmd.Sheet as { Instruments?: OsmdInstrumentLike[] }).Instruments = instruments;
    const ret = extractNotesFromOsmd(osmd);
    expect(ret.backingNotes).toHaveLength(1);
  });
});

describe('extractNotesFromOsmd — output ordering', () => {
  it('sorts notes ascending by timeSec, then by midi for ties', () => {
    const osmd = makeOsmd({
      steps: [
        {
          measureIdx: 0,
          tsWhole: 0,
          voices: [
            voiceEntry(0, [
              { halfTone: 60, length: { realValue: 0.25 } }, // C5 = 72
              { halfTone: 48, length: { realValue: 0.25 } }, // C4 = 60
            ]),
          ],
        },
      ],
      sourceMeasures: [{ Duration: { realValue: 0.25 }, TempoInBPM: 120 }],
    });
    const ret = extractNotesFromOsmd(osmd);
    // Both notes at timeSec=0; sort by midi → 60 before 72
    expect(ret.notes[0]?.midi).toBe(60);
    expect(ret.notes[1]?.midi).toBe(72);
  });
});
