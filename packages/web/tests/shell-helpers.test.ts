// @vitest-environment happy-dom
//
// Tests for packages/web/src/shell-helpers.ts.
//
// Pure-function helpers — most tests just hand inputs and assert
// outputs. setupHiDPICanvas needs happy-dom for the Canvas API.

import { describe, it, expect, vi } from 'vitest';
import {
  setupHiDPICanvas,
  notePitchClass,
  midiToFreq,
  noteStateLabel,
  midiToPitchName,
  midiToFullName,
} from '../src/shell-helpers';

// ─── notePitchClass ────────────────────────────────────────────────

describe('notePitchClass', () => {
  it('60 (C4) → 0 (C pitch class)', () => {
    expect(notePitchClass(60)).toBe(0);
  });

  it('61 (C#4) → 1', () => {
    expect(notePitchClass(61)).toBe(1);
  });

  it('69 (A4) → 9', () => {
    expect(notePitchClass(69)).toBe(9);
  });

  it('71 (B4) → 11', () => {
    expect(notePitchClass(71)).toBe(11);
  });

  it('72 (C5) → 0 (wraps modulo 12)', () => {
    expect(notePitchClass(72)).toBe(0);
  });

  it('handles negative MIDI defensively', () => {
    expect(notePitchClass(-1)).toBe(11); // B
    expect(notePitchClass(-12)).toBe(0); // C
  });

  it('handles zero', () => {
    expect(notePitchClass(0)).toBe(0);
  });
});

// ─── midiToFreq ────────────────────────────────────────────────────

describe('midiToFreq', () => {
  it('A4 (69) → 440 Hz exactly', () => {
    expect(midiToFreq(69)).toBe(440);
  });

  it('A5 (81) → 880 Hz', () => {
    expect(midiToFreq(81)).toBeCloseTo(880, 5);
  });

  it('A3 (57) → 220 Hz', () => {
    expect(midiToFreq(57)).toBeCloseTo(220, 5);
  });

  it('C4 (60) → ~261.63 Hz', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
  });

  it('C5 (72) → 2× C4', () => {
    expect(midiToFreq(72)).toBeCloseTo(midiToFreq(60) * 2, 5);
  });

  it('semitone interval is the 12th root of 2', () => {
    const ratio = midiToFreq(70) / midiToFreq(69);
    expect(ratio).toBeCloseTo(Math.pow(2, 1 / 12), 5);
  });
});

// ─── noteStateLabel ────────────────────────────────────────────────

describe('noteStateLabel', () => {
  it('hit → " HIT"', () => {
    expect(noteStateLabel({ hit: true })).toBe(' HIT');
  });

  it('missed → " MISS"', () => {
    expect(noteStateLabel({ missed: true })).toBe(' MISS');
  });

  it('neither → ""', () => {
    expect(noteStateLabel({})).toBe('');
  });

  it('hit takes precedence over missed (defensive)', () => {
    // Shouldn't happen in practice but the legacy implementation
    // returns ' HIT' first.
    expect(noteStateLabel({ hit: true, missed: true })).toBe(' HIT');
  });
});

// ─── midiToPitchName + midiToFullName ──────────────────────────────

const EN_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const JP_NAMES = ['ド', 'ド#', 'レ', 'レ#', 'ミ', 'ファ', 'ファ#', 'ソ', 'ソ#', 'ラ', 'ラ#', 'シ'];

describe('midiToPitchName', () => {
  it('C4 (60) EN → "C"', () => {
    expect(midiToPitchName(60, EN_NAMES)).toBe('C');
  });

  it('C4 (60) JP → "ド"', () => {
    expect(midiToPitchName(60, JP_NAMES)).toBe('ド');
  });

  it('A4 (69) EN → "A"', () => {
    expect(midiToPitchName(69, EN_NAMES)).toBe('A');
  });

  it('A4 (69) JP → "ラ"', () => {
    expect(midiToPitchName(69, JP_NAMES)).toBe('ラ');
  });

  it('C#4 (61) EN → "C#"', () => {
    expect(midiToPitchName(61, EN_NAMES)).toBe('C#');
  });

  it('returns empty string for missing entries (defensive)', () => {
    expect(midiToPitchName(60, [])).toBe('');
  });
});

describe('midiToFullName', () => {
  it('C4 (60) EN → "C4"', () => {
    expect(midiToFullName(60, EN_NAMES)).toBe('C4');
  });

  it('C4 (60) JP → "ド4"', () => {
    expect(midiToFullName(60, JP_NAMES)).toBe('ド4');
  });

  it('A4 (69) EN → "A4"', () => {
    expect(midiToFullName(69, EN_NAMES)).toBe('A4');
  });

  it('B3 (59) EN → "B3"', () => {
    expect(midiToFullName(59, EN_NAMES)).toBe('B3');
  });

  it('C5 (72) EN → "C5"', () => {
    expect(midiToFullName(72, EN_NAMES)).toBe('C5');
  });

  it('A0 (21, lowest piano key) EN → "A0"', () => {
    expect(midiToFullName(21, EN_NAMES)).toBe('A0');
  });

  it('C8 (108, highest piano key) EN → "C8"', () => {
    expect(midiToFullName(108, EN_NAMES)).toBe('C8');
  });
});

// ─── setupHiDPICanvas ──────────────────────────────────────────────

// Note: happy-dom's <canvas> width/height properties are protected
// (the underlying lib treats them as readonly attributes). We assert
// the observable side effects: CSS sizing + setTransform with the
// expected DPR.
describe('setupHiDPICanvas', () => {
  it('sets CSS size in px', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const canvas = document.createElement('canvas');
    const fakeCtx = { setTransform: vi.fn() };
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    const ctx = setupHiDPICanvas(canvas, 100, 200);
    expect(canvas.style.width).toBe('100px');
    expect(canvas.style.height).toBe('200px');
    expect(ctx).toBe(fakeCtx);
  });

  it('calls setTransform with DPR=2 (HiDPI)', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const canvas = document.createElement('canvas');
    const fakeCtx = { setTransform: vi.fn() };
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    setupHiDPICanvas(canvas, 100, 200);
    expect(fakeCtx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('calls setTransform with DPR=1 (low-DPI desktop)', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    const canvas = document.createElement('canvas');
    const fakeCtx = { setTransform: vi.fn() };
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    setupHiDPICanvas(canvas, 80, 120);
    expect(fakeCtx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('falls back to DPR=1 when window.devicePixelRatio is 0/undefined', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true });
    const canvas = document.createElement('canvas');
    const fakeCtx = { setTransform: vi.fn() };
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    setupHiDPICanvas(canvas, 50, 60);
    expect(fakeCtx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('returns the context on success', () => {
    const canvas = document.createElement('canvas');
    const fakeCtx = { setTransform: vi.fn() };
    vi.spyOn(canvas, 'getContext').mockReturnValue(fakeCtx as unknown as CanvasRenderingContext2D);
    const ctx = setupHiDPICanvas(canvas, 10, 10);
    expect(ctx).toBe(fakeCtx);
  });

  it('returns null when getContext returns null (stripped-down env)', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    expect(setupHiDPICanvas(canvas, 10, 10)).toBeNull();
  });
});
