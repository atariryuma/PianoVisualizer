import { describe, it, expect } from 'vitest';
import { CONFIG, QUESTS, type QuestStateView } from '../src/config';

describe('CONFIG — schema sanity', () => {
  it('exposes the audio FFT sizes as power-of-two', () => {
    expect(CONFIG.FFT_SIZE).toBe(4096);
    expect(CONFIG.ONSET_FFT_SIZE).toBe(2048);
    // Both should be powers of 2 (Web Audio requirement).
    expect(CONFIG.FFT_SIZE & (CONFIG.FFT_SIZE - 1)).toBe(0);
    expect(CONFIG.ONSET_FFT_SIZE & (CONFIG.ONSET_FFT_SIZE - 1)).toBe(0);
  });

  it('quality weights sum to ~1.0', () => {
    const sum =
      CONFIG.SCORE_RHYTHM_WEIGHT + CONFIG.SCORE_DYNAMICS_WEIGHT + CONFIG.SCORE_STABILITY_WEIGHT;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('AGC bounds are sensible', () => {
    expect(CONFIG.AGC_MIN_GAIN).toBeLessThan(CONFIG.AGC_MAX_GAIN);
    expect(CONFIG.AGC_VOICE_SUPPRESS_MAX).toBeLessThan(CONFIG.AGC_MAX_GAIN);
    expect(CONFIG.AGC_TARGET_RMS).toBeGreaterThan(CONFIG.AGC_SILENCE_FLOOR);
  });

  it('NOTE_COLORS covers all 12 chromatic note names', () => {
    const expected = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const name of expected) {
      expect(CONFIG.NOTE_COLORS).toHaveProperty(name);
      expect((CONFIG.NOTE_COLORS as Record<string, string>)[name]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('STAGES are monotonically non-decreasing in minFlow', () => {
    for (let i = 1; i < CONFIG.STAGES.length; i++) {
      expect(CONFIG.STAGES[i].minFlow).toBeGreaterThanOrEqual(CONFIG.STAGES[i - 1].minFlow);
    }
  });

  it('ENCOURAGEMENT_TIERS are monotonically increasing in minCombo', () => {
    for (let i = 1; i < CONFIG.ENCOURAGEMENT_TIERS.length; i++) {
      expect(CONFIG.ENCOURAGEMENT_TIERS[i].minCombo).toBeGreaterThan(
        CONFIG.ENCOURAGEMENT_TIERS[i - 1].minCombo
      );
    }
  });

  it('THEMES has 4 entries, each with 6 colors', () => {
    expect(CONFIG.THEMES).toHaveLength(4);
    for (const theme of CONFIG.THEMES) {
      expect(theme.colors).toHaveLength(6);
      expect(theme.bg).toHaveLength(3);
      expect(theme.glow).toMatch(/^rgba\(/);
    }
  });

  it('PIANO key range matches an 88-key piano (A0=21 .. C8=108)', () => {
    expect(CONFIG.PIANO_KEY_MIN).toBe(21);
    expect(CONFIG.PIANO_KEY_COUNT).toBe(88);
    expect(CONFIG.PIANO_KEY_MIN + CONFIG.PIANO_KEY_COUNT - 1).toBe(108);
  });

  it('practice harmonicity gate is stricter than free-play', () => {
    expect(CONFIG.HARMONICITY_MIN_PRACTICE).toBeGreaterThan(CONFIG.HARMONICITY_MIN);
  });

  it('CONFIG is treated as readonly via `as const`', () => {
    // Type-level check: `CONFIG.FFT_SIZE` is a literal `4096`, not `number`.
    // We can't assert types at runtime, but if this file compiles it passes.
    const verify: 4096 = CONFIG.FFT_SIZE;
    expect(verify).toBe(4096);
  });
});

describe('QUESTS', () => {
  const baseState: QuestStateView = {
    noteOnsetTimes: [],
    flow: 0,
    combo: 0,
    bestCombo: 0,
    stabilityScore: 0,
    rhythmScore: 0,
    dynamicsScore: 0,
    qualityScore: 0,
    sessionState: 'waiting',
    sessionConfidence: 0,
  };

  it('has 11 quests, each with required fields', () => {
    expect(QUESTS).toHaveLength(11);
    for (const q of QUESTS) {
      expect(q.id).toBeTruthy();
      expect(q.nameKey).toBeTruthy();
      expect(q.descKey).toBeTruthy();
      expect(typeof q.condition).toBe('function');
      expect(q.reward).toBeTruthy();
    }
  });

  it('quest ids are unique', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('q1 fires after 3+ note onsets', () => {
    const q1 = QUESTS.find((q) => q.id === 'q1')!;
    expect(q1.condition({ ...baseState, noteOnsetTimes: [1, 2, 3] })).toBe(true);
    expect(q1.condition({ ...baseState, noteOnsetTimes: [1, 2] })).toBe(false);
  });

  it('q2 fires when flow ≥ 50', () => {
    const q2 = QUESTS.find((q) => q.id === 'q2')!;
    expect(q2.condition({ ...baseState, flow: 50 })).toBe(true);
    expect(q2.condition({ ...baseState, flow: 49.9 })).toBe(false);
  });

  it('q5 requires both performing state AND high session confidence', () => {
    const q5 = QUESTS.find((q) => q.id === 'q5')!;
    expect(q5.condition({ ...baseState, sessionState: 'performing', sessionConfidence: 0.9 })).toBe(
      true
    );
    expect(q5.condition({ ...baseState, sessionState: 'warmup', sessionConfidence: 0.9 })).toBe(
      false
    );
    expect(q5.condition({ ...baseState, sessionState: 'performing', sessionConfidence: 0.5 })).toBe(
      false
    );
  });

  it('q11 LEGENDARY requires 200 best combo AND 90 flow', () => {
    const q11 = QUESTS.find((q) => q.id === 'q11')!;
    expect(q11.condition({ ...baseState, bestCombo: 200, flow: 90 })).toBe(true);
    expect(q11.condition({ ...baseState, bestCombo: 199, flow: 90 })).toBe(false);
    expect(q11.condition({ ...baseState, bestCombo: 200, flow: 89 })).toBe(false);
  });

  it('every quest condition returns false on the empty baseState', () => {
    for (const q of QUESTS) {
      expect(q.condition(baseState), `quest ${q.id}`).toBe(false);
    }
  });
});
