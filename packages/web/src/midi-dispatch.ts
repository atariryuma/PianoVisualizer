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
   *  detector flips it false on the YIN-only fallback).
   *  P1-11: 第3引数 `inputLagMs` は MIDIMessageEvent.timeStamp
   *  （performance.now() 起点）からハンドラ実行までの遅延。判定側
   *  （practice-scoring.matchNoteOnset）が elapsed クロックから減算する。 */
  matchNoteOnset: (midiNum: number, isExact: boolean, inputLagMs?: number) => void;

  /** Optional override for the BLE-redelivery dedupe window.
   *  Defaults to 30 ms. */
  dedupeWindowMs?: number;
}

export interface MidiDispatch {
  /** Raw 3-byte dispatcher. Status/data bytes per MIDI spec.
   *  P1-11: `inputLagMs`（省略時 0）はイベント発生→ハンドラ実行の遅延。
   *  BLE 経路（ble-midi-parser 経由の直呼び）には timeStamp が無いので
   *  常に 0 のまま。 */
  dispatch(status: number, a: number, b: number, inputLagMs?: number): void;

  /** Browser-style `onmidimessage` handler. Wire as
   *  `port.onmidimessage = midiDispatch.onMessage;`.
   *  P1-11: `e.timeStamp`（MIDIMessageEvent — performance.now() 起点）が
   *  あれば handler 遅延を算出して dispatch に貫通させる。 */
  onMessage(e: { data: ArrayLike<number> | null | undefined; timeStamp?: number }): void;

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

  function dispatch(status: number, a: number, b: number, inputLagMs = 0): void {
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
        // P1-11: per-event 遅延を判定へ渡す（実際に鍵が押された時刻で採点）。
        deps.matchNoteOnset(a, true, inputLagMs);
      }
    } else if (cmd === 0x80 || (cmd === 0x90 && b === 0)) {
      // 0x80 explicit note-off OR 0x90 with velocity 0 (running-status
      // note-off — common on cheaper keyboards).
      // note-off で同一鍵のデデュープキーを解除する。デデュープは BLE の
      // 再送だけを潰すのが目的で、note-off を挟んだ「正当な同音連打」は
      // 通すべき（さもないと速いスタッカート2打目が落ちる）。
      if (lastNoteOnKey >> 8 === a) lastNoteOnKey = -1;
      deps.onMidiNoteOff(a);
    } else if (cmd === 0xb0) {
      deps.onMidiCC(a, b);
    }
  }

  function onMessage(e: { data: ArrayLike<number> | null | undefined; timeStamp?: number }): void {
    const d = e.data;
    if (d && d.length >= 2) {
      // P1-11: MIDIMessageEvent.timeStamp（performance.now() 起点）から
      // ハンドラ実行までの遅延を算出。負値（クロック不整合・ポリフィルの
      // 疑似値）や 1000ms 超（バックグラウンド復帰直後のバースト等）は
      // 補正しない方が安全なので 0 にクランプする。
      let lagMs = 0;
      if (typeof e.timeStamp === 'number' && Number.isFinite(e.timeStamp)) {
        const lag = performance.now() - e.timeStamp;
        if (lag > 0 && lag <= 1000) lagMs = lag;
      }
      dispatch(d[0], d[1], d.length > 2 ? d[2] : 0, lagMs);
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
