// Spectral feature extractors used by the multi-feature onset gate.
//
// All functions accept a *magnitude spectrum* (typically from
// `analyser.getByteFrequencyData()` returning Uint8Array of bin magnitudes
// 0..255). They are pure and operate on a [startBin, endBin) sub-range.

/**
 * Spectral flatness: geometric mean / arithmetic mean.
 * 0 = pure tone (concentrated energy), 1 = white noise.
 *
 * @param spectrum Magnitude spectrum (Uint8Array or number[]).
 * @param startBin Inclusive lower bound.
 * @param endBin   Exclusive upper bound.
 */
export function computeSpectralFlatness(
  spectrum: ArrayLike<number>,
  startBin: number,
  endBin: number
): number {
  const n = endBin - startBin;
  if (n < 2) return 0;
  let logSum = 0;
  let arithSum = 0;
  let validBins = 0;
  for (let i = startBin; i < endBin; i++) {
    const val = spectrum[i] + 1e-10;
    logSum += Math.log(val);
    arithSum += val;
    validBins++;
  }
  if (validBins === 0 || arithSum < 1e-8) return 0;
  const geometricMean = Math.exp(logSum / validBins);
  const arithmeticMean = arithSum / validBins;
  return geometricMean / arithmeticMean;
}

/**
 * Spectral crest: max bin / mean.
 * High = single dominant peak (tonal). Low ≈ 1 = uniform spectrum.
 */
export function computeSpectralCrest(
  spectrum: ArrayLike<number>,
  startBin: number,
  endBin: number
): number {
  const n = endBin - startBin;
  if (n < 2) return 0;
  let maxVal = 0;
  let sum = 0;
  for (let i = startBin; i < endBin; i++) {
    if (spectrum[i] > maxVal) maxVal = spectrum[i];
    sum += spectrum[i];
  }
  const mean = sum / n;
  if (mean < 1e-8) return 0;
  return maxVal / mean;
}

/**
 * Spectral centroid in Hz: weighted average bin frequency, weighted by magnitude.
 *
 * @param binHz Frequency width per bin, e.g. sampleRate / fftSize.
 */
export function computeSpectralCentroid(
  spectrum: ArrayLike<number>,
  startBin: number,
  endBin: number,
  binHz: number
): number {
  let weightedSum = 0;
  let totalEnergy = 0;
  for (let i = startBin; i < endBin; i++) {
    const val = spectrum[i];
    weightedSum += val * (i * binHz);
    totalEnergy += val;
  }
  if (totalEnergy < 1e-8) return 0;
  return weightedSum / totalEnergy;
}

/**
 * Coefficient of variation: stddev / |mean|.
 * Returns 0 for arrays with fewer than 3 entries or near-zero mean.
 *
 * Used by:
 *   - rhythm scoring (CV of inter-onset intervals)
 *   - centroid stability tracking (CV over a sliding window)
 */
export function coefficientOfVariation(arr: ArrayLike<number>): number {
  if (arr.length < 3) return 0;
  let mean = 0;
  for (let i = 0; i < arr.length; i++) mean += arr[i];
  mean /= arr.length;
  if (Math.abs(mean) < 1e-10) return 0;
  let variance = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    variance += d * d;
  }
  variance /= arr.length;
  return Math.sqrt(variance) / Math.abs(mean);
}
