// Center radial-gradient glow — the soft halo that swells in the middle of
// the canvas with audio energy + flow + the encouragement glow-pulse boost.
//
// Pure: no globals, no THEMES dep. The caller passes `theme.glow` (the rgba
// prefix string) so the module stays decoupled from the theme tables.

export interface CenterGlowOptions {
  screenW: number;
  screenH: number;
  /** Smoothed audio energy (0..~1). Drives the base radius. */
  smoothEnergy: number;
  /** Current flow (0..100). Adds linear-radius growth + alpha boost. */
  flow: number;
  /** Encouragement glow-pulse intensity (0..~1.5). Adds extra radius + alpha. */
  glowExtra: number;
  /** Theme glow prefix, e.g. `'rgba(139,92,246,'` (caller appends alpha + ')'). */
  glowPrefix: string;
}

/**
 * Draw the center radial-gradient halo. No-op when both `smoothEnergy` and
 * `glowExtra` are below the visibility floor (matches legacy gate
 * `smoothEnergy > 0.04 || glowExtra > 0.02`).
 *
 * Math, faithful to legacy:
 *   baseGlow  = W × 0.3 × smoothEnergy + 100 + flow × 3
 *   glowSize  = baseGlow + glowExtra × W × 0.2
 *   glowAlpha = min(0.4, 0.08 + flow × 0.002 + glowExtra × 0.15)
 */
export function drawCenterGlow(ctx: CanvasRenderingContext2D, opts: CenterGlowOptions): void {
  if (opts.smoothEnergy <= 0.04 && opts.glowExtra <= 0.02) return;

  const W = opts.screenW;
  const H = opts.screenH;
  const baseGlow = W * 0.3 * opts.smoothEnergy + 100 + opts.flow * 3;
  const glowSize = baseGlow + opts.glowExtra * W * 0.2;
  const glowAlpha = Math.min(0.4, 0.08 + opts.flow * 0.002 + opts.glowExtra * 0.15);
  const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, glowSize);
  grad.addColorStop(0, opts.glowPrefix + glowAlpha + ')');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}
