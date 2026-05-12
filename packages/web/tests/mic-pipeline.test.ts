// @vitest-environment happy-dom
//
// Tests for packages/web/src/mic-pipeline.ts.
//
// Covers:
//   • Mic-suspended path → only practice tick fires (no AGC, no game-state).
//   • Mic-active path → analyser pulled, AGC ticked, game-state called,
//     mic meter painted when visible, intro hint hidden on first good note.
//   • YIN throttle — full detect every 3rd frame, RMS-only on the others
//     (cached pitch reused).
//   • MIDI-recently-active gate skips the mic-driven spawn.
//   • Note spawn details — burst + ripple + wake-up flash + bass boost
//     + synesthesia color override.
//   • MIN_NOTE_INTERVAL_MS rate-limits the burst path but not stream/display.

import { describe, it, expect, vi } from 'vitest';
import {
  tickMicPipeline,
  type MicPipelineDeps,
  type MicPipelineState,
  type PitchResult,
  type NoteDescriptor,
} from '../src/mic-pipeline';

// ─── helpers ────────────────────────────────────────────────────────

function makeState(over: Partial<MicPipelineState> = {}): MicPipelineState {
  return {
    yinSkipCounter: 0,
    cachedPitchResult: { pitch: 0, conf: 0, rms: 0 },
    micSuspended: false,
    useSynesthesiaMode: false,
    smoothEnergy: 0.5,
    flow: 30,
    combo: 5,
    lastNoteTimeMs: 0,
    inputFlash: 0, // WakeUpFlashState
    ...over,
  };
}

interface MockHooks {
  detectPitchYIN: ReturnType<typeof vi.fn>;
  updateAGC: ReturnType<typeof vi.fn>;
  updateGameState: ReturnType<typeof vi.fn>;
  updatePractice: ReturnType<typeof vi.fn>;
  freqToNote: ReturnType<typeof vi.fn>;
  getNoteColor: ReturnType<typeof vi.fn>;
  spawnBurst: ReturnType<typeof vi.fn>;
  spawnStream: ReturnType<typeof vi.fn>;
  showNoteDisplay: ReturnType<typeof vi.fn>;
  triggerWakeUpFlash: ReturnType<typeof vi.fn>;
  hideIntroHint: ReturnType<typeof vi.fn>;
}

function makeDeps(
  over: Partial<MicPipelineDeps> = {},
  hooks?: Partial<MockHooks>
): { deps: MicPipelineDeps; hooks: MockHooks; state: MicPipelineState; ripples: unknown[] } {
  const state = (over.state as MicPipelineState | undefined) ?? makeState();
  const ripples: unknown[] = [];
  const h: MockHooks = {
    detectPitchYIN: vi
      .fn()
      .mockReturnValue({ pitch: 440, conf: 0.95, rms: 0.1 } satisfies PitchResult),
    updateAGC: vi.fn(),
    updateGameState: vi.fn().mockReturnValue(true),
    updatePractice: vi.fn(),
    freqToNote: vi.fn().mockReturnValue({
      name: 'A',
      octave: 4,
      noteNum: 69,
      freq: 440,
    } satisfies NoteDescriptor),
    getNoteColor: vi.fn().mockReturnValue('#ff00ff'),
    spawnBurst: vi.fn(),
    spawnStream: vi.fn(),
    showNoteDisplay: vi.fn(),
    triggerWakeUpFlash: vi.fn(),
    hideIntroHint: vi.fn(),
    ...hooks,
  };

  // Build a minimal AnalyserNode mock — we just need
  // `getFloatTimeDomainData(buf)` to populate something.
  const analyser = {
    getFloatTimeDomainData: (buf: Float32Array) => {
      // Fill with a small sine so RMS isn't zero.
      for (let i = 0; i < buf.length; i++) buf[i] = Math.sin(i / 4) * 0.1;
    },
  } as unknown as AnalyserNode;

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
  } as unknown as MicPipelineDeps['Ripple'];

  const deps: MicPipelineDeps = {
    analyser,
    audioCtx: { sampleRate: 48000 },
    freqArray: new Float32Array(4096) as Float32Array<ArrayBuffer>,
    detectPitchYIN: h.detectPitchYIN,
    updateAGC: h.updateAGC,
    updateGameState: h.updateGameState,
    state,
    practice: { enabled: false },
    midiInput: { enabled: false, lastEventTime: 0 },
    micMeter: null,
    micMeterFill: null,
    introHint: null,
    hideIntroHint: h.hideIntroHint,
    updatePractice: h.updatePractice,
    freqToNote: h.freqToNote,
    getNoteColor: h.getNoteColor,
    spawnBurst: h.spawnBurst,
    spawnStream: h.spawnStream,
    ripples: { push: (r: unknown) => ripples.push(r) },
    Ripple,
    showNoteDisplay: h.showNoteDisplay,
    triggerWakeUpFlash: h.triggerWakeUpFlash,
    wufOpts: { triggerLevel: 0.2, halfLifeSec: 0.071 },
    theme: { colors: ['#aaa', '#bbb', '#ccc'] },
    screen: { W: 800, H: 600 },
    config: {
      MIN_NOTE_INTERVAL_MS: 50,
      PITCH_MIN_HZ: 50,
      PIANO_KEY_MIN: 21,
      PIANO_KEY_COUNT: 88,
    },
    ...over,
  };
  return { deps, hooks: h, state, ripples };
}

// ─── mic-suspended branch ───────────────────────────────────────────

describe('tickMicPipeline — mic-suspended branch', () => {
  it('skips analyser/AGC/game-state when state.micSuspended is true', () => {
    const { deps, hooks } = makeDeps({ state: makeState({ micSuspended: true }) });
    const result = tickMicPipeline(1000, 16, deps);
    expect(result.isGoodNote).toBe(false);
    expect(hooks.detectPitchYIN).not.toHaveBeenCalled();
    expect(hooks.updateAGC).not.toHaveBeenCalled();
    expect(hooks.updateGameState).not.toHaveBeenCalled();
    expect(hooks.spawnBurst).not.toHaveBeenCalled();
  });

  it('still ticks practice in mic-suspended branch when practice.enabled', () => {
    const { deps, hooks } = makeDeps({
      state: makeState({ micSuspended: true }),
      practice: { enabled: true },
    });
    tickMicPipeline(1000, 16, deps);
    expect(hooks.updatePractice).toHaveBeenCalledWith(1000, false, 0);
  });

  it('does not tick practice when both mic-suspended AND practice disabled', () => {
    const { deps, hooks } = makeDeps({ state: makeState({ micSuspended: true }) });
    tickMicPipeline(1000, 16, deps);
    expect(hooks.updatePractice).not.toHaveBeenCalled();
  });

  it('falls back to mic-suspended branch when analyser is null', () => {
    const { deps, hooks } = makeDeps({ analyser: null, practice: { enabled: true } });
    tickMicPipeline(1000, 16, deps);
    expect(hooks.detectPitchYIN).not.toHaveBeenCalled();
    expect(hooks.updatePractice).toHaveBeenCalledWith(1000, false, 0);
  });
});

// ─── mic → midiState bridge (Opt-2/3) ───────────────────────────────

describe('tickMicPipeline — mic → midiState bridge', () => {
  function makeMidiState(): MicPipelineDeps['midiState'] & {} {
    return {
      activeNotes: new Map<
        number,
        { velocity: number; onTimeMs: number; synColor?: string | null; source?: 'mic' | 'midi' }
      >(),
      recentOnsets: [] as Array<{ midi: number; timeMs: number }>,
      lastChordName: '',
      lastChordTimeMs: 0,
    };
  }

  it('writes detected mic note into midiState.activeNotes with source="mic"', () => {
    const midiState = makeMidiState();
    const { deps } = makeDeps({ midiState });
    deps.state.yinSkipCounter = 2; // force full YIN this tick
    tickMicPipeline(1000, 16, deps);
    expect(midiState.activeNotes.has(69)).toBe(true);
    const entry = midiState.activeNotes.get(69)!;
    expect(entry.source).toBe('mic');
    expect(entry.onTimeMs).toBe(1000);
    expect(entry.velocity).toBeGreaterThanOrEqual(1);
    expect(entry.velocity).toBeLessThanOrEqual(127);
  });

  it('feeds applyOnsetToWindow when mic detects a pitch', () => {
    const midiState = makeMidiState();
    const applyOnsetToWindow = vi.fn().mockReturnValue({ emitted: null });
    const cwOpts = { windowMs: 80, minNotes: 3, repeatCooldownMs: 600, detectChord: () => null };
    const { deps } = makeDeps({ midiState, applyOnsetToWindow, cwOpts });
    deps.state.yinSkipCounter = 2;
    tickMicPipeline(1000, 16, deps);
    expect(applyOnsetToWindow).toHaveBeenCalledWith(midiState, 69, 1000, cwOpts);
  });

  it('refreshes the existing entry on the next tick (no second insert)', () => {
    const midiState = makeMidiState();
    const { deps } = makeDeps({ midiState });
    deps.state.yinSkipCounter = 2;
    tickMicPipeline(1000, 16, deps);
    deps.state.yinSkipCounter = 2;
    tickMicPipeline(1100, 16, deps);
    expect(midiState.activeNotes.size).toBe(1);
    expect(midiState.activeNotes.get(69)!.onTimeMs).toBe(1100);
  });

  it('prunes mic-derived activeNotes older than MIC_NOTE_TTL_MS (300 ms)', () => {
    const midiState = makeMidiState();
    midiState.activeNotes.set(60, {
      velocity: 80,
      onTimeMs: 0,
      source: 'mic',
    });
    const { deps, hooks } = makeDeps({ midiState });
    // No fresh note this tick.
    hooks.updateGameState.mockReturnValue(false);
    tickMicPipeline(500, 16, deps); // 500 ms after entry → expired
    expect(midiState.activeNotes.has(60)).toBe(false);
  });

  it('does NOT prune MIDI-source entries (only mic-source ones expire)', () => {
    const midiState = makeMidiState();
    midiState.activeNotes.set(60, {
      velocity: 100,
      onTimeMs: 0,
      source: 'midi',
    });
    const { deps, hooks } = makeDeps({ midiState });
    hooks.updateGameState.mockReturnValue(false);
    // No fresh note; if pruner mis-targets MIDI entries it'd evict
    // this even though source !== 'mic'.
    tickMicPipeline(60_000, 16, deps);
    expect(midiState.activeNotes.has(60)).toBe(true);
  });

  it('does NOT write to midiState when MIDI is enabled (midi owns the visual lane)', () => {
    const midiState = makeMidiState();
    const { deps } = makeDeps({
      midiState,
      midiInput: { enabled: true, lastEventTime: 0 },
    });
    deps.state.yinSkipCounter = 2;
    tickMicPipeline(1000, 16, deps);
    expect(midiState.activeNotes.size).toBe(0);
  });

  it('skips mic→midiState bridge entirely when midiState is not provided', () => {
    // Old callsites that don't care about the bridge can omit
    // midiState; nothing should throw.
    const { deps } = makeDeps();
    expect(deps.midiState).toBeUndefined();
    deps.state.yinSkipCounter = 2;
    expect(() => tickMicPipeline(1000, 16, deps)).not.toThrow();
  });
});

// ─── mic → chord detection end-to-end (Opt-3 integration) ──────────

describe('tickMicPipeline — mic-driven chord detection (E2E with real applyOnsetToWindow)', () => {
  // Use the actual PianoCore reducer + chord detector here. This is
  // the integration test that proves an arpeggiated C major chord
  // played on an acoustic piano (mic-only) surfaces a chord name in
  // midiState.lastChordName — the chord-display renderer reads that
  // field every frame, so this is the contract that lets the chord
  // overlay appear without MIDI.
  function makeMidiState(): {
    activeNotes: Map<
      number,
      { velocity: number; onTimeMs: number; synColor?: string | null; source?: 'mic' | 'midi' }
    >;
    recentOnsets: Array<{ midi: number; timeMs: number }>;
    lastChordName: string;
    lastChordTimeMs: number;
  } {
    return {
      activeNotes: new Map(),
      recentOnsets: [],
      lastChordName: '',
      lastChordTimeMs: 0,
    };
  }

  it('three consecutive mic onsets within 80 ms → lastChordName populated', async () => {
    const { applyOnsetToWindow, detectChord } = await import('@piano/core');
    const cwOpts = { windowMs: 80, minNotes: 3, repeatCooldownMs: 600, detectChord };
    const midiState = makeMidiState();

    // Onset 1: C4 (midi 60). YIN must return the right pitch each call.
    const fxC = makeDeps({
      midiState,
      applyOnsetToWindow,
      cwOpts,
    });
    fxC.hooks.detectPitchYIN.mockReturnValue({ pitch: 261.63, conf: 0.95, rms: 0.1 });
    fxC.hooks.freqToNote.mockReturnValue({ name: 'C', octave: 4, noteNum: 60, freq: 261.63 });
    fxC.deps.state.yinSkipCounter = 2;
    tickMicPipeline(1000, 16, fxC.deps);

    // Onset 2: E4 (midi 64), 30 ms later.
    const fxE = makeDeps({
      midiState,
      applyOnsetToWindow,
      cwOpts,
      state: fxC.state,
    });
    fxE.hooks.detectPitchYIN.mockReturnValue({ pitch: 329.63, conf: 0.95, rms: 0.1 });
    fxE.hooks.freqToNote.mockReturnValue({ name: 'E', octave: 4, noteNum: 64, freq: 329.63 });
    fxE.deps.state.yinSkipCounter = 2;
    // MIN_NOTE_INTERVAL_MS=50 in the test config — bump time past it
    // so the spawn block fires and the second onset registers.
    tickMicPipeline(1060, 16, fxE.deps);

    // Onset 3: G4 (midi 67), another 30 ms later — still inside the
    // 80 ms chord window (1060 - 1000 = 60 ms < 80 ms is the cw window
    // we passed in).
    const fxG = makeDeps({
      midiState,
      applyOnsetToWindow,
      cwOpts,
      state: fxE.state,
    });
    fxG.hooks.detectPitchYIN.mockReturnValue({ pitch: 392.0, conf: 0.95, rms: 0.1 });
    fxG.hooks.freqToNote.mockReturnValue({ name: 'G', octave: 4, noteNum: 67, freq: 392.0 });
    fxG.deps.state.yinSkipCounter = 2;
    tickMicPipeline(1078, 16, fxG.deps);

    expect(midiState.lastChordName).not.toBe('');
    expect(midiState.activeNotes.size).toBe(3);
    expect(midiState.activeNotes.has(60)).toBe(true);
    expect(midiState.activeNotes.has(64)).toBe(true);
    expect(midiState.activeNotes.has(67)).toBe(true);
  });
});

// ─── mic-active branch ─────────────────────────────────────────────

describe('tickMicPipeline — mic-active branch', () => {
  it('pulls analyser data + runs full YIN on 3rd frame, then RMS-only', () => {
    const state = makeState({ yinSkipCounter: 0 });
    const { deps, hooks } = makeDeps({ state });
    tickMicPipeline(0, 16, deps); // counter→1, 1%3≠0 → RMS only
    tickMicPipeline(16, 16, deps); // counter→2, 2%3≠0 → RMS only
    tickMicPipeline(32, 16, deps); // counter→3, 3%3=0 → full YIN
    expect(hooks.detectPitchYIN).toHaveBeenCalledTimes(1);
    expect(state.yinSkipCounter).toBe(3);
  });

  it('reuses cachedPitchResult for pitch+conf during RMS-only frames', () => {
    const state = makeState({
      yinSkipCounter: 2, // next tick → 3, 3%3=0 → full YIN
      cachedPitchResult: { pitch: 999, conf: 0.42, rms: 0.5 },
    });
    const { deps, hooks } = makeDeps({ state });
    hooks.detectPitchYIN.mockReturnValueOnce({ pitch: 220, conf: 0.9, rms: 0.2 });
    tickMicPipeline(0, 16, deps); // counter→3 → full YIN
    expect(state.cachedPitchResult.pitch).toBe(220); // updated by full path
    tickMicPipeline(16, 16, deps); // counter→4 → RMS-only, reuses 220 pitch
    const args = hooks.updateGameState.mock.calls[1][2] as PitchResult;
    expect(args.pitch).toBe(220);
    expect(args.conf).toBe(0.9);
    // RMS gets recomputed every frame (not from cache).
    expect(args.rms).toBeGreaterThan(0);
  });

  it('calls updateAGC with the pitch.rms', () => {
    const { deps, hooks } = makeDeps();
    hooks.detectPitchYIN.mockReturnValue({ pitch: 440, conf: 0.95, rms: 0.123 });
    // first frame is RMS-only (counter 0→1), so seed cachedPitchResult
    deps.state.cachedPitchResult = { pitch: 0, conf: 0, rms: 0 };
    deps.state.yinSkipCounter = 2; // → 3 → full YIN
    tickMicPipeline(0, 16, deps);
    expect(hooks.updateAGC).toHaveBeenCalledWith(0, 0.123);
  });

  it('paints mic-meter width when visible', () => {
    const meter = document.createElement('div');
    meter.classList.add('visible');
    const fill = document.createElement('div');
    const { deps } = makeDeps({ micMeter: meter, micMeterFill: fill });
    deps.state.yinSkipCounter = 2; // → 3 → full YIN
    tickMicPipeline(0, 16, deps);
    // rms*25 capped at 1 → percentage between 0..100
    expect(fill.style.width).toMatch(/^\d+(\.\d+)?%$/);
  });

  it('does not paint mic-meter when meter is hidden', () => {
    const meter = document.createElement('div'); // no .visible
    const fill = document.createElement('div');
    const { deps } = makeDeps({ micMeter: meter, micMeterFill: fill });
    tickMicPipeline(0, 16, deps);
    expect(fill.style.width).toBe('');
  });

  it('hides intro hint on first good note', () => {
    const introHint = document.createElement('div');
    introHint.classList.add('visible');
    const { deps, hooks } = makeDeps({ introHint });
    tickMicPipeline(0, 16, deps);
    expect(hooks.hideIntroHint).toHaveBeenCalledOnce();
  });

  it('does not hide intro hint when not visible', () => {
    const introHint = document.createElement('div');
    const { deps, hooks } = makeDeps({ introHint });
    tickMicPipeline(0, 16, deps);
    expect(hooks.hideIntroHint).not.toHaveBeenCalled();
  });

  it('returns isGoodNote from updateGameState', () => {
    const { deps, hooks } = makeDeps();
    hooks.updateGameState.mockReturnValue(false);
    const result = tickMicPipeline(0, 16, deps);
    expect(result.isGoodNote).toBe(false);
  });

  it('runs practice tick when practice.enabled (mic-active branch)', () => {
    const { deps, hooks } = makeDeps({ practice: { enabled: true } });
    deps.state.yinSkipCounter = 2; // → full YIN
    hooks.detectPitchYIN.mockReturnValue({ pitch: 440, conf: 0.9, rms: 0.1 });
    tickMicPipeline(0, 16, deps);
    expect(hooks.updatePractice).toHaveBeenCalledWith(0, true, 440);
  });
});

// ─── MIDI-active gate ───────────────────────────────────────────────

describe('tickMicPipeline — MIDI-active gate', () => {
  it('skips mic-driven note spawn when MIDI is enabled (any lastEventTime)', () => {
    const now = performance.now();
    const { deps, hooks } = makeDeps({
      midiInput: { enabled: true, lastEventTime: now - 500 },
    });
    deps.state.yinSkipCounter = 2;
    hooks.detectPitchYIN.mockReturnValue({ pitch: 440, conf: 0.9, rms: 0.1 });
    tickMicPipeline(now, 16, deps);
    expect(hooks.spawnBurst).not.toHaveBeenCalled();
    expect(hooks.spawnStream).not.toHaveBeenCalled();
    expect(hooks.showNoteDisplay).not.toHaveBeenCalled();
  });

  it('still skips mic-driven note spawn when MIDI is enabled but quiet for >2 s', () => {
    // Old policy backfilled mic data into silent gaps between MIDI
    // presses; new policy keeps the mic muted as long as a MIDI port
    // is attached, so a long pause between presses should NOT
    // re-enable mic-driven visuals.
    const now = performance.now();
    const { deps, hooks } = makeDeps({
      midiInput: { enabled: true, lastEventTime: now - 3000 },
    });
    deps.state.yinSkipCounter = 2;
    hooks.detectPitchYIN.mockReturnValue({ pitch: 440, conf: 0.9, rms: 0.1 });
    tickMicPipeline(now, 16, deps);
    expect(hooks.spawnBurst).not.toHaveBeenCalled();
  });

  it('runs the spawn path when MIDI is disabled', () => {
    const { deps, hooks } = makeDeps({
      midiInput: { enabled: false, lastEventTime: 0 },
    });
    deps.state.yinSkipCounter = 2;
    hooks.detectPitchYIN.mockReturnValue({ pitch: 440, conf: 0.9, rms: 0.1 });
    // Use a non-zero tick so the burst path isn't rate-limited
    // (lastNoteTimeMs starts at 0, MIN_NOTE_INTERVAL_MS is 50).
    tickMicPipeline(100, 16, deps);
    expect(hooks.spawnBurst).toHaveBeenCalled();
  });
});

// ─── note spawn details ─────────────────────────────────────────────

describe('tickMicPipeline — note spawn details', () => {
  function setup(over: Partial<MicPipelineDeps> = {}) {
    const r = makeDeps(over);
    r.deps.state.yinSkipCounter = 2; // next tick → full YIN
    r.hooks.detectPitchYIN.mockReturnValue({ pitch: 440, conf: 0.9, rms: 0.1 });
    return r;
  }

  it('spawns burst + ripple + stream + showNoteDisplay on a good note', () => {
    const { deps, hooks, ripples } = setup();
    tickMicPipeline(100, 16, deps);
    expect(hooks.spawnBurst).toHaveBeenCalled();
    expect(hooks.spawnStream).toHaveBeenCalled();
    expect(hooks.showNoteDisplay).toHaveBeenCalledWith('A', 'A4', null, 100);
    expect(ripples.length).toBe(1);
  });

  it('rate-limits burst+ripple by MIN_NOTE_INTERVAL_MS but still streams + displays', () => {
    const { deps, hooks, ripples } = setup();
    deps.state.lastNoteTimeMs = 80; // tick at 100, delta 20 < 50
    tickMicPipeline(100, 16, deps);
    expect(hooks.spawnBurst).not.toHaveBeenCalled();
    expect(ripples.length).toBe(0);
    // Stream + display still fire even when rate-limited.
    expect(hooks.spawnStream).toHaveBeenCalled();
    expect(hooks.showNoteDisplay).toHaveBeenCalled();
  });

  it('triggers wake-up flash when flow < 10', () => {
    const { deps, hooks } = setup();
    deps.state.flow = 5;
    tickMicPipeline(100, 16, deps);
    expect(hooks.triggerWakeUpFlash).toHaveBeenCalledWith(deps.state, deps.wufOpts);
  });

  it('does not trigger wake-up flash when flow >= 10', () => {
    const { deps, hooks } = setup();
    deps.state.flow = 25;
    tickMicPipeline(100, 16, deps);
    expect(hooks.triggerWakeUpFlash).not.toHaveBeenCalled();
  });

  it('applies bass boost (>1.0) for notes < 100Hz', () => {
    const { deps, hooks } = setup();
    hooks.detectPitchYIN.mockReturnValue({ pitch: 60, conf: 0.9, rms: 0.1 });
    hooks.freqToNote.mockReturnValue({ name: 'C', octave: 1, noteNum: 24, freq: 60 });
    tickMicPipeline(100, 16, deps);
    const burstSize = hooks.spawnBurst.mock.calls[0][2] as number;
    // expected = floor((10 + 0.5*25 + 30*0.2) * 1.5) = floor(28.5 * 1.5) = floor(42.75) = 42
    expect(burstSize).toBe(42);
  });

  it('skips note spawn when pitch <= PITCH_MIN_HZ', () => {
    const { deps, hooks } = setup();
    hooks.detectPitchYIN.mockReturnValue({ pitch: 30, conf: 0.9, rms: 0.1 });
    tickMicPipeline(100, 16, deps);
    expect(hooks.spawnBurst).not.toHaveBeenCalled();
    expect(hooks.freqToNote).not.toHaveBeenCalled();
  });

  it('skips note spawn when isGoodNote is false', () => {
    const { deps, hooks } = setup();
    hooks.updateGameState.mockReturnValue(false);
    tickMicPipeline(100, 16, deps);
    expect(hooks.spawnBurst).not.toHaveBeenCalled();
    expect(hooks.freqToNote).not.toHaveBeenCalled();
  });

  it('uses synesthesia color when state.useSynesthesiaMode', () => {
    const { deps, hooks } = setup();
    deps.state.useSynesthesiaMode = true;
    tickMicPipeline(100, 16, deps);
    expect(hooks.getNoteColor).toHaveBeenCalledWith('A');
    expect(hooks.showNoteDisplay).toHaveBeenCalledWith('A', 'A4', '#ff00ff', 100);
  });

  it('uses theme color (no synesthesia) when useSynesthesiaMode is false', () => {
    const { deps, hooks, ripples } = setup();
    deps.state.useSynesthesiaMode = false;
    tickMicPipeline(100, 16, deps);
    expect(hooks.getNoteColor).not.toHaveBeenCalled();
    expect(hooks.showNoteDisplay).toHaveBeenCalledWith('A', 'A4', null, 100);
    // Ripple gets a theme color from the colors[] palette.
    const ripple = ripples[0] as { color: string };
    expect(deps.theme.colors).toContain(ripple.color);
  });

  it('updates state.lastNoteTimeMs on a successful spawn', () => {
    const { deps } = setup();
    expect(deps.state.lastNoteTimeMs).toBe(0);
    tickMicPipeline(123, 16, deps);
    expect(deps.state.lastNoteTimeMs).toBe(123);
  });

  it('does not advance lastNoteTimeMs when rate-limited', () => {
    const { deps } = setup();
    deps.state.lastNoteTimeMs = 80;
    tickMicPipeline(100, 16, deps);
    expect(deps.state.lastNoteTimeMs).toBe(80);
  });

  it('skips note spawn when freqToNote returns null', () => {
    const { deps, hooks } = setup();
    hooks.freqToNote.mockReturnValue(null);
    tickMicPipeline(100, 16, deps);
    expect(hooks.spawnBurst).not.toHaveBeenCalled();
    expect(hooks.showNoteDisplay).not.toHaveBeenCalled();
  });
});
