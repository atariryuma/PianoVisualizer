// Tests for packages/core/src/render/perf-tier.ts — device tier detection +
// the reduced-motion helpers (previously untested; flagged by the 2026-07
// audit). detectPerfTier reads navigator/localStorage, so we stub globals.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectPerfTier,
  PERF_PROFILES,
  prefersReducedMotion,
  reduceProfile,
} from '../src/render/perf-tier';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PERF_PROFILES', () => {
  it('escalates particle budget low → mid → high', () => {
    expect(PERF_PROFILES.low.maxParticles3D).toBeLessThan(PERF_PROFILES.mid.maxParticles3D);
    expect(PERF_PROFILES.mid.maxParticles3D).toBeLessThan(PERF_PROFILES.high.maxParticles3D);
  });
  it('disables shadowBlur only on low', () => {
    expect(PERF_PROFILES.low.shadowBlur).toBe(false);
    expect(PERF_PROFILES.mid.shadowBlur).toBe(true);
    expect(PERF_PROFILES.high.shadowBlur).toBe(true);
  });
});

describe('detectPerfTier', () => {
  it('honors the localStorage override', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, userAgent: '' });
    vi.stubGlobal('localStorage', { getItem: () => 'low' });
    expect(detectPerfTier()).toBe('low');
  });

  it('8+ cores → high', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 10, userAgent: 'X', deviceMemory: 8 });
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(detectPerfTier()).toBe('high');
  });

  it('2 cores / low memory → low', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 2, userAgent: 'X', deviceMemory: 2 });
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(detectPerfTier()).toBe('low');
  });

  it('mid-range → mid', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 4, userAgent: 'X', deviceMemory: 4 });
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(detectPerfTier()).toBe('mid');
  });

  it('survives a throwing localStorage (private mode)', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 4, userAgent: 'X', deviceMemory: 4 });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => detectPerfTier()).not.toThrow();
  });
});

describe('prefersReducedMotion', () => {
  it('true when matchMedia matches', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
  });
  it('false when matchMedia does not match', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });
  it('false + no throw when matchMedia is unavailable (SSR/happy-dom)', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('reduceProfile', () => {
  it('caps particles, zeroes ambient, kills shadowBlur', () => {
    const r = reduceProfile(PERF_PROFILES.high);
    expect(r.maxParticles3D).toBeLessThanOrEqual(120);
    expect(r.ambientChance).toBe(0);
    expect(r.shadowBlur).toBe(false);
    expect(r.bgStarCount).toBeLessThanOrEqual(30);
  });
  it('never raises a profile below its own values', () => {
    const r = reduceProfile(PERF_PROFILES.low); // low is already 400
    expect(r.maxParticles3D).toBeLessThanOrEqual(PERF_PROFILES.low.maxParticles3D);
  });
});
