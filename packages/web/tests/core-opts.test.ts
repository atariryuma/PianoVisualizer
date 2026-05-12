// Tests for packages/web/src/core-opts.ts.
//
// Pure data factory — verifies the option bags carry the right tunables
// + that the per-source (mic vs MIDI) variants diverge where they should
// (the MIDI debounce is shorter because there's no acoustic bleed to
// gate against).

import { describe, it, expect, vi } from 'vitest';
import {
  createCoreOpts,
  DEFAULT_AUDIO_OFFSET_MS,
  ONSET_HYSTERESIS_FRAMES,
  PITCH_MEDIAN_FRAMES,
  NOTE_NAMES_JP,
  type CoreOptsConfig,
} from '../src/core-opts';

function makeConfig(over: Partial<CoreOptsConfig> = {}): CoreOptsConfig {
  return {
    IOI_HISTORY_SIZE: 16,
    AMPLITUDE_HISTORY_SIZE: 24,
    STABILITY_SEMITONE_THRESHOLD: 0.5,
    STABILITY_GROWTH: 0.1,
    STABILITY_DECAY_GOOD: 0.05,
    ...over,
  };
}

describe('createCoreOpts — quality histories', () => {
  it('threads IOI + amplitude history sizes from CONFIG', () => {
    const opts = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    expect(opts.qhOptsMic.ioiHistorySize).toBe(16);
    expect(opts.qhOptsMic.amplitudeHistorySize).toBe(24);
    expect(opts.qhOptsMidi.ioiHistorySize).toBe(16);
    expect(opts.qhOptsMidi.amplitudeHistorySize).toBe(24);
  });

  it('MIDI debounce is shorter than mic debounce (no acoustic bleed to gate)', () => {
    const opts = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    expect(opts.qhOptsMic.debounceMs).toBe(80);
    expect(opts.qhOptsMidi.debounceMs).toBe(30);
    expect(opts.qhOptsMidi.debounceMs).toBeLessThan(opts.qhOptsMic.debounceMs);
  });

  it('min/max IOI windows are the same on both paths', () => {
    const opts = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    expect(opts.qhOptsMic.minIoiMs).toBe(100);
    expect(opts.qhOptsMic.maxIoiMs).toBe(5000);
    expect(opts.qhOptsMidi.minIoiMs).toBe(opts.qhOptsMic.minIoiMs);
    expect(opts.qhOptsMidi.maxIoiMs).toBe(opts.qhOptsMic.maxIoiMs);
  });
});

describe('createCoreOpts — pitch stability', () => {
  it('forwards stability tunables verbatim from CONFIG', () => {
    const opts = createCoreOpts({
      config: makeConfig({
        STABILITY_SEMITONE_THRESHOLD: 0.75,
        STABILITY_GROWTH: 0.15,
        STABILITY_DECAY_GOOD: 0.08,
      }),
      detectChord: () => null,
    });
    expect(opts.psOpts.semitoneThreshold).toBe(0.75);
    expect(opts.psOpts.growth).toBe(0.15);
    expect(opts.psOpts.decayOnJump).toBe(0.08);
  });

  it('pins the idle / active rates to the legacy values', () => {
    const opts = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    expect(opts.psOpts.idleHalfLifeSec).toBe(5.0);
    expect(opts.psOpts.activePlayRate).toBe(0.005);
    expect(opts.psOpts.activePlayFloor).toBe(0.2);
  });
});

describe('createCoreOpts — chord window', () => {
  it('forwards the injected detectChord function', () => {
    const detector = vi.fn().mockReturnValue('Cmaj7');
    const opts = createCoreOpts({ config: makeConfig(), detectChord: detector });
    expect(opts.cwOpts.detectChord).toBe(detector);
    // Verify it's actually wired (not just same reference).
    const result = opts.cwOpts.detectChord([60, 64, 67]);
    expect(detector).toHaveBeenCalledWith([60, 64, 67]);
    expect(result).toBe('Cmaj7');
  });

  it('window=80ms, minNotes=3, cooldown=600ms (pins the legacy values)', () => {
    const opts = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    expect(opts.cwOpts.windowMs).toBe(80);
    expect(opts.cwOpts.minNotes).toBe(3);
    expect(opts.cwOpts.repeatCooldownMs).toBe(600);
  });
});

describe('createCoreOpts — wake-up flash', () => {
  it('triggerLevel=0.2, halfLifeSec≈0.071 (frame-rate-independent decay)', () => {
    const opts = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    expect(opts.wufOpts.triggerLevel).toBe(0.2);
    expect(opts.wufOpts.halfLifeSec).toBe(0.071);
  });
});

describe('createCoreOpts — independence + freshness', () => {
  it('each call returns fresh bags (no shared mutation)', () => {
    const a = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    const b = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    expect(a).not.toBe(b);
    expect(a.qhOptsMic).not.toBe(b.qhOptsMic);
    expect(a.cwOpts).not.toBe(b.cwOpts);
    a.qhOptsMic.debounceMs = 999;
    expect(b.qhOptsMic.debounceMs).toBe(80);
  });

  it('qhOptsMic and qhOptsMidi are independent (spread copy, not shared ref)', () => {
    const opts = createCoreOpts({ config: makeConfig(), detectChord: () => null });
    opts.qhOptsMic.debounceMs = 999;
    expect(opts.qhOptsMidi.debounceMs).toBe(30); // unchanged
  });
});

describe('module-level constants', () => {
  it('DEFAULT_AUDIO_OFFSET_MS is 40 (sane fallback for auto-detect)', () => {
    expect(DEFAULT_AUDIO_OFFSET_MS).toBe(40);
  });

  it('ONSET_HYSTERESIS_FRAMES is 1 (drops staccato in practice)', () => {
    expect(ONSET_HYSTERESIS_FRAMES).toBe(1);
  });

  it('PITCH_MEDIAN_FRAMES is 5 (octave-error correction ring)', () => {
    expect(PITCH_MEDIAN_FRAMES).toBe(5);
  });

  it('NOTE_NAMES_JP has 12 entries covering one full octave', () => {
    expect(NOTE_NAMES_JP).toHaveLength(12);
    expect(NOTE_NAMES_JP[0]).toBe('ド');
    expect(NOTE_NAMES_JP[2]).toBe('レ');
    expect(NOTE_NAMES_JP[4]).toBe('ミ');
    expect(NOTE_NAMES_JP[5]).toBe('ファ');
    expect(NOTE_NAMES_JP[7]).toBe('ソ');
    expect(NOTE_NAMES_JP[9]).toBe('ラ');
    expect(NOTE_NAMES_JP[11]).toBe('シ');
  });

  it('NOTE_NAMES_JP marks sharps with # suffix on the natural names', () => {
    expect(NOTE_NAMES_JP[1]).toBe('ド#');
    expect(NOTE_NAMES_JP[3]).toBe('レ#');
    expect(NOTE_NAMES_JP[6]).toBe('ファ#');
    expect(NOTE_NAMES_JP[8]).toBe('ソ#');
    expect(NOTE_NAMES_JP[10]).toBe('ラ#');
  });
});
