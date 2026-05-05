import { describe, it, expect } from 'vitest';
import { formatTime } from '../src/util/format';

describe('formatTime', () => {
  it('formats 0 ms as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('zero-pads sub-10 seconds', () => {
    expect(formatTime(5_000)).toBe('0:05');
    expect(formatTime(9_999)).toBe('0:09');
  });

  it('does not pad ten or more seconds', () => {
    expect(formatTime(10_000)).toBe('0:10');
    expect(formatTime(59_000)).toBe('0:59');
  });

  it('rolls over to the next minute at exactly 60 s', () => {
    expect(formatTime(60_000)).toBe('1:00');
  });

  it('handles minutes correctly', () => {
    expect(formatTime(125_000)).toBe('2:05');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(5_999)).toBe('0:05');
    expect(formatTime(60_999)).toBe('1:00');
  });

  it('does not split out hours (free-play sessions stay short of an hour)', () => {
    expect(formatTime(3_600_000 + 65_000)).toBe('61:05');
  });

  it('clamps negative input to 0', () => {
    expect(formatTime(-5_000)).toBe('0:00');
  });

  it('renders non-finite input as 0:00 instead of NaN:NaN', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-Infinity)).toBe('0:00');
  });
});
