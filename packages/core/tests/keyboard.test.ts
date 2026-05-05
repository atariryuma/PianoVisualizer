import { describe, it, expect, beforeEach } from 'vitest';
import {
  KB_WHITE,
  KB_BLACK,
  KB_BLACK_LEFT_WHITE_IDX,
  drawMidiKeyboard,
  type KeyboardMidiView,
  type KeyboardDrawOptions,
} from '../src/render/keyboard';
import { makeCanvasStub } from './_fixtures/canvas-stub';

describe('Key tables', () => {
  it('KB_WHITE has 52 entries on an 88-key piano', () => {
    expect(KB_WHITE).toHaveLength(52);
  });

  it('KB_BLACK has 36 entries on an 88-key piano', () => {
    expect(KB_BLACK).toHaveLength(36);
  });

  it('total = 88 keys', () => {
    expect(KB_WHITE.length + KB_BLACK.length).toBe(88);
  });

  it('white keys exclude semitones 1, 3, 6, 8, 10 (mod 12)', () => {
    for (const m of KB_WHITE) {
      const pc = m % 12;
      expect([1, 3, 6, 8, 10]).not.toContain(pc);
    }
  });

  it('black keys are exactly the 5 sharp/flat pitch classes', () => {
    for (const m of KB_BLACK) {
      expect([1, 3, 6, 8, 10]).toContain(m % 12);
    }
  });

  it('lowest key is A0 (21), highest is C8 (108)', () => {
    expect(Math.min(...KB_WHITE, ...KB_BLACK)).toBe(21);
    expect(Math.max(...KB_WHITE, ...KB_BLACK)).toBe(108);
  });

  it('KB_BLACK_LEFT_WHITE_IDX maps each black key to a valid white index', () => {
    for (const m of KB_BLACK) {
      const wi = KB_BLACK_LEFT_WHITE_IDX[m];
      expect(wi).toBeGreaterThanOrEqual(0);
      expect(wi).toBeLessThan(KB_WHITE.length);
      // The white at that index should be one semitone below the black.
      expect(KB_WHITE[wi]).toBe(m - 1);
    }
  });
});

describe('drawMidiKeyboard', () => {
  let midi: KeyboardMidiView;
  let opts: KeyboardDrawOptions;

  beforeEach(() => {
    midi = {
      activeNotes: new Map(),
      sustainedNotes: new Set(),
      sustainOn: false,
    };
    opts = {
      screenW: 800,
      screenH: 600,
      kbHeight: 50,
      kbSafeBottom: 4,
      noteThemeColor: () => '#deadbeef',
      sustainLabel: 'SUSTAIN',
    };
  });

  it('paints background + each white + each black + strokes them all', () => {
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(stub.countCalls('save')).toBe(1);
    expect(stub.countCalls('restore')).toBe(1);
    // 1 background + 52 whites + 36 blacks = 89 fillRect calls
    expect(stub.countCalls('fillRect')).toBe(89);
    expect(stub.countCalls('strokeRect')).toBe(88);
  });

  it('idle state uses default fill colors', () => {
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    // Search calls for fillStyle assignments
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0] as string);
    expect(fillStyles).toContain('rgba(245, 245, 250, 0.85)'); // white default
    expect(fillStyles).toContain('rgba(15, 15, 25, 0.95)'); // black default
  });

  it('lit key (active) paints with its theme color and white outline', () => {
    midi.activeNotes.set(60, { synColor: null }); // C4
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0] as string);
    // theme color was injected as #deadbeef
    expect(fillStyles).toContain('#deadbeef');
    const strokeStyles = stub.calls
      .filter((c) => c.method === 'set strokeStyle')
      .map((c) => c.args[0] as string);
    expect(strokeStyles).toContain('rgba(255, 255, 255, 0.9)');
  });

  it('lit key with synColor uses synColor over theme color', () => {
    midi.activeNotes.set(60, { synColor: '#ff00ff' });
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0] as string);
    expect(fillStyles).toContain('#ff00ff');
  });

  it('sustained-only key paints theme color with dimmer outline', () => {
    midi.sustainedNotes.add(64); // E4
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const strokeStyles = stub.calls
      .filter((c) => c.method === 'set strokeStyle')
      .map((c) => c.args[0] as string);
    expect(strokeStyles).toContain('rgba(255, 255, 255, 0.5)');
  });

  it('renders SUSTAIN label when pedal is on', () => {
    midi.sustainOn = true;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const fillTextCalls = stub.calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(1);
    expect(fillTextCalls[0].args[0]).toBe('SUSTAIN');
  });

  it('does NOT render SUSTAIN label when pedal is off', () => {
    midi.sustainOn = false;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(stub.countCalls('fillText')).toBe(0);
  });

  it('honors injected sustainLabel localization', () => {
    midi.sustainOn = true;
    opts.sustainLabel = 'サステイン';
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const fillText = stub.calls.find((c) => c.method === 'fillText')!;
    expect(fillText.args[0]).toBe('サステイン');
  });

  it('positions keyboard at screenH - kbHeight - kbSafeBottom (top-left of bg fill)', () => {
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const bgFill = stub.calls.find((c) => c.method === 'fillRect')!;
    const [_x, y] = bgFill.args as [number, number, number, number];
    expect(y).toBe(600 - 50 - 4);
  });
});
