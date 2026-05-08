// Tests for packages/web/src/layout-detect.ts.
//
// The boundaries are tuned against a real device matrix. These tests
// pin every "named device" the comments call out, plus a couple of
// edge cases (1199×500 misclassification regression).

import { describe, it, expect } from 'vitest';
import { detectLayout } from '../src/layout-detect';

describe('detectLayout — desktop', () => {
  it('1920x1080 → desktop', () => {
    expect(detectLayout(1920, 1080)).toBe('desktop');
  });

  it('1280x720 → desktop (just over the 1200 threshold)', () => {
    expect(detectLayout(1280, 720)).toBe('desktop');
  });

  it('iPad Pro 12.9 landscape (1366x1024) → desktop', () => {
    expect(detectLayout(1366, 1024)).toBe('desktop');
  });

  it('1199×500 (regression case) → NOT desktop, NOT phone-landscape', () => {
    // 1199 < 1200 so it can't be desktop. h=500 ≤ 520 + landscape
    // would pin it as phone-landscape *except* the w<1024 cap stops
    // the misclassification. With both rules failing it lands as
    // phone-portrait (defensive fallback).
    const got = detectLayout(1199, 500);
    expect(got).not.toBe('desktop');
    expect(got).not.toBe('phone-landscape');
  });
});

describe('detectLayout — tablet', () => {
  it('iPad Mini portrait (768x1024) → tablet', () => {
    expect(detectLayout(768, 1024)).toBe('tablet');
  });

  it('iPad Mini landscape (1024x768) → tablet', () => {
    expect(detectLayout(1024, 768)).toBe('tablet');
  });

  it('iPad Air 4 portrait (820x1180) → tablet', () => {
    expect(detectLayout(820, 1180)).toBe('tablet');
  });

  it('iPad Air 4 landscape (1180x820) → tablet', () => {
    expect(detectLayout(1180, 820)).toBe('tablet');
  });

  it('iPad Pro 11 portrait (834x1194) → tablet', () => {
    expect(detectLayout(834, 1194)).toBe('tablet');
  });

  it('iPad Pro 11 landscape (1194x834) → tablet', () => {
    expect(detectLayout(1194, 834)).toBe('tablet');
  });

  it('iPad Pro 12.9 portrait (1024x1366) → tablet (NOT desktop)', () => {
    expect(detectLayout(1024, 1366)).toBe('tablet');
  });

  it('900x600 → tablet (just over the threshold)', () => {
    expect(detectLayout(900, 600)).toBe('tablet');
  });

  it('900x599 → NOT tablet (short edge below 600)', () => {
    expect(detectLayout(900, 599)).not.toBe('tablet');
  });

  it('899x700 → NOT tablet (longest edge below 900)', () => {
    expect(detectLayout(899, 700)).not.toBe('tablet');
  });
});

describe('detectLayout — phone-landscape', () => {
  it('iPhone 14 landscape (852x393) → phone-landscape', () => {
    expect(detectLayout(852, 393)).toBe('phone-landscape');
  });

  it('iPhone SE landscape (667x375) → phone-landscape', () => {
    expect(detectLayout(667, 375)).toBe('phone-landscape');
  });

  it('Pixel 7 landscape (915x412) → phone-landscape', () => {
    expect(detectLayout(915, 412)).toBe('phone-landscape');
  });

  it('800x520 → phone-landscape (height just at threshold)', () => {
    expect(detectLayout(800, 520)).toBe('phone-landscape');
  });

  it('800x521 → NOT phone-landscape (one pixel over)', () => {
    expect(detectLayout(800, 521)).not.toBe('phone-landscape');
  });

  it('square viewport (500x500) → NOT phone-landscape (needs w>h)', () => {
    expect(detectLayout(500, 500)).not.toBe('phone-landscape');
  });
});

describe('detectLayout — phone-portrait (fallback)', () => {
  it('iPhone 14 portrait (393x852) → phone-portrait', () => {
    expect(detectLayout(393, 852)).toBe('phone-portrait');
  });

  it('Pixel 7 portrait (412x915) → phone-portrait', () => {
    expect(detectLayout(412, 915)).toBe('phone-portrait');
  });

  it('iPhone SE portrait (375x667) → phone-portrait', () => {
    expect(detectLayout(375, 667)).toBe('phone-portrait');
  });

  it('500x500 (square) → phone-portrait (default)', () => {
    expect(detectLayout(500, 500)).toBe('phone-portrait');
  });

  it('100x100 (tiny embedded iframe) → phone-portrait', () => {
    expect(detectLayout(100, 100)).toBe('phone-portrait');
  });
});
