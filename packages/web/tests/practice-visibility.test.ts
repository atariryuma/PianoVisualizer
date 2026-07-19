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

  // ─── explicit pause / resume (P1-6 settings-panel, P2-13 ⏸) ────────

  it('pause() freezes + sets practice.paused; resume() rebases + clears it', () => {
    const practice = { enabled: true, startAudioTime: 2, paused: false };
    const pause = vi.fn();
    const start = vi.fn();
    let now = 12;
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: now },
        Transport: { state: 'started', pause, start },
      }),
      log: vi.fn(),
    });

    ctrl.pause();
    expect(practice.paused).toBe(true);
    expect(ctrl.isPaused()).toBe(true);
    expect(pause).toHaveBeenCalledOnce(); // Transport paused

    now = 42;
    ctrl.resume();
    expect(practice.paused).toBe(false);
    expect(ctrl.isPaused()).toBe(false);
    expect(practice.startAudioTime).toBeCloseTo(32.05, 5); // elapsed 10s preserved
    expect(start).toHaveBeenCalledOnce();
  });

  it('a tab refocus during an explicit pause does NOT resume', () => {
    const practice = { enabled: true, startAudioTime: 2, paused: false };
    const start = vi.fn();
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: 12 },
        Transport: { state: 'started', pause: vi.fn(), start },
      }),
      log: vi.fn(),
    });

    ctrl.pause(); // settings panel opens
    ctrl.onVisible(); // tab refocus while the panel is still up
    expect(practice.paused).toBe(true); // still paused
    expect(start).not.toHaveBeenCalled(); // Transport NOT resumed

    ctrl.resume(); // panel closes
    expect(practice.paused).toBe(false);
    expect(start).toHaveBeenCalledOnce();
  });

  it('pause() no-ops when practice is not active (settings opened on title)', () => {
    // Opening the settings panel on the title / song-panel / result card
    // (practice inactive) must not set stray paused / hold state.
    const practice = { enabled: false, startAudioTime: 2, paused: false };
    const pauseSpy = vi.fn();
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: 12 },
        Transport: { state: 'stopped', pause: pauseSpy, start: vi.fn() },
      }),
      log: vi.fn(),
    });
    ctrl.pause();
    expect(practice.paused).toBe(false);
    expect(ctrl.isPaused()).toBe(false);
    expect(pauseSpy).not.toHaveBeenCalled();
    // And a subsequent resume() is a harmless no-op.
    ctrl.resume();
    expect(practice.paused).toBe(false);
  });

  it('pause() is idempotent (double-open guard)', () => {
    const practice = { enabled: true, startAudioTime: 2, paused: false };
    const pause = vi.fn();
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: 12 },
        Transport: { state: 'started', pause, start: vi.fn() },
      }),
      log: vi.fn(),
    });
    ctrl.pause();
    ctrl.pause();
    expect(pause).toHaveBeenCalledOnce(); // second pause is a no-op
  });
});

// ─── enabled ガード（2026-07-19 再入ライフサイクル監査 発見3/4） ───

describe('createPracticeVisibilityController — セッション終了後の stale 凍結', () => {
  it('凍結中に practice が無効化されたら、復帰時にクロックを触らず凍結を破棄する', () => {
    // 再現列: タブ非表示で freeze → 背面で 600ms 完了タイマーが発火して
    // enabled=false → タブ復帰。ここで stale な凍結時刻でリベースすると
    // 次セッションの startAudioTime が破壊される。
    const practice = { enabled: true, startAudioTime: 2 };
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
    ctrl.onHidden(); // freeze (elapsed=10s)
    practice.enabled = false; // 背面で完了
    now = 42;
    ctrl.onVisible();
    expect(practice.startAudioTime).toBe(2); // クロック不変
    expect(start).not.toHaveBeenCalled(); // 空 Transport を再開しない
  });

  it('明示ポーズ後に無効化されても resume() でラッチと凍結が確実に消える', () => {
    const practice = { enabled: true, startAudioTime: 2, paused: false };
    const start = vi.fn();
    const ctrl = createPracticeVisibilityController({
      practice,
      getTone: () => ({
        context: { currentTime: 12 },
        Transport: { state: 'started', pause: vi.fn(), start },
      }),
      log: vi.fn(),
    });
    ctrl.pause();
    expect(ctrl.isPaused()).toBe(true);
    practice.enabled = false; // 猶予タイマー発火で完了した想定
    ctrl.resume();
    expect(ctrl.isPaused()).toBe(false);
    expect(practice.paused).toBe(false);
    expect(practice.startAudioTime).toBe(2);
    expect(start).not.toHaveBeenCalled();
    // ラッチが消えているので次セッションの pause は普通に効く
    practice.enabled = true;
    ctrl.pause();
    expect(ctrl.isPaused()).toBe(true);
  });
});
