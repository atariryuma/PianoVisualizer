import { describe, it, expect } from 'vitest';
import {
  THEMES,
  noteThemeColor,
  synColorFor,
  drawBackgroundFade,
  type Theme,
} from '../src/render/theme';
import { makeCanvasStub } from './_fixtures/canvas-stub';

describe('THEMES table', () => {
  it('exposes exactly 4 themes (purple, cyan, orange, lavender)', () => {
    expect(THEMES).toHaveLength(4);
  });

  it('each theme has a 3-component bg, ≥6 colors, and a glow prefix', () => {
    for (const t of THEMES) {
      expect(t.bg).toHaveLength(3);
      for (const c of t.bg) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
      expect(t.colors.length).toBeGreaterThanOrEqual(6);
      for (const c of t.colors) {
        expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
      expect(t.glow).toMatch(/^rgba\([\d,]+,\s*$/);
    }
  });

  it('is frozen — runtime mutation throws (or is silently ignored in non-strict)', () => {
    expect(Object.isFrozen(THEMES)).toBe(true);
  });

  it('glow prefix can be appended with alpha + ")" to form a valid rgba', () => {
    const example = THEMES[0].glow + '0.3)';
    expect(example).toBe('rgba(139,92,246,0.3)');
  });
});

describe('noteThemeColor', () => {
  const theme = THEMES[0];

  it('returns one of the theme palette entries', () => {
    const c = noteThemeColor(60, theme);
    expect(theme.colors).toContain(c);
  });

  it('cycles deterministically by midi % colors.length', () => {
    const len = theme.colors.length;
    expect(noteThemeColor(0, theme)).toBe(theme.colors[0]);
    expect(noteThemeColor(len, theme)).toBe(theme.colors[0]);
    expect(noteThemeColor(len + 1, theme)).toBe(theme.colors[1]);
  });

  it('handles negative midi numbers without returning undefined', () => {
    const c = noteThemeColor(-7, theme);
    expect(theme.colors).toContain(c);
  });
});

describe('synColorFor', () => {
  const colorMap: Record<string, string> = {
    C: '#ff0000',
    'C#': '#ff8800',
    D: '#ffff00',
    G: '#00ff00',
    A: '#0000ff',
    B: '#800080',
  };

  it('returns null when synesthesia is disabled', () => {
    expect(synColorFor(60, { enabled: false, colorMap })).toBeNull();
  });

  it('maps midi 60 (C4) to the C entry', () => {
    expect(synColorFor(60, { enabled: true, colorMap })).toBe('#ff0000');
  });

  it('maps midi 61 (C#4) to the C# entry', () => {
    expect(synColorFor(61, { enabled: true, colorMap })).toBe('#ff8800');
  });

  it('returns null when the resolved note name has no color in the map', () => {
    expect(synColorFor(63, { enabled: true, colorMap })).toBeNull(); // D# missing
  });

  it('honors a custom note-name table (e.g. flats)', () => {
    const flats = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const map = { Db: '#abcdef' };
    expect(synColorFor(61, { enabled: true, colorMap: map, noteNames: flats })).toBe('#abcdef');
  });

  it('handles negative midi numbers (wraps mod 12)', () => {
    // -1 % 12 = -1 in JS; we want pc=11 → 'B'
    expect(synColorFor(-1, { enabled: true, colorMap })).toBe('#800080');
  });
});

describe('drawBackgroundFade', () => {
  it('paints a single full-canvas rect with the theme bg color', () => {
    const stub = makeCanvasStub();
    drawBackgroundFade(stub.ctx, { screenW: 800, screenH: 600, theme: THEMES[0], flow: 0 });
    expect(stub.countCalls('fillRect')).toBe(1);
    const rect = stub.calls.find((c) => c.method === 'fillRect')!;
    expect(rect.args).toEqual([0, 0, 800, 600]);
  });

  it('uses the theme bg triple in the fillStyle', () => {
    const stub = makeCanvasStub();
    drawBackgroundFade(stub.ctx, { screenW: 800, screenH: 600, theme: THEMES[1], flow: 50 });
    const fill = stub.props.fillStyle as string;
    const [r, g, b] = THEMES[1].bg;
    expect(fill.startsWith('rgba(' + r + ',' + g + ',' + b + ',')).toBe(true);
  });

  it('low flow fades faster than high flow (alpha decreases with flow)', () => {
    const stub1 = makeCanvasStub();
    const stub2 = makeCanvasStub();
    drawBackgroundFade(stub1.ctx, { screenW: 1, screenH: 1, theme: THEMES[0], flow: 0 });
    drawBackgroundFade(stub2.ctx, { screenW: 1, screenH: 1, theme: THEMES[0], flow: 100 });
    const a1 = parseFloat((stub1.props.fillStyle as string).split(',')[3]);
    const a2 = parseFloat((stub2.props.fillStyle as string).split(',')[3]);
    expect(a1).toBeGreaterThan(a2);
  });

  it('honors a hand-rolled custom theme (not from the THEMES table)', () => {
    const custom: Theme = {
      bg: [255, 128, 64],
      colors: ['#fff'],
      glow: 'rgba(255,128,64,',
    };
    const stub = makeCanvasStub();
    drawBackgroundFade(stub.ctx, { screenW: 100, screenH: 100, theme: custom, flow: 0 });
    expect((stub.props.fillStyle as string).startsWith('rgba(255,128,64,')).toBe(true);
  });
});
