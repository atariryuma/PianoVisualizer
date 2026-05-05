import { describe, it, expect } from 'vitest';
import { detectChord } from '../src/audio/chord';

describe('detectChord', () => {
  it('returns null for fewer than 3 notes', () => {
    expect(detectChord([])).toBeNull();
    expect(detectChord([60])).toBeNull();
    expect(detectChord([60, 64])).toBeNull();
  });

  it('detects major triad', () => {
    // C major: C E G  (60, 64, 67)
    expect(detectChord([60, 64, 67])).toBe('C');
    // G major: G B D  (67, 71, 74)
    expect(detectChord([67, 71, 74])).toBe('G');
  });

  it('detects minor triad', () => {
    // A minor: A C E  (69, 72, 76)
    expect(detectChord([69, 72, 76])).toBe('Am');
    // D minor: D F A  (62, 65, 69)
    expect(detectChord([62, 65, 69])).toBe('Dm');
  });

  it('detects augmented and diminished', () => {
    // C aug: C E G#  (60, 64, 68)
    expect(detectChord([60, 64, 68])).toBe('Caug');
    // C dim: C Eb Gb  (60, 63, 66)
    expect(detectChord([60, 63, 66])).toBe('Cdim');
  });

  it('detects sevenths', () => {
    // C7: C E G Bb  (60, 64, 67, 70)
    expect(detectChord([60, 64, 67, 70])).toBe('C7');
    // Cmaj7: C E G B  (60, 64, 67, 71)
    expect(detectChord([60, 64, 67, 71])).toBe('Cmaj7');
    // Am7: A C E G  (69, 72, 76, 79)
    expect(detectChord([69, 72, 76, 79])).toBe('Am7');
  });

  it('detects sus chords', () => {
    // Csus4: C F G  (60, 65, 67)
    expect(detectChord([60, 65, 67])).toBe('Csus4');
    // Csus2: C D G  (60, 62, 67)
    expect(detectChord([60, 62, 67])).toBe('Csus2');
  });

  it('is order-independent', () => {
    expect(detectChord([67, 60, 64])).toBe('C');
    expect(detectChord([64, 67, 60])).toBe('C');
  });

  it('treats octave duplicates as the same pitch class', () => {
    // C E G with extra C an octave up
    expect(detectChord([60, 64, 67, 72])).toBe('C');
    // C E G with C TWO octaves up
    expect(detectChord([60, 64, 67, 84])).toBe('C');
  });

  it('returns null for non-dictionary intervals', () => {
    // Random cluster: C, C#, D
    expect(detectChord([60, 61, 62])).toBeNull();
    // 4-note chord with no entry: 0,2,5,7 (not sus2 + sus4)
    expect(detectChord([60, 62, 65, 67])).toBeNull();
  });

  it('uses lowest note as root (no inversion handling)', () => {
    // Inversion of C-major (E in bass: E G C → root=E, intervals 0,3,8 = no match)
    expect(detectChord([64, 67, 72])).toBeNull();
    // Inversion of A-minor (C in bass: C E A → root=C, intervals 0,4,9 = no match)
    expect(detectChord([60, 64, 69])).toBeNull();
  });

  it('handles MIDI extremes without crashing', () => {
    // Lowest piano: A0 = 21. Plus E1 + A1 = A minor low.
    expect(detectChord([21, 24, 28])).toBe('Am');
    // Highest piano: C8 = 108. Plus E8 + G8.
    expect(detectChord([108, 112, 115])).toBe('C');
  });

  it('reuses pitch-class buffer (no GC pressure smoke test)', () => {
    // Just ensure repeated calls don't throw and stay correct.
    for (let i = 0; i < 100; i++) {
      expect(detectChord([60, 64, 67])).toBe('C');
      expect(detectChord([62, 65, 69])).toBe('Dm');
    }
  });
});
