// Tests for packages/web/src/game-state-init.ts.
//
// Sanity checks on the 130-field initial game state literal:
//   • Returns a fresh object each call (no shared array refs).
//   • Every documented "dynamic field" is pre-declared (V8 hidden-
//     class stability — these used to be lazily `||=` initialized in
//     the hot path; pre-declaration moves the hidden-class transition
//     to startup time).
//   • Initial flag values match the legacy literal char-for-char.

import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../src/game-state-init';

describe('createInitialGameState — fresh-instance contract', () => {
  it('returns a new object each call', () => {
    const a = createInitialGameState();
    const b = createInitialGameState();
    expect(a).not.toBe(b);
  });

  it('returns fresh array fields each call (no shared refs)', () => {
    const a = createInitialGameState();
    const b = createInitialGameState();
    expect(a.completedQuests).not.toBe(b.completedQuests);
    expect(a.spectralFluxHistory).not.toBe(b.spectralFluxHistory);
    expect(a.noteOnsetTimes).not.toBe(b.noteOnsetTimes);
    expect(a.ioiHistory).not.toBe(b.ioiHistory);
    expect(a.amplitudeHistory).not.toBe(b.amplitudeHistory);
    expect(a.centroidHistory).not.toBe(b.centroidHistory);
    expect(a.qualityHistory).not.toBe(b.qualityHistory);
  });

  it('cachedPitchResult is a fresh object each call', () => {
    const a = createInitialGameState();
    const b = createInitialGameState();
    expect(a.cachedPitchResult).not.toBe(b.cachedPitchResult);
    expect(a.cachedPitchResult).toEqual({ pitch: -1, conf: 0, rms: 0 });
  });
});

describe('createInitialGameState — initial values', () => {
  it('boot flags are off', () => {
    const s = createInitialGameState();
    expect(s.running).toBe(false);
    expect(s.starting).toBe(false);
    expect(s.useSynesthesiaMode).toBe(false);
    expect(s.micSuspended).toBe(false);
    expect(s.micPermissionFailed).toBe(false);
    expect(s.micIntentionallySkipped).toBe(false);
    expect(s.debugMode).toBe(false);
  });

  it('numeric counters start at 0', () => {
    const s = createInitialGameState();
    expect(s.flow).toBe(0);
    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(0);
    expect(s.currentStage).toBe(0);
    expect(s.pitchStability).toBe(0);
    expect(s.smoothEnergy).toBe(0);
    expect(s.peakFlow).toBe(0);
    expect(s.consecutiveOnsetFrames).toBe(0);
  });

  it('AGC seeds gain at 1.0', () => {
    const s = createInitialGameState();
    expect(s.agcGain).toBe(1.0);
    expect(s.debugAgcGain).toBe(1.0);
  });

  it('encouragement tier starts at -1 (none)', () => {
    const s = createInitialGameState();
    expect(s.currentEncouragementTier).toBe(-1);
  });

  it('shimmer phase starts at -1 (idle sentinel)', () => {
    const s = createInitialGameState();
    expect(s.shimmerPhase).toBe(-1);
  });

  it('lastSilenceStartMs starts at -1 (no silence yet)', () => {
    const s = createInitialGameState();
    expect(s.lastSilenceStartMs).toBe(-1);
  });

  it('lastOnsetTimeMs is -9999 (cold start, nothing recent)', () => {
    const s = createInitialGameState();
    expect(s.lastOnsetTimeMs).toBe(-9999);
  });

  it('session state starts at "waiting"', () => {
    const s = createInitialGameState();
    expect(s.sessionState).toBe('waiting');
    expect(s.debugSessionState).toBe('waiting');
  });

  it('quest tracking is empty + null', () => {
    const s = createInitialGameState();
    expect(s.completedQuests).toEqual([]);
    expect(s.activeQuestId).toBeNull();
  });

  it('cachedPitchResult is the cold-start triple { -1, 0, 0 }', () => {
    const s = createInitialGameState();
    expect(s.cachedPitchResult).toEqual({ pitch: -1, conf: 0, rms: 0 });
  });

  it('null-typed lifecycle hooks are pre-declared null (not undefined)', () => {
    // V8 hidden-class drift: undefined → null transition would force
    // a hidden-class change mid-game. Pre-declaring as null keeps
    // the shape stable.
    const s = createInitialGameState();
    expect(s.lastPitchSemitones).toBeNull();
    expect(s.adaptiveSilenceRms).toBeNull();
    expect(s.recentPitches).toBeNull();
    expect(s.lastMidiNoteForStability).toBeNull();
    expect(s.lastIntroDiag).toBeNull();
    expect(s.prevSpectrum).toBeNull();
  });

  it('every dynamic field documented in the V8-hidden-class comment is present', () => {
    // Drift detector — if someone deletes a pre-declared field
    // thinking it's unused, the hot path will lazily add it back
    // and trigger a hidden-class transition. These fields MUST be
    // present in the initial state.
    const s = createInitialGameState();
    const dynamicFields = [
      'adaptiveSilenceRms',
      'recentPitches',
      'consecutiveOnsetFrames',
      'lastDebugLogMs',
      'debugMaxRms',
      'debugMaxConf',
      'debugMaxHarm',
      'debugOnsetCount',
      'lastMidiNoteForStability',
      'micPermissionFailed',
      'micIntentionallySkipped',
      'lastIntroDiag',
      '_lastSummary',
    ] as const;
    for (const field of dynamicFields) {
      expect(s).toHaveProperty(field);
    }
  });
});
