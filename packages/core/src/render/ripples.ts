// Ripple — concentric circle expansion at note onset positions.
//
// Pure: physics (update) takes flow as an argument, rendering (draw) takes
// the canvas context + opts. No globals.

export interface RippleUpdateOptions {
  /** Current flow value (0..100). Drives expansion rate. */
  flow: number;
}

export interface RippleDrawOptions {
  /** Current flow value (0..100). Drives line width and shadowBlur intensity. */
  flow: number;
  /** Whether to apply ctx.shadowBlur. Caller decides per frame (typically:
   *  PERF_PROFILE.shadowBlur && ripples.length < 15). */
  useShadow: boolean;
}

/**
 * Expanding circle (ripple) drawn at note-onset positions. Single-purpose:
 *   - radius grows each tick at a flow-modulated rate
 *   - life fades from 1 → 0 as radius approaches maxRadius
 *   - draw is a no-op once life ≤ 0 so caller can compact the array
 */
export class Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;

  constructor(x: number, y: number, color: string, size?: number) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = size ?? 200;
    this.color = color;
    this.life = 1;
  }

  /** One physics tick. Mutates self only.
   *
   *  dtNorm はフレーム時間の正規化係数（16.67ms = 1）。120Hz 端末で
   *  リップル拡大が2倍速になるのを防ぐ。dtNorm=1 のとき従来実装と同値。 */
  update(opts: RippleUpdateOptions, dtNorm: number = 1): void {
    this.radius += (2.5 + opts.flow * 0.03) * dtNorm;
    this.life = 1 - this.radius / this.maxRadius;
  }

  /** Render into the provided context. No-op when life has expired. */
  draw(ctx: CanvasRenderingContext2D, opts: RippleDrawOptions): void {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life * 0.3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5 + opts.flow * 0.02;
    if (opts.useShadow) {
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10 + opts.flow * 0.15;
    }
    ctx.stroke();
    ctx.restore();
  }
}
