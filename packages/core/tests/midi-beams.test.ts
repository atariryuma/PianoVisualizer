import { describe, it, expect, beforeEach } from 'vitest';
import {
  drawMidiBeams,
  type MidiBeamsActiveNote,
  type MidiBeamsDrawOptions,
  type MidiBeamsView,
} from '../src/render/midi-beams';
import { makeCanvasStub } from './_fixtures/canvas-stub';

const makeOpts = (over: Partial<MidiBeamsDrawOptions> = {}): MidiBeamsDrawOptions => ({
  kbTop: 800,
  timeMs: 1000,
  midiToScreenX: (midi) => (midi - 21) * 10, // simple linear stub
  noteThemeColor: () => '#abcdef',
  ...over,
});

describe('drawMidiBeams', () => {
  let stub: ReturnType<typeof makeCanvasStub>;
  beforeEach(() => {
    stub = makeCanvasStub();
  });

  it('no-ops when no notes are held', () => {
    const view: MidiBeamsView = { activeNotes: new Map(), sustainedNotes: new Set() };
    drawMidiBeams(stub.ctx, view, makeOpts());
    expect(stub.calls).toHaveLength(0);
  });

  it('uses screen composite mode and restores afterward', () => {
    const view: MidiBeamsView = {
      activeNotes: new Map<number, MidiBeamsActiveNote>([[60, { velocity: 100, onTimeMs: 0 }]]),
      sustainedNotes: new Set(),
    };
    drawMidiBeams(stub.ctx, view, makeOpts());
    expect(stub.countCalls('save')).toBe(1);
    expect(stub.countCalls('restore')).toBe(1);
    expect(stub.prop('globalCompositeOperation')).toBe('screen');
  });

  it('paints one fillRect per active note', () => {
    const active = new Map<number, MidiBeamsActiveNote>([
      [60, { velocity: 100, onTimeMs: 0 }],
      [64, { velocity: 80, onTimeMs: 0 }],
      [67, { velocity: 64, onTimeMs: 0 }],
    ]);
    const view: MidiBeamsView = { activeNotes: active, sustainedNotes: new Set() };
    drawMidiBeams(stub.ctx, view, makeOpts());
    expect(stub.countCalls('fillRect')).toBe(3);
    // Each beam also produces a gradient.
    expect(stub.countCalls('createLinearGradient')).toBe(3);
  });

  it('skips sustained notes that are also currently active (no double-draw)', () => {
    const active = new Map<number, MidiBeamsActiveNote>([[60, { velocity: 100, onTimeMs: 0 }]]);
    const sustained = new Set<number>([60, 64]);
    const view: MidiBeamsView = { activeNotes: active, sustainedNotes: sustained };
    drawMidiBeams(stub.ctx, view, makeOpts());
    // 1 active + 1 sustained-only (64) = 2 fillRects, not 3.
    expect(stub.countCalls('fillRect')).toBe(2);
  });

  it('uses synColor when present, falls back to noteThemeColor otherwise', () => {
    const active = new Map<number, MidiBeamsActiveNote>([
      [60, { velocity: 100, onTimeMs: 0, synColor: '#ff0000' }],
      [64, { velocity: 100, onTimeMs: 0 }],
    ]);
    const themeColors: number[] = [];
    const opts = makeOpts({
      noteThemeColor: (midi) => {
        themeColors.push(midi);
        return '#00ff00';
      },
    });
    drawMidiBeams(stub.ctx, { activeNotes: active, sustainedNotes: new Set() }, opts);
    // Theme color was queried only for midi 64 (synColor took over for 60).
    expect(themeColors).toEqual([64]);
  });

  it('passes the keyboard top to the gradient and paints the full height', () => {
    const active = new Map<number, MidiBeamsActiveNote>([[60, { velocity: 100, onTimeMs: 0 }]]);
    const opts = makeOpts({ kbTop: 700 });
    drawMidiBeams(stub.ctx, { activeNotes: active, sustainedNotes: new Set() }, opts);
    const gradCall = stub.calls.find((c) => c.method === 'createLinearGradient');
    // Stub's midiToScreenX(60) = (60 - 21) * 10 = 390.
    expect(gradCall?.args).toEqual([390, 700, 390, 0]);
  });

  it('beam width grows with velocity', () => {
    const lo = makeCanvasStub();
    const hi = makeCanvasStub();
    const optsFrozen = makeOpts({ timeMs: 0 }); // pulse phase = 0 fixes the multiplier
    drawMidiBeams(
      lo.ctx,
      {
        activeNotes: new Map([[60, { velocity: 1, onTimeMs: 0 }]]),
        sustainedNotes: new Set(),
      },
      optsFrozen
    );
    drawMidiBeams(
      hi.ctx,
      {
        activeNotes: new Map([[60, { velocity: 127, onTimeMs: 0 }]]),
        sustainedNotes: new Set(),
      },
      optsFrozen
    );
    const loRect = lo.calls.find((c) => c.method === 'fillRect');
    const hiRect = hi.calls.find((c) => c.method === 'fillRect');
    // fillRect args: [x - beamW/2, 0, beamW, kbTop] — args[2] is beamW.
    expect(Number(hiRect?.args[2])).toBeGreaterThan(Number(loRect?.args[2]));
  });

  it('alpha grows with velocity', () => {
    const lo = makeCanvasStub();
    const hi = makeCanvasStub();
    drawMidiBeams(
      lo.ctx,
      {
        activeNotes: new Map([[60, { velocity: 1, onTimeMs: 0 }]]),
        sustainedNotes: new Set(),
      },
      makeOpts()
    );
    drawMidiBeams(
      hi.ctx,
      {
        activeNotes: new Map([[60, { velocity: 127, onTimeMs: 0 }]]),
        sustainedNotes: new Set(),
      },
      makeOpts()
    );
    expect(Number(hi.prop('globalAlpha'))).toBeGreaterThan(Number(lo.prop('globalAlpha')));
  });
});
