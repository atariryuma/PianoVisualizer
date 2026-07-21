// Tests for packages/web/src/practice-tone-audio.ts.
//
// Covers:
//   • ensureInstruments: lazy + idempotent, no-op when Tone undefined,
//     volumes set on both synths.
//   • scheduleCountIn: passes lazy synths + countInMs from getCountInMs
//     thunk, no-op when Tone missing, custom beats override.
//   • stopPracticeAudio: Transport.stop + Transport.cancel + cursor
//     hide + clearHighlights, swallows Transport throws, no-op on
//     missing Tone.
//   • getInstruments: returns nulls before ensure, returns refs after.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPracticeToneAudio,
  type PracticeToneAudioDeps,
  type ToneInstrument,
  type ToneLibRef,
} from '../src/practice-tone-audio';

// ─── fake Tone lib ─────────────────────────────────────────────────

interface FakeInstrument extends ToneInstrument {
  isPolySynth?: boolean;
  isMembrane?: boolean;
}

function makeFakeInstrument(kind: 'poly' | 'membrane'): FakeInstrument {
  const inst: FakeInstrument = {
    toDestination: vi.fn().mockImplementation(() => inst),
    volume: { value: 0 },
    triggerAttackRelease: vi.fn(),
    isPolySynth: kind === 'poly',
    isMembrane: kind === 'membrane',
  };
  return inst;
}

interface FakeTone extends ToneLibRef {
  /** Capture the most-recent instances so tests can assert volumes etc. */
  _lastPoly?: FakeInstrument;
  _lastMembrane?: FakeInstrument;
  _stopCalls?: number;
  _cancelCalls?: number;
}

function makeFakeTone(opts: { transportThrows?: boolean } = {}): FakeTone {
  const fake: FakeTone = {
    _stopCalls: 0,
    _cancelCalls: 0,
    Synth: function FakeSynth() {} as unknown as ToneLibRef['Synth'],
    PolySynth: function FakePolySynth(this: FakeInstrument): FakeInstrument {
      const i = makeFakeInstrument('poly');
      Object.assign(this, i);
      fake._lastPoly = this;
      return this;
    } as unknown as ToneLibRef['PolySynth'],
    MembraneSynth: function FakeMembraneSynth(this: FakeInstrument): FakeInstrument {
      const i = makeFakeInstrument('membrane');
      Object.assign(this, i);
      fake._lastMembrane = this;
      return this;
    } as unknown as ToneLibRef['MembraneSynth'],
    Transport: {
      stop: vi.fn(() => {
        fake._stopCalls = (fake._stopCalls || 0) + 1;
        if (opts.transportThrows) throw new Error('transport not started');
      }),
      cancel: vi.fn(() => {
        fake._cancelCalls = (fake._cancelCalls || 0) + 1;
      }),
    },
  };
  return fake;
}

interface Mocks {
  scheduleCountInBeeps: ReturnType<typeof vi.fn>;
  hideCursor: ReturnType<typeof vi.fn>;
  clearHighlights: ReturnType<typeof vi.fn>;
}

function makeFixture(over: Partial<PracticeToneAudioDeps> = {}) {
  const tone = over.Tone === undefined ? makeFakeTone() : (over.Tone as FakeTone | undefined);
  const mocks: Mocks = {
    scheduleCountInBeeps: vi.fn(),
    hideCursor: vi.fn(),
    clearHighlights: vi.fn(),
  };
  const deps: PracticeToneAudioDeps = {
    Tone: tone,
    audioScheduler: { scheduleCountInBeeps: mocks.scheduleCountInBeeps },
    cursor: { hideCursor: mocks.hideCursor, clearHighlights: mocks.clearHighlights },
    getCountInMs: () => 4000,
    ...over,
  };
  return { audio: createPracticeToneAudio(deps), deps, tone, mocks };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── ensureInstruments ─────────────────────────────────────────────

describe('ensureInstruments', () => {
  it('builds PolySynth + MembraneSynth on first call', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    expect(fx.tone!._lastPoly).toBeDefined();
    expect(fx.tone!._lastMembrane).toBeDefined();
  });

  it('idempotent: second call does not re-instantiate', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    const firstPoly = fx.tone!._lastPoly;
    fx.audio.ensureInstruments();
    expect(fx.tone!._lastPoly).toBe(firstPoly);
  });

  it('sets piano volume to -14 dB', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    const inst = fx.audio.getInstruments();
    expect(inst.piano!.volume.value).toBe(-14);
  });

  it('sets metronome volume to -10 dB', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    const inst = fx.audio.getInstruments();
    expect(inst.metronome!.volume.value).toBe(-10);
  });

  it('scales volume by prefs percent (100% = base dB, 50% ≈ -6 dB, 0% = mute)', () => {
    const vols = { ghost: 100, backing: 100, metronome: 100 };
    const fx = makeFixture({ getVolumes: () => vols });
    fx.audio.ensureInstruments();
    const inst = fx.audio.getInstruments();
    // 100% keeps the tuned base levels.
    expect(inst.piano!.volume.value).toBe(-14);
    expect(inst.metronome!.volume.value).toBe(-10);
    // 50% is ~6 dB down; live-applied without rebuilding the synths.
    vols.ghost = 50;
    fx.audio.applyVolumes();
    expect(inst.piano!.volume.value).toBeCloseTo(-14 + 20 * Math.log10(0.5), 3);
    // 0% mutes (−Infinity dB) — Tone treats this as silence.
    vols.ghost = 0;
    fx.audio.applyVolumes();
    expect(inst.piano!.volume.value).toBe(-Infinity);
  });

  it('no-op when Tone undefined', () => {
    const fx = makeFixture({ Tone: undefined });
    fx.audio.ensureInstruments();
    const inst = fx.audio.getInstruments();
    expect(inst.piano).toBeNull();
    expect(inst.metronome).toBeNull();
  });

  it('routes synths to destination via toDestination()', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    expect(fx.tone!._lastPoly!.toDestination).toHaveBeenCalled();
    expect(fx.tone!._lastMembrane!.toDestination).toHaveBeenCalled();
  });
});

// ─── scheduleCountIn ───────────────────────────────────────────────

describe('scheduleCountIn', () => {
  it('forwards to audioScheduler.scheduleCountInBeeps with the lazy synths', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    fx.audio.scheduleCountIn(123.45);
    expect(fx.mocks.scheduleCountInBeeps).toHaveBeenCalledWith(
      { metronome: fx.audio.getInstruments().metronome, piano: fx.audio.getInstruments().piano },
      123.45,
      { countInMs: 4000, beats: 4 }
    );
  });

  it('reads getCountInMs() at call time (tempo change between sections)', () => {
    let cur = 4000;
    const fx = makeFixture({ getCountInMs: () => cur });
    fx.audio.ensureInstruments();
    fx.audio.scheduleCountIn(0);
    cur = 1500; // tempo doubled
    fx.audio.scheduleCountIn(1);
    expect(fx.mocks.scheduleCountInBeeps.mock.calls[0][2].countInMs).toBe(4000);
    expect(fx.mocks.scheduleCountInBeeps.mock.calls[1][2].countInMs).toBe(1500);
  });

  it('honors custom beats override', () => {
    const fx = makeFixture({ beats: 8 });
    fx.audio.ensureInstruments();
    fx.audio.scheduleCountIn(0);
    expect(fx.mocks.scheduleCountInBeeps.mock.calls[0][2].beats).toBe(8);
  });

  it('no-op when Tone undefined (no scheduler call)', () => {
    const fx = makeFixture({ Tone: undefined });
    fx.audio.scheduleCountIn(0);
    expect(fx.mocks.scheduleCountInBeeps).not.toHaveBeenCalled();
  });

  it('passes null synths when ensureInstruments not called yet', () => {
    const fx = makeFixture();
    // Skipped ensureInstruments → synths still null.
    fx.audio.scheduleCountIn(0);
    expect(fx.mocks.scheduleCountInBeeps).toHaveBeenCalledWith(
      { metronome: null, piano: null },
      0,
      expect.any(Object)
    );
  });
});

// ─── stopPracticeAudio ─────────────────────────────────────────────

describe('stopPracticeAudio', () => {
  it('calls Transport.stop + Transport.cancel + cursor hide + clearHighlights', () => {
    const fx = makeFixture();
    fx.audio.stopPracticeAudio();
    expect(fx.tone!._stopCalls).toBe(1);
    expect(fx.tone!._cancelCalls).toBe(1);
    expect(fx.mocks.hideCursor).toHaveBeenCalledOnce();
    expect(fx.mocks.clearHighlights).toHaveBeenCalledOnce();
  });

  it('swallows Transport.stop() throws + still hides cursor', () => {
    const fx = makeFixture({ Tone: makeFakeTone({ transportThrows: true }) });
    expect(() => fx.audio.stopPracticeAudio()).not.toThrow();
    expect(fx.mocks.hideCursor).toHaveBeenCalledOnce();
    expect(fx.mocks.clearHighlights).toHaveBeenCalledOnce();
  });

  it('no Transport calls when Tone undefined, but still hides cursor', () => {
    const fx = makeFixture({ Tone: undefined });
    fx.audio.stopPracticeAudio();
    expect(fx.mocks.hideCursor).toHaveBeenCalledOnce();
    expect(fx.mocks.clearHighlights).toHaveBeenCalledOnce();
  });
});

// ─── playStampCelebration (SE 最小版) ──────────────────────────────

describe('playStampCelebration', () => {
  it('no-ops when the AudioContext is not running (suspended / title)', () => {
    const fx = makeFixture(); // fake Tone は context 無し → running でない
    fx.audio.playStampCelebration();
    // 早期 return するので synth すら作らない。
    expect(fx.audio.getInstruments().melody).toBeNull();
  });

  it('plays a soft 3-note arpeggio on the melody synth when running', () => {
    const tone = makeFakeTone();
    (tone as unknown as { context: { state: string } }).context = { state: 'running' };
    const fx = makeFixture({ Tone: tone as unknown as PracticeToneAudioDeps['Tone'] });
    fx.audio.playStampCelebration();
    const melody = fx.audio.getInstruments().melody as unknown as {
      triggerAttackRelease: ReturnType<typeof vi.fn>;
    };
    expect(melody).not.toBeNull();
    expect(melody.triggerAttackRelease).toHaveBeenCalledTimes(3); // C5-E5-G5
    // 全て低ベロシティ（<0.35）で控えめ。
    for (const call of melody.triggerAttackRelease.mock.calls) {
      expect(call[3]).toBeLessThan(0.35);
    }
  });
});

describe('playSongClear', () => {
  it('no-ops when the AudioContext is not running', () => {
    const fx = makeFixture();
    fx.audio.playSongClear();
    expect(fx.audio.getInstruments().melody).toBeNull();
  });

  it('plays a soft 4-note ascending fanfare (C5-E5-G5-C6) when running', () => {
    const tone = makeFakeTone();
    (tone as unknown as { context: { state: string } }).context = { state: 'running' };
    const fx = makeFixture({ Tone: tone as unknown as PracticeToneAudioDeps['Tone'] });
    fx.audio.playSongClear();
    const melody = fx.audio.getInstruments().melody as unknown as {
      triggerAttackRelease: ReturnType<typeof vi.fn>;
    };
    expect(melody).not.toBeNull();
    expect(melody.triggerAttackRelease).toHaveBeenCalledTimes(4);
    // Still piano-toned + restrained (no gamey bloops): low velocity throughout.
    for (const call of melody.triggerAttackRelease.mock.calls) {
      expect(call[3]).toBeLessThan(0.4);
    }
  });
});

// ─── getInstruments ────────────────────────────────────────────────

describe('getInstruments', () => {
  it('returns nulls before ensureInstruments', () => {
    const fx = makeFixture();
    expect(fx.audio.getInstruments()).toEqual({ piano: null, metronome: null, melody: null });
  });

  it('returns refs after ensureInstruments', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    const inst = fx.audio.getInstruments();
    expect(inst.piano).not.toBeNull();
    expect(inst.metronome).not.toBeNull();
  });

  it('returns same refs across calls (stable identity)', () => {
    const fx = makeFixture();
    fx.audio.ensureInstruments();
    const a = fx.audio.getInstruments();
    const b = fx.audio.getInstruments();
    expect(a.piano).toBe(b.piano);
    expect(a.metronome).toBe(b.metronome);
  });
});
