// Chord recognition for triads and seventh chords in root position.
//
// Inversions are intentionally out of scope — keeps detection cheap and
// honest. A first-inversion C-major (E-G-C) is reported as C/E by some
// theory tools, but most kid-pedagogy materials treat root-position only.
//
// Algorithm:
//   1. Find lowest MIDI note (root candidate).
//   2. Compute pitch-class intervals from root, deduplicated, sorted.
//   3. Look up in dictionary.
//
// Allocation: this runs on every MIDI note-on. To keep GC quiet during
// 16th-note runs (~12 events/sec), the pitch-class buckets are reused
// across calls instead of rebuilding a Set per invocation.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/**
 * Quality dictionary: comma-joined sorted pitch-class intervals from root → quality suffix.
 * "" = major triad, "m" = minor, etc. Keep keys sorted ascending.
 */
const CHORD_DICT: Record<string, string> = {
  '0,4,7': '',
  '0,3,7': 'm',
  '0,4,8': 'aug',
  '0,3,6': 'dim',
  '0,4,7,10': '7',
  '0,4,7,11': 'maj7',
  '0,3,7,10': 'm7',
  '0,3,6,9': 'dim7',
  '0,5,7': 'sus4',
  '0,2,7': 'sus2',
};

const _pcBuckets = new Uint8Array(12);

/**
 * Detect chord name from a list of MIDI note numbers played roughly together.
 * Returns null if no quality matches or fewer than 3 distinct notes.
 *
 * @param midis MIDI note numbers (0-127). Order doesn't matter.
 * @returns Note name + quality (e.g. "C", "Cm", "Cmaj7"), or null.
 */
export function detectChord(midis: readonly number[]): string | null {
  if (midis.length < 3) return null;

  let root = 128;
  for (let i = 0; i < midis.length; i++) {
    if (midis[i] < root) root = midis[i];
  }
  if (root > 127) return null;

  _pcBuckets.fill(0);
  for (let i = 0; i < midis.length; i++) {
    _pcBuckets[(((midis[i] - root) % 12) + 12) % 12] = 1;
  }

  let sig = '';
  for (let pc = 0; pc < 12; pc++) {
    if (_pcBuckets[pc]) sig += (sig ? ',' : '') + pc;
  }

  const quality = CHORD_DICT[sig];
  if (quality === undefined) return null;
  return NOTE_NAMES[((root % 12) + 12) % 12] + quality;
}
