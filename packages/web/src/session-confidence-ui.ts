// Session-confidence reducer + UI driver — Phase 0d batch 41.
//
// "How sure are we that the user is actually playing piano right now?"
// — runs at SESSION_SAMPLE_INTERVAL_MS (~250 ms) ticks and walks a
// state machine:
//
//   waiting → warmup → performing → (back to warmup on confidence
//   drop; back to waiting on warmup confidence drop)
//
// Confidence is the ratio of "isPiano" samples in a sliding ring
// buffer (~100 samples covering SESSION_WINDOW_MS, ~5 s). Above
// SESSION_CONFIRM_THRESHOLD (~0.7) → upgrade; below
// SESSION_LOSE_THRESHOLD (~0.4) → downgrade.
//
// While performing, drives a goal-window timer that celebrates
// MOTIVATION_GOAL_MS streaks (kid played for N seconds straight)
// and triggers a 'radiance' effect + chip.
//
// The ring buffer is a pre-allocated zero-allocation deque (head /
// tail / size pointers) so a long session doesn't accumulate GC
// pressure from per-sample object allocations. The bookkeeping for
// add/expire stays O(1) amortized.
//
// DOM side: writes the sessionStatus pill ('🎵 Listening', goal
// countdown, celebrate banner) — visibility-toggled by the state-
// machine outcome.

/** Single sample slot in the ring buffer. */
export interface SessionSample {
  timeMs: number;
  isPiano: boolean;
}

/** Subset of the shell `state` we read + write. The fields with
 *  `*Ring*` prefix are head/tail/size for the deque + a running
 *  count of isPiano samples so confidence is O(1). */
export interface SessionConfidenceStateRef {
  lastSessionSampleMs: number;
  sessionRingHead: number;
  sessionRingTail: number;
  sessionRingSize: number;
  sessionPianoCount: number;
  sessionConfidence: number;
  sessionState: 'waiting' | 'warmup' | 'performing';
  sessionStartMs: number;
  sessionPerformingStartMs: number;
  goalWindowStartMs: number;
  goalCompletedCount: number;
  goalCelebrateUntilMs: number;
  /** Debug overlay snapshots. */
  debugSessionConf: number;
  debugSessionState: string;
}

/** Tunables — passed in so the reducer is testable without pulling
 *  the whole CONFIG bag. */
export interface SessionConfidenceTuning {
  sampleIntervalMs: number;
  windowMs: number;
  confirmThreshold: number;
  loseThreshold: number;
  warmupMs: number;
  motivationGoalMs: number;
  ringCap: number;
}

/** DOM bag — only sessionStatus is touched. */
export interface SessionConfidenceDom {
  sessionStatus: {
    textContent: string;
    classList: { add(c: string): void; remove(c: string): void };
  } | null;
}

export interface SessionConfidenceDeps {
  state: SessionConfidenceStateRef;
  /** Pre-allocated ring buffer (length = ringCap). The shell builds
   *  this once at boot to avoid per-sample allocations. */
  sessionRing: SessionSample[];
  tuning: SessionConfidenceTuning;
  dom: SessionConfidenceDom;
  /** Bilingual translator. Reads listeningFmt / goalCelebrate /
   *  goalCountdownFmt. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Visual flair on goal completion. The shell hands its triggerEffect. */
  triggerEffect: (kind: string) => void;
}

/** One-tick reducer. Idempotent within the same sample interval. */
export function updateSessionConfidence(
  timeMs: number,
  isPianoDetected: boolean,
  deps: SessionConfidenceDeps
): void {
  const s = deps.state;
  const t = deps.tuning;

  if (timeMs - s.lastSessionSampleMs < t.sampleIntervalMs) return;
  s.lastSessionSampleMs = timeMs;

  const ring = deps.sessionRing;
  // Push to ring buffer (reuse pre-allocated slot, zero allocation).
  // When full, the slot at head is the oldest and must be evicted
  // first (its isPiano flag goes off the running count).
  const entry = ring[s.sessionRingHead];
  if (s.sessionRingSize === t.ringCap && entry.isPiano) {
    s.sessionPianoCount--;
  }
  entry.timeMs = timeMs;
  entry.isPiano = isPianoDetected;
  if (isPianoDetected) s.sessionPianoCount++;
  if (s.sessionRingSize < t.ringCap) {
    s.sessionRingSize++;
  } else {
    s.sessionRingTail = (s.sessionRingTail + 1) % t.ringCap;
  }
  s.sessionRingHead = (s.sessionRingHead + 1) % t.ringCap;

  // Expire samples outside the time window (O(1) amortized).
  const windowStart = timeMs - t.windowMs;
  while (s.sessionRingSize > 0 && ring[s.sessionRingTail].timeMs < windowStart) {
    if (ring[s.sessionRingTail].isPiano) s.sessionPianoCount--;
    s.sessionRingTail = (s.sessionRingTail + 1) % t.ringCap;
    s.sessionRingSize--;
  }

  if (s.sessionRingSize < 3) {
    s.sessionConfidence = 0;
    return;
  }

  // O(1) confidence — no iteration needed.
  s.sessionConfidence = s.sessionPianoCount / s.sessionRingSize;
  s.debugSessionConf = s.sessionConfidence;

  const prevState = s.sessionState;

  switch (s.sessionState) {
    case 'waiting':
      if (s.sessionConfidence >= t.confirmThreshold) {
        s.sessionState = 'warmup';
        s.sessionStartMs = timeMs;
      }
      break;
    case 'warmup':
      if (s.sessionConfidence < t.loseThreshold) {
        s.sessionState = 'waiting';
      } else if (
        timeMs - s.sessionStartMs >= t.warmupMs &&
        s.sessionConfidence >= t.confirmThreshold
      ) {
        s.sessionState = 'performing';
        s.sessionPerformingStartMs = timeMs;
        s.goalWindowStartMs = timeMs;
      }
      break;
    case 'performing':
      if (s.sessionConfidence < t.loseThreshold) {
        s.sessionState = 'warmup';
        s.sessionStartMs = timeMs;
      }
      break;
  }

  if (prevState !== 'performing' && s.sessionState === 'performing') {
    s.goalWindowStartMs = timeMs;
  }

  s.debugSessionState = s.sessionState;

  // Update visual indicator
  const ss = deps.dom.sessionStatus;
  if (!ss) return;
  if (s.sessionState === 'warmup') {
    const warmupProgress = Math.min(1, (timeMs - s.sessionStartMs) / t.warmupMs);
    const dots = Math.floor(warmupProgress * 3) + 1;
    ss.textContent = deps.t('listeningFmt', { p: '♫ '.repeat(dots) });
    ss.classList.add('visible');
  } else if (s.sessionState === 'performing') {
    if (s.goalWindowStartMs <= 0) s.goalWindowStartMs = timeMs;
    const elapsedGoal = timeMs - s.goalWindowStartMs;
    if (elapsedGoal >= t.motivationGoalMs) {
      s.goalCompletedCount++;
      s.goalWindowStartMs = timeMs;
      s.goalCelebrateUntilMs = timeMs + 2200;
      deps.triggerEffect('radiance');
    }

    if (timeMs < s.goalCelebrateUntilMs) {
      ss.textContent = deps.t('goalCelebrate');
    } else {
      const remainSec = Math.max(
        0,
        Math.ceil((t.motivationGoalMs - (timeMs - s.goalWindowStartMs)) / 1000)
      );
      ss.textContent = deps.t('goalCountdownFmt', { v: remainSec });
    }
    ss.classList.add('visible');
  } else {
    ss.classList.remove('visible');
  }
}
