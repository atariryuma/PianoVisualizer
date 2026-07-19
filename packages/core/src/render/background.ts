// Background composites — twinkling star field, aurora bands, ground flowers.
//
// Pure: each draw fn takes ctx + opts (no globals, no CONFIG/THEMES). Star
// state is owned by the caller via initBackground(opts) → BgState; subsequent
// drawBgStars calls mutate the twinkle phase on the same state object.
//
// Layering (back-to-front): stars → aurora → flowers. Caller orchestrates.

import { drawFlower } from './particles';

export interface BgStar {
  x: number;
  y: number;
  size: number;
  /** Phase accumulator — mutated each frame by drawBgStars. */
  twinkle: number;
  /** Per-star phase increment per frame. */
  speed: number;
}

export interface BgState {
  stars: BgStar[];
}

export interface InitBackgroundOptions {
  screenW: number;
  screenH: number;
  /** Star field density (e.g. PERF_PROFILES tier value). */
  starCount: number;
  /** Optional injectable RNG (defaults to Math.random) — useful for tests. */
  rng?: () => number;
}

/**
 * Build the star field once. Re-call when the canvas resizes or the perf
 * tier changes — the legacy app rebuilt on every devicePixelRatio shift.
 */
export function initBackground(opts: InitBackgroundOptions): BgState {
  const rng = opts.rng ?? Math.random;
  const stars: BgStar[] = [];
  for (let i = 0; i < opts.starCount; i++) {
    stars.push({
      x: rng() * opts.screenW,
      y: rng() * opts.screenH,
      size: rng() * 2 + 0.5,
      twinkle: rng() * Math.PI * 2,
      speed: 0.01 + rng() * 0.02,
    });
  }
  return { stars };
}

export interface DrawBgStarsOptions {
  /** Current flow value (0..100). Drives both visibility and star size pulse. */
  flow: number;
  /** Theme color palette — stars cycle through these tints over time. */
  themeColors: readonly string[];
  /** フレーム時間の正規化係数（16.67ms = 60fps の1フレームを 1 とする）。
   *  twinkle 位相の前進をリフレッシュレート非依存にする。省略時 1
   *  （= 従来の per-frame 前進と同値）。 */
  dtNorm?: number;
}

/**
 * Paint the twinkling star field. No-op when flow visibility is below ~1%.
 * Mutates `bg.stars[i].twinkle` forward by `speed * dtNorm` each frame.
 */
export function drawBgStars(
  ctx: CanvasRenderingContext2D,
  bg: BgState,
  opts: DrawBgStarsOptions
): void {
  const visibility = Math.min(1, opts.flow / 30);
  if (visibility < 0.01) return;
  const cols = opts.themeColors;
  const dtNorm = opts.dtNorm ?? 1;
  ctx.save();
  for (const s of bg.stars) {
    s.twinkle += s.speed * dtNorm;
    const a = visibility * (0.3 + 0.7 * (Math.sin(s.twinkle) * 0.5 + 0.5));
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * (1 + opts.flow * 0.01), 0, Math.PI * 2);
    ctx.fillStyle = cols[Math.floor(s.twinkle) % cols.length] || '#fff';
    ctx.fill();
  }
  ctx.restore();
}

export interface DrawAuroraOptions {
  screenW: number;
  screenH: number;
  /** Current flow. Aurora appears once flow > 40 (intensity = (flow-40)/60). */
  flow: number;
  themeColors: readonly string[];
  /** Wall-clock time in ms — drives the band sway. */
  timeMs: number;
}

// オーロラ用グラデーションキャッシュ — lane.ts の寸法タプルキー方式と同型。
// 3本のバンドが毎フレーム createLinearGradient していた（3個/フレーム × 60fps）
// のを、(ctx, H) が同じ間は色文字列キーで再利用する。ctx / H が変わったら
// （リサイズ・コンテキスト再生成）全キャッシュを破棄。テーマ切替は色キーの
// ミスとして自然に新規作成される（テーマ数×色数で有界）。
let _auroraGradCtx: CanvasRenderingContext2D | null = null;
let _auroraGradH = -1;
const _auroraGradByColor = new Map<string, CanvasGradient>();

/**
 * Three sinusoidal aurora bands gradient-faded into the background. No-op
 * below flow 40. Each band uses a different theme color.
 */
export function drawAurora(ctx: CanvasRenderingContext2D, opts: DrawAuroraOptions): void {
  const intensity = Math.max(0, (opts.flow - 40) / 60);
  if (intensity < 0.01) return;
  const W = opts.screenW;
  const H = opts.screenH;
  const cols = opts.themeColors;
  if (_auroraGradCtx !== ctx || _auroraGradH !== H) {
    _auroraGradByColor.clear();
    _auroraGradCtx = ctx;
    _auroraGradH = H;
  }
  ctx.save();
  ctx.globalAlpha = intensity * 0.15;
  for (let band = 0; band < 3; band++) {
    ctx.beginPath();
    ctx.moveTo(0, H * 0.3 + band * 40);
    for (let x = 0; x <= W; x += 20) {
      const y =
        H * 0.3 +
        band * 40 +
        Math.sin(x * 0.005 + opts.timeMs * 0.0008 + band) * 50 * intensity +
        Math.sin(x * 0.01 + opts.timeMs * 0.001) * 25 * intensity;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    // 色ごとに1回だけ生成（グラデーション座標は H のみ依存 — ctx/H の
    // 変化は上のガードでキャッシュ全破棄済み）。
    const color = cols[band % cols.length] ?? '#fff';
    let grad = _auroraGradByColor.get(color);
    if (!grad) {
      grad = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.7);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      _auroraGradByColor.set(color, grad);
    }
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();
}

export interface DrawGroundFlowersOptions {
  screenW: number;
  screenH: number;
  /** Current flow. Flowers appear above flow 55 (intensity = (flow-55)/45). */
  flow: number;
  themeColors: readonly string[];
  /** Wall-clock time in ms — drives stem sway. */
  timeMs: number;
}

/**
 * Row of ground flowers along the bottom. Count and stem height scale with
 * flow intensity (above 55). Uses drawFlower from render/particles for the
 * petal geometry.
 */
export function drawGroundFlowers(
  ctx: CanvasRenderingContext2D,
  opts: DrawGroundFlowersOptions
): void {
  const intensity = Math.max(0, (opts.flow - 55) / 45);
  if (intensity < 0.01) return;
  const W = opts.screenW;
  const H = opts.screenH;
  const cols = opts.themeColors;
  ctx.save();
  ctx.globalAlpha = intensity * 0.5;
  const count = Math.floor(intensity * 12);
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1 || 1)) * W;
    const baseY = H - 20;
    const sway = Math.sin(opts.timeMs * 0.001 + i * 0.7) * 5;
    const s = 4 + intensity * 6;
    ctx.strokeStyle = 'rgba(100,180,100,' + intensity * 0.4 + ')';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x + sway, baseY - 20 - s * 2);
    ctx.stroke();
    drawFlower(
      ctx,
      x + sway,
      baseY - 20 - s * 2,
      s,
      cols[i % cols.length] ?? '#fff',
      intensity,
      false
    );
  }
  ctx.restore();
}
