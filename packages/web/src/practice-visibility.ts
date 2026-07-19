// Practice visibility policy.
//
// Browser backgrounding pauses rAF, but Web Audio's clock can keep
// advancing. If the practice clock is derived directly from that clock,
// the next visible frame can skip hundreds of notes. The policy here is
// simple: freeze the practice timeline on hidden, pause Tone.Transport
// when it is running, then resume from the same musical elapsed time.

export interface PracticeVisibilityPracticeRef {
  enabled: boolean;
  startAudioTime: number;
  /** Set true while an explicit pause (settings panel / ⏸ button) holds
   *  the session. practice-tick reads this to skip auto-miss + cursor
   *  advance so the AudioContext clock (which keeps ticking) can't drain
   *  the section behind a modal. */
  paused?: boolean;
  _cursorScanIdx?: number;
  _lastCursorNoteIdx?: number;
}

export interface PracticeVisibilityToneRef {
  now?: () => number;
  context?: { currentTime?: number };
  Transport?: {
    state?: string;
    pause?: () => void;
    start?: (time?: number | string) => void;
  };
}

export interface PracticeVisibilityDeps {
  practice: PracticeVisibilityPracticeRef;
  getTone: () => PracticeVisibilityToneRef | undefined | null;
  resumeLeadSec?: number;
  log?: (msg: string) => void;
}

export interface PracticeVisibilityController {
  /** Tab hidden — freeze the clock + pause Transport. No-op if already frozen. */
  onHidden(): void;
  /** Tab visible — resume, UNLESS an explicit pause still holds the
   *  session (a tab refocus mid-settings-panel must not un-pause). */
  onVisible(): void;
  /** Explicit pause (settings panel opened / ⏸ pressed). Freezes like
   *  onHidden AND sets practice.paused + an explicit-hold latch so a
   *  tab-visible event can't resume until resume() is called. */
  pause(): void;
  /** Explicit resume (settings panel closed / ▶ pressed). Clears the
   *  latch, rebases the clock, restarts Transport, clears practice.paused. */
  resume(): void;
  /** True while an explicit pause holds the session. */
  isPaused(): boolean;
}

const DEFAULT_RESUME_LEAD_SEC = 0.05;

export function createPracticeVisibilityController(
  deps: PracticeVisibilityDeps
): PracticeVisibilityController {
  const log = deps.log ?? ((m: string) => console.log(m));
  const resumeLeadSec = deps.resumeLeadSec ?? DEFAULT_RESUME_LEAD_SEC;
  let frozen: {
    elapsedSec: number;
    transportWasStarted: boolean;
  } | null = null;
  /** Latch set by pause(); an explicit pause survives tab visibility
   *  events (a refocus while the settings panel is open must not resume). */
  let explicitHold = false;

  function toneNowSec(tone: PracticeVisibilityToneRef | undefined | null): number {
    const ctxNow = tone?.context?.currentTime;
    if (typeof ctxNow === 'number' && Number.isFinite(ctxNow)) return ctxNow;
    const now = tone?.now?.();
    if (typeof now === 'number' && Number.isFinite(now)) return now;
    return performance.now() / 1000;
  }

  /** Freeze the practice timeline + pause Transport. Idempotent (guarded
   *  by `frozen`). Shared by tab-hidden and explicit pause. */
  function freeze(reason: string): void {
    if (!deps.practice.enabled || frozen) return;
    const tone = deps.getTone();
    const nowSec = toneNowSec(tone);
    const elapsedSec = Math.max(0, nowSec - (deps.practice.startAudioTime || 0));
    const transportWasStarted = tone?.Transport?.state === 'started';

    frozen = { elapsedSec, transportWasStarted };

    if (transportWasStarted && typeof tone?.Transport?.pause === 'function') {
      try {
        tone.Transport.pause();
      } catch {
        /* best-effort; the clock freeze below is still authoritative */
      }
    }

    log(
      '[PRACTICE-VISIBILITY] ' +
        reason +
        ' freeze ' +
        JSON.stringify({
          elapsedMs: Math.round(elapsedSec * 1000),
          transportWasStarted,
        })
    );
  }

  /** Rebase the clock from the frozen elapsed + restart Transport.
   *  Idempotent (guarded by `frozen`). Shared by tab-visible and resume. */
  function thaw(reason: string): void {
    if (!frozen) return;
    // セッションが既に終わっている（完了/quit 済み）なら、stale な凍結
    // 時刻で startAudioTime をリベースしたり空の Transport を再開したり
    // しない。凍結スナップショットは黙って破棄する。
    if (!deps.practice.enabled) {
      frozen = null;
      log('[PRACTICE-VISIBILITY] ' + reason + ' thaw skipped (practice disabled)');
      return;
    }
    const tone = deps.getTone();
    const leadSec = frozen.transportWasStarted ? resumeLeadSec : 0;
    const resumeAtSec = toneNowSec(tone) + leadSec;

    deps.practice.startAudioTime = resumeAtSec - frozen.elapsedSec;
    // Keep the amortized scanner coherent with the frozen time. The next
    // frame will scan from the old index unless the elapsed time regressed.
    deps.practice._cursorScanIdx = deps.practice._lastCursorNoteIdx ?? deps.practice._cursorScanIdx;

    if (frozen.transportWasStarted && typeof tone?.Transport?.start === 'function') {
      try {
        tone.Transport.start(resumeAtSec);
      } catch {
        /* user gesture / platform recovery may require a manual restart */
      }
    }

    log(
      '[PRACTICE-VISIBILITY] ' +
        reason +
        ' resume ' +
        JSON.stringify({
          elapsedMs: Math.round(frozen.elapsedSec * 1000),
          leadMs: Math.round(leadSec * 1000),
          transportResumed: frozen.transportWasStarted,
        })
    );
    frozen = null;
  }

  function onHidden(): void {
    freeze('hidden');
  }

  function onVisible(): void {
    // A tab refocus while an explicit pause holds the session must NOT
    // resume — the settings panel / ⏸ is still up.
    if (explicitHold) return;
    thaw('visible');
  }

  function pause(): void {
    // Only hold a session that's actually running — the settings panel can
    // also be opened on the title / song-panel / result card, where there's
    // nothing to pause and setting practice.paused would be stray state.
    if (explicitHold || !deps.practice.enabled) return;
    explicitHold = true;
    deps.practice.paused = true;
    freeze('pause');
  }

  function resume(): void {
    if (!explicitHold) return;
    explicitHold = false;
    deps.practice.paused = false;
    // enabled=false のとき thaw は凍結を破棄するだけ（クロック不変）。
    thaw('resume');
  }

  return { onHidden, onVisible, pause, resume, isPaused: () => explicitHold };
}
