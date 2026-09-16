// Tests for packages/web/src/game-state-update.ts.
//
// Smoke-test integration: drive the reducer with synthetic
// pitch/conf/rms inputs and assert observable state mutations
// (pitch median ring, combo bookkeeping, flow decay, stage transition,
// onset routing through reducers).

import { describe, it, expect, vi } from 'vitest';
import { applyFlowEvent } from '@piano/core';
import {
  updateGameState,
  updateGameStateWithoutMic,
  buildFlowMeterOptions,
  type GameStateUpdateDeps,
  type GameStateRef,
  type GameStateOnsetState,
  type GameStateTuning,
} from '../src/game-state-update';

const TUNING: Omit<GameStateTuning, 'pitchMedianFrames'> = {
  pitchMinHz: 50,
  pitchMinHzPractice: 60,
  pitchMaxHz: 5000,
  confidenceThreshold: 0.7,
  goodNoteRms: 0.005,
  onsetGateDurationMs: 150,
  noiseRmsThreshold: 0.05,
  // The REAL shared reducer runs in these tests (see `core` below), so these
  // are the rules under test — not a mock's.
  flow: {
    comboWindowMs: 2000,
    silenceDecayStartMs: 3000,
    silenceHardDecayMs: 8000,
    flowDecaySoft: 5,
    flowDecayHard: 15,
    comboDecayRate: 0.5,
    noisePenaltyCooldownMs: 500,
    flowNoisePenalty: 8,
    comboNoisePenalty: 2,
    flowGainBase: 4,
    flowGainComboMax: 8,
    flowGainStabilityMax: 6,
    flowGainQualityMax: 4,
    flowGainNonPerformingMultiplier: 1.5,
    midiBaseFlowGain: 1,
    midiVelocityFlowGain: 1.8,
  },
};

function makeState(over: Partial<GameStateRef> = {}): GameStateRef {
  return {
    recentPitches: [],
    adaptiveSilenceRms: 0.001,
    lastOnsetTimeMs: -10000,
    debugLastRms: 0,
    debugLastConf: 0,
    debugLastPitch: 0,
    debugIsGoodNote: false,
    debugIsActivePlay: false,
    debugHarmonicity: 0,
    debugOnsetReason: '',
    debugMaxRms: 0,
    debugMaxConf: 0,
    debugMaxHarm: 0,
    debugOnsetCount: 0,
    sessionState: 'performing',
    lastSilenceStartMs: -1,
    lastGoodNoteTimeMs: 0,
    lastNoisePenaltyMs: 0,
    combo: 0,
    bestCombo: 0,
    comboDecayAccum: 0,
    flow: 30,
    peakFlow: 30,
    qualityScore: 0.5,
    pitchStability: 0.5,
    currentStage: 0,
    lastDebugLogMs: 0,
    ...over,
  };
}

function makeFixture(over: { state?: Partial<GameStateRef>; onset?: GameStateOnsetState } = {}) {
  const state = makeState(over.state);
  const updateMultiFeatureOnset = vi
    .fn<(timeMs: number, pitch: number) => GameStateOnsetState>()
    .mockReturnValue(over.onset ?? { isOnset: false, gateOpen: false });
  const updateSessionConfidence = vi.fn();
  const updateQualityScores = vi.fn();
  const updateHUD = vi.fn();
  const spawnBurst = vi.fn();
  const effectStarShower = vi.fn();
  const stageLabelEl = { textContent: '', classList: { toggle: vi.fn() } };
  const remoteLog = vi.fn();

  let stageReturn = 0;
  const deps: GameStateUpdateDeps = {
    state,
    getPractice: () => ({ enabled: false }),
    getMidiInput: () => ({ enabled: false, lastEventTime: 0 }),
    // 'auto' semantics — the resolved source follows the hardware, which is what
    // every expectation in this file was written against.
    isMidiActive: () => false,
    getPitchMedianFrames: () => 5,
    tuning: { ...TUNING },
    stages: [{ minFlow: 0 }, { minFlow: 30 }, { minFlow: 60 }, { minFlow: 90 }],
    qhOptsMic: {},
    psOpts: {},
    core: {
      applyOnsetToHistory: vi.fn(),
      applyOnsetPitch: vi.fn(),
      applyActivePlay: vi.fn(),
      decayStability: vi.fn(),
      stageForFlow: vi.fn(() => stageReturn),
      classifyStageTransition: (prev, next) => (next > prev ? 'up' : next < prev ? 'down' : 'same'),
      pitchHzToSemitones: (hz) => Math.round(12 * Math.log2(hz / 440) + 69),
      applyFlowEvent: applyFlowEvent as GameStateUpdateDeps['core']['applyFlowEvent'],
    },
    updateMultiFeatureOnset,
    updateSessionConfidence,
    updateQualityScores,
    updateHUD,
    spawnBurst,
    effectStarShower,
    getScreen: () => ({ W: 800, H: 600 }),
    stageLabelEl,
    stageLabelText: (s) => 'STAGE:' + JSON.stringify(s),
    remoteLogEnabled: false,
    remoteLog,
  };

  return {
    state,
    deps,
    updateMultiFeatureOnset,
    updateSessionConfidence,
    updateQualityScores,
    updateHUD,
    spawnBurst,
    effectStarShower,
    setStage: (n: number) => {
      stageReturn = n;
    },
  };
}

// ─── pitch median ─────────────────────────────────────────────────

describe('updateGameState — pitch median ring', () => {
  it('only collects high-confidence pitches', () => {
    const fx = makeFixture();
    updateGameState(0, 16, { pitch: 440, conf: 0.4, rms: 0.01 }, fx.deps); // low conf
    updateGameState(20, 16, { pitch: 440, conf: 0.8, rms: 0.01 }, fx.deps);
    // R2-3: エントリは時刻付き（t = その tick の timeMs）
    expect(fx.state.recentPitches).toEqual([{ hz: 440, t: 20 }]);
  });

  it('trims to pitchMedianFrames length', () => {
    const fx = makeFixture();
    for (let i = 0; i < 10; i++) {
      updateGameState(i * 20, 16, { pitch: 440 + i, conf: 0.9, rms: 0.01 }, fx.deps);
    }
    expect(fx.state.recentPitches!.length).toBe(5);
  });

  it('R2-3: 各エントリに書き込み tick の timeMs が刻まれる', () => {
    const fx = makeFixture();
    updateGameState(100, 16, { pitch: 440, conf: 0.9, rms: 0.01 }, fx.deps);
    updateGameState(350, 16, { pitch: 220, conf: 0.9, rms: 0.01 }, fx.deps);
    expect(fx.state.recentPitches).toEqual([
      { hz: 440, t: 100 },
      { hz: 220, t: 350 },
    ]);
  });
});

// ─── adaptive silence floor ───────────────────────────────────────

describe('updateGameState — adaptive silence', () => {
  it('seeds adaptiveSilenceRms when null', () => {
    const fx = makeFixture({ state: { adaptiveSilenceRms: null } });
    updateGameState(0, 16, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    expect(fx.state.adaptiveSilenceRms).not.toBeNull();
  });

  it('updates floor during quiet windows (low rms + no recent onset)', () => {
    const fx = makeFixture({ state: { adaptiveSilenceRms: 0.001, lastOnsetTimeMs: -10000 } });
    updateGameState(10000, 16, { pitch: 0, conf: 0, rms: 0.005 }, fx.deps);
    // EMA 0.001 * 0.97 + 0.005 * 0.03 = 0.001120
    expect(fx.state.adaptiveSilenceRms).toBeCloseTo(0.00112, 5);
  });
});

// ─── onset routing ────────────────────────────────────────────────

describe('updateGameState — onset routing', () => {
  it('isOnsetNote=true on full-criteria pitch + onset detector fires', () => {
    const fx = makeFixture({ onset: { isOnset: true, gateOpen: true } });
    const r = updateGameState(0, 16, { pitch: 440, conf: 0.9, rms: 0.05 }, fx.deps);
    expect(r).toBe(true);
    expect(fx.state.debugIsGoodNote).toBe(true);
    expect(fx.deps.core.applyOnsetToHistory).toHaveBeenCalled();
    expect(fx.deps.core.applyOnsetPitch).toHaveBeenCalled();
  });

  it('isOnsetNote=false when pitch out of range', () => {
    const fx = makeFixture({ onset: { isOnset: true, gateOpen: true } });
    const r = updateGameState(0, 16, { pitch: 30, conf: 0.9, rms: 0.05 }, fx.deps); // < 50Hz
    expect(r).toBe(false);
  });

  it('uses practice-mode pitchMinHz when practice.enabled', () => {
    const fx = makeFixture({ onset: { isOnset: true, gateOpen: true } });
    fx.deps.getPractice = () => ({ enabled: true });
    // Pitch 55Hz: passes default pitchMinHz=50, fails practice=60.
    const r = updateGameState(0, 16, { pitch: 55, conf: 0.9, rms: 0.05 }, fx.deps);
    expect(r).toBe(false);
  });

  it('skips onset history feed when MIDI is the ACTIVE input', () => {
    const fx = makeFixture({ onset: { isOnset: true, gateOpen: true } });
    fx.deps.isMidiActive = () => true;
    updateGameState(500, 16, { pitch: 440, conf: 0.9, rms: 0.05 }, fx.deps);
    expect(fx.deps.core.applyOnsetToHistory).not.toHaveBeenCalled();
  });

  it('KEEPS feeding the histories when a keyboard is attached but the mic is pinned', () => {
    // The gate is the resolved source, not the hardware flag. Reading
    // `midiInput.enabled` here froze a mic-pinned player's quality read-out
    // (rhythm / dynamics / stability) for the whole session while they played.
    const fx = makeFixture({ onset: { isOnset: true, gateOpen: true } });
    fx.deps.getMidiInput = () => ({ enabled: true, lastEventTime: 0 });
    fx.deps.isMidiActive = () => false;
    updateGameState(500, 16, { pitch: 440, conf: 0.9, rms: 0.05 }, fx.deps);
    expect(fx.deps.core.applyOnsetToHistory).toHaveBeenCalled();
  });
});

// ─── combo bookkeeping ───────────────────────────────────────────

describe('updateGameState — combo', () => {
  it('within comboWindow → increment', () => {
    const fx = makeFixture({
      state: { combo: 5, lastGoodNoteTimeMs: 100 },
      onset: { isOnset: true, gateOpen: true },
    });
    updateGameState(500, 16, { pitch: 440, conf: 0.9, rms: 0.05 }, fx.deps);
    expect(fx.state.combo).toBe(6);
  });

  it('outside comboWindow → reduce by 60% (floor at 1)', () => {
    const fx = makeFixture({
      state: { combo: 10, lastGoodNoteTimeMs: 100 },
      onset: { isOnset: true, gateOpen: true },
    });
    // 5000ms gap, > 2000 comboWindow.
    updateGameState(5100, 16, { pitch: 440, conf: 0.9, rms: 0.05 }, fx.deps);
    expect(fx.state.combo).toBe(6); // floor(10*0.6)=6
  });

  it('updates state.bestCombo on new high', () => {
    const fx = makeFixture({
      state: { combo: 5, bestCombo: 5, lastGoodNoteTimeMs: 100 },
      onset: { isOnset: true, gateOpen: true },
    });
    updateGameState(500, 16, { pitch: 440, conf: 0.9, rms: 0.05 }, fx.deps);
    expect(fx.state.bestCombo).toBe(6);
  });
});

// ─── flow decay ──────────────────────────────────────────────────

describe('updateGameState — flow decay', () => {
  it('soft decay after silenceDecayStartMs', () => {
    const fx = makeFixture({ state: { flow: 50, lastSilenceStartMs: 0 } });
    updateGameState(5000, 1000, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    // 5000ms > 3000, but < 8000 → soft decay = 5 * 1 = 5
    expect(fx.state.flow).toBe(45);
  });

  it('hard decay after silenceHardDecayMs (soft + hard combined)', () => {
    const fx = makeFixture({ state: { flow: 50, lastSilenceStartMs: 0 } });
    updateGameState(10000, 1000, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    // Both decays apply: soft (5) then hard (15) -> 50 - 20 = 30
    expect(fx.state.flow).toBe(30);
  });

  it('flow floors at 0', () => {
    const fx = makeFixture({ state: { flow: 1, lastSilenceStartMs: 0 } });
    updateGameState(20000, 1000, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    expect(fx.state.flow).toBe(0);
  });
});

// ─── stage transitions ────────────────────────────────────────────

describe('updateGameState — stage transitions', () => {
  it('updates currentStage + writes label on transition', () => {
    const fx = makeFixture();
    fx.setStage(2);
    updateGameState(0, 16, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    expect(fx.state.currentStage).toBe(2);
  });

  it('fires star shower + bursts on up-transition', () => {
    const fx = makeFixture({ state: { currentStage: 0 } });
    fx.setStage(2);
    updateGameState(0, 16, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    expect(fx.effectStarShower).toHaveBeenCalled();
    expect(fx.spawnBurst.mock.calls.length).toBeGreaterThan(0);
  });

  it('does NOT fire star shower on same-stage', () => {
    const fx = makeFixture({ state: { currentStage: 1 } });
    fx.setStage(1);
    updateGameState(0, 16, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    expect(fx.effectStarShower).not.toHaveBeenCalled();
  });
});

// ─── HUD dispatch ─────────────────────────────────────────────────

describe('updateGameState — HUD', () => {
  it('always dispatches updateHUD', () => {
    const fx = makeFixture();
    updateGameState(0, 16, { pitch: 0, conf: 0, rms: 0 }, fx.deps);
    expect(fx.updateHUD).toHaveBeenCalledWith(0);
  });
});

// ─── the game frame without a microphone ─────────────────────────────
//
// A MIDI session suspends the mic, and the mic pipeline used to skip the
// whole reducer when it did — so the gauge, the encouragement, the stage, the
// quality read-out and every decay simply stopped for keyboard players. The
// built bundle showed internal flow 100 / combo 120 with the gauge at 0. These
// pin the frame that now runs instead.

describe('updateGameStateWithoutMic', () => {
  const FRAME = 16;

  it('paints the HUD and resolves the stage — the part that never reached the screen', () => {
    const f = makeFixture({ state: { flow: 70, currentStage: 0 } });
    f.setStage(2);
    updateGameStateWithoutMic(1000, FRAME, { keyHeld: true }, f.deps);
    expect(f.updateHUD).toHaveBeenCalledWith(1000);
    expect(f.state.currentStage).toBe(2);
    // …with the celebration a mic player gets for the same climb.
    expect(f.effectStarShower).toHaveBeenCalled();
    expect(f.updateQualityScores).toHaveBeenCalledWith(1000);
  });

  it('decays the gauge after the player stops — it used to stay at 100 forever', () => {
    const f = makeFixture({ state: { flow: 100, combo: 40, lastGoodNoteTimeMs: 1000 } });
    // Play stopped at t=1000. Walk the clock well past the hard-decay point.
    for (let t = 1200; t <= 20000; t += FRAME) {
      updateGameStateWithoutMic(t, FRAME, { keyHeld: false }, f.deps);
    }
    expect(f.state.flow).toBeLessThan(100);
    expect(f.state.combo).toBeLessThan(40);
  });

  it('a HELD key is still music — no decay while a chord rings', () => {
    const f = makeFixture({ state: { flow: 80, combo: 12, lastGoodNoteTimeMs: 1000 } });
    for (let t = 1200; t <= 20000; t += FRAME) {
      updateGameStateWithoutMic(t, FRAME, { keyHeld: true }, f.deps);
    }
    expect(f.state.flow).toBe(80);
    expect(f.state.combo).toBe(12);
  });

  it('feeds the session machine the same "is the player making sound" the mic does', () => {
    // A strike counts for the mic's onset-gate span; after that only a held key does.
    const f = makeFixture({ state: { lastGoodNoteTimeMs: 1000 } });
    updateGameStateWithoutMic(1100, FRAME, { keyHeld: false }, f.deps); // inside the 150 ms gate
    updateGameStateWithoutMic(1400, FRAME, { keyHeld: false }, f.deps); // past it
    updateGameStateWithoutMic(1500, FRAME, { keyHeld: true }, f.deps); // held
    expect(f.updateSessionConfidence.mock.calls.map((c) => c[1])).toEqual([true, false, true]);
  });

  it('adds NO continuous gain — a held key must not out-earn playing', () => {
    const f = makeFixture({ state: { flow: 20, lastGoodNoteTimeMs: 1000 } });
    for (let t = 1000; t <= 10000; t += FRAME) {
      updateGameStateWithoutMic(t, FRAME, { keyHeld: true }, f.deps);
    }
    expect(f.state.flow).toBe(20);
  });

  it('never touches the mic-only analysis', () => {
    const f = makeFixture();
    updateGameStateWithoutMic(1000, FRAME, { keyHeld: false }, f.deps);
    expect(f.updateMultiFeatureOnset).not.toHaveBeenCalled();
    expect(f.deps.core.applyOnsetToHistory).not.toHaveBeenCalled();
  });
});

describe('buildFlowMeterOptions', () => {
  it('maps every rule from CONFIG — one definition for the mic and the keyboard', () => {
    const opts = buildFlowMeterOptions({
      COMBO_WINDOW_MS: 3000,
      SILENCE_DECAY_START_MS: 8000,
      SILENCE_HARD_DECAY_MS: 12000,
      FLOW_DECAY_SOFT: 0.5,
      FLOW_DECAY_HARD: 2,
      COMBO_DECAY_RATE: 0.5,
      FLOW_NOISE_PENALTY: 3,
      COMBO_NOISE_PENALTY: 1,
      NOISE_PENALTY_COOLDOWN_MS: 300,
      FLOW_GAIN_BASE: 8,
      FLOW_GAIN_COMBO_MAX: 10,
      FLOW_GAIN_STABILITY_MAX: 20,
      FLOW_GAIN_QUALITY_MAX: 25,
      FLOW_GAIN_NON_PERFORMING_MULTIPLIER: 1.5,
      MIDI_FLOW_GAIN_BASE: 1,
      MIDI_FLOW_GAIN_VELOCITY: 1.8,
    } as Parameters<typeof buildFlowMeterOptions>[0]);
    // Every field is a real number — a missing mapping would be `undefined`
    // and quietly turn the reducer's arithmetic into NaN.
    for (const [k, v] of Object.entries(opts)) {
      expect(Number.isFinite(v), k).toBe(true);
    }
    expect(Object.keys(opts)).toHaveLength(16);
  });
});
