import { describe, it, expect, beforeEach } from 'vitest';
import {
  KB_WHITE,
  KB_BLACK,
  KB_BLACK_LEFT_WHITE_IDX,
  drawMidiKeyboard,
  keyboardKeyCenterX,
  type KeyboardMidiView,
  type KeyboardDrawOptions,
  type KeyboardHintNote,
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

  it('null hintNotes leaves the existing draw counts unchanged', () => {
    opts.hintNotes = null;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(stub.countCalls('fillRect')).toBe(89);
    expect(stub.countCalls('strokeRect')).toBe(88);
    expect(stub.countCalls('fill')).toBe(0);
    expect(stub.countCalls('beginPath')).toBe(0);
  });
});

describe('drawMidiKeyboard with expectedNotes (guided ちがう指の淡色化)', () => {
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
      expectedNotes: new Set([60, 64, 67]),
    };
  });

  const fillsOf = (stub: ReturnType<typeof makeCanvasStub>) =>
    stub.calls.filter((c) => c.method === 'set fillStyle').map((c) => c.args[0] as string);
  const strokesOf = (stub: ReturnType<typeof makeCanvasStub>) =>
    stub.calls.filter((c) => c.method === 'set strokeStyle').map((c) => c.args[0] as string);

  it('期待外の点灯キーは淡スレート塗り + 控えめ輪郭（白リング無し）', () => {
    midi.activeNotes.set(69, { synColor: null }); // A4 — 期待 {C,E,G} の外
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(fillsOf(stub)).toContain('rgba(150, 158, 175, 0.9)');
    expect(strokesOf(stub)).toContain('rgba(200, 205, 215, 0.6)');
    expect(strokesOf(stub)).not.toContain('rgba(255, 255, 255, 0.9)');
    expect(fillsOf(stub)).not.toContain('#deadbeef');
  });

  it('期待内の点灯キーは従来どおりテーマ色 + 白リング', () => {
    midi.activeNotes.set(60, { synColor: null });
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(fillsOf(stub)).toContain('#deadbeef');
    expect(strokesOf(stub)).toContain('rgba(255, 255, 255, 0.9)');
    expect(fillsOf(stub)).not.toContain('rgba(150, 158, 175, 0.9)');
  });

  it('正解 2 + まちがい 1 の同時押し: まちがいだけ淡色', () => {
    midi.activeNotes.set(60, { synColor: null });
    midi.activeNotes.set(64, { synColor: null });
    midi.activeNotes.set(69, { synColor: null }); // これだけ期待外
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const fills = fillsOf(stub);
    expect(fills.filter((f) => f === '#deadbeef')).toHaveLength(2);
    expect(fills.filter((f) => f === 'rgba(150, 158, 175, 0.9)')).toHaveLength(1);
  });

  it('expectedNotes 無し（フリープレイ / rhythm）は従来挙動のまま', () => {
    delete opts.expectedNotes;
    midi.activeNotes.set(69, { synColor: null });
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(fillsOf(stub)).toContain('#deadbeef');
    expect(fillsOf(stub)).not.toContain('rgba(150, 158, 175, 0.9)');
  });

  it('sustained のみ（押していない）キーは期待外でも淡色化しない', () => {
    midi.sustainedNotes.add(69);
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(fillsOf(stub)).not.toContain('rgba(150, 158, 175, 0.9)');
  });
});

describe('drawMidiKeyboard with hint notes', () => {
  let midi: KeyboardMidiView;
  let opts: KeyboardDrawOptions;

  beforeEach(() => {
    midi = { activeNotes: new Map(), sustainedNotes: new Set(), sustainOn: false };
    opts = {
      screenW: 800,
      screenH: 600,
      kbHeight: 50,
      kbSafeBottom: 4,
      noteThemeColor: () => '#deadbeef',
      sustainLabel: 'SUSTAIN',
    };
  });

  const fillStylesOf = (stub: ReturnType<typeof makeCanvasStub>) =>
    stub.calls.filter((c) => c.method === 'set fillStyle').map((c) => c.args[0] as string);

  const strokeStylesOf = (stub: ReturnType<typeof makeCanvasStub>) =>
    stub.calls.filter((c) => c.method === 'set strokeStyle').map((c) => c.args[0] as string);

  it('LH primary hint paints a blue tint overlay on the key', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([[60, { hand: 'L', primary: true }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const fills = fillStylesOf(stub);
    expect(fills.some((s) => s.includes('120, 180, 255'))).toBe(true);
    expect(fills.some((s) => s.includes('255, 150, 200'))).toBe(false);
  });

  it('RH primary hint paints a pink tint overlay', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([[64, { hand: 'R', primary: true }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const fills = fillStylesOf(stub);
    expect(fills.some((s) => s.includes('255, 150, 200'))).toBe(true);
    expect(fills.some((s) => s.includes('120, 180, 255'))).toBe(false);
  });

  it('primary hint draws a ▼ marker (one fill / one closed path)', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([[60, { hand: 'L', primary: true }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(stub.countCalls('beginPath')).toBe(1);
    expect(stub.countCalls('moveTo')).toBe(1);
    expect(stub.countCalls('lineTo')).toBe(2);
    expect(stub.countCalls('closePath')).toBe(1);
    expect(stub.countCalls('fill')).toBe(1);
  });

  it('primary hint also strokes a thicker hint outline (lineWidth 2.5)', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([[60, { hand: 'L', primary: true }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const lineWidths = stub.calls
      .filter((c) => c.method === 'set lineWidth')
      .map((c) => c.args[0] as number);
    expect(lineWidths).toContain(2.5);
  });

  it('chord-mate hint paints a tint overlay but no ▼ marker', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([[64, { hand: 'L', primary: false }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    // 1 bg + 52 white + 36 black + 1 hint overlay = 90 fillRect calls
    expect(stub.countCalls('fillRect')).toBe(90);
    expect(stub.countCalls('fill')).toBe(0);
    expect(stub.countCalls('beginPath')).toBe(0);
  });

  it('active key with a hint: hint is suppressed (real press wins)', () => {
    midi.activeNotes.set(60, { synColor: null });
    opts.hintNotes = new Map<number, KeyboardHintNote>([[60, { hand: 'L', primary: true }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(fillStylesOf(stub).some((s) => s.includes('120, 180, 255'))).toBe(false);
    expect(stub.countCalls('fill')).toBe(0);
  });

  it('sustained key with a hint: hint is suppressed', () => {
    midi.sustainedNotes.add(60);
    opts.hintNotes = new Map<number, KeyboardHintNote>([[60, { hand: 'R', primary: true }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    expect(fillStylesOf(stub).some((s) => s.includes('255, 150, 200'))).toBe(false);
    expect(stub.countCalls('fill')).toBe(0);
  });

  it('breathing alpha changes with nowMs', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([[60, { hand: 'L', primary: true }]]);

    // sin(0) = 0  → breathe=0.5  → primary alpha = 0.4 + 0.3*0.5 = 0.55
    opts.nowMs = 0;
    const stub1 = makeCanvasStub();
    drawMidiKeyboard(stub1.ctx, midi, opts);
    const tint1 = fillStylesOf(stub1).find((s) => s.includes('120, 180, 255'));

    // Quarter cycle of 1.4 Hz ≈ 178.57 ms → sin(π/2) = 1 → breathe=1 → alpha = 0.7
    opts.nowMs = 1000 / (1.4 * 4);
    const stub2 = makeCanvasStub();
    drawMidiKeyboard(stub2.ctx, midi, opts);
    const tint2 = fillStylesOf(stub2).find((s) => s.includes('120, 180, 255'));

    expect(tint1).toBeDefined();
    expect(tint2).toBeDefined();
    expect(tint1).not.toEqual(tint2);
  });

  it('multiple hints share a single breathing phase (one cohesive pulse)', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([
      [60, { hand: 'L', primary: true }],
      [64, { hand: 'L', primary: false }],
      [67, { hand: 'L', primary: false }],
    ]);
    opts.nowMs = 100;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    // Two chord mates at the same nowMs and same hand should produce the
    // exact same rgba string — phase is shared.
    const mateFills = fillStylesOf(stub).filter(
      (s) => s.includes('120, 180, 255') && !s.includes('0.95') // exclude stroke style
    );
    // Find the two mate-tint fills (alpha ~0.22..0.34, distinct from primary 0.4..0.7)
    const mateAlphas = mateFills.filter((s) => /0\.[23]\d{2}\)$/.test(s));
    expect(mateAlphas.length).toBeGreaterThanOrEqual(2);
    // All mate-alphas should be identical strings.
    const unique = new Set(mateAlphas);
    expect(unique.size).toBe(1);
  });

  it('idle hint outline differs from default outline', () => {
    opts.hintNotes = new Map<number, KeyboardHintNote>([[60, { hand: 'L', primary: false }]]);
    opts.nowMs = 0;
    const stub = makeCanvasStub();
    drawMidiKeyboard(stub.ctx, midi, opts);
    const strokes = strokeStylesOf(stub);
    expect(strokes.some((s) => s.includes('120, 180, 255'))).toBe(true);
  });
});

describe('keyboardKeyCenterX', () => {
  // Layout reference: kbX = 8, kbW = screenW - 16, wKeyW = kbW / 52.
  it('returns center for white keys (middle C = 60)', () => {
    const screenW = 800;
    const kbX = 8;
    const wKeyW = (screenW - 16) / 52;
    // C4 is the 24th white key (0-indexed: 23) — A0,B0,C1..B1,C2..B2,C3..B3,C4.
    const expected = kbX + (23 + 0.5) * wKeyW;
    expect(keyboardKeyCenterX(60, screenW)).toBeCloseTo(expected, 6);
  });

  it('returns center for black keys (C#4 = 61, between C4 and D4)', () => {
    const screenW = 800;
    const kbX = 8;
    const wKeyW = (screenW - 16) / 52;
    const expected = kbX + (23 + 1) * wKeyW;
    expect(keyboardKeyCenterX(61, screenW)).toBeCloseTo(expected, 6);
  });

  it('returns NaN for midi outside the 88-key range', () => {
    expect(Number.isNaN(keyboardKeyCenterX(20, 800))).toBe(true);
    expect(Number.isNaN(keyboardKeyCenterX(109, 800))).toBe(true);
  });

  it('matches the actual draw position of A0 (lowest key)', () => {
    // A0 = midi 21 = white index 0. center = kbX + 0.5 * wKeyW.
    const screenW = 800;
    const kbX = 8;
    const wKeyW = (screenW - 16) / 52;
    expect(keyboardKeyCenterX(21, screenW)).toBeCloseTo(kbX + 0.5 * wKeyW, 6);
  });

  it('matches the actual draw position of C8 (highest key)', () => {
    // C8 = midi 108 = white index 51. center = kbX + 51.5 * wKeyW.
    const screenW = 800;
    const kbX = 8;
    const wKeyW = (screenW - 16) / 52;
    expect(keyboardKeyCenterX(108, screenW)).toBeCloseTo(kbX + 51.5 * wKeyW, 6);
  });
});
