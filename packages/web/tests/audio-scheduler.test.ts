// Tests for packages/web/src/audio-scheduler.ts.
//
// The scheduler doesn't own any Tone state — it takes ToneInstrument
// stubs via deps + calls Tone.Transport.schedule directly. We mock
// `tone` so the module loads in Node without a Web Audio context, then
// inspect the scheduled callbacks via spies.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tone before importing the scheduler so the module's top-level
// `import * as Tone from 'tone'` resolves to our spy-able stub instead
// of trying to construct an AudioContext at import time.
const transportSchedule = vi.fn();
vi.mock('tone', () => ({
  Transport: {
    get schedule() {
      return transportSchedule;
    },
  },
}));

import {
  scheduleCountInBeeps,
  scheduleSectionPlayback,
  type SchedulerNote,
} from '../src/audio-scheduler';

/** Minimal stub matching ToneInstrument. */
function makeInstrumentStub() {
  return { triggerAttackRelease: vi.fn() };
}

beforeEach(() => {
  transportSchedule.mockReset();
});

describe('scheduleCountInBeeps', () => {
  it('schedules N click beats + a final GO beep at countInMs offset', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps(
      { metronome, piano: null },
      100, // startAudioTime
      { countInMs: 2000, beats: 4 }
    );
    // 4 click calls + 1 final GO call
    expect(metronome.triggerAttackRelease).toHaveBeenCalledTimes(5);
  });

  it('spaces click beats evenly across the count-in window', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 2000, beats: 4 });
    // beatSec = 2000ms / 4 / 1000 = 0.5s
    // Calls 0..3 land at startAudioTime + 0, +0.5, +1.0, +1.5
    const callTimes = metronome.triggerAttackRelease.mock.calls.slice(0, 4).map((c) => c[2]);
    expect(callTimes).toEqual([0, 0.5, 1.0, 1.5]);
  });

  it('uses 660 Hz for clicks and 990 Hz for the GO beep', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 1000, beats: 2 });
    const calls = metronome.triggerAttackRelease.mock.calls;
    // First N are clicks at 660; last is GO at 990.
    expect(calls[0][0]).toBe(660);
    expect(calls[1][0]).toBe(660);
    expect(calls[calls.length - 1][0]).toBe(990);
  });

  it('lands the GO beep exactly at countInMs offset (where the first note plays)', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps(
      { metronome, piano: null },
      10, // startAudioTime
      { countInMs: 3000, beats: 4 }
    );
    const goCall = metronome.triggerAttackRelease.mock.calls.at(-1)!;
    expect(goCall[0]).toBe(990);
    expect(goCall[2]).toBe(10 + 3000 / 1000); // 13
  });

  it('honors a non-default beat count', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 1500, beats: 6 });
    expect(metronome.triggerAttackRelease).toHaveBeenCalledTimes(7); // 6 clicks + GO
  });

  it('no-ops when metronome is null (mic-only mode)', () => {
    expect(() =>
      scheduleCountInBeeps({ metronome: null, piano: null }, 0, { countInMs: 1000, beats: 4 })
    ).not.toThrow();
  });

  it('swallows errors from the instrument (suspended AudioContext)', () => {
    const metronome = {
      triggerAttackRelease: vi.fn(() => {
        throw new Error('AudioContext suspended');
      }),
    };
    // Should NOT throw — practice mode keeps working without click sound.
    expect(() =>
      scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 1000, beats: 4 })
    ).not.toThrow();
  });
});

describe('scheduleSectionPlayback', () => {
  const noteCMaj: SchedulerNote = { midi: 60, timeMs: 0, durMs: 500 };
  const noteEMaj: SchedulerNote = { midi: 64, timeMs: 1000, durMs: 500 };

  it('schedules one Tone.Transport.schedule call per ghost note', () => {
    const piano = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano, metronome: null },
      { notes: [noteCMaj, noteEMaj], metronomeOn: false, beatMs: 500, countInMs: 0 }
    );
    expect(transportSchedule).toHaveBeenCalledTimes(2);
  });

  it('schedules ghost notes at note.timeMs / 1000 (Tone uses seconds)', () => {
    const piano = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano, metronome: null },
      {
        notes: [
          { midi: 60, timeMs: 0, durMs: 500 },
          { midi: 64, timeMs: 1500, durMs: 500 },
        ],
        metronomeOn: false,
        beatMs: 500,
        countInMs: 0,
      }
    );
    const times = transportSchedule.mock.calls.map((c) => c[1]);
    expect(times).toEqual([0, 1.5]);
  });

  it('skips ghost playback when piano is null', () => {
    scheduleSectionPlayback(
      { piano: null, metronome: makeInstrumentStub() },
      { notes: [noteCMaj], metronomeOn: false, beatMs: 500, countInMs: 0 }
    );
    expect(transportSchedule).not.toHaveBeenCalled();
  });

  it('skips ghost playback when notes is empty', () => {
    scheduleSectionPlayback(
      { piano: makeInstrumentStub(), metronome: null },
      { notes: [], metronomeOn: false, beatMs: 500, countInMs: 0 }
    );
    expect(transportSchedule).not.toHaveBeenCalled();
  });

  it('schedules metronome ticks at beatMs intervals starting from countInMs', () => {
    scheduleSectionPlayback(
      { piano: null, metronome: makeInstrumentStub() },
      {
        // Section spans 0..2000ms, with 1000ms count-in window. Notes
        // signal "section length" — metronome stops at last note + 1s pad.
        notes: [{ midi: 60, timeMs: 0, durMs: 1000 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 1000,
      }
    );
    // metronome runs from t=1000ms to t<(0+1000+1000)=2000ms at 500ms
    // intervals → ticks at 1000, 1500. (2000 is exclusive bound.)
    const metronomeTimes = transportSchedule.mock.calls.map((c) => c[1]);
    expect(metronomeTimes).toEqual([1.0, 1.5]);
  });

  it('alternates 880 Hz strong / 660 Hz weak metronome beats every 3rd', () => {
    const metronome = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano: null, metronome },
      {
        notes: [{ midi: 60, timeMs: 0, durMs: 5000 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 0,
      }
    );
    // First fire each scheduled callback to drive the instrument calls.
    for (const [cb, time] of transportSchedule.mock.calls) {
      (cb as (t: number) => void)(time as number);
    }
    const freqs = metronome.triggerAttackRelease.mock.calls.map((c) => c[0]);
    // Beat 0 = 880, 1 = 660, 2 = 660, 3 = 880, ...
    expect(freqs[0]).toBe(880);
    expect(freqs[1]).toBe(660);
    expect(freqs[2]).toBe(660);
    expect(freqs[3]).toBe(880);
  });

  it('skips metronome when metronomeOn is false even with metronome set', () => {
    scheduleSectionPlayback(
      { piano: null, metronome: makeInstrumentStub() },
      {
        notes: [{ midi: 60, timeMs: 0, durMs: 1000 }],
        metronomeOn: false,
        beatMs: 500,
        countInMs: 0,
      }
    );
    expect(transportSchedule).not.toHaveBeenCalled();
  });

  it('skips metronome when notes is empty (no section length to stop at)', () => {
    scheduleSectionPlayback(
      { piano: null, metronome: makeInstrumentStub() },
      { notes: [], metronomeOn: true, beatMs: 500, countInMs: 0 }
    );
    expect(transportSchedule).not.toHaveBeenCalled();
  });

  it('clamps note duration to 0.1s minimum when calling triggerAttackRelease', () => {
    const piano = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano, metronome: null },
      {
        notes: [{ midi: 60, timeMs: 0, durMs: 50 }], // 50ms × 0.85 = 42.5ms
        metronomeOn: false,
        beatMs: 500,
        countInMs: 0,
      }
    );
    // Fire the scheduled callback so triggerAttackRelease is observable.
    transportSchedule.mock.calls[0]![0]!(0);
    const dur = piano.triggerAttackRelease.mock.calls[0]![1];
    // Math.max(0.1, 0.05 * 0.85) = 0.1 (clamp wins)
    expect(dur).toBe(0.1);
  });

  it('converts MIDI to frequency correctly (A4 = 440Hz at midi 69)', () => {
    const piano = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano, metronome: null },
      {
        notes: [{ midi: 69, timeMs: 0, durMs: 500 }],
        metronomeOn: false,
        beatMs: 500,
        countInMs: 0,
      }
    );
    transportSchedule.mock.calls[0]![0]!(0);
    const freq = piano.triggerAttackRelease.mock.calls[0]![0];
    expect(freq).toBe(440);
  });

  it('schedules ghost playback AND metronome together when both are configured', () => {
    scheduleSectionPlayback(
      { piano: makeInstrumentStub(), metronome: makeInstrumentStub() },
      {
        notes: [
          { midi: 60, timeMs: 0, durMs: 500 },
          { midi: 64, timeMs: 1000, durMs: 500 },
        ],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 0,
      }
    );
    // 2 ghost calls + (last.timeMs+last.durMs+1000)/beatMs metronome ticks
    // Metronome from t=0 to t<(1000+500+1000)=2500ms at 500ms = 5 ticks
    // Total: 2 + 5 = 7
    expect(transportSchedule).toHaveBeenCalledTimes(7);
  });
});

describe('scheduleSectionPlayback — おともパート (backingNotes)', () => {
  function runScheduled() {
    // Transport.schedule に積まれたコールバックを time=0 で全部発火する。
    for (const call of transportSchedule.mock.calls) {
      (call[0] as (t: number) => void)(0);
    }
  }

  it('melody インストゥルメントに backingNotes がスケジュールされる', () => {
    const melody = makeInstrumentStub();
    scheduleSectionPlayback(
      { metronome: null, piano: null, melody },
      {
        notes: [],
        backingNotes: [{ midi: 69, timeMs: 4000, durMs: 1000 }],
        metronomeOn: false,
        beatMs: 500,
        countInMs: 4000,
      }
    );
    expect(transportSchedule).toHaveBeenCalledTimes(1);
    expect(transportSchedule.mock.calls[0][1]).toBe(4); // 4000ms → 4s
    runScheduled();
    expect(melody.triggerAttackRelease).toHaveBeenCalledTimes(1);
    // レガート係数 0.95: 1000ms → 0.95s
    expect(melody.triggerAttackRelease.mock.calls[0][1]).toBeCloseTo(0.95);
  });

  it('ゴースト OFF（piano=null）でも backing は鳴る — 伴奏練習の分担', () => {
    const melody = makeInstrumentStub();
    scheduleSectionPlayback(
      { metronome: null, piano: null, melody },
      {
        notes: [{ midi: 60, timeMs: 4000, durMs: 500 }],
        backingNotes: [{ midi: 69, timeMs: 4000, durMs: 500 }],
        metronomeOn: false,
        beatMs: 500,
        countInMs: 4000,
      }
    );
    runScheduled();
    expect(melody.triggerAttackRelease).toHaveBeenCalledTimes(1);
  });

  it('melody が無い（単一パート・テスト環境）なら何も積まれない', () => {
    scheduleSectionPlayback(
      { metronome: null, piano: null },
      {
        notes: [],
        backingNotes: [{ midi: 69, timeMs: 0, durMs: 500 }],
        metronomeOn: false,
        beatMs: 500,
        countInMs: 4000,
      }
    );
    expect(transportSchedule).not.toHaveBeenCalled();
  });
});
