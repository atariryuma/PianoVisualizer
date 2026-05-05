import { describe, it, expect, beforeEach } from 'vitest';
import { drawCenterGlow } from '../src/render/center-glow';
import { makeCanvasStub } from './_fixtures/canvas-stub';

const PREFIX = 'rgba(139,92,246,';

function defaults(over: Parameters<typeof drawCenterGlow>[1] | object = {}) {
  return {
    screenW: 800,
    screenH: 600,
    smoothEnergy: 0.5,
    flow: 50,
    glowExtra: 0,
    glowPrefix: PREFIX,
    ...(over as Record<string, number | string>),
  } as Parameters<typeof drawCenterGlow>[1];
}

describe('drawCenterGlow', () => {
  let stub: ReturnType<typeof makeCanvasStub>;
  beforeEach(() => {
    stub = makeCanvasStub();
  });

  it('paints a single radial gradient + full-canvas fillRect when above the energy floor', () => {
    drawCenterGlow(stub.ctx, defaults());
    expect(stub.countCalls('createRadialGradient')).toBe(1);
    expect(stub.countCalls('fillRect')).toBe(1);
    const rect = stub.calls.find((c) => c.method === 'fillRect')!;
    expect(rect.args).toEqual([0, 0, 800, 600]);
  });

  it('no-ops when both smoothEnergy and glowExtra are below their floors', () => {
    drawCenterGlow(stub.ctx, defaults({ smoothEnergy: 0.04, glowExtra: 0.02 }));
    expect(stub.calls).toHaveLength(0);
  });

  it('renders when smoothEnergy is below floor but glowExtra alone exceeds its floor', () => {
    drawCenterGlow(stub.ctx, defaults({ smoothEnergy: 0, glowExtra: 0.05 }));
    expect(stub.countCalls('fillRect')).toBe(1);
  });

  it('centers the gradient at (W/2, H/2)', () => {
    drawCenterGlow(stub.ctx, defaults());
    const grad = stub.calls.find((c) => c.method === 'createRadialGradient')!;
    expect(grad.args.slice(0, 2)).toEqual([400, 300]);
    expect(grad.args[3]).toBe(400);
    expect(grad.args[4]).toBe(300);
  });

  it('gradient outer radius scales with smoothEnergy and flow', () => {
    drawCenterGlow(stub.ctx, defaults({ smoothEnergy: 0.5, flow: 50 }));
    const grad = stub.calls.find((c) => c.method === 'createRadialGradient')!;
    // baseGlow = 800×0.3×0.5 + 100 + 50×3 = 120 + 100 + 150 = 370
    expect(grad.args[5]).toBeCloseTo(370);
  });

  it('glowExtra adds W × 0.2 × extra to the radius', () => {
    drawCenterGlow(stub.ctx, defaults({ smoothEnergy: 0, flow: 0, glowExtra: 0.5 }));
    const grad = stub.calls.find((c) => c.method === 'createRadialGradient')!;
    // baseGlow = 0 + 100 + 0 = 100; glowExtra adds 800×0.2×0.5 = 80; total 180
    expect(grad.args[5]).toBeCloseTo(180);
  });

  it('inner gradient stop uses the injected glow prefix + computed alpha', () => {
    drawCenterGlow(stub.ctx, defaults({ flow: 0, smoothEnergy: 0.2, glowExtra: 0 }));
    const stops = stub.calls.filter((c) => c.method === 'gradient.addColorStop');
    expect(stops).toHaveLength(2);
    // Inner stop (offset 0) = prefix + alpha + ')'; alpha = 0.08 at flow=0, glowExtra=0
    expect(stops[0].args[0]).toBe(0);
    const colorStr = stops[0].args[1] as string;
    expect(colorStr.startsWith(PREFIX)).toBe(true);
    expect(colorStr.endsWith(')')).toBe(true);
    const alpha = parseFloat(colorStr.slice(PREFIX.length, -1));
    expect(alpha).toBeCloseTo(0.08);
    // Outer stop = transparent
    expect(stops[1].args[0]).toBe(1);
    expect(stops[1].args[1]).toBe('transparent');
  });

  it('caps alpha at 0.4 even with peak flow + glowExtra', () => {
    drawCenterGlow(stub.ctx, defaults({ flow: 100, glowExtra: 1.5 }));
    const stops = stub.calls.filter((c) => c.method === 'gradient.addColorStop');
    const colorStr = stops[0].args[1] as string;
    const alpha = parseFloat(colorStr.slice(PREFIX.length, -1));
    expect(alpha).toBeLessThanOrEqual(0.4);
  });

  it('honors a custom glowPrefix (any theme works)', () => {
    drawCenterGlow(stub.ctx, defaults({ glowPrefix: 'rgba(255,128,64,' }));
    const stops = stub.calls.filter((c) => c.method === 'gradient.addColorStop');
    expect((stops[0].args[1] as string).startsWith('rgba(255,128,64,')).toBe(true);
  });
});
