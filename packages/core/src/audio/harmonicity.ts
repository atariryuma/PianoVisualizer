// Harmonicity check — the v9 onset-gate addition that rejects voice / clatter.
//
// Piano sound has strong energy at integer multiples of the fundamental.
// Voice (especially vowels) has formant peaks that don't align with the
// integer-ratio grid. Returns the ratio of harmonic-bin energy to total
// energy, in [0, 1]. Higher = more piano-like.

export interface HarmonicityOptions {
  /** Number of partials to check. 実装は基音（1×）を含めて
   *  1×〜(N+1)× の整数倍ビンを走査する（旧記載の「2×〜」は誤り）。 */
  partials?: number;
  /** ± bins around each integer-multiple bin to consider as harmonic energy. */
  binTolerance?: number;
}

const DEFAULTS: Required<HarmonicityOptions> = {
  partials: 6,
  binTolerance: 2,
};

/**
 * @param spectrum Magnitude spectrum (typically Uint8Array 0..255 from getByteFrequencyData).
 * @param fundamentalBin Bin index of the detected fundamental.
 * @param startBin Inclusive lower bound of the analysis window.
 * @param endBin Exclusive upper bound.
 * @returns harmonic energy / total energy, in [0, 1]. 0 if fundamental out of range.
 */
export function computeHarmonicity(
  spectrum: ArrayLike<number>,
  fundamentalBin: number,
  startBin: number,
  endBin: number,
  opts: HarmonicityOptions = {}
): number {
  if (fundamentalBin <= 0 || fundamentalBin >= endBin) return 0;

  const o = { ...DEFAULTS, ...opts };
  const tol = o.binTolerance;
  let harmonicEnergy = 0;
  let totalEnergy = 0;

  // Total energy (normalized magnitudes squared).
  for (let i = startBin; i < endBin; i++) {
    const val = spectrum[i] / 255;
    totalEnergy += val * val;
  }
  if (totalEnergy < 1e-6) return 0;

  // Energy at integer multiples h = 1..(partials+1).
  for (let h = 1; h <= o.partials + 1; h++) {
    const harmonicBin = Math.round(fundamentalBin * h);
    if (harmonicBin >= endBin) break;
    const lo = Math.max(startBin, harmonicBin - tol);
    const hi = Math.min(endBin - 1, harmonicBin + tol);
    for (let i = lo; i <= hi; i++) {
      const val = spectrum[i] / 255;
      harmonicEnergy += val * val;
    }
  }

  return harmonicEnergy / totalEnergy;
}
