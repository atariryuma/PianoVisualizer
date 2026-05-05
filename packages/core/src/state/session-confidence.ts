// Session-confidence state machine — slides through `waiting → warmup →
// performing` based on a sliding-window confidence ratio of "is this audio
// piano-like?" samples.
//
// Pure reducer: takes (state, sample) → newState. The DOM-side effects
// (updating sessionStatus text, triggering radiance effect) used to live
// inside the legacy updateSessionConfidence — they're now signaled via the
// returned `events` array, and the caller (web/mobile shell) decides what
// UI/audio reaction to fire.
//
// Ring buffer is preallocated and reused (zero-alloc per frame) for the
// per-frame hot path.

export const SESSION_RING_CAP = 100;

export type SessionPhase = 'waiting' | 'warmup' | 'performing';

export interface SessionRingEntry {
  timeMs: number;
  isPiano: boolean;
}

export interface SessionConfidenceState {
  phase: SessionPhase;
  /** Confidence ratio (pianoCount / ringSize), 0..1. */
  confidence: number;
  /** Buffer (preallocated). */
  ring: SessionRingEntry[];
  ringHead: number;
  ringTail: number;
  ringSize: number;
  pianoCount: number;
  /** Time the current `warmup` (or `performing`) phase entered. */
  phaseStartMs: number;
  /** Time `performing` was first entered. */
  performingStartMs: number;
  /** Last sample timestamp (for throttle). */
  lastSampleMs: number;
  /** Goal-window timing (motivation cycle while performing). */
  goalWindowStartMs: number;
  goalCelebrateUntilMs: number;
  goalCompletedCount: number;
}

export interface SessionConfidenceOptions {
  /** Throttle: don't sample more often than this. */
  sampleIntervalMs: number;
  /** Sliding window for confidence calc. */
  windowMs: number;
  /** Confidence at which we leave `waiting` / sustain `performing`. */
  confirmThreshold: number;
  /** Confidence at which we drop back from `warmup`/`performing`. */
  loseThreshold: number;
  /** Required time in `warmup` (above confirmThreshold) before entering `performing`. */
  warmupMs: number;
  /** Time period for the motivation-goal cycle. */
  motivationGoalMs: number;
  /** How long a goal-celebration UI message stays up. */
  celebrationDurationMs: number;
}

export type SessionEvent =
  | { type: 'phaseEnter'; from: SessionPhase; to: SessionPhase; timeMs: number }
  | { type: 'goalCompleted'; timeMs: number; totalCompleted: number };

export interface SessionStepResult {
  state: SessionConfidenceState;
  /** Events emitted this tick. Empty if this call was throttled or no transitions fired. */
  events: SessionEvent[];
  /** True if this call did real work (not throttled). */
  ticked: boolean;
}

/** Construct a fresh session-confidence state with a preallocated ring buffer. */
export function initSessionConfidenceState(): SessionConfidenceState {
  const ring: SessionRingEntry[] = new Array(SESSION_RING_CAP);
  for (let i = 0; i < SESSION_RING_CAP; i++) ring[i] = { timeMs: 0, isPiano: false };
  return {
    phase: 'waiting',
    confidence: 0,
    ring,
    ringHead: 0,
    ringTail: 0,
    ringSize: 0,
    pianoCount: 0,
    phaseStartMs: 0,
    performingStartMs: 0,
    // -Infinity ensures the first stepSessionConfidence call always passes the
    // throttle check, regardless of when it lands on the timeline (t=0, t=100, etc.).
    lastSampleMs: -Infinity,
    goalWindowStartMs: 0,
    goalCelebrateUntilMs: 0,
    goalCompletedCount: 0,
  };
}

/**
 * Reset the ring + counters but keep the buffer allocation. Use on session
 * reset to avoid throwing away the preallocated slots.
 */
export function resetSessionConfidence(s: SessionConfidenceState): SessionConfidenceState {
  for (let i = 0; i < SESSION_RING_CAP; i++) s.ring[i].isPiano = false;
  s.phase = 'waiting';
  s.confidence = 0;
  s.ringHead = 0;
  s.ringTail = 0;
  s.ringSize = 0;
  s.pianoCount = 0;
  s.phaseStartMs = 0;
  s.performingStartMs = 0;
  s.lastSampleMs = -Infinity;
  s.goalWindowStartMs = 0;
  s.goalCelebrateUntilMs = 0;
  s.goalCompletedCount = 0;
  return s;
}

/**
 * Advance the state machine by one sample.
 *
 * MUTATES state in place (the ring buffer is preallocated for performance).
 * Returns the same state reference for ergonomic chaining.
 */
export function stepSessionConfidence(
  s: SessionConfidenceState,
  timeMs: number,
  isPianoDetected: boolean,
  opts: SessionConfidenceOptions
): SessionStepResult {
  if (timeMs - s.lastSampleMs < opts.sampleIntervalMs) {
    return { state: s, events: [], ticked: false };
  }
  s.lastSampleMs = timeMs;

  // Push new sample into the ring (overwrite oldest if full).
  const entry = s.ring[s.ringHead];
  if (s.ringSize === SESSION_RING_CAP && entry.isPiano) s.pianoCount--;
  entry.timeMs = timeMs;
  entry.isPiano = isPianoDetected;
  if (isPianoDetected) s.pianoCount++;
  if (s.ringSize < SESSION_RING_CAP) {
    s.ringSize++;
  } else {
    s.ringTail = (s.ringTail + 1) % SESSION_RING_CAP;
  }
  s.ringHead = (s.ringHead + 1) % SESSION_RING_CAP;

  // Expire samples outside the time window (O(1) amortized).
  const windowStart = timeMs - opts.windowMs;
  while (s.ringSize > 0 && s.ring[s.ringTail].timeMs < windowStart) {
    if (s.ring[s.ringTail].isPiano) s.pianoCount--;
    s.ringTail = (s.ringTail + 1) % SESSION_RING_CAP;
    s.ringSize--;
  }

  if (s.ringSize < 3) {
    s.confidence = 0;
    return { state: s, events: [], ticked: true };
  }

  s.confidence = s.pianoCount / s.ringSize;

  const events: SessionEvent[] = [];
  const prevPhase = s.phase;

  switch (s.phase) {
    case 'waiting':
      if (s.confidence >= opts.confirmThreshold) {
        s.phase = 'warmup';
        s.phaseStartMs = timeMs;
      }
      break;
    case 'warmup':
      if (s.confidence < opts.loseThreshold) {
        s.phase = 'waiting';
      } else if (
        timeMs - s.phaseStartMs >= opts.warmupMs &&
        s.confidence >= opts.confirmThreshold
      ) {
        s.phase = 'performing';
        s.performingStartMs = timeMs;
        s.goalWindowStartMs = timeMs;
      }
      break;
    case 'performing':
      if (s.confidence < opts.loseThreshold) {
        s.phase = 'warmup';
        s.phaseStartMs = timeMs;
      }
      break;
  }

  if (prevPhase !== s.phase) {
    events.push({ type: 'phaseEnter', from: prevPhase, to: s.phase, timeMs });
    if (prevPhase !== 'performing' && s.phase === 'performing') {
      s.goalWindowStartMs = timeMs;
    }
  }

  // Goal-cycle bookkeeping (only relevant in `performing`).
  if (s.phase === 'performing') {
    if (s.goalWindowStartMs <= 0) s.goalWindowStartMs = timeMs;
    const elapsedGoal = timeMs - s.goalWindowStartMs;
    if (elapsedGoal >= opts.motivationGoalMs) {
      s.goalCompletedCount++;
      s.goalWindowStartMs = timeMs;
      s.goalCelebrateUntilMs = timeMs + opts.celebrationDurationMs;
      events.push({ type: 'goalCompleted', timeMs, totalCompleted: s.goalCompletedCount });
    }
  }

  return { state: s, events, ticked: true };
}

/**
 * Convenience UI helper — derives the text/visibility values that the legacy
 * code computed inline. Pure: takes state + opts + locale strings, returns
 * a render hint.
 */
export interface SessionUIHint {
  visible: boolean;
  text: string;
}

export interface SessionUIStrings {
  /** Format string with {p} placeholder for ♫ characters. e.g. "{p}Listening{p}" */
  listeningFmt: (p: string) => string;
  goalCelebrate: () => string;
  /** Format string with {v} placeholder for seconds. */
  goalCountdownFmt: (v: number) => string;
}

export function deriveSessionUIHint(
  s: SessionConfidenceState,
  timeMs: number,
  opts: SessionConfidenceOptions,
  strings: SessionUIStrings
): SessionUIHint {
  if (s.phase === 'warmup') {
    const warmupProgress = Math.min(1, (timeMs - s.phaseStartMs) / opts.warmupMs);
    const dots = Math.floor(warmupProgress * 3) + 1;
    return { visible: true, text: strings.listeningFmt('♫ '.repeat(dots)) };
  }
  if (s.phase === 'performing') {
    if (timeMs < s.goalCelebrateUntilMs) {
      return { visible: true, text: strings.goalCelebrate() };
    }
    const remainSec = Math.max(
      0,
      Math.ceil((opts.motivationGoalMs - (timeMs - s.goalWindowStartMs)) / 1000)
    );
    return { visible: true, text: strings.goalCountdownFmt(remainSec) };
  }
  return { visible: false, text: '' };
}
