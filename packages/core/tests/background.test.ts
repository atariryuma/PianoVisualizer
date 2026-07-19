import { describe, it, expect, beforeEach } from 'vitest';
import {
  initBackground,
  drawBgStars,
  drawAurora,
  drawGroundFlowers,
  type BgState,
} from '../src/render/background';
import { makeCanvasStub } from './_fixtures/canvas-stub';

const themeColors = ['#ff0000', '#00ff00', '#0000ff'] as const;

// Deterministic RNG for stable star positions.
function seedRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

describe('initBackground', () => {
  it('builds the requested number of stars', () => {
    const bg = initBackground({ screenW: 800, screenH: 600, starCount: 50, rng: seedRng(1) });
    expect(bg.stars).toHaveLength(50);
  });

  it('places every star within the canvas bounds', () => {
    const bg = initBackground({ screenW: 800, screenH: 600, starCount: 100, rng: seedRng(7) });
    for (const s of bg.stars) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(800);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(600);
      expect(s.size).toBeGreaterThanOrEqual(0.5);
      expect(s.speed).toBeGreaterThan(0);
    }
  });

  it('starCount=0 yields an empty star array', () => {
    const bg = initBackground({ screenW: 800, screenH: 600, starCount: 0 });
    expect(bg.stars).toHaveLength(0);
  });

  it('uses Math.random by default (no rng injected) — produces stars', () => {
    const bg = initBackground({ screenW: 800, screenH: 600, starCount: 5 });
    expect(bg.stars).toHaveLength(5);
  });
});

describe('drawBgStars', () => {
  let bg: BgState;
  let stub: ReturnType<typeof makeCanvasStub>;

  beforeEach(() => {
    bg = initBackground({ screenW: 800, screenH: 600, starCount: 10, rng: seedRng(42) });
    stub = makeCanvasStub();
  });

  it('no-ops when flow is below the visibility floor (flow < 0.3)', () => {
    drawBgStars(stub.ctx, bg, { flow: 0.2, themeColors });
    expect(stub.calls).toHaveLength(0);
  });

  it('paints one arc per star when flow is above the visibility floor', () => {
    drawBgStars(stub.ctx, bg, { flow: 50, themeColors });
    expect(stub.countCalls('arc')).toBe(10);
    expect(stub.countCalls('fill')).toBe(10);
  });

  it('advances each star twinkle phase by its speed', () => {
    const before = bg.stars.map((s) => s.twinkle);
    const speeds = bg.stars.map((s) => s.speed);
    drawBgStars(stub.ctx, bg, { flow: 50, themeColors });
    for (let i = 0; i < bg.stars.length; i++) {
      expect(bg.stars[i].twinkle).toBeCloseTo(before[i] + speeds[i], 6);
    }
  });

  it('dtNorm 指定時は twinkle 前進が dtNorm 倍（dtNorm=1 は省略時と同値）', () => {
    const before = bg.stars.map((s) => s.twinkle);
    const speeds = bg.stars.map((s) => s.speed);
    drawBgStars(stub.ctx, bg, { flow: 50, themeColors, dtNorm: 2 });
    for (let i = 0; i < bg.stars.length; i++) {
      expect(bg.stars[i].twinkle).toBeCloseTo(before[i] + speeds[i] * 2, 6);
    }
  });

  it('star fill cycles through the injected theme palette', () => {
    drawBgStars(stub.ctx, bg, { flow: 50, themeColors });
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0] as string);
    // Every fill must be one of the palette colors (or '#fff' fallback)
    for (const f of fillStyles) {
      expect([...themeColors, '#fff']).toContain(f);
    }
  });
});

describe('drawAurora', () => {
  let stub: ReturnType<typeof makeCanvasStub>;
  beforeEach(() => {
    stub = makeCanvasStub();
  });

  it('no-ops when flow ≤ 40 (intensity = 0)', () => {
    drawAurora(stub.ctx, { screenW: 800, screenH: 600, flow: 40, themeColors, timeMs: 1000 });
    expect(stub.calls).toHaveLength(0);
  });

  it('paints exactly 3 bands when flow is above the threshold', () => {
    drawAurora(stub.ctx, { screenW: 800, screenH: 600, flow: 80, themeColors, timeMs: 1000 });
    expect(stub.countCalls('createLinearGradient')).toBe(3);
    expect(stub.countCalls('fill')).toBe(3);
    expect(stub.countCalls('closePath')).toBe(3);
  });

  it('applies intensity * 0.15 as global alpha', () => {
    drawAurora(stub.ctx, { screenW: 800, screenH: 600, flow: 100, themeColors, timeMs: 1000 });
    // intensity = (100-40)/60 = 1.0 → globalAlpha = 0.15
    const alphas = stub.calls
      .filter((c) => c.method === 'set globalAlpha')
      .map((c) => c.args[0] as number);
    expect(alphas).toContain(0.15);
  });

  it('cycles theme palette across the 3 bands (mod themeColors.length)', () => {
    drawAurora(stub.ctx, { screenW: 800, screenH: 600, flow: 100, themeColors, timeMs: 1000 });
    const stops = stub.calls
      .filter((c) => c.method === 'gradient.addColorStop' && c.args[0] === 0)
      .map((c) => c.args[1] as string);
    expect(stops).toEqual([themeColors[0], themeColors[1], themeColors[2]]);
  });

  it('handles a single-color palette without crashing', () => {
    expect(() =>
      drawAurora(stub.ctx, {
        screenW: 800,
        screenH: 600,
        flow: 80,
        themeColors: ['#abcdef'],
        timeMs: 1000,
      })
    ).not.toThrow();
  });

  // ─── グラデーションキャッシュ（R2-5） ─────────────────────────────

  it('同一 ctx + H + 色なら2フレーム目以降グラデーションを再生成しない', () => {
    const opts = { screenW: 800, screenH: 600, flow: 80, themeColors, timeMs: 1000 };
    drawAurora(stub.ctx, opts);
    expect(stub.countCalls('createLinearGradient')).toBe(3);
    drawAurora(stub.ctx, { ...opts, timeMs: 1016 });
    drawAurora(stub.ctx, { ...opts, timeMs: 1033 });
    // キャッシュヒット — 生成は最初の3本のまま増えない
    expect(stub.countCalls('createLinearGradient')).toBe(3);
    // 描画自体は毎フレーム走る（3バンド × 3フレーム）
    expect(stub.countCalls('fill')).toBe(9);
  });

  it('キャッシュヒット時も色ストップは初回と同一（同一色出力）', () => {
    const opts = { screenW: 800, screenH: 600, flow: 100, themeColors, timeMs: 1000 };
    drawAurora(stub.ctx, opts);
    const firstStops = stub.calls
      .filter((c) => c.method === 'gradient.addColorStop' && c.args[0] === 0)
      .map((c) => c.args[1] as string);
    expect(firstStops).toEqual([themeColors[0], themeColors[1], themeColors[2]]);
    // 2フレーム目: addColorStop は増えない（= キャッシュ済みオブジェクトを
    // fillStyle にそのまま使う → 出力色は初回と同一）
    const stopCountAfterFirst = stub.countCalls('gradient.addColorStop');
    drawAurora(stub.ctx, { ...opts, timeMs: 2000 });
    expect(stub.countCalls('gradient.addColorStop')).toBe(stopCountAfterFirst);
  });

  it('H（画面高さ）が変わるとキャッシュを破棄して作り直す', () => {
    const opts = { screenW: 800, screenH: 600, flow: 80, themeColors, timeMs: 1000 };
    drawAurora(stub.ctx, opts);
    expect(stub.countCalls('createLinearGradient')).toBe(3);
    drawAurora(stub.ctx, { ...opts, screenH: 900 }); // リサイズ
    expect(stub.countCalls('createLinearGradient')).toBe(6);
  });

  it('ctx が変わる（コンテキスト再生成）とキャッシュを破棄する', () => {
    const opts = { screenW: 800, screenH: 600, flow: 80, themeColors, timeMs: 1000 };
    drawAurora(stub.ctx, opts);
    const stub2 = makeCanvasStub();
    drawAurora(stub2.ctx, opts);
    expect(stub2.countCalls('createLinearGradient')).toBe(3);
  });

  it('テーマ切替（別色）は色キーのミスとして新規生成される', () => {
    const opts = { screenW: 800, screenH: 600, flow: 80, themeColors, timeMs: 1000 };
    drawAurora(stub.ctx, opts);
    expect(stub.countCalls('createLinearGradient')).toBe(3);
    drawAurora(stub.ctx, { ...opts, themeColors: ['#111111', '#222222', '#333333'] });
    expect(stub.countCalls('createLinearGradient')).toBe(6);
    // 元テーマへ戻すとキャッシュヒット（生成は増えない）
    drawAurora(stub.ctx, opts);
    expect(stub.countCalls('createLinearGradient')).toBe(6);
  });
});

describe('drawGroundFlowers', () => {
  let stub: ReturnType<typeof makeCanvasStub>;
  beforeEach(() => {
    stub = makeCanvasStub();
  });

  it('no-ops when flow ≤ 55', () => {
    drawGroundFlowers(stub.ctx, {
      screenW: 800,
      screenH: 600,
      flow: 55,
      themeColors,
      timeMs: 1000,
    });
    expect(stub.calls).toHaveLength(0);
  });

  it('flower count scales linearly with intensity (12 at flow=100)', () => {
    drawGroundFlowers(stub.ctx, {
      screenW: 800,
      screenH: 600,
      flow: 100,
      themeColors,
      timeMs: 1000,
    });
    // Each flower draws 1 stem (moveTo/lineTo/stroke). Count strokes.
    expect(stub.countCalls('stroke')).toBe(12);
  });

  it('flower count is partial in the 55..100 ramp', () => {
    drawGroundFlowers(stub.ctx, {
      screenW: 800,
      screenH: 600,
      flow: 80,
      themeColors,
      timeMs: 1000,
    });
    // intensity = (80-55)/45 ≈ 0.556 → floor(0.556 * 12) = 6
    expect(stub.countCalls('stroke')).toBe(6);
  });

  it('balances save/restore', () => {
    drawGroundFlowers(stub.ctx, {
      screenW: 800,
      screenH: 600,
      flow: 80,
      themeColors,
      timeMs: 1000,
    });
    expect(stub.countCalls('save')).toBe(stub.countCalls('restore'));
  });
});
