// Tests for packages/web/src/practice-lane.ts.
//
// The lane drawer has 4 ordered concerns: cursor sync, lane region
// calc, view population, draw + writeback. We stub the canvas + the
// PianoCore drawPracticeLane forwarder + osmd adapter, drive the
// per-frame draw under different practice modes / layouts, and
// assert the right cursor + region + view.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPracticeLane,
  type PracticeLaneDeps,
  type PracticeLanePracticeRef,
  type PracticeLaneStateRef,
} from '../src/practice-lane';

function makeStubCtx(): CanvasRenderingContext2D {
  const stub: Record<string, unknown> = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
  };
  return stub as unknown as CanvasRenderingContext2D;
}

function makeNote(
  over: Partial<{ timeMs: number; midi: number; measureIdx: number; inBarQuarters: number }> = {}
) {
  return {
    timeMs: 0,
    midi: 60,
    measureIdx: 0,
    inBarQuarters: 0,
    ...over,
  };
}

function makeDeps(over: Partial<PracticeLaneDeps> = {}): PracticeLaneDeps {
  const practice: PracticeLanePracticeRef = {
    enabled: true,
    mode: 'guided',
    sectionNotes: [],
    currentNoteIdx: 0,
    sectionIdx: 0,
    laneDrawFromIdx: 0,
  };
  const state: PracticeLaneStateRef = { useSynesthesiaMode: false };
  return {
    ctx: makeStubCtx(),
    practice,
    state,
    midiInput: { enabled: false },
    getLayout: () => ({
      W: 1024,
      H: 768,
      kbHeight: 80,
      kbSafeBottom: 8,
      safeRight: 0,
      currentLayoutMode: 'wide',
      cachedOsmdRect: { right: 0, bottom: 0, top: 0, height: 0 },
      osmdContainerVisible: false,
    }),
    getCurrentSong: () => ({ sections: [{ isBoss: false }, { isBoss: true }] }),
    osmdAdapter: { cursorTo: vi.fn() },
    practiceElapsedMs: () => 0,
    practiceRealElapsedMs: () => 0,
    noteThemeColor: () => '#fff',
    midiToPitchName: (m: number) => 'midi-' + m,
    noteColors: { C: '#f00', D: '#0f0', E: '#00f' },
    noteNames: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const,
    laneLookaheadMs: 1500,
    countInMs: 1500,
    // Judgement bands come from the ACTIVE input path's profile, read fresh
    // each frame so a mid-section keyboard hot-plug moves the drawn bands too.
    getJudgeProfile: () => ({ perfectMs: 35, greatMs: 80, earlyMs: 50, lateMs: 130 }),
    drawPracticeLane: vi.fn(),
    laneLabelL: 'L',
    laneLabelR: 'R',
    countInGoLabel: 'GO!',
    ...over,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ─── enabled gate ────────────────────────────────────────────────────

describe('createPracticeLane — enabled gate', () => {
  it('does nothing when practice.enabled is false', () => {
    const deps = makeDeps();
    deps.practice.enabled = false;
    createPracticeLane(deps).draw(100);
    expect(deps.drawPracticeLane).not.toHaveBeenCalled();
  });

  it('runs the draw when practice.enabled is true', () => {
    const deps = makeDeps();
    createPracticeLane(deps).draw(100);
    expect(deps.drawPracticeLane).toHaveBeenCalled();
  });
});

// ─── cursor sync ─────────────────────────────────────────────────────

describe('createPracticeLane — OSMD cursor sync', () => {
  it('skips cursor sync when OSMD is hidden', () => {
    const deps = makeDeps();
    deps.practice.sectionNotes = [makeNote()];
    createPracticeLane(deps).draw(100);
    expect(deps.osmdAdapter.cursorTo).not.toHaveBeenCalled();
  });

  it('advances cursor in guided mode using practice.currentNoteIdx', () => {
    const deps = makeDeps({
      getLayout: () => ({
        W: 1024,
        H: 768,
        kbHeight: 80,
        kbSafeBottom: 8,
        safeRight: 0,
        currentLayoutMode: 'wide',
        cachedOsmdRect: { right: 100, bottom: 200, top: 50, height: 150 },
        osmdContainerVisible: true,
      }),
    });
    deps.practice.sectionNotes = [
      makeNote({ measureIdx: 0, inBarQuarters: 0.0 }),
      makeNote({ measureIdx: 0, inBarQuarters: 1.0 }),
      makeNote({ measureIdx: 1, inBarQuarters: 0.0 }),
    ];
    deps.practice.currentNoteIdx = 1;
    createPracticeLane(deps).draw(100);
    expect(deps.osmdAdapter.cursorTo).toHaveBeenCalledWith(0, 1.0);
  });

  it('advances cursor in listen mode based on real elapsed time', () => {
    const deps = makeDeps({
      practiceRealElapsedMs: () => 1500,
      getLayout: () => ({
        W: 1024,
        H: 768,
        kbHeight: 80,
        kbSafeBottom: 8,
        safeRight: 0,
        currentLayoutMode: 'wide',
        cachedOsmdRect: { right: 100, bottom: 200, top: 50, height: 150 },
        osmdContainerVisible: true,
      }),
    });
    deps.practice.mode = 'listen';
    deps.practice.sectionNotes = [
      makeNote({ timeMs: 0, measureIdx: 0, inBarQuarters: 0 }),
      makeNote({ timeMs: 1000, measureIdx: 0, inBarQuarters: 1 }),
      makeNote({ timeMs: 2000, measureIdx: 1, inBarQuarters: 0 }),
    ];
    createPracticeLane(deps).draw(100);
    // elapsed=1500 → idx 1 (timeMs=1000 ≤ 1500, timeMs=2000 > 1500)
    expect(deps.osmdAdapter.cursorTo).toHaveBeenCalledWith(0, 1);
  });

  it('does NOT re-fire cursorTo when target index has not changed', () => {
    const deps = makeDeps({
      getLayout: () => ({
        W: 1024,
        H: 768,
        kbHeight: 80,
        kbSafeBottom: 8,
        safeRight: 0,
        currentLayoutMode: 'wide',
        cachedOsmdRect: { right: 100, bottom: 200, top: 50, height: 150 },
        osmdContainerVisible: true,
      }),
    });
    deps.practice.sectionNotes = [makeNote(), makeNote()];
    deps.practice.currentNoteIdx = 0;
    const lane = createPracticeLane(deps);
    lane.draw(100);
    lane.draw(116);
    lane.draw(132);
    expect(deps.osmdAdapter.cursorTo).toHaveBeenCalledTimes(1);
  });

  it('logs [CURSOR-CATCHUP] when target idx jumps > 5 in one tick (rAF pause recovery)', () => {
    // Simulate a rAF pause: first frame at elapsed=0 lands targetIdx=0,
    // second frame at elapsed=10000 catches up across 12 notes. The
    // jump > 5 should fire the [CURSOR-CATCHUP] diagnostic.
    let elapsed = 0;
    const notes = [];
    for (let i = 0; i < 13; i++) {
      notes.push(makeNote({ timeMs: i * 100, measureIdx: i >> 2, inBarQuarters: i % 4 }));
    }
    const deps = makeDeps({
      practiceRealElapsedMs: () => elapsed,
      getLayout: () => ({
        W: 1024,
        H: 768,
        kbHeight: 80,
        kbSafeBottom: 8,
        safeRight: 0,
        currentLayoutMode: 'wide',
        cachedOsmdRect: { right: 100, bottom: 200, top: 50, height: 150 },
        osmdContainerVisible: true,
      }),
    });
    deps.practice.mode = 'listen';
    deps.practice.sectionNotes = notes;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const lane = createPracticeLane(deps);
    elapsed = 0;
    lane.draw(0); // primes _lastCursorNoteIdx = 0
    elapsed = 10000;
    lane.draw(16); // catches up to idx 12 → jump = 12

    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => s.startsWith('[CURSOR-CATCHUP]'))).toBe(true);
  });
});

// ─── lane region ─────────────────────────────────────────────────────

describe('createPracticeLane — lane region', () => {
  it('uses full screen width when OSMD is hidden', () => {
    const deps = makeDeps();
    createPracticeLane(deps).draw(100);
    const opts = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(opts.screenW).toBe(1024);
    expect(deps.ctx.translate).not.toHaveBeenCalled();
  });

  it('shifts lane right of OSMD in phone-landscape mode', () => {
    const deps = makeDeps({
      getLayout: () => ({
        W: 1024,
        H: 400,
        kbHeight: 80,
        kbSafeBottom: 8,
        safeRight: 24,
        currentLayoutMode: 'phone-landscape',
        cachedOsmdRect: { right: 500, bottom: 200, top: 0, height: 200 },
        osmdContainerVisible: true,
      }),
    });
    createPracticeLane(deps).draw(100);
    const opts = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    // laneLeft = 500+8 = 508; laneWidth = 1024 - 508 - 4 - 24 = 488
    expect(opts.screenW).toBe(488);
    // ctx.translate is called with laneLeft offset
    expect(deps.ctx.translate).toHaveBeenCalledWith(508, 0);
    expect(deps.ctx.save).toHaveBeenCalled();
    expect(deps.ctx.restore).toHaveBeenCalled();
  });

  it('uses laneTopOverride below OSMD in non-landscape mode', () => {
    const deps = makeDeps({
      getLayout: () => ({
        W: 1024,
        H: 768,
        kbHeight: 80,
        kbSafeBottom: 8,
        safeRight: 0,
        currentLayoutMode: 'wide',
        cachedOsmdRect: { right: 0, bottom: 300, top: 0, height: 300 },
        osmdContainerVisible: true,
      }),
    });
    createPracticeLane(deps).draw(100);
    const opts = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(opts.laneTopOverride).toBe(312); // bottom + 12
  });
});

// ─── view + opts population ──────────────────────────────────────────

describe('createPracticeLane — view + opts population', () => {
  it('reads sectionNotes / currentNoteIdx / handRanges into the view', () => {
    const deps = makeDeps();
    deps.practice.sectionNotes = [makeNote(), makeNote()];
    deps.practice.currentNoteIdx = 1;
    deps.practice.handRanges = { lhMin: 50, lhMax: 60, rhMin: 60, rhMax: 70 };
    createPracticeLane(deps).draw(100);
    const view = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(view.sectionNotes.length).toBe(2);
    expect(view.currentNoteIdx).toBe(1);
    expect(view.handRanges).toEqual({ lhMin: 50, lhMax: 60, rhMin: 60, rhMax: 70 });
  });

  it('reads currentSong.sections[sectionIdx].isBoss into view.isBoss', () => {
    const deps = makeDeps();
    deps.practice.sectionIdx = 1; // boss in fixture
    createPracticeLane(deps).draw(100);
    const view = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(view.isBoss).toBe(true);
  });

  it('forwards a constant kbReserve in practice (keyboard is always drawn during practice)', () => {
    // Old policy: kbReserve switched between 60 (mic-only) and
    // kbHeight+safeBottom+16 (MIDI-on). That left mic-only practice
    // without a keyboard + ▼ next-key marker, so render-late now
    // always draws the keyboard during practice. The lane must
    // reserve the full keyboard strip regardless of midi state.
    const noMidi = makeDeps();
    createPracticeLane(noMidi).draw(100);
    const noMidiOpts = (noMidi.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(noMidiOpts.kbReserve).toBe(80 + 8 + 16);

    const withMidi = makeDeps();
    withMidi.midiInput.enabled = true;
    createPracticeLane(withMidi).draw(100);
    const midiOpts = (withMidi.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(midiOpts.kbReserve).toBe(80 + 8 + 16);
  });

  it('writes laneDrawFromIdx back to practice after the draw', () => {
    const deps = makeDeps({
      drawPracticeLane: vi.fn((_ctx, view: { laneDrawFromIdx: number }) => {
        view.laneDrawFromIdx = 42; // mutate via the persistent reference
      }),
    });
    deps.practice.laneDrawFromIdx = 0;
    createPracticeLane(deps).draw(100);
    expect(deps.practice.laneDrawFromIdx).toBe(42);
  });
});

// ─── setLabels / setTimings ──────────────────────────────────────────

describe('createPracticeLane — i18n + tempo updates', () => {
  it('setLabels updates lane labels for next frame', () => {
    const deps = makeDeps();
    const lane = createPracticeLane(deps);
    lane.setLabels({ laneLabelL: 'LEFT', laneLabelR: 'RIGHT', countInGoLabel: 'GO!' });
    lane.draw(100);
    const opts = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(opts.laneLabelL).toBe('LEFT');
    expect(opts.laneLabelR).toBe('RIGHT');
    expect(opts.countInGoLabel).toBe('GO!');
  });

  it('setTimings updates laneLookahead + countIn for next frame', () => {
    const deps = makeDeps();
    const lane = createPracticeLane(deps);
    lane.setTimings({ laneLookaheadMs: 2000, countInMs: 800 });
    lane.draw(100);
    const opts = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(opts.laneLookaheadMs).toBe(2000);
    expect(opts.countInMs).toBe(800);
  });
});

// ─── synesthesia mode ────────────────────────────────────────────────

describe('createPracticeLane — synesthesia toggle', () => {
  it('uses NOTE_COLORS when synesthesia is on', () => {
    const deps = makeDeps();
    deps.state.useSynesthesiaMode = true;
    createPracticeLane(deps).draw(100);
    const opts = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    // C=60 → noteNames[0]='C' → noteColors.C='#f00'
    expect(opts.noteRestingColor(60)).toBe('#f00');
  });

  it('falls back to noteThemeColor when synesthesia is off', () => {
    const deps = makeDeps({ noteThemeColor: () => '#themecolor' });
    deps.state.useSynesthesiaMode = false;
    createPracticeLane(deps).draw(100);
    const opts = (deps.drawPracticeLane as ReturnType<typeof vi.fn>).mock.calls[0][3];
    expect(opts.noteRestingColor(60)).toBe('#themecolor');
  });
});
