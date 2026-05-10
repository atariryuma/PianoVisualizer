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
});
