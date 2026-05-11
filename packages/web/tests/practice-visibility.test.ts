import { describe, expect, it, vi } from 'vitest';
import { createPracticeVisibilityController } from '../src/practice-visibility';

describe('createPracticeVisibilityController', () => {
  it('freezes practice time and pauses a started Transport on hidden', () => {
    const practice = { enabled: true, startAudioTime: 2 };
    const pause = vi.fn();
    const log = vi.fn();
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: 12 },
        Transport: { state: 'started', pause },
      }),
      log,
    });

    ctrl.onHidden();

    expect(pause).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toContain('[PRACTICE-VISIBILITY] hidden freeze');
    expect(log.mock.calls[0][0]).toContain('"elapsedMs":10000');
  });

  it('resumes Transport from the same musical elapsed time', () => {
    const practice = {
      enabled: true,
      startAudioTime: 2,
      _cursorScanIdx: 8,
      _lastCursorNoteIdx: 8,
    };
    let now = 12;
    const start = vi.fn();
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: now },
        Transport: { state: 'started', pause: vi.fn(), start },
      }),
      log: vi.fn(),
    });

    ctrl.onHidden(); // elapsed = 10s
    now = 42;
    ctrl.onVisible();

    expect(practice.startAudioTime).toBeCloseTo(32.05, 5);
    expect(start).toHaveBeenCalledWith(42.05);
    expect(practice._cursorScanIdx).toBe(8);
  });

  it('does nothing when practice is inactive', () => {
    const pause = vi.fn();
    const start = vi.fn();
    const practice = { enabled: false, startAudioTime: 2 };
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: 12 },
        Transport: { state: 'started', pause, start },
      }),
      log: vi.fn(),
    });

    ctrl.onHidden();
    ctrl.onVisible();

    expect(pause).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(practice.startAudioTime).toBe(2);
  });

  // Production-log scenario pin — server.log 2026-05-10 11:36:14 / 11:36:25:
  //   [PRACTICE-VISIBILITY] hidden freeze {"elapsedMs":4858,"transportWasStarted":true}
  //   [PRACTICE-VISIBILITY] visible resume {"elapsedMs":4858,"leadMs":50,"transportResumed":true}
  // i.e. the user backgrounded the tab 4.858s into practice, came back ~11s
  // later, and Tone.Transport resumed gap-free at the same musical position.
  // Regression-blocks anyone shortening or scaling the freeze window.
  it('pins the real-world 11s background scenario (elapsed=4858ms, leadMs=50)', () => {
    const practice = {
      enabled: true,
      startAudioTime: 0,
      _cursorScanIdx: 12,
      _lastCursorNoteIdx: 12,
    };
    let now = 4.858; // 4858ms of practice elapsed
    const pause = vi.fn();
    const start = vi.fn();
    const log = vi.fn();
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: now },
        Transport: { state: 'started', pause, start },
      }),
      log,
    });

    ctrl.onHidden();
    // Tone keeps advancing while the tab is hidden — 11.04s later.
    now = 4.858 + 11.04;
    ctrl.onVisible();

    // Elapsed musical time preserved across the background trip.
    expect(log.mock.calls[0][0]).toContain('"elapsedMs":4858');
    expect(log.mock.calls[1][0]).toContain('"elapsedMs":4858');
    expect(log.mock.calls[1][0]).toContain('"leadMs":50');
    expect(log.mock.calls[1][0]).toContain('"transportResumed":true');
    // startAudioTime rebased so practiceElapsedMs() returns ~4.858s again
    // (modulo the 50ms lead so Transport.start has scheduling headroom).
    expect(practice.startAudioTime).toBeCloseTo(now + 0.05 - 4.858, 5);
    expect(start).toHaveBeenCalledOnce();
  });
});
