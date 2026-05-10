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
  onHidden(): void;
  onVisible(): void;
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

  function toneNowSec(tone: PracticeVisibilityToneRef | undefined | null): number {
    const ctxNow = tone?.context?.currentTime;
    if (typeof ctxNow === 'number' && Number.isFinite(ctxNow)) return ctxNow;
    const now = tone?.now?.();
    if (typeof now === 'number' && Number.isFinite(now)) return now;
    return performance.now() / 1000;
  }

  function onHidden(): void {
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
      '[PRACTICE-VISIBILITY] hidden freeze ' +
        JSON.stringify({
          elapsedMs: Math.round(elapsedSec * 1000),
          transportWasStarted,
        })
    );
  }

  function onVisible(): void {
    if (!frozen) return;
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
      '[PRACTICE-VISIBILITY] visible resume ' +
        JSON.stringify({
          elapsedMs: Math.round(frozen.elapsedSec * 1000),
          leadMs: Math.round(leadSec * 1000),
          transportResumed: frozen.transportWasStarted,
        })
    );
    frozen = null;
  }

  return { onHidden, onVisible };
}
