// Tests for packages/web/src/piano-config.ts.
//
// CONFIG is mostly tuning constants; we don't try to assert every
// value. We DO pin:
//   • Fresh-instance contract — runtime PERF_TIER override must not
//     poison subsequent constructions.
//   • Field set vs. legacy literal — drift detector that catches a
//     missing or renamed field before the v8/v9/v10 tuning lineage
//     gets lost.
//   • QUESTS predicates — pure functions, easy to spot-check each
//     condition's threshold.

import { describe, it, expect } from 'vitest';
import { createPianoConfig, QUESTS_DEFS, type QuestEvalState } from '../src/piano-config';

function emptyState(): QuestEvalState {
  return {
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
}

describe('createPianoConfig — fresh instance contract', () => {
  it('returns a new object each call', () => {
    const a = createPianoConfig();
    const b = createPianoConfig();
    expect(a).not.toBe(b);
  });

  it('returns fresh nested arrays each call (no shared refs)', () => {
    const a = createPianoConfig();
    const b = createPianoConfig();
    expect(a.STAGES).not.toBe(b.STAGES);
    expect(a.ENCOURAGEMENT_TIERS).not.toBe(b.ENCOURAGEMENT_TIERS);
    expect(a.NOTE_NAMES).not.toBe(b.NOTE_NAMES);
    expect(a.THEMES).not.toBe(b.THEMES);
  });

  it('runtime mutation of MAX_PARTICLES does not poison subsequent constructions', () => {
    // Boot path: shell mutates MAX_PARTICLES from PERF_TIER override.
    const c1 = createPianoConfig();
    c1.MAX_PARTICLES = 200;
    c1.SHADOW_BLUR_ENABLED = false;
    c1.AMBIENT_PARTICLE_CHANCE = 0;
    const c2 = createPianoConfig();
    expect(c2.MAX_PARTICLES).toBe(800);
    expect(c2.SHADOW_BLUR_ENABLED).toBe(true);
    expect(c2.AMBIENT_PARTICLE_CHANCE).toBe(0.03);
  });
});

describe('createPianoConfig — pinned constants', () => {
  it('Audio analyser pinning', () => {
    const c = createPianoConfig();
    expect(c.FFT_SIZE).toBe(4096);
    expect(c.SMOOTHING).toBe(0.82);
    expect(c.ONSET_FFT_SIZE).toBe(2048);
    expect(c.ONSET_SMOOTHING).toBe(0.15);
  });

  it('AGC default range', () => {
    const c = createPianoConfig();
    expect(c.AGC_MIN_GAIN).toBe(1.0);
    expect(c.AGC_MAX_GAIN).toBe(40.0);
    expect(c.AGC_TARGET_RMS).toBe(0.06);
  });

  it('YIN minimums (incl. practice-mode floor)', () => {
    const c = createPianoConfig();
    expect(c.PITCH_MIN_HZ).toBe(25);
    expect(c.PITCH_MIN_HZ_PRACTICE).toBe(80); // dodges octave-down YIN errors
    expect(c.PITCH_MAX_HZ).toBe(5000);
  });

  it('Harmonicity gate threshold (v9)', () => {
    const c = createPianoConfig();
    // free-play: タップ/衝撃音を弾く床。実音を通す実績のある練習 0.12 の直下。
    expect(c.HARMONICITY_MIN).toBe(0.1);
    expect(c.HARMONICITY_MIN_PRACTICE).toBe(0.12); // practice filters voice/clatter
    // practice のほうが厳しい関係は維持（実音を通す実績のある 0.12 が上限）。
    expect(c.HARMONICITY_MIN_PRACTICE).toBeGreaterThan(c.HARMONICITY_MIN);
  });

  it('Quality scoring weights sum to 1.0', () => {
    const c = createPianoConfig();
    expect(c.SCORE_RHYTHM_WEIGHT + c.SCORE_DYNAMICS_WEIGHT + c.SCORE_STABILITY_WEIGHT).toBeCloseTo(
      1.0,
      5
    );
  });

  it('Synesthesia map covers all 12 chromatic semitones', () => {
    const c = createPianoConfig();
    const semis = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const s of semis) {
      expect(c.NOTE_COLORS[s]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('Stages: 7 entries (silent + 6 visible), monotonically increasing minFlow', () => {
    const c = createPianoConfig();
    expect(c.STAGES.length).toBe(7);
    expect(c.STAGES[0].minFlow).toBe(0);
    for (let i = 1; i < c.STAGES.length; i++) {
      expect(c.STAGES[i].minFlow).toBeGreaterThan(c.STAGES[i - 1].minFlow);
    }
  });

  it('Encouragement tiers: 8 entries, monotonically increasing minCombo', () => {
    const c = createPianoConfig();
    expect(c.ENCOURAGEMENT_TIERS.length).toBe(8);
    for (let i = 1; i < c.ENCOURAGEMENT_TIERS.length; i++) {
      expect(c.ENCOURAGEMENT_TIERS[i].minCombo).toBeGreaterThan(
        c.ENCOURAGEMENT_TIERS[i - 1].minCombo
      );
    }
  });

  it('Themes: 4 entries (purple/cyan/orange/white-lavender)', () => {
    const c = createPianoConfig();
    expect(c.THEMES.length).toBe(4);
    for (const t of c.THEMES) {
      expect(t.bg).toHaveLength(3);
      expect(t.colors.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('Piano key range: 21..21+88 (88-key acoustic)', () => {
    const c = createPianoConfig();
    expect(c.PIANO_KEY_MIN).toBe(21);
    expect(c.PIANO_KEY_COUNT).toBe(88);
  });

  it('QUESTS array attached to CONFIG.QUESTS at construction', () => {
    const c = createPianoConfig();
    expect(c.QUESTS).toBe(QUESTS_DEFS);
  });
});

describe('QUESTS_DEFS — predicate spot checks', () => {
  it('q1 (Nice Start) — fires at 3 onsets', () => {
    const q = QUESTS_DEFS.find((q) => q.id === 'q1')!;
    expect(q.condition({ ...emptyState(), noteOnsetTimes: [0, 1] })).toBe(false);
    expect(q.condition({ ...emptyState(), noteOnsetTimes: [0, 1, 2] })).toBe(true);
  });

  it('q2 (Good Flow) — fires at flow 50', () => {
    const q = QUESTS_DEFS.find((q) => q.id === 'q2')!;
    expect(q.condition({ ...emptyState(), flow: 49.9 })).toBe(false);
    expect(q.condition({ ...emptyState(), flow: 50 })).toBe(true);
  });

  it('q3 (Combo Master) — fires at combo 30', () => {
    const q = QUESTS_DEFS.find((q) => q.id === 'q3')!;
    expect(q.condition({ ...emptyState(), combo: 29 })).toBe(false);
    expect(q.condition({ ...emptyState(), combo: 30 })).toBe(true);
  });

  it('q5 (Virtuoso) — requires both performing state AND high confidence', () => {
    const q = QUESTS_DEFS.find((q) => q.id === 'q5')!;
    // performing alone — no
    expect(
      q.condition({ ...emptyState(), sessionState: 'performing', sessionConfidence: 0.5 })
    ).toBe(false);
    // high confidence alone (warmup) — no
    expect(q.condition({ ...emptyState(), sessionState: 'warmup', sessionConfidence: 0.9 })).toBe(
      false
    );
    // both — yes
    expect(
      q.condition({ ...emptyState(), sessionState: 'performing', sessionConfidence: 0.81 })
    ).toBe(true);
  });

  it('q11 (LEGENDARY) — needs bestCombo 200 AND flow 90', () => {
    const q = QUESTS_DEFS.find((q) => q.id === 'q11')!;
    expect(q.condition({ ...emptyState(), bestCombo: 199, flow: 95 })).toBe(false);
    expect(q.condition({ ...emptyState(), bestCombo: 250, flow: 89 })).toBe(false);
    expect(q.condition({ ...emptyState(), bestCombo: 200, flow: 90 })).toBe(true);
  });

  it('every quest has a unique id', () => {
    const ids = new Set(QUESTS_DEFS.map((q) => q.id));
    expect(ids.size).toBe(QUESTS_DEFS.length);
  });

  it('every quest has non-empty i18n keys + reward', () => {
    for (const q of QUESTS_DEFS) {
      expect(q.nameKey.length).toBeGreaterThan(0);
      expect(q.descKey.length).toBeGreaterThan(0);
      expect(q.reward.length).toBeGreaterThan(0);
    }
  });
});
