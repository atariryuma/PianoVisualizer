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
  // Count-in beeps are now scheduled on Tone.Transport (relative to
  // Transport position 0) so Transport.cancel() can kill pending beeps
  // on quit. Each transportSchedule call is (callback, offsetSec); the
  // callback fires with the precise audio `time` and calls the synth.
  function runScheduled() {
    for (const call of transportSchedule.mock.calls) {
      (call[0] as (t: number) => void)(0);
    }
  }

  it('schedules N clicks + a final GO beep on the Transport', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 100, { countInMs: 2000, beats: 4 });
    expect(transportSchedule).toHaveBeenCalledTimes(5); // 4 clicks + GO
    runScheduled();
    expect(metronome.triggerAttackRelease).toHaveBeenCalledTimes(5);
  });

  it('spaces clicks one real beat apart (Transport-relative offsets)', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 2000, beats: 4 });
    // beatSec = 2000 / 4 / 1000 = 0.5s → clicks at 0, 0.5, 1.0, 1.5, GO at 2.0
    const offsets = transportSchedule.mock.calls.map((c) => c[1]);
    expect(offsets).toEqual([0, 0.5, 1.0, 1.5, 2.0]);
  });

  it('uses 660 Hz for clicks and 990 Hz for the GO beep', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 1000, beats: 2 });
    runScheduled();
    const calls = metronome.triggerAttackRelease.mock.calls;
    expect(calls[0][0]).toBe(660);
    expect(calls[1][0]).toBe(660);
    expect(calls[calls.length - 1][0]).toBe(990);
  });

  it('lands the GO beep exactly at the countInMs offset', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 10, { countInMs: 3000, beats: 4 });
    const goOffset = transportSchedule.mock.calls.at(-1)![1];
    expect(goOffset).toBe(3000 / 1000); // 3.0s Transport-relative
  });

  it('honors a non-default beat count', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 1500, beats: 6 });
    expect(transportSchedule).toHaveBeenCalledTimes(7); // 6 clicks + GO
  });

  it('no-ops when metronome is null (mic-only mode)', () => {
    scheduleCountInBeeps({ metronome: null, piano: null }, 0, { countInMs: 1000, beats: 4 });
    expect(transportSchedule).not.toHaveBeenCalled();
  });

  it('swallows errors from the instrument (suspended AudioContext)', () => {
    const metronome = {
      triggerAttackRelease: vi.fn(() => {
        throw new Error('AudioContext suspended');
      }),
    };
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 1000, beats: 4 });
    // Should NOT throw when the callback runs against a suspended context.
    expect(() => {
      for (const call of transportSchedule.mock.calls) (call[0] as (t: number) => void)(0);
    }).not.toThrow();
  });

  // ── 弱起（goMs）/ 拍単位（clickMs）対応 ────────────────────────────

  it('弱起: goMs からクリック列を逆向きに配置し GO がダウンビートに乗る', () => {
    const metronome = makeInstrumentStub();
    // 1 拍ピックアップ: countInMs=2000 (4×500)、GO=2500。
    // クリックは 2500 から逆向きに 4 個 → 500/1000/1500/2000、GO 2500。
    // ピックアップ音（timeMs=countInMs=2000）は最後のクリックと同時 =
    // カウント内の正しい拍位置で鳴る。
    scheduleCountInBeeps({ metronome, piano: null }, 0, {
      countInMs: 2000,
      beats: 4,
      clickMs: 500,
      goMs: 2500,
    });
    const offsets = transportSchedule.mock.calls.map((c) => c[1]);
    expect(offsets).toEqual([0.5, 1.0, 1.5, 2.0, 2.5]);
  });

  it('clickMs 指定（複合拍子の付点四分）でクリック間隔が拍単位になる', () => {
    const metronome = makeInstrumentStub();
    // 6/8: 4 クリック × 1125ms = 4500ms。
    scheduleCountInBeeps({ metronome, piano: null }, 0, {
      countInMs: 4500,
      beats: 4,
      clickMs: 1125,
    });
    const offsets = transportSchedule.mock.calls.map((c) => c[1]);
    expect(offsets).toEqual([0, 1.125, 2.25, 3.375, 4.5]);
  });

  it('goMs / clickMs 省略時は従来挙動（countInMs 均等割り・GO=countInMs）', () => {
    const metronome = makeInstrumentStub();
    scheduleCountInBeeps({ metronome, piano: null }, 0, { countInMs: 2000, beats: 4 });
    const offsets = transportSchedule.mock.calls.map((c) => c[1]);
    expect(offsets).toEqual([0, 0.5, 1.0, 1.5, 2.0]);
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

  it('schedules metronome ticks starting one beat after count-in', () => {
    scheduleSectionPlayback(
      { piano: null, metronome: makeInstrumentStub() },
      {
        notes: [{ midi: 60, timeMs: 0, durMs: 1000 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 1000,
      }
    );
    // The GO! beep covers the downbeat at countInMs (1000ms), so the
    // metronome starts one beat later at 1500ms. Range [1500, 2000).
    const metronomeTimes = transportSchedule.mock.calls.map((c) => c[1]);
    expect(metronomeTimes).toEqual([1.5]);
  });

  it('accents the bar downbeat (4/4 default) — 880 Hz strong, 660 Hz weak', () => {
    const metronome = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano: null, metronome },
      {
        notes: [{ midi: 60, timeMs: 0, durMs: 5000 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 0,
        // default beatsPerMeasure = 4
      }
    );
    for (const [cb, time] of transportSchedule.mock.calls) {
      (cb as (t: number) => void)(time as number);
    }
    const freqs = metronome.triggerAttackRelease.mock.calls.map((c) => c[0]);
    // Starts at beat index 1 (downbeat covered by GO). beat%4===0 → 880.
    // beats 1,2,3 → 660; beat 4 → 880; beats 5,6,7 → 660; beat 8 → 880.
    expect(freqs[0]).toBe(660); // beat 1
    expect(freqs[3]).toBe(880); // beat 4 (next bar downbeat)
    expect(freqs[7]).toBe(880); // beat 8
  });

  it('follows the time signature: 3/4 accents every 3rd beat (P2-16)', () => {
    const metronome = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano: null, metronome },
      {
        notes: [{ midi: 60, timeMs: 0, durMs: 5000 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 0,
        beatsPerMeasure: 3,
      }
    );
    for (const [cb, time] of transportSchedule.mock.calls) {
      (cb as (t: number) => void)(time as number);
    }
    const freqs = metronome.triggerAttackRelease.mock.calls.map((c) => c[0]);
    // beat%3===0 → 880. beats 1,2 → 660; beat 3 → 880; beats 4,5 → 660; 6 → 880.
    expect(freqs[0]).toBe(660); // beat 1
    expect(freqs[1]).toBe(660); // beat 2
    expect(freqs[2]).toBe(880); // beat 3 (downbeat)
    expect(freqs[5]).toBe(880); // beat 6
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

  // ── metronomeEvents（小節グリッド由来のクリック列） ────────────────

  it('metronomeEvents があれば一様ループの代わりにその列を鳴らす', () => {
    const metronome = makeInstrumentStub();
    scheduleSectionPlayback(
      { piano: null, metronome },
      {
        notes: [{ midi: 60, timeMs: 4000, durMs: 500 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 4000,
        metronomeEvents: [
          { timeMs: 4500, accent: false },
          { timeMs: 5000, accent: true },
        ],
      }
    );
    const times = transportSchedule.mock.calls.map((c) => c[1]);
    expect(times).toEqual([4.5, 5.0]);
    for (const [cb, time] of transportSchedule.mock.calls) {
      (cb as (t: number) => void)(time as number);
    }
    const freqs = metronome.triggerAttackRelease.mock.calls.map((c) => c[0]);
    // accent=true → 880 Hz（小節頭）、false → 660 Hz。
    expect(freqs).toEqual([660, 880]);
  });

  it('metronomeEvents が空配列なら何も鳴らさない（フォールバックしない）', () => {
    scheduleSectionPlayback(
      { piano: null, metronome: makeInstrumentStub() },
      {
        notes: [{ midi: 60, timeMs: 4000, durMs: 500 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 4000,
        metronomeEvents: [],
      }
    );
    expect(transportSchedule).not.toHaveBeenCalled();
  });

  it('metronomeEvents が null なら従来の一様ループへフォールバック', () => {
    scheduleSectionPlayback(
      { piano: null, metronome: makeInstrumentStub() },
      {
        notes: [{ midi: 60, timeMs: 0, durMs: 1000 }],
        metronomeOn: true,
        beatMs: 500,
        countInMs: 1000,
        metronomeEvents: null,
      }
    );
    const times = transportSchedule.mock.calls.map((c) => c[1]);
    expect(times).toEqual([1.5]); // 旧挙動と同一（countIn + 1 拍から）
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
    // 2 ghost calls + metronome ticks. Metronome from t=500 (one beat
    // after the 0ms count-in) to t<(1000+500+1000)=2500ms at 500ms:
    // 500,1000,1500,2000 = 4 ticks. Total: 2 + 4 = 6.
    expect(transportSchedule).toHaveBeenCalledTimes(6);
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
