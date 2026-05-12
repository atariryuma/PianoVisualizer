// MIDI byte → handler dispatcher — Phase 0d batch 22.
//
// Routes raw MIDI bytes (`status`, `a`, `b`) into the shell's typed
// note-on / note-off / CC handlers. Two side concerns rolled in:
//
//   1. BLE-redelivery dedupe — Roland GO:PIANO and other BLE-MIDI
//      keyboards occasionally re-emit the same note-on within ~10 ms
//      of the original (the BLE stack retries the GATT notification).
//      We dedupe on the `(midi<<8)|velocity` key inside a 30 ms
//      window so the visuals don't double-spawn.
//
//   2. Same-frame practice match — a free-play note-on additionally
//      drives `matchNoteOnset(midi, true)` so the practice cursor
//      advances on MIDI presses (mic path drives this elsewhere).
//
// Pure aside from the dedupe state — captured in a closure factory
// so multiple dispatchers (one Web MIDI, one BLE-MIDI listener) can
// share the same dedupe cache by sharing the same factory instance.
//
// The shell wraps the legacy `onMidiMessageHandler` + `dispatchMidiMessage`
// surface around this factory so the visibility-resume `verifyMidiAlive`
// path that re-binds `port.onmidimessage = onMidiMessageHandler` keeps
// working unchanged.

/** Subset of the shell's `midiInput` ref the dispatcher mutates —
 *  `lastEventTime` is used by the mic-pipeline + topbar to decide
 *  "is MIDI actively driving right now?" */
export interface MidiDispatchInputRef {
  lastEventTime: number;
}

/** Subset of `practice` — only the `enabled` flag affects routing. */
export interface MidiDispatchPracticeRef {
  enabled: boolean;
}

export interface MidiDispatchDeps {
  midiInput: MidiDispatchInputRef;
  practice: MidiDispatchPracticeRef;

  /** Read at dispatch time. Practice cursor advancement is gated on
   *  BOTH `practice.enabled` AND a running session — without this,
   *  a press while practice is enabled but the user has paused into
   *  the settings panel / section result card would phantom-advance
   *  the cursor. */
  isSessionRunning: () => boolean;

  /** Visual heartbeat — flashes the MIDI badge briefly. */
  pulseMidiBadge: () => void;

  /** Free-play / practice note-on. The dispatcher does not gate on
   *  `state.running` — that's the handler's job. */
  onMidiNoteOn: (midiNum: number, velocity: number) => void;
  onMidiNoteOff: (midiNum: number) => void;
  onMidiCC: (cc: number, value: number) => void;

  /** Practice-only — when a MIDI note-on lands during a guided/rhythm
   *  section, the cursor matcher needs the same event the mic path
   *  would have sent through `matchNoteOnset`. The 2nd arg is
   *  `isExact: true` because MIDI is sample-accurate (the mic onset
   *  detector flips it false on the YIN-only fallback). */
  matchNoteOnset: (midiNum: number, isExact: boolean) => void;

  /** Optional override for the BLE-redelivery dedupe window.
   *  Defaults to 30 ms. */
  dedupeWindowMs?: number;
}

export interface MidiDispatch {
  /** Raw 3-byte dispatcher. Status/data bytes per MIDI spec. */
  dispatch(status: number, a: number, b: number): void;

  /** Browser-style `onmidimessage` handler. Wire as
   *  `port.onmidimessage = midiDispatch.onMessage;`. */
  onMessage(e: { data: ArrayLike<number> | null | undefined }): void;

  /** Clear the BLE-redelivery dedupe cache. Called from session
   *  reset so a long mic-only session followed by a MIDI reconnect
   *  doesn't accidentally swallow the first note-on (when its
   *  `(midi<<8)|velocity` key happens to match a stale entry). */
  reset(): void;
}

const DEFAULT_DEDUPE_MS = 30;

export function createMidiDispatch(deps: MidiDispatchDeps): MidiDispatch {
  let lastNoteOnKey = -1;
  let lastNoteOnTime = 0;
  const dedupeWindowMs = deps.dedupeWindowMs ?? DEFAULT_DEDUPE_MS;

  function dispatch(status: number, a: number, b: number): void {
    const cmd = status & 0xf0;
    const now = performance.now();

    // BLE-redelivery dedupe — drop a duplicate note-on within the
    // window. We only dedupe note-ons (cmd 0x90 + velocity > 0); a
    // legitimate "two of the same note in a row" relies on the
    // intervening note-off to bump the key off the cache via the
    // following note-on changing velocity (rare at the same v) or
    // outliving the 30 ms window.
    if (cmd === 0x90 && b > 0) {
      const key = (a << 8) | b;
      if (key === lastNoteOnKey && now - lastNoteOnTime < dedupeWindowMs) return;
      lastNoteOnKey = key;
      lastNoteOnTime = now;
    }
    deps.midiInput.lastEventTime = now;

    if (cmd === 0x90 && b > 0) {
      deps.pulseMidiBadge();
      deps.onMidiNoteOn(a, b);
      if (deps.practice.enabled && deps.isSessionRunning()) {
        deps.matchNoteOnset(a, true);
      }
    } else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) {
      // 0x80 explicit note-off OR 0x90 with velocity 0 (running-status
      // note-off — common on cheaper keyboards).
      deps.onMidiNoteOff(a);
    } else if (cmd === 0xb0) {
      deps.onMidiCC(a, b);
    }
  }

  function onMessage(e: { data: ArrayLike<number> | null | undefined }): void {
    const d = e.data;
    if (d && d.length >= 2) {
      dispatch(d[0], d[1], d.length > 2 ? d[2] : 0);
    }
  }

  return {
    dispatch,
    onMessage,
    reset: () => {
      lastNoteOnKey = -1;
      lastNoteOnTime = 0;
    },
  };
}
