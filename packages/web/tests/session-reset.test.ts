// @vitest-environment happy-dom
// Tests for packages/web/src/session-reset.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSessionReset,
  type SessionResetCoreReducers,
  type SessionResetMidiState,
} from '../src/session-reset';

function makeStateBag() {
  // Shape the legacy state bag with everything the reducer touches,
  // pre-poisoned with non-zero values so we can assert the writes.
  return {
    flow: 99,
    combo: 99,
    bestCombo: 99,
    currentStage: 5,
    pitchStability: 0.9,
    centroidHistory: [1, 2, 3],
    rhythmScore: 0.8,
    dynamicsScore: 0.7,
    stabilityScore: 0.6,
    qualityScore: 0.75,
    displayedQualityScore: 0.5,
    growthScore: 0.4,
    qualityHistory: [{ timeMs: 1, score: 0.5 }],
    completedQuests: ['q1', 'q2'] as string[] & { length: number },
    activeQuestId: 'q3',
    lastQuestCheckMs: 1234,
    currentEncouragementTier: 3,
    lastEncouragementTimeMs: 1000,
    encouragementHideTimeMs: 5000,
    lastGoodNoteTimeMs: 1000,
    lastSilenceStartMs: 2000,
    lastPitchSemitones: 60,
    peakFlow: 80,
    sessionStartTimeMs: 0,
    lastNoteTimeMs: 1500,
    lastDetectedNote: 'C4',
    sessionState: 'performing',
    sessionConfidence: 0.8,
    sessionPianoCount: 3,
    sessionRingHead: 5,
    sessionRingTail: 4,
    sessionRingSize: 7,
    feedbackGood: 'something',
    feedbackNext: 'something else',
    goalWindowStartMs: 1000,
    goalCelebrateUntilMs: 2000,
    goalCompletedCount: 4,
    spectralFluxHistory: [1, 2, 3],
    prevSpectrum: { foo: 'bar' },
    lastOnsetTimeMs: 1234,
    smoothEnergy: 0.5,
    glowPulseIntensity: 0.7,
    shimmerPhase: 0.3,
  };
}

function makeFixture() {
  const state = makeStateBag();
  const questState = { completedIds: state.completedQuests as unknown };
  const encState = { currentTier: 3, lastShownTimeMs: 1000, hideTimeMs: 5000 };
  const midiState: SessionResetMidiState = {
    activeNotes: { clear: vi.fn() },
    sustainedNotes: { clear: vi.fn() },
    sustainOn: true,
  };
  const sessionRing = Array.from({ length: 16 }, () => ({ isPiano: true }));
  const ripples: unknown[] = [{}, {}, {}];
  const particles: unknown[] = [{}, {}, {}, {}];

  const reducers: SessionResetCoreReducers = {
    resetQualityHistoryState: vi.fn(),
    resetQuestTrackerState: vi.fn(),
    resetEncouragementState: vi.fn((es: unknown) => {
      const e = es as { currentTier: number; lastShownTimeMs: number; hideTimeMs: number };
      e.currentTier = -1;
      e.lastShownTimeMs = 0;
      e.hideTimeMs = -1;
    }),
    resetWakeUpFlashState: vi.fn(),
    resetChordWindowState: vi.fn(),
  };

  // Build DOM bag with elements + initial poison classes / text.
  const mkEl = (init: Partial<{ text: string; html: string; cls: string[] }> = {}) => {
    const el = document.createElement('div');
    if (init.text) el.textContent = init.text;
    if (init.html) el.innerHTML = init.html;
    (init.cls ?? []).forEach((c) => el.classList.add(c));
    return el;
  };
  const dom = {
    stageLabel: mkEl({ text: 'Cosmos', cls: ['visible'] }),
    encouragement: mkEl({ cls: ['visible'] }),
    qualityScore: mkEl({ cls: ['visible'] }),
    noteDisplay: mkEl({ cls: ['visible'] }),
    questDisplay: mkEl({ cls: ['visible'] }),
    questDots: mkEl({ html: '<div class="quest-dot done"></div>' }),
    questLabel: mkEl({ text: 'Quest!' }),
    questToast: mkEl({ cls: ['show'] }),
    flowFill: mkEl(),
    sessionStatus: mkEl({ text: 'Listening', cls: ['visible'] }),
    playTime: mkEl({ text: '1:23' }),
  };
  dom.flowFill.style.height = '88%';

  const invalidateFlowCache = vi.fn();
  const resetMidiDispatch = vi.fn();
  const remoteLog = vi.fn();

  const reset = createSessionReset({
    refs: {
      state,
      questState,
      encState,
      getMidiState: () => midiState,
      sessionRing,
      ripples,
      particles,
    },
    reducers,
    dom,
    sessionRingCap: sessionRing.length,
    invalidateFlowCache,
    resetMidiDispatch,
    remoteLog,
    now: () => 99999,
  });

  return {
    state,
    questState,
    encState,
    midiState,
    sessionRing,
    ripples,
    particles,
    reducers,
    dom,
    invalidateFlowCache,
    resetMidiDispatch,
    remoteLog,
    reset,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('createSessionReset — scalar resets', () => {
  it('zeros flow / combo / bestCombo / currentStage / pitchStability', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.flow).toBe(0);
    expect(fx.state.combo).toBe(0);
    expect(fx.state.bestCombo).toBe(0);
    expect(fx.state.currentStage).toBe(0);
    expect(fx.state.pitchStability).toBe(0);
  });

  it('zeros all four score fields + growth + clears qualityHistory', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.rhythmScore).toBe(0);
    expect(fx.state.dynamicsScore).toBe(0);
    expect(fx.state.stabilityScore).toBe(0);
    expect(fx.state.qualityScore).toBe(0);
    expect(fx.state.displayedQualityScore).toBe(0);
    expect(fx.state.growthScore).toBe(0);
    expect(fx.state.qualityHistory).toEqual([]);
  });

  it('resets feedback strings + goal window', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.feedbackGood).toBe('');
    expect(fx.state.feedbackNext).toBe('');
    expect(fx.state.goalWindowStartMs).toBe(0);
    expect(fx.state.goalCelebrateUntilMs).toBe(0);
    expect(fx.state.goalCompletedCount).toBe(0);
  });

  it('seeds sessionStartTimeMs from deps.now()', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.sessionStartTimeMs).toBe(99999);
  });

  it('puts session state machine back in waiting + zeros confidence ring', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.sessionState).toBe('waiting');
    expect(fx.state.sessionConfidence).toBe(0);
    expect(fx.state.sessionPianoCount).toBe(0);
    expect(fx.state.sessionRingHead).toBe(0);
    expect(fx.state.sessionRingTail).toBe(0);
    expect(fx.state.sessionRingSize).toBe(0);
    expect(fx.sessionRing.every((s) => s.isPiano === false)).toBe(true);
  });

  it('zeros spectral / onset history fields', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.spectralFluxHistory).toEqual([]);
    expect(fx.state.prevSpectrum).toBe(null);
    expect(fx.state.lastOnsetTimeMs).toBe(-9999);
    expect(fx.state.smoothEnergy).toBe(0);
    expect(fx.state.glowPulseIntensity).toBe(0);
    expect(fx.state.shimmerPhase).toBe(-1);
  });
});

describe('createSessionReset — quest tracker', () => {
  it('clears completedQuests in place (preserves array identity)', () => {
    const fx = makeFixture();
    const arrRef = fx.state.completedQuests;
    fx.reset.reset();
    expect(fx.state.completedQuests).toBe(arrRef); // same array
    expect(fx.state.completedQuests.length).toBe(0);
  });

  it('re-shares completedQuests as questState.completedIds after reset', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.questState.completedIds).toBe(fx.state.completedQuests);
  });

  it('clears activeQuestId + lastQuestCheckMs', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.activeQuestId).toBe(null);
    expect(fx.state.lastQuestCheckMs).toBe(0);
  });

  it('calls resetQuestTrackerState reducer', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.reducers.resetQuestTrackerState).toHaveBeenCalledWith(fx.questState);
  });
});

describe('createSessionReset — encouragement mirror', () => {
  it('mirrors reset encState back into state.* fields (with hideTimeMs<0 → 0)', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.state.currentEncouragementTier).toBe(-1);
    expect(fx.state.lastEncouragementTimeMs).toBe(0);
    expect(fx.state.encouragementHideTimeMs).toBe(0); // mock zeroes hideTimeMs to -1 → mirror sets 0
  });
});

describe('createSessionReset — visual buffers + DOM hide', () => {
  it('clears ripples + particles in place', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.ripples.length).toBe(0);
    expect(fx.particles.length).toBe(0);
  });

  it('hides every HUD class and clears their text', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.dom.stageLabel.textContent).toBe('');
    expect(fx.dom.stageLabel.classList.contains('visible')).toBe(false);
    expect(fx.dom.encouragement.classList.contains('visible')).toBe(false);
    expect(fx.dom.qualityScore.classList.contains('visible')).toBe(false);
    expect(fx.dom.noteDisplay.classList.contains('visible')).toBe(false);
    expect(fx.dom.questDisplay.classList.contains('visible')).toBe(false);
    expect(fx.dom.questDots.innerHTML).toBe('');
    expect(fx.dom.questLabel.textContent).toBe('');
    expect(fx.dom.questToast.classList.contains('show')).toBe(false);
    expect(fx.dom.flowFill.style.height).toBe('0%');
    expect(fx.dom.sessionStatus.classList.contains('visible')).toBe(false);
    expect(fx.dom.sessionStatus.textContent).toBe('');
    expect(fx.dom.playTime.textContent).toBe('0:00');
  });

  it('calls invalidateFlowCache after the height write', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.invalidateFlowCache).toHaveBeenCalled();
  });
});

describe('createSessionReset — MIDI bookkeeping', () => {
  it('clears active + sustained note maps and drops sustainOn', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.midiState.activeNotes.clear).toHaveBeenCalled();
    expect(fx.midiState.sustainedNotes.clear).toHaveBeenCalled();
    expect(fx.midiState.sustainOn).toBe(false);
  });

  it('calls resetChordWindowState reducer with midiState', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.reducers.resetChordWindowState).toHaveBeenCalledWith(fx.midiState);
  });

  it('calls resetMidiDispatch (BLE-redelivery dedupe drop)', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.resetMidiDispatch).toHaveBeenCalled();
  });
});

describe('createSessionReset — observability', () => {
  it('writes a [RESET] tag to the remoteLog', () => {
    const fx = makeFixture();
    fx.reset.reset();
    expect(fx.remoteLog).toHaveBeenCalledWith('[RESET] Session reset by user');
  });
});
