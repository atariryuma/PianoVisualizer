// Frequency spectrum bars — narrow piano-range strip drawn at the bottom of
// the canvas. Pure: takes ctx + a frequency-data buffer + opts. The caller
// owns the AnalyserNode and decides when to draw (e.g. only when
// smoothEnergy > 0.03 so silent frames skip the work).

export interface SpectrumDrawOptions {
  screenW: number;
  screenH: number;
  /** First FFT bin to sample (inclusive). Caller computes from
   *  `floor(PIANO_FREQ_MIN / binHz)`. */
  startBin: number;
  /** Last FFT bin to sample (exclusive). Caller computes from
   *  `floor(PIANO_FREQ_MAX / binHz)`. */
  endBin: number;
  /** Number of bars to paint across the canvas width. */
  barCount: number;
  /** Theme color palette — bars cycle through these positionally. */
  themeColors: readonly string[];
  /** Current flow (0..100). Drives bar height (taller at higher flow) and
   *  per-bar alpha (more visible at higher flow). */
  flow: number;
}

/**
 * Draw `barCount` frequency bars across the canvas, sampling `freqData`
 * uniformly between `startBin` and `endBin`. No-op when the slice is empty,
 * the bar count is non-positive, or the palette is empty.
 *
 * Per-bar height = (val/255) × H × (0.1 + flow×0.001).
 * Per-bar alpha = (val/255) × (0.15 + flow×0.003).
 * Color = `themeColors[floor((i/barCount) × themeColors.length) % len]`.
 */
export function drawSpectrumBars(
  ctx: CanvasRenderingContext2D,
  freqData: Uint8Array | readonly number[],
  opts: SpectrumDrawOptions
): void {
  if (opts.barCount <= 0) return;
  if (opts.themeColors.length === 0) return;
  const sliceLen = opts.endBin - opts.startBin;
  if (sliceLen <= 0) return;
  const step = Math.floor(sliceLen / opts.barCount);
  if (step <= 0) return;

  const W = opts.screenW;
  const H = opts.screenH;
  const barW = W / opts.barCount;
  const barAlphaScale = 0.15 + opts.flow * 0.003;
  const heightScale = H * (0.1 + opts.flow * 0.001);
  const cols = opts.themeColors;

  for (let i = 0; i < opts.barCount; i++) {
    const idx = opts.startBin + i * step;
    if (idx >= freqData.length) break;
    const val = freqData[idx] / 255;
    const barH = val * heightScale;
    ctx.fillStyle = cols[Math.floor((i / opts.barCount) * cols.length) % cols.length];
    ctx.globalAlpha = val * barAlphaScale;
    ctx.fillRect(i * barW, H - barH, barW - 1, barH);
  }
  ctx.globalAlpha = 1;
}
