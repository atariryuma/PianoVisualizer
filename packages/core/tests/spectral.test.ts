import { describe, it, expect } from 'vitest';
import {
  computeSpectralFlatness,
  computeSpectralCrest,
  computeSpectralCentroid,
  coefficientOfVariation,
} from '../src/audio/spectral';

describe('computeSpectralFlatness', () => {
  it('returns ~0 for a single dominant peak', () => {
    const spec = new Uint8Array(64);
    spec[10] = 200;
    const f = computeSpectralFlatness(spec, 0, 64);
    expect(f).toBeLessThan(0.05);
  });

  it('returns ~1 for uniform spectrum (white noise)', () => {
    const spec = new Uint8Array(64).fill(100);
    const f = computeSpectralFlatness(spec, 0, 64);
    expect(f).toBeGreaterThan(0.95);
  });

  it('returns 0 for too-small range', () => {
    expect(computeSpectralFlatness(new Uint8Array(64), 0, 1)).toBe(0);
  });

  it('returns 0 for all-zero spectrum', () => {
    expect(computeSpectralFlatness(new Uint8Array(64), 0, 64)).toBeLessThan(1e-3);
  });

  it('values between 0 and 1 for mixed spectra', () => {
    const spec = new Uint8Array(64);
    for (let i = 0; i < 64; i++) spec[i] = i; // ramp
    const f = computeSpectralFlatness(spec, 0, 64);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
  });
});

describe('computeSpectralCrest', () => {
  it('high for single peak', () => {
    const spec = new Uint8Array(64);
    spec[10] = 200;
    // Mean ≈ 200/64 ≈ 3.1, max=200 → crest ≈ 64
    const c = computeSpectralCrest(spec, 0, 64);
    expect(c).toBeGreaterThan(50);
  });

  it('≈ 1 for uniform spectrum', () => {
    const spec = new Uint8Array(64).fill(100);
    expect(computeSpectralCrest(spec, 0, 64)).toBeCloseTo(1, 5);
  });

  it('returns 0 for empty range', () => {
    expect(computeSpectralCrest(new Uint8Array(64), 0, 1)).toBe(0);
  });

  it('returns 0 for all-zero spectrum', () => {
    expect(computeSpectralCrest(new Uint8Array(64), 0, 64)).toBe(0);
  });
});

describe('computeSpectralCentroid', () => {
  it('returns the peak frequency for a single-bin spectrum', () => {
    const spec = new Uint8Array(64);
    spec[10] = 255;
    const binHz = 100; // 10 * 100 = 1000 Hz
    expect(computeSpectralCentroid(spec, 0, 64, binHz)).toBeCloseTo(1000, 5);
  });

  it('returns mean of two equal peaks', () => {
    const spec = new Uint8Array(64);
    spec[10] = 100;
    spec[20] = 100;
    const binHz = 50; // 10*50=500 + 20*50=1000 → centroid 750
    expect(computeSpectralCentroid(spec, 0, 64, binHz)).toBeCloseTo(750, 5);
  });

  it('returns 0 for empty spectrum', () => {
    expect(computeSpectralCentroid(new Uint8Array(64), 0, 64, 50)).toBe(0);
  });

  it('weighted toward larger peaks', () => {
    const spec = new Uint8Array(64);
    spec[10] = 50; // 10 * 100 = 1000
    spec[20] = 200; // 20 * 100 = 2000, but weighted 4x
    const binHz = 100;
    const c = computeSpectralCentroid(spec, 0, 64, binHz);
    // (50*1000 + 200*2000) / (50+200) = 450000/250 = 1800
    expect(c).toBeCloseTo(1800, 5);
  });
});

describe('coefficientOfVariation', () => {
  it('returns 0 for arrays shorter than 3', () => {
    expect(coefficientOfVariation([])).toBe(0);
    expect(coefficientOfVariation([5])).toBe(0);
    expect(coefficientOfVariation([5, 5])).toBe(0);
  });

  it('returns 0 for constant array', () => {
    expect(coefficientOfVariation([5, 5, 5, 5])).toBe(0);
    expect(coefficientOfVariation([100, 100, 100])).toBe(0);
  });

  it('returns 0 for zero-mean array', () => {
    expect(coefficientOfVariation([-1, 0, 1])).toBe(0);
  });

  it('correctly computes CV for known sequences', () => {
    // [1, 2, 3] → mean=2, variance=2/3, stddev=√(2/3)≈0.816, CV≈0.408
    expect(coefficientOfVariation([1, 2, 3])).toBeCloseTo(0.408, 2);
    // [10, 20, 30] → same shape, just scaled
    expect(coefficientOfVariation([10, 20, 30])).toBeCloseTo(0.408, 2);
  });

  it('handles larger arrays', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const cv = coefficientOfVariation(arr);
    // mean=50.5, variance≈833.25, stddev≈28.87, CV≈0.572
    expect(cv).toBeCloseTo(0.572, 2);
  });
});
