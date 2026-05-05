// YIN pitch detection — time-domain autocorrelation algorithm.
//
// Reference: de Cheveigné, A. & Kawahara, H. (2002). YIN, a fundamental
// frequency estimator for speech and music. JASA 111(4), 1917-1930.
//
// Implementation uses Cumulative Mean Normalized Difference Function (CMNDF)
// + parabolic interpolation. Robust on piano (single-pitched, harmonic) but
// known to lock onto sub-harmonics 1-2 octaves below the actual note. The
// caller compensates by:
//   1. Filtering by RMS (silent buffer → no detection)
//   2. Median of last N high-confidence pitches (kills 1-frame octave errors)
//   3. Practice-mode floor (PITCH_MIN_HZ_PRACTICE) to reject impossibly-low

export interface YinOptions {
  /** Threshold for the cumulative mean function (typical 0.10–0.20). Lower = more strict. */
  threshold?: number;
  /** Minimum confidence (1 - cmndf) for a positive detection. */
  probabilityThreshold?: number;
  /** Reject buffers below this RMS. */
  rmsSilenceThreshold?: number;
  /** Pitch range to search. */
  pitchMinHz?: number;
  pitchMaxHz?: number;
}

export interface YinResult {
  /** Detected pitch in Hz, or -1 if none. */
  pitch: number;
  /** Confidence (1 - cmndf) when pitch > 0; else the best partial match. */
  conf: number;
  /** Buffer RMS (independent of pitch detection). */
  rms: number;
}

const DEFAULTS: Required<YinOptions> = {
  threshold: 0.2,
  probabilityThreshold: 0.1,
  rmsSilenceThreshold: 0.008,
  pitchMinHz: 25,
  pitchMaxHz: 5000,
};

// Reusable scratch buffers — sized lazily to the largest tau seen.
let _diffBuf: Float32Array | null = null;
let _cmndfBuf: Float32Array | null = null;

/**
 * Detect the fundamental frequency in a time-domain audio buffer.
 *
 * @param buf Float32 PCM, range typically -1..1.
 * @param sampleRate In Hz (e.g., 48000).
 * @param opts Algorithm tuning. Defaults match the legacy app.js values.
 */
export function detectPitchYIN(
  buf: Float32Array,
  sampleRate: number,
  opts: YinOptions = {}
): YinResult {
  const o = { ...DEFAULTS, ...opts };
  const SIZE = buf.length;

  // RMS check — cheap silence guard.
  let rmsSum = 0;
  for (let i = 0; i < SIZE; i++) rmsSum += buf[i] * buf[i];
  const rms = Math.sqrt(rmsSum / SIZE);
  if (rms < o.rmsSilenceThreshold) return { pitch: -1, conf: 0, rms };

  const halfLen = Math.floor(SIZE / 2);
  const tauMin = Math.floor(sampleRate / o.pitchMaxHz);
  const tauMax = Math.min(halfLen, Math.floor(sampleRate / o.pitchMinHz));
  if (tauMax <= tauMin + 2) return { pitch: -1, conf: 0, rms };

  if (!_diffBuf || _diffBuf.length < tauMax + 1) {
    _diffBuf = new Float32Array(tauMax + 1);
    _cmndfBuf = new Float32Array(tauMax + 1);
  }
  const diff = _diffBuf;
  const cmndf = _cmndfBuf as Float32Array;
  diff[0] = 0;

  // Squared-difference function.
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < halfLen; j++) {
      const delta = buf[j] - buf[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference function.
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 0;
  }

  // Find first tau below threshold; descend into the local minimum.
  let bestTau = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (cmndf[tau] < o.threshold) {
      while (tau + 1 < tauMax && cmndf[tau + 1] < cmndf[tau]) tau++;
      bestTau = tau;
      break;
    }
  }

  if (bestTau < 0) {
    // No strong dip — fall back to the global minimum, but only if it's
    // promising. A flat cmndf > 0.5 means there's no periodicity at all.
    let minVal = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmndf[tau] < minVal) {
        minVal = cmndf[tau];
        bestTau = tau;
      }
    }
    if (minVal > 0.5) return { pitch: -1, conf: 0, rms };
  }

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  let refinedTau = bestTau;
  if (bestTau > 0 && bestTau < tauMax) {
    const s0 = diff[bestTau - 1];
    const s1 = diff[bestTau];
    const s2 = diff[bestTau + 1];
    const denom = 2 * (2 * s1 - s0 - s2);
    if (Math.abs(denom) > 1e-10) {
      refinedTau = bestTau + (s0 - s2) / denom;
    }
  }
  if (refinedTau <= 0) return { pitch: -1, conf: 0, rms };

  const pitch = sampleRate / refinedTau;
  const conf = 1 - cmndf[bestTau];

  if (pitch < o.pitchMinHz || pitch > o.pitchMaxHz) {
    return { pitch: -1, conf, rms };
  }
  if (conf < o.probabilityThreshold) {
    return { pitch: -1, conf, rms };
  }
  return { pitch, conf, rms };
}

/** Convert a frequency to nearest MIDI note, octave, name. Returns null if out of piano range. */
export function freqToNote(
  f: number,
  pitchMinHz = DEFAULTS.pitchMinHz,
  pitchMaxHz = DEFAULTS.pitchMaxHz
): { name: string; octave: number; noteNum: number; freq: number } | null {
  if (f < pitchMinHz || f > pitchMaxHz) return null;
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const n = 12 * Math.log2(f / 440) + 69;
  const r = Math.round(n);
  return {
    name: NOTE_NAMES[((r % 12) + 12) % 12],
    octave: Math.floor(r / 12) - 1,
    noteNum: r,
    freq: f,
  };
}
