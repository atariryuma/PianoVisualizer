// Tests for packages/web/src/midi-render.ts.

import { describe, it, expect, vi } from 'vitest';
import {
  buildKeyboardHintNotes,
  buildExpectedClusterSet,
  createMidiRender,
  type MidiRenderDeps,
  type MidiRenderMidiState,
  type MidiRenderPracticeRef,
} from '../src/midi-render';

function makeStubCtx(): CanvasRenderingContext2D {
  const stub: Record<string, unknown> = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
  };
  return stub as unknown as CanvasRenderingContext2D;
}

function makeMidiState(over: Partial<MidiRenderMidiState> = {}): MidiRenderMidiState {
  return {
    activeNotes: new Map(),
    sustainOn: false,
    sustainedNotes: new Set(),
    lastChordName: '',
    lastChordTimeMs: 0,
    ...over,
  };
}

function makePractice(over: Partial<MidiRenderPracticeRef> = {}): MidiRenderPracticeRef {
  return {
    enabled: false,
    mode: 'guided',
    sectionNotes: [],
    currentNoteIdx: 0,
    ...over,
  };
}

function makeDeps(over: Partial<MidiRenderDeps> = {}): MidiRenderDeps {
  return {
    ctx: makeStubCtx(),
    midiState: makeMidiState(),
    practice: makePractice(),
    getLayout: () => ({ W: 1024, H: 768, kbHeight: 80, kbSafeBottom: 8 }),
    drawMidiKeyboard: vi.fn(),
    drawMidiBeams: vi.fn(),
    midiToScreenX: (m: number) => m * 10,
    noteThemeColor: () => '#fff',
    chordMateToleranceMs: 50,
    shadowBlurEnabled: true,
    sustainLabel: 'SUSTAIN',
    ...over,
  };
}

// ─── buildKeyboardHintNotes ──────────────────────────────────────────

describe('buildKeyboardHintNotes', () => {
  it('returns null when practice is off', () => {
    expect(buildKeyboardHintNotes(makePractice({ enabled: false }), 50)).toBeNull();
  });

  it('returns null in listen mode', () => {
    expect(buildKeyboardHintNotes(makePractice({ enabled: true, mode: 'listen' }), 50)).toBeNull();
  });

  it('returns null when sectionNotes is undefined (defensive — partially-wired proxy)', () => {
    // Regression: the shell-midi-handlers proxy used to forward only
    // `enabled`, leaving `mode` / `sectionNotes` / `currentNoteIdx`
    // undefined. After Fix-2 widened drawMidiKeyboard's gate to fire
    // during practice, this hit `undefined.length` every frame and
    // flooded the console with FATAL TypeErrors (see server.log
    // 2026-05-12 22:48 fullSong listen session). The function now
    // guards against undefined sectionNotes.
    const p = {
      enabled: true,
      mode: 'guided' as const,
      currentNoteIdx: 0,
      // sectionNotes intentionally undefined — mimics the bug condition.
    } as unknown as Parameters<typeof buildKeyboardHintNotes>[0];
    expect(buildKeyboardHintNotes(p, 50)).toBeNull();
  });

  it('returns null when sectionNotes is an empty array (no notes yet)', () => {
    const p = makePractice({ enabled: true, mode: 'guided', sectionNotes: [] });
    expect(buildKeyboardHintNotes(p, 50)).toBeNull();
  });

  it('treats undefined currentNoteIdx as 0 (defensive)', () => {
    const p = {
      enabled: true,
      mode: 'guided' as const,
      sectionNotes: [{ timeMs: 0, midi: 60, hand: 'R' }],
      // currentNoteIdx intentionally undefined
    } as unknown as Parameters<typeof buildKeyboardHintNotes>[0];
    const m = buildKeyboardHintNotes(p, 50)!;
    expect(m).not.toBeNull();
    expect(m.size).toBe(1);
    expect(m.get(60)?.primary).toBe(true);
  });

  it('returns null when all upcoming notes are resolved', () => {
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      currentNoteIdx: 0,
      sectionNotes: [
        { timeMs: 0, midi: 60, hit: true },
        { timeMs: 100, midi: 62, missed: true },
      ],
    });
    expect(buildKeyboardHintNotes(p, 50)).toBeNull();
  });

  it('marks the next unresolved note as primary', () => {
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      currentNoteIdx: 0,
      sectionNotes: [
        { timeMs: 0, midi: 60, hit: true },
        { timeMs: 100, midi: 62, hand: 'L' },
      ],
    });
    const m = buildKeyboardHintNotes(p, 50)!;
    expect(m.size).toBe(1);
    expect(m.get(62)).toEqual({ hand: 'L', primary: true });
  });

  it('includes chord-mates within tolerance as secondary', () => {
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      currentNoteIdx: 0,
      sectionNotes: [
        { timeMs: 0, midi: 60, hand: 'R' },
        { timeMs: 30, midi: 64, hand: 'R' }, // chord-mate (within 50ms)
        { timeMs: 200, midi: 67, hand: 'R' }, // outside window
      ],
    });
    const m = buildKeyboardHintNotes(p, 50)!;
    expect(m.size).toBe(2);
    expect(m.get(60)?.primary).toBe(true);
    expect(m.get(64)?.primary).toBe(false);
    expect(m.has(67)).toBe(false);
  });

  it('skips already-resolved chord-mates', () => {
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      currentNoteIdx: 0,
      sectionNotes: [
        { timeMs: 0, midi: 60, hand: 'R' },
        { timeMs: 10, midi: 64, hand: 'R', hit: true }, // already hit
        { timeMs: 20, midi: 67, hand: 'R' },
      ],
    });
    const m = buildKeyboardHintNotes(p, 50)!;
    expect(m.has(64)).toBe(false);
    expect(m.has(67)).toBe(true);
  });

  it('does not double-count duplicate midis', () => {
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      currentNoteIdx: 0,
      sectionNotes: [
        { timeMs: 0, midi: 60, hand: 'R' },
        { timeMs: 10, midi: 60, hand: 'R' },
      ],
    });
    const m = buildKeyboardHintNotes(p, 50)!;
    expect(m.size).toBe(1);
    expect(m.get(60)?.primary).toBe(true);
  });
});

// ─── buildExpectedClusterSet ─────────────────────────────────────────

describe('buildExpectedClusterSet (guided ちがう指の淡色化用)', () => {
  it('practice off / listen / 残ノーツ無しは null', () => {
    expect(buildExpectedClusterSet(makePractice({ enabled: false }), 50)).toBeNull();
    expect(buildExpectedClusterSet(makePractice({ enabled: true, mode: 'listen' }), 50)).toBeNull();
    expect(
      buildExpectedClusterSet(makePractice({ enabled: true, sectionNotes: [] }), 50)
    ).toBeNull();
  });

  it('和音クラスタ全体（未解決 + 解決済み）を含む — 押し続けている正解の鍵を淡色化しないため', () => {
    // C(hit 済) + E(現在) + G(未解決) の 3 音和音。ユーザー報告の核心:
    // 正解して押している C が「期待外」扱いで淡色化されてはいけない。
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      sectionNotes: [
        { timeMs: 1000, midi: 60, hit: true },
        { timeMs: 1000, midi: 64 },
        { timeMs: 1010, midi: 67 },
      ],
      currentNoteIdx: 0,
    });
    const set = buildExpectedClusterSet(p, 50)!;
    expect(set).not.toBeNull();
    expect([...set].sort((a, b) => a - b)).toEqual([60, 64, 67]);
  });

  it('許容窓の外（次の和音）は含めない', () => {
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      sectionNotes: [
        { timeMs: 1000, midi: 60 },
        { timeMs: 2000, midi: 72 },
      ],
      currentNoteIdx: 0,
    });
    const set = buildExpectedClusterSet(p, 50)!;
    expect([...set]).toEqual([60]);
  });

  it('全ノーツ解決済みなら null', () => {
    const p = makePractice({
      enabled: true,
      mode: 'guided',
      sectionNotes: [{ timeMs: 1000, midi: 60, hit: true }],
      currentNoteIdx: 0,
    });
    expect(buildExpectedClusterSet(p, 50)).toBeNull();
  });
});

// ─── createMidiRender ────────────────────────────────────────────────

describe('createMidiRender — drawKeyboard', () => {
  it('forwards layout + sustainLabel + hintNotes', () => {
    const deps = makeDeps();
    const r = createMidiRender(deps);
    r.drawKeyboard();
    expect(deps.drawMidiKeyboard).toHaveBeenCalledWith(
      deps.ctx,
      deps.midiState,
      expect.objectContaining({
        screenW: 1024,
        screenH: 768,
        kbHeight: 80,
        kbSafeBottom: 8,
        sustainLabel: 'SUSTAIN',
      })
    );
  });

  it('guided では expectedNotes（クラスタ集合）を渡す', () => {
    const deps = makeDeps({
      practice: makePractice({
        enabled: true,
        mode: 'guided',
        sectionNotes: [
          { timeMs: 1000, midi: 60, hit: true },
          { timeMs: 1000, midi: 64 },
        ],
        currentNoteIdx: 0,
      }),
    });
    createMidiRender(deps).drawKeyboard();
    const opts = (deps.drawMidiKeyboard as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(opts.expectedNotes).not.toBeNull();
    expect([...opts.expectedNotes].sort((a: number, b: number) => a - b)).toEqual([60, 64]);
  });

  it('rhythm では expectedNotes を渡さない（誤淡色化防止で guided 限定）', () => {
    const deps = makeDeps({
      practice: makePractice({
        enabled: true,
        mode: 'rhythm',
        sectionNotes: [{ timeMs: 1000, midi: 60 }],
        currentNoteIdx: 0,
      }),
    });
    createMidiRender(deps).drawKeyboard();
    const opts = (deps.drawMidiKeyboard as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(opts.expectedNotes).toBeNull();
  });

  it('setLabels updates sustainLabel for next draw', () => {
    const deps = makeDeps();
    const r = createMidiRender(deps);
    r.setLabels({ sustainLabel: 'PEDAL' });
    r.drawKeyboard();
    const opts = (deps.drawMidiKeyboard as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(opts.sustainLabel).toBe('PEDAL');
  });
});

describe('createMidiRender — drawBeams', () => {
  it('computes kbTop from layout + forwards adapters', () => {
    const deps = makeDeps();
    const r = createMidiRender(deps);
    r.drawBeams(123);
    expect(deps.drawMidiBeams).toHaveBeenCalledWith(
      deps.ctx,
      deps.midiState,
      expect.objectContaining({
        kbTop: 768 - 80 - 8, // = 680
        timeMs: 123,
      })
    );
  });
});

describe('createMidiRender — drawChordDisplay', () => {
  it('skips when no chord name', () => {
    const deps = makeDeps();
    deps.midiState.lastChordName = '';
    createMidiRender(deps).drawChordDisplay(100);
    expect(deps.ctx.save).not.toHaveBeenCalled();
  });

  it('skips when chord age > 1800ms', () => {
    const deps = makeDeps();
    deps.midiState.lastChordName = 'C major';
    deps.midiState.lastChordTimeMs = 0;
    createMidiRender(deps).drawChordDisplay(2000);
    expect(deps.ctx.save).not.toHaveBeenCalled();
  });

  it('draws big centered in free play (with scale)', () => {
    const deps = makeDeps();
    deps.midiState.lastChordName = 'C major';
    deps.midiState.lastChordTimeMs = 0;
    createMidiRender(deps).drawChordDisplay(500);
    expect(deps.ctx.save).toHaveBeenCalled();
    expect(deps.ctx.scale).toHaveBeenCalled(); // free-play uses scale-pulse
    expect(deps.ctx.fillText).toHaveBeenCalledWith('C major', 0, 0);
    expect(deps.ctx.restore).toHaveBeenCalled();
  });

  it('draws quiet above-keyboard variant in practice mode (no scale)', () => {
    const deps = makeDeps({
      practice: makePractice({ enabled: true, mode: 'guided' }),
    });
    deps.midiState.lastChordName = 'F minor';
    deps.midiState.lastChordTimeMs = 0;
    createMidiRender(deps).drawChordDisplay(500);
    expect(deps.ctx.save).toHaveBeenCalled();
    expect(deps.ctx.scale).not.toHaveBeenCalled(); // practice variant skips scale
    expect(deps.ctx.fillText).toHaveBeenCalledWith('F minor', 0, 0);
  });

  it('skips shadowBlur when shadowBlurEnabled is false', () => {
    const deps = makeDeps({ shadowBlurEnabled: false });
    deps.midiState.lastChordName = 'G7';
    deps.midiState.lastChordTimeMs = 0;
    createMidiRender(deps).drawChordDisplay(500);
    // shadowBlur stays at the stub default (0) — the `if (useShadow)`
    // branch never wrote to it.
    expect(deps.ctx.shadowBlur).toBe(0);
  });
});
