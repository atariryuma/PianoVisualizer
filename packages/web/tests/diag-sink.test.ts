// @vitest-environment happy-dom
//
// The diagnostic sink exists because the device log stream is not reliable —
// `devicectl --console` stops delivering while the process keeps running, and
// says nothing when it does. These tests pin the properties that make the
// stored ring usable as the fallback record.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { diag, clearDiag, readDiag } from '../src/diag-sink';

describe('diag sink', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDiag();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to BOTH the console and storage', () => {
    // The console half is what a live stream shows; the storage half is what
    // survives when that stream has silently stopped.
    vi.useFakeTimers();
    diag('INPUT', { active: 'mic' });
    expect(console.log).toHaveBeenCalledWith('[INPUT] {"active":"mic"}');
    expect(readDiag().join('\n')).toContain('[INPUT] {"active":"mic"}');
    // The storage half is DEBOUNCED — a synchronous setItem per line put a
    // whole-ring stringify inside every logged pointermove. It must still land.
    expect(localStorage.getItem('pianoViz_diag')).not.toContain('[INPUT]');
    vi.runAllTimers();
    expect(localStorage.getItem('pianoViz_diag')).toContain('[INPUT]');
    vi.useRealTimers();
  });

  it('flushes when the page goes away, because iOS may not come back', () => {
    vi.useFakeTimers();
    diag('LATE', 'unflushed');
    expect(localStorage.getItem('pianoViz_diag')).not.toContain('[LATE]');
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem('pianoViz_diag')).toContain('[LATE] unflushed');
    vi.useRealTimers();
  });

  it('stamps each line, because ORDER is usually the question', () => {
    diag('A', 'first');
    diag('B', 'second');
    const [a, b] = readDiag();
    expect(a).toMatch(/^\d\d:\d\d:\d\d\.\d\d\d \[A] first$/);
    expect(b).toContain('[B] second');
  });

  it('keeps the ring bounded so it cannot become a log file', () => {
    for (let i = 0; i < 200; i++) diag('N', String(i));
    const lines = readDiag();
    expect(lines.length).toBeLessThanOrEqual(120);
    // Oldest dropped, newest kept — a debugging session wants the tail.
    expect(lines[lines.length - 1]).toContain('[N] 199');
    expect(lines.join('\n')).not.toContain('[N] 0\n');
  });

  it('survives a storage that throws (private mode) without losing the console', () => {
    vi.useFakeTimers();
    const boom = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => diag('X', 'still logged')).not.toThrow();
    expect(console.log).toHaveBeenCalledWith('[X] still logged');
    // The throw happens in the deferred flush, where nothing is there to catch
    // it for us — an unhandled rejection there would take the timer down.
    expect(() => vi.runAllTimers()).not.toThrow();
    boom.mockRestore();
    vi.useRealTimers();
  });

  it('accepts a string body unchanged (callers already format some lines)', () => {
    diag('INPUT', 'pref=auto active=mic');
    expect(readDiag()[0]).toContain('[INPUT] pref=auto active=mic');
  });
});
