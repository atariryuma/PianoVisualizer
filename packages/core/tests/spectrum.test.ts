import { describe, it, expect, beforeEach } from 'vitest';
import { drawSpectrumBars } from '../src/render/spectrum';
import { makeCanvasStub } from './_fixtures/canvas-stub';

const themeColors = ['#ff0000', '#00ff00', '#0000ff'] as const;

function makeFreq(len: number, value = 128): Uint8Array {
  const a = new Uint8Array(len);
  a.fill(value);
  return a;
}

describe('drawSpectrumBars', () => {
  let stub: ReturnType<typeof makeCanvasStub>;
  beforeEach(() => {
    stub = makeCanvasStub();
  });

  it('paints one fillRect per bar', () => {
    drawSpectrumBars(stub.ctx, makeFreq(2048), {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 64,
      themeColors,
      flow: 50,
    });
    expect(stub.countCalls('fillRect')).toBe(64);
  });

  it('no-ops when barCount ≤ 0', () => {
    drawSpectrumBars(stub.ctx, makeFreq(2048), {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 0,
      themeColors,
      flow: 50,
    });
    expect(stub.countCalls('fillRect')).toBe(0);
  });

  it('no-ops when themeColors is empty', () => {
    drawSpectrumBars(stub.ctx, makeFreq(2048), {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 64,
      themeColors: [],
      flow: 50,
    });
    expect(stub.countCalls('fillRect')).toBe(0);
  });

  it('no-ops when slice (endBin - startBin) is empty', () => {
    drawSpectrumBars(stub.ctx, makeFreq(2048), {
      screenW: 800,
      screenH: 600,
      startBin: 100,
      endBin: 100,
      barCount: 64,
      themeColors,
      flow: 50,
    });
    expect(stub.countCalls('fillRect')).toBe(0);
  });

  it('no-ops when slice is smaller than barCount (step would be 0)', () => {
    drawSpectrumBars(stub.ctx, makeFreq(2048), {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 30, // 26 bins / 64 bars → step = 0
      barCount: 64,
      themeColors,
      flow: 50,
    });
    expect(stub.countCalls('fillRect')).toBe(0);
  });

  it('cycles through the injected theme palette positionally', () => {
    drawSpectrumBars(stub.ctx, makeFreq(2048), {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 6,
      themeColors,
      flow: 50,
    });
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0] as string);
    // 6 bars, 3 palette colors → bars 0,1 → red; 2,3 → green; 4,5 → blue
    expect(fillStyles).toEqual(['#ff0000', '#ff0000', '#00ff00', '#00ff00', '#0000ff', '#0000ff']);
  });

  it('bar height scales linearly with the freqData value', () => {
    const freq = new Uint8Array(2048);
    // Make bin 4 = 255 (max), the rest 0. Only bar 0 should be tall.
    freq[4] = 255;
    drawSpectrumBars(stub.ctx, freq, {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 4 + 64,
      barCount: 64,
      themeColors,
      flow: 0,
    });
    const rects = stub.calls.filter((c) => c.method === 'fillRect');
    // bar 0 (val=255 → 1.0) → barH = 600 × 0.1 = 60
    const [_x0, y0, _w0, h0] = rects[0].args as [number, number, number, number];
    expect(h0).toBeCloseTo(60);
    expect(y0).toBeCloseTo(540);
    // bar 1 (val=0) → barH = 0
    const [, , , h1] = rects[1].args as [number, number, number, number];
    expect(h1).toBe(0);
  });

  it('bar height scales with flow (higher flow → taller bars)', () => {
    const freq = makeFreq(2048, 255);

    const stub1 = makeCanvasStub();
    drawSpectrumBars(stub1.ctx, freq, {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 64,
      themeColors,
      flow: 0,
    });

    const stub2 = makeCanvasStub();
    drawSpectrumBars(stub2.ctx, freq, {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 64,
      themeColors,
      flow: 100,
    });

    const heights = (s: ReturnType<typeof makeCanvasStub>) =>
      s.calls.filter((c) => c.method === 'fillRect').map((c) => (c.args as number[])[3]);
    const h0 = heights(stub1)[0];
    const h100 = heights(stub2)[0];
    expect(h100).toBeGreaterThan(h0);
  });

  it('bar alpha scales with flow', () => {
    const freq = makeFreq(2048, 255);
    drawSpectrumBars(stub.ctx, freq, {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 64,
      themeColors,
      flow: 100,
    });
    const alphas = stub.calls
      .filter((c) => c.method === 'set globalAlpha')
      .map((c) => c.args[0] as number);
    // val=1.0, flow=100 → alpha = 0.15 + 100×0.003 = 0.45 (modulo float epsilon)
    expect(alphas[0]).toBeCloseTo(0.45, 6);
  });

  it('resets globalAlpha to 1 at the end so subsequent draws are unaffected', () => {
    drawSpectrumBars(stub.ctx, makeFreq(2048, 100), {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 64,
      themeColors,
      flow: 50,
    });
    expect(stub.props.globalAlpha).toBe(1);
  });

  it('stops early when the computed bin index exceeds the freqData length', () => {
    // Pass a tiny buffer so most bar indices are out of bounds.
    const tiny = new Uint8Array(8);
    tiny.fill(255);
    drawSpectrumBars(stub.ctx, tiny, {
      screenW: 800,
      screenH: 600,
      startBin: 0,
      endBin: 256,
      barCount: 64,
      themeColors,
      flow: 50,
    });
    // step = 256/64 = 4. Idx grows 0,4,8,... → out of bounds at i=2 (idx=8).
    expect(stub.countCalls('fillRect')).toBeLessThan(64);
    expect(stub.countCalls('fillRect')).toBeGreaterThan(0);
  });

  it('accepts a plain number[] (not just Uint8Array)', () => {
    const arr: number[] = new Array(2048).fill(64);
    drawSpectrumBars(stub.ctx, arr, {
      screenW: 800,
      screenH: 600,
      startBin: 4,
      endBin: 200,
      barCount: 32,
      themeColors,
      flow: 50,
    });
    expect(stub.countCalls('fillRect')).toBe(32);
  });
});
