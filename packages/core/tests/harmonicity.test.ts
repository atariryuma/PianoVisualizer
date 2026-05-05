import { describe, it, expect } from 'vitest';
import { computeHarmonicity } from '../src/audio/harmonicity';

describe('computeHarmonicity', () => {
  it('returns 0 if fundamental bin is invalid', () => {
    const spec = new Uint8Array(256);
    expect(computeHarmonicity(spec, 0, 0, 256)).toBe(0);
    expect(computeHarmonicity(spec, 256, 0, 256)).toBe(0);
    expect(computeHarmonicity(spec, -1, 0, 256)).toBe(0);
  });

  it('returns 0 for empty spectrum', () => {
    expect(computeHarmonicity(new Uint8Array(256), 10, 0, 256)).toBe(0);
  });

  it('returns ~1 for a perfect harmonic series', () => {
    // Build a spectrum with peaks ONLY at integer multiples of bin 10.
    const spec = new Uint8Array(256);
    for (let h = 1; h <= 7; h++) {
      const bin = h * 10;
      if (bin < 256) spec[bin] = 200;
    }
    const r = computeHarmonicity(spec, 10, 0, 256);
    expect(r).toBeGreaterThan(0.95); // nearly all energy is harmonic
  });

  it('returns low value for noise (energy spread everywhere)', () => {
    const spec = new Uint8Array(256);
    for (let i = 0; i < 256; i++) spec[i] = 80 + Math.floor(Math.random() * 40);
    const r = computeHarmonicity(spec, 10, 0, 256);
    // Harmonics cover roughly 7 partials × (2*tol+1) = 35 bins out of 256.
    // Expect ~35/256 = 0.137 of total. Allow generous range due to randomness.
    expect(r).toBeGreaterThan(0.05);
    expect(r).toBeLessThan(0.4);
  });

  it('higher harmonicity for piano-like vs voice-like', () => {
    // Piano-like: peaks at integer multiples of 20.
    const piano = new Uint8Array(512);
    for (let h = 1; h <= 6; h++) piano[h * 20] = 220 - h * 20;
    // Voice-like: formants at non-harmonic bins (45, 95, 180).
    const voice = new Uint8Array(512);
    voice[20] = 100;
    voice[45] = 200;
    voice[95] = 200;
    voice[180] = 200;

    const ph = computeHarmonicity(piano, 20, 0, 512);
    const vh = computeHarmonicity(voice, 20, 0, 512);
    expect(ph).toBeGreaterThan(vh);
    expect(ph).toBeGreaterThan(0.9);
  });

  it('respects custom binTolerance (wider = catches more energy)', () => {
    const spec = new Uint8Array(256);
    spec[20] = 200; // exact fundamental
    spec[19] = 100; // ±1
    spec[21] = 100;
    spec[18] = 100; // ±2
    spec[22] = 100;
    spec[40] = 200; // 2nd harmonic exact
    const tight = computeHarmonicity(spec, 20, 0, 256, { binTolerance: 0 });
    const wide = computeHarmonicity(spec, 20, 0, 256, { binTolerance: 2 });
    expect(wide).toBeGreaterThan(tight);
  });

  it('respects custom partials count', () => {
    const spec = new Uint8Array(512);
    for (let h = 1; h <= 10; h++) spec[h * 30] = 200;
    const few = computeHarmonicity(spec, 30, 0, 512, { partials: 2 });
    const many = computeHarmonicity(spec, 30, 0, 512, { partials: 8 });
    expect(many).toBeGreaterThan(few);
  });
});
