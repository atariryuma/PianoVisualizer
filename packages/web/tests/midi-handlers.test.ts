// @vitest-environment happy-dom
//
// Tests for packages/web/src/midi-handlers.ts.
//
// Covers:
//   • spawnMidiNoteVisuals — flow/combo bookkeeping, idle-gap reset,
//     bestCombo pinning, low-flow wake-up flash, low-vs-high y placement.
//   • onMidiNoteOn — running gate, mic-suspended → performing transition,
//     reducer dispatch, glow effect (free-play only), practice gate skips
//     spawn + reducers.
//   • onMidiNoteOff — sustain-on routes to sustainedNotes, sustain-off
//     evicts from activeNotes, practice always finalizes hold.
//   • onMidiCC — only CC#64 drives sustain, on release every sustained
//     key drops with a fade ripple + activeNotes cleanup.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  spawnMidiNoteVisuals,
  onMidiNoteOn,
  onMidiNoteOff,
  onMidiCC,
  type MidiHandlersDeps,
  type MidiHandlersState,
  type MidiHandlersMidiState,
} from '../src/midi-handlers';

// ─── helpers ────────────────────────────────────────────────────────

function makeState(over: Partial<MidiHandlersState> = {}): MidiHandlersState {
  return {
    running: true,
    flow: 50,
    combo: 0,
    bestCombo: 0,
    lastNoteTimeMs: 0,
    lastGoodNoteTimeMs: 0,
    lastSilenceStartMs: 0,
    micSuspended: false,
    sessionState: 'waiting',
    sessionConfidence: 0.2,
    noteShowTimeMs: 0,
    lastDetectedNote: '',
    inputFlash: 0, // WakeUpFlashState
    ...over,
  };
}

function makeMidiState(): MidiHandlersMidiState {
  return {
    activeNotes: new Map(),
    sustainOn: false,
    sustainedNotes: new Set(),
    recentOnsets: [],
    lastChordName: '',
    lastChordTimeMs: 0,
  };
}

interface Mocks {
  midiToScreenX: ReturnType<typeof vi.fn>;
  noteThemeColor: ReturnType<typeof vi.fn>;
  synColorFor: ReturnType<typeof vi.fn>;
  spawnBurst: ReturnType<typeof vi.fn>;
  spawnStream: ReturnType<typeof vi.fn>;
  hideIntroHint: ReturnType<typeof vi.fn>;
  showNoteDisplay: ReturnType<typeof vi.fn>;
  effectGlowPulse: ReturnType<typeof vi.fn>;
  finalizeNoteHold: ReturnType<typeof vi.fn>;
  applyOnsetToHistory: ReturnType<typeof vi.fn>;
  applyOnsetPitch: ReturnType<typeof vi.fn>;
  applyOnsetToWindow: ReturnType<typeof vi.fn>;
  triggerWakeUpFlash: ReturnType<typeof vi.fn>;
}

function makeDeps(
  over: Partial<MidiHandlersDeps> = {},
  mocks?: Partial<Mocks>
): {
  deps: MidiHandlersDeps;
  mocks: Mocks;
  ripples: unknown[];
  state: MidiHandlersState;
  midiState: MidiHandlersMidiState;
} {
  const state = (over.state as MidiHandlersState | undefined) ?? makeState();
  const midiState = (over.midiState as MidiHandlersMidiState | undefined) ?? makeMidiState();
  const ripples: unknown[] = [];
  const m: Mocks = {
    midiToScreenX: vi.fn().mockImplementation((mn: number) => mn * 10),
    noteThemeColor: vi.fn().mockReturnValue('#abc123'),
    synColorFor: vi.fn().mockReturnValue(null),
    spawnBurst: vi.fn(),
    spawnStream: vi.fn(),
    hideIntroHint: vi.fn(),
    showNoteDisplay: vi.fn(),
    effectGlowPulse: vi.fn(),
    finalizeNoteHold: vi.fn(),
    applyOnsetToHistory: vi.fn(),
    applyOnsetPitch: vi.fn(),
    applyOnsetToWindow: vi.fn().mockReturnValue({ emitted: null }),
    triggerWakeUpFlash: vi.fn(),
    ...mocks,
  };

  const Ripple = function MockRipple(
    this: { x: number; y: number; color: string; size: number },
    x: number,
    y: number,
    color: string,
    size: number
  ): void {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size;
  } as unknown as MidiHandlersDeps['Ripple'];

  const deps: MidiHandlersDeps = {
    state,
    midiState,
    practice: { enabled: false },
    midiToScreenX: m.midiToScreenX,
    noteThemeColor: m.noteThemeColor,
    synColorFor: m.synColorFor,
    spawnBurst: m.spawnBurst,
    spawnStream: m.spawnStream,
    ripples: { push: (r: unknown) => ripples.push(r) },
    Ripple,
    hideIntroHint: m.hideIntroHint,
    showNoteDisplay: m.showNoteDisplay,
    effectGlowPulse: m.effectGlowPulse,
    finalizeNoteHold: m.finalizeNoteHold,
    applyOnsetToHistory: m.applyOnsetToHistory,
    applyOnsetPitch: m.applyOnsetPitch,
    applyOnsetToWindow: m.applyOnsetToWindow,
    triggerWakeUpFlash: m.triggerWakeUpFlash,
    qhOptsMidi: { tag: 'qhMidi' },
    psOpts: { tag: 'ps' },
    cwOpts: { tag: 'cw' },
    wufOpts: { triggerLevel: 0.2, halfLifeSec: 0.071 },
    config: {
      NOTE_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
      COMBO_WINDOW_MS: 2000,
    },
    getHeight: () => 600,
    ...over,
  };
  return { deps, mocks: m, ripples, state, midiState };
}

// ─── spawnMidiNoteVisuals ───────────────────────────────────────────

describe('spawnMidiNoteVisuals', () => {
  beforeEach(() => {
    // Pin Math.random so noteY jitter is deterministic.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('hides intro hint + spawns burst+ripple+stream + showNoteDisplay', () => {
    const { deps, mocks, ripples, state } = makeDeps();
    spawnMidiNoteVisuals(69, 100, undefined, deps); // A4
    expect(mocks.hideIntroHint).toHaveBeenCalledOnce();
    expect(mocks.spawnBurst).toHaveBeenCalledOnce();
    expect(mocks.spawnStream).toHaveBeenCalledOnce();
    expect(ripples.length).toBe(1);
    expect(mocks.showNoteDisplay).toHaveBeenCalledWith('A', 'A4', undefined, expect.any(Number));
    expect(state.lastNoteTimeMs).toBeGreaterThan(0);
  });

  it('clamps flow at 100 (no overshoot from velocity)', () => {
    const { deps, state } = makeDeps({ state: makeState({ flow: 99 }) });
    spawnMidiNoteVisuals(60, 127, undefined, deps);
    expect(state.flow).toBe(100);
  });

  it('resets combo to 1 after idle gap > COMBO_WINDOW_MS', () => {
    // Spy performance.now so the gap is deterministic across vitest's
    // happy-dom (which can hand out very small numbers right after
    // boot, making the bare `now - 1 >= 2000` flaky).
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(10_000);
    const { deps, state } = makeDeps({
      state: makeState({ combo: 8, lastGoodNoteTimeMs: 1 }),
    });
    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(state.combo).toBe(1);
    nowSpy.mockRestore();
  });

  it('continues combo within window', () => {
    const now = performance.now();
    const { deps, state } = makeDeps({
      state: makeState({ combo: 8, lastGoodNoteTimeMs: now - 100 }),
    });
    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(state.combo).toBe(9);
  });

  it('updates bestCombo when combo exceeds previous best', () => {
    const { deps, state } = makeDeps({
      state: makeState({ combo: 4, bestCombo: 5, lastGoodNoteTimeMs: performance.now() - 100 }),
    });
    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(state.combo).toBe(5);
    expect(state.bestCombo).toBe(5);
    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(state.combo).toBe(6);
    expect(state.bestCombo).toBe(6);
  });

  it('does not regress bestCombo on a smaller streak', () => {
    const { deps, state } = makeDeps({
      state: makeState({ combo: 1, bestCombo: 20, lastGoodNoteTimeMs: 0 }),
    });
    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(state.bestCombo).toBe(20);
  });

  it('triggers wake-up flash when flow < 10', () => {
    const { deps, mocks } = makeDeps({ state: makeState({ flow: 5 }) });
    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(mocks.triggerWakeUpFlash).toHaveBeenCalled();
  });

  it('does not trigger wake-up flash when flow >= 10', () => {
    const { deps, mocks } = makeDeps({ state: makeState({ flow: 25 }) });
    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(mocks.triggerWakeUpFlash).not.toHaveBeenCalled();
  });

  it('uses synColor when provided, else theme color', () => {
    const { deps, mocks } = makeDeps();
    spawnMidiNoteVisuals(60, 80, '#ff00ff', deps);
    expect(mocks.noteThemeColor).not.toHaveBeenCalled(); // synColor wins
    expect(mocks.spawnBurst.mock.calls[0][4]).toBe('#ff00ff');

    spawnMidiNoteVisuals(60, 80, undefined, deps);
    expect(mocks.noteThemeColor).toHaveBeenCalledWith(60);
    expect(mocks.spawnBurst.mock.calls[1][4]).toBe('#abc123');
  });

  it('places low notes (midi < 60) below the focal plane', () => {
    const { deps, mocks } = makeDeps();
    spawnMidiNoteVisuals(48, 80, undefined, deps); // C3 — low
    const burstY = mocks.spawnBurst.mock.calls[0][1] as number;
    expect(burstY).toBeGreaterThan(300); // baseY = 600 * 0.65 = 390
  });

  it('places high notes (midi >= 60) above the focal plane', () => {
    const { deps, mocks } = makeDeps();
    spawnMidiNoteVisuals(72, 80, undefined, deps); // C5 — high
    const burstY = mocks.spawnBurst.mock.calls[0][1] as number;
    expect(burstY).toBeLessThan(300); // baseY = 600 * 0.35 = 210
  });
});

// ─── onMidiNoteOn ──────────────────────────────────────────────────

describe('onMidiNoteOn', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('no-ops when state.running is false', () => {
    const { deps, mocks, midiState } = makeDeps({ state: makeState({ running: false }) });
    onMidiNoteOn(60, 100, deps);
    expect(midiState.activeNotes.size).toBe(0);
    expect(mocks.spawnBurst).not.toHaveBeenCalled();
    expect(mocks.applyOnsetToWindow).not.toHaveBeenCalled();
  });

  it('records the active note + drops sustained dup', () => {
    const { deps, midiState } = makeDeps();
    midiState.sustainedNotes.add(60); // pre-existing pedal-held
    onMidiNoteOn(60, 100, deps);
    expect(midiState.activeNotes.has(60)).toBe(true);
    const entry = midiState.activeNotes.get(60)!;
    expect(entry.velocity).toBe(100);
    expect(midiState.sustainedNotes.has(60)).toBe(false);
  });

  it('mic-suspended → switches sessionState to performing + bumps confidence', () => {
    const { deps, state } = makeDeps({
      state: makeState({ micSuspended: true, sessionState: 'waiting', sessionConfidence: 0.5 }),
    });
    onMidiNoteOn(60, 100, deps);
    expect(state.sessionState).toBe('performing');
    expect(state.sessionConfidence).toBeCloseTo(0.65, 2);
  });

  it('feeds reducers in free-play (history + pitch + chord-window)', () => {
    const { deps, mocks } = makeDeps();
    onMidiNoteOn(64, 110, deps);
    expect(mocks.applyOnsetToHistory).toHaveBeenCalledWith(
      deps.state,
      expect.any(Number),
      110 / 127,
      deps.qhOptsMidi
    );
    expect(mocks.applyOnsetPitch).toHaveBeenCalledWith(deps.state, 64, deps.psOpts);
    expect(mocks.applyOnsetToWindow).toHaveBeenCalledWith(
      deps.midiState,
      64,
      expect.any(Number),
      deps.cwOpts
    );
  });

  it('clears lastSilenceStartMs after a successful onset', () => {
    const { deps, state } = makeDeps({
      state: makeState({ lastSilenceStartMs: 12345 }),
    });
    onMidiNoteOn(60, 100, deps);
    expect(state.lastSilenceStartMs).toBe(-1);
  });

  it('practice mode skips visuals + history/pitch reducers', () => {
    const { deps, mocks } = makeDeps({ practice: { enabled: true } });
    onMidiNoteOn(60, 100, deps);
    expect(mocks.spawnBurst).not.toHaveBeenCalled();
    expect(mocks.applyOnsetToHistory).not.toHaveBeenCalled();
    expect(mocks.applyOnsetPitch).not.toHaveBeenCalled();
    // chord-window reducer still ticks (so chord beam works in practice).
    expect(mocks.applyOnsetToWindow).toHaveBeenCalled();
  });

  it('practice mode skips glow even when chord emits', () => {
    const { deps, mocks } = makeDeps(
      { practice: { enabled: true } },
      { applyOnsetToWindow: vi.fn().mockReturnValue({ emitted: 'Cmaj' }) }
    );
    onMidiNoteOn(60, 100, deps);
    expect(mocks.effectGlowPulse).not.toHaveBeenCalled();
  });

  it('free-play fires glow when chord emits', () => {
    const { deps, mocks } = makeDeps(
      {},
      { applyOnsetToWindow: vi.fn().mockReturnValue({ emitted: 'Cmaj' }) }
    );
    onMidiNoteOn(60, 100, deps);
    expect(mocks.effectGlowPulse).toHaveBeenCalledOnce();
  });

  it('free-play does NOT fire glow when chord didnt emit', () => {
    const { deps, mocks } = makeDeps();
    onMidiNoteOn(60, 100, deps);
    expect(mocks.effectGlowPulse).not.toHaveBeenCalled();
  });
});

// ─── onMidiNoteOff ─────────────────────────────────────────────────

describe('onMidiNoteOff', () => {
  it('routes to sustainedNotes when sustainOn=true', () => {
    const { deps, midiState } = makeDeps();
    midiState.activeNotes.set(60, { velocity: 100, onTimeMs: 0 });
    midiState.sustainOn = true;
    onMidiNoteOff(60, deps);
    expect(midiState.sustainedNotes.has(60)).toBe(true);
    // activeNotes is left intact while sustained (renderer keeps drawing it).
    expect(midiState.activeNotes.has(60)).toBe(true);
  });

  it('evicts activeNote when sustainOn=false', () => {
    const { deps, midiState } = makeDeps();
    midiState.activeNotes.set(60, { velocity: 100, onTimeMs: 0 });
    midiState.sustainOn = false;
    onMidiNoteOff(60, deps);
    expect(midiState.activeNotes.has(60)).toBe(false);
    expect(midiState.sustainedNotes.has(60)).toBe(false);
  });

  it('practice mode finalizes the hold regardless of pedal', () => {
    const { deps, mocks } = makeDeps({ practice: { enabled: true } });
    deps.midiState.sustainOn = true;
    onMidiNoteOff(60, deps);
    expect(mocks.finalizeNoteHold).toHaveBeenCalledWith(60);
  });

  it('free-play does not finalize (no scoring)', () => {
    const { deps, mocks } = makeDeps();
    onMidiNoteOff(60, deps);
    expect(mocks.finalizeNoteHold).not.toHaveBeenCalled();
  });
});

// ─── onMidiCC (sustain pedal) ──────────────────────────────────────

describe('onMidiCC', () => {
  it('only CC#64 (sustain) is processed; other CCs are no-ops', () => {
    const { deps, midiState } = makeDeps();
    onMidiCC(7, 127, deps); // volume — should be ignored
    expect(midiState.sustainOn).toBe(false);
  });

  it('value >= 64 turns sustain on', () => {
    const { deps, midiState } = makeDeps();
    onMidiCC(64, 80, deps);
    expect(midiState.sustainOn).toBe(true);
  });

  it('value < 64 turns sustain off', () => {
    const { deps, midiState } = makeDeps();
    midiState.sustainOn = true;
    onMidiCC(64, 0, deps);
    expect(midiState.sustainOn).toBe(false);
  });

  it('on pedal release: every sustained key drops with a fade ripple', () => {
    const { deps, midiState, ripples } = makeDeps();
    midiState.sustainOn = true;
    midiState.sustainedNotes.add(60);
    midiState.sustainedNotes.add(72);
    midiState.activeNotes.set(60, { velocity: 100, onTimeMs: 0 });
    midiState.activeNotes.set(72, { velocity: 100, onTimeMs: 0 });

    onMidiCC(64, 0, deps);

    expect(ripples.length).toBe(2);
    expect(midiState.sustainedNotes.size).toBe(0);
    expect(midiState.activeNotes.has(60)).toBe(false);
    expect(midiState.activeNotes.has(72)).toBe(false);
  });

  it('idempotent: pedal-on → pedal-on does not double-process', () => {
    const { deps, midiState, ripples } = makeDeps();
    midiState.sustainedNotes.add(60);
    onMidiCC(64, 100, deps); // sustainOn was false → true
    onMidiCC(64, 100, deps); // already on → no-op
    expect(ripples.length).toBe(0);
    expect(midiState.sustainedNotes.has(60)).toBe(true);
  });
});
