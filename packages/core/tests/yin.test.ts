import { describe, it, expect } from 'vitest';
import { detectPitchYIN, freqToNote } from '../src/audio/yin';

const SAMPLE_RATE = 48000;
const BUF_SIZE = 4096;

function sineBuffer(
  freqHz: number,
  sampleRate = SAMPLE_RATE,
  size = BUF_SIZE,
  amp = 0.5
): Float32Array {
  const out = new Float32Array(size);
  const w = (2 * Math.PI * freqHz) / sampleRate;
  for (let i = 0; i < size; i++) out[i] = Math.sin(w * i) * amp;
  return out;
}

function noiseBuffer(size = BUF_SIZE, amp = 0.1): Float32Array {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = (Math.random() * 2 - 1) * amp;
  return out;
}

describe('detectPitchYIN', () => {
  it('returns pitch=-1 on silence', () => {
    const buf = new Float32Array(BUF_SIZE);
    const r = detectPitchYIN(buf, SAMPLE_RATE);
    expect(r.pitch).toBe(-1);
    expect(r.rms).toBeLessThan(0.001);
  });

  // YIN at 4096-sample buffer / 48kHz has ~bin-width frequency resolution.
  // Realistic accuracy is ±0.5% (about ±2 Hz at A4, ±10 Hz at C7).
  // Music-perceptually that's <10 cents — fine for note classification.
  const expectClosePct = (actual: number, expected: number, pct: number) => {
    expect(Math.abs(actual - expected) / expected).toBeLessThan(pct);
  };

  it('detects A4 (440 Hz) within 0.5%', () => {
    const r = detectPitchYIN(sineBuffer(440), SAMPLE_RATE);
    expect(r.pitch).toBeGreaterThan(0);
    expectClosePct(r.pitch, 440, 0.005);
    expect(r.conf).toBeGreaterThan(0.5);
  });

  it('detects middle C (261.63 Hz) within 1%', () => {
    // Middle C lands between bins more awkwardly than A4 — slightly wider tolerance.
    const r = detectPitchYIN(sineBuffer(261.63), SAMPLE_RATE);
    expectClosePct(r.pitch, 261.63, 0.01);
  });

  it('detects low piano A1 (55 Hz) within 0.5%', () => {
    const r = detectPitchYIN(sineBuffer(55), SAMPLE_RATE);
    expectClosePct(r.pitch, 55, 0.005);
  });

  it('detects high piano C7 (~2093 Hz) within 1%', () => {
    // Higher pitches have wider bin error at 4096-sample resolution.
    const r = detectPitchYIN(sineBuffer(2093), SAMPLE_RATE);
    expectClosePct(r.pitch, 2093, 0.01);
  });

  it('rejects pure noise (low confidence OR pitch=-1)', () => {
    const r = detectPitchYIN(noiseBuffer(), SAMPLE_RATE);
    // White noise either fails the pitch detector entirely or returns very low confidence.
    if (r.pitch > 0) {
      expect(r.conf).toBeLessThan(0.5);
    } else {
      expect(r.pitch).toBe(-1);
    }
  });

  it('respects custom min (rejects 55 Hz if pitchMinHz=80)', () => {
    // YIN searches in [tauMin..tauMax] derived from min/max. Below pitchMinHz,
    // tauMax shrinks and the algorithm can't find the period → returns -1.
    const r = detectPitchYIN(sineBuffer(55), SAMPLE_RATE, { pitchMinHz: 80 });
    expect(r.pitch).toBe(-1);
  });

  it('respects custom max (out-of-range pitch returns -1 OR sub-harmonic in range)', () => {
    // KNOWN YIN BEHAVIOR: with max=300, a 440 Hz sine may lock to its 220 Hz
    // sub-harmonic (octave below). Accept either rejection (-1) OR a value
    // within [min..max]. The legacy app compensates with a median ring buffer.
    const r = detectPitchYIN(sineBuffer(440), SAMPLE_RATE, { pitchMaxHz: 300 });
    if (r.pitch > 0) {
      expect(r.pitch).toBeLessThanOrEqual(300);
      expect(r.pitch).toBeGreaterThanOrEqual(25);
    }
  });

  it('handles different sample rates within 0.5%', () => {
    const r44k = detectPitchYIN(sineBuffer(440, 44100), 44100);
    expectClosePct(r44k.pitch, 440, 0.005);

    const r96k = detectPitchYIN(sineBuffer(440, 96000), 96000);
    expectClosePct(r96k.pitch, 440, 0.005);
  });

  it('handles harmonic-rich tone (square wave) at 220 Hz', () => {
    // Build a square wave; YIN should still lock to the fundamental.
    const buf = new Float32Array(BUF_SIZE);
    const period = SAMPLE_RATE / 220;
    for (let i = 0; i < BUF_SIZE; i++) {
      buf[i] = (i % period < period / 2 ? 1 : -1) * 0.4;
    }
    const r = detectPitchYIN(buf, SAMPLE_RATE);
    expect(r.pitch).toBeCloseTo(220, 0);
  });

  it('returns sensible RMS for a 0.5 amplitude sine', () => {
    const r = detectPitchYIN(sineBuffer(440, SAMPLE_RATE, BUF_SIZE, 0.5), SAMPLE_RATE);
    // RMS of a 0.5 amp sine is 0.5/sqrt(2) ≈ 0.354
    expect(r.rms).toBeCloseTo(0.354, 1);
  });

  it('repeated calls reuse scratch buffers without allocation issues', () => {
    for (let i = 0; i < 50; i++) {
      const r = detectPitchYIN(sineBuffer(440 + i), SAMPLE_RATE);
      expect(r.pitch).toBeGreaterThan(0);
    }
  });
});

describe('freqToNote', () => {
  it('returns A4 for 440 Hz', () => {
    const n = freqToNote(440)!;
    expect(n.name).toBe('A');
    expect(n.octave).toBe(4);
    expect(n.noteNum).toBe(69);
  });

  it('returns C4 (middle C) for ~261.63 Hz', () => {
    const n = freqToNote(261.63)!;
    expect(n.name).toBe('C');
    expect(n.octave).toBe(4);
    expect(n.noteNum).toBe(60);
  });

  it('returns null for out-of-range frequencies', () => {
    expect(freqToNote(10)).toBeNull();
    expect(freqToNote(10000)).toBeNull();
  });

  it('handles A0 (lowest piano key) at 27.5 Hz', () => {
    // 27.5 is below the default min (25), so it should resolve.
    const n = freqToNote(27.5);
    expect(n).not.toBeNull();
    expect(n!.name).toBe('A');
    expect(n!.octave).toBe(0);
  });
});
