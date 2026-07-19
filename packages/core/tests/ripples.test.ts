import { describe, it, expect } from 'vitest';
import { Ripple } from '../src/render/ripples';
import { makeCanvasStub } from './_fixtures/canvas-stub';

describe('Ripple constructor', () => {
  it('starts at radius 0 with life=1', () => {
    const r = new Ripple(100, 200, '#abc');
    expect(r.x).toBe(100);
    expect(r.y).toBe(200);
    expect(r.color).toBe('#abc');
    expect(r.radius).toBe(0);
    expect(r.life).toBe(1);
    expect(r.maxRadius).toBe(200); // default
  });

  it('honors custom maxRadius', () => {
    expect(new Ripple(0, 0, '#fff', 500).maxRadius).toBe(500);
  });
});

describe('Ripple.update', () => {
  it('expands radius at base 2.5 + flow*0.03', () => {
    const r = new Ripple(0, 0, '#fff', 100);
    r.update({ flow: 0 });
    expect(r.radius).toBeCloseTo(2.5, 5);
    r.update({ flow: 100 });
    expect(r.radius).toBeCloseTo(2.5 + 5.5, 5); // +2.5 (base) + 100*0.03
  });

  it('life decreases as radius approaches maxRadius', () => {
    const r = new Ripple(0, 0, '#fff', 100);
    r.update({ flow: 0 }); // radius=2.5
    expect(r.life).toBeCloseTo(1 - 0.025, 5);
  });

  it('life crosses ≤ 0 once radius reaches maxRadius', () => {
    const r = new Ripple(0, 0, '#fff', 10);
    // Need ~5 updates at flow=0 (2.5/tick) to reach 10.
    while (r.life > 0) r.update({ flow: 0 });
    expect(r.life).toBeLessThanOrEqual(0);
  });
});

// ─── dtNorm 正規化（リフレッシュレート非依存の拡大） ────────────────

describe('Ripple.update — dtNorm', () => {
  it('update(opts, 1) は従来の update(opts) と完全同値', () => {
    const a = new Ripple(0, 0, '#fff', 100);
    const b = new Ripple(0, 0, '#fff', 100);
    a.update({ flow: 60 });
    b.update({ flow: 60 }, 1);
    expect(b.radius).toBe(a.radius);
    expect(b.life).toBe(a.life);
  });

  it('dtNorm=2 で拡大量が2倍になる（life も radius 由来で追従）', () => {
    const r = new Ripple(0, 0, '#fff', 100);
    r.update({ flow: 100 }, 2);
    expect(r.radius).toBeCloseTo((2.5 + 3) * 2, 5); // (2.5 + 100*0.03) * 2
    expect(r.life).toBeCloseTo(1 - 11 / 100, 5);
  });

  it('dtNorm=0.5（120Hz 相当）で拡大量が半分になる', () => {
    const r = new Ripple(0, 0, '#fff', 100);
    r.update({ flow: 0 }, 0.5);
    expect(r.radius).toBeCloseTo(1.25, 5);
  });
});

describe('Ripple.draw', () => {
  it('no-ops when life ≤ 0', () => {
    const r = new Ripple(0, 0, '#fff', 1);
    r.life = 0;
    const stub = makeCanvasStub();
    r.draw(stub.ctx, { flow: 50, useShadow: false });
    expect(stub.calls).toHaveLength(0);
  });

  it('draws an arc with stroke when alive', () => {
    const r = new Ripple(100, 200, '#abc', 100);
    r.radius = 50;
    r.life = 0.5;
    const stub = makeCanvasStub();
    r.draw(stub.ctx, { flow: 50, useShadow: false });
    expect(stub.countCalls('save')).toBe(1);
    expect(stub.countCalls('restore')).toBe(1);
    expect(stub.countCalls('arc')).toBe(1);
    expect(stub.countCalls('stroke')).toBe(1);
    expect(stub.props.strokeStyle).toBe('#abc');
    expect(stub.props.globalAlpha).toBeCloseTo(0.5 * 0.3, 5);
  });

  it('lineWidth scales with flow', () => {
    const r = new Ripple(0, 0, '#fff', 100);
    r.radius = 10;
    r.life = 0.5;
    const stubLow = makeCanvasStub();
    r.draw(stubLow.ctx, { flow: 0, useShadow: false });
    const lwLow = stubLow.props.lineWidth as number;
    const stubHigh = makeCanvasStub();
    r.draw(stubHigh.ctx, { flow: 100, useShadow: false });
    expect(stubHigh.props.lineWidth).toBeGreaterThan(lwLow);
  });

  it('applies shadowBlur only when useShadow=true', () => {
    const r = new Ripple(0, 0, '#fff', 100);
    r.radius = 10;
    r.life = 0.5;

    const off = makeCanvasStub();
    r.draw(off.ctx, { flow: 50, useShadow: false });
    expect(off.props.shadowBlur).toBeUndefined();

    const on = makeCanvasStub();
    r.draw(on.ctx, { flow: 50, useShadow: true });
    expect(on.props.shadowBlur).toBeGreaterThan(0);
  });

  it('shadowBlur intensity scales with flow when useShadow=true', () => {
    const r = new Ripple(0, 0, '#fff', 100);
    r.radius = 10;
    r.life = 0.5;
    const low = makeCanvasStub();
    r.draw(low.ctx, { flow: 0, useShadow: true });
    const high = makeCanvasStub();
    r.draw(high.ctx, { flow: 100, useShadow: true });
    expect(high.props.shadowBlur).toBeGreaterThan(low.props.shadowBlur as number);
  });
});
