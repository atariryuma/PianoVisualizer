// BLE-MIDI packet parser — Phase 0d batch 21.
//
// Decodes the running-status / multi-event BLE-MIDI 1.0 packet format
// into individual MIDI messages, calling back to the shell's
// `dispatchMidiMessage(status, a, b)` for each one. Pure: no DOM, no
// I/O, no global state — exactly what an LLM benefits from being able
// to test in isolation.
//
// BLE-MIDI 1.0 packet layout (https://www.midi.org/specifications-old/
// item/bluetooth-le-midi):
//
//   header                  1B  0b10cccccc       (high 2 bits + low 6 of timestamp-high)
//   per-event:
//     timestamp-low         1B  0b1ttttttt       (high bit set, marks start of event)
//     status (or running)   1B  0b1ssss... or carry from previous event
//     data                  1-2B (depending on status type)
//
// Edge cases this handler covers:
//   - Multi-event packets with shared running status.
//   - Mid-packet status changes (timestamp byte then a fresh status).
//   - 1-data-byte commands (0xC0 program change, 0xD0 channel pressure).
//   - 2-data-byte commands (0x80/0x90/0xA0/0xB0/0xE0).
//   - SysEx (0xF0..0xF7) — skipped without re-emitting.
//   - Truncated packets (drops events past the buffer end).
//
// Tests cover each of those edge cases; the legacy shell's body
// (parseBleMidiPacket in legacy-app.js, ~39 lines) becomes a 1-line
// wrapper that hands the buffer + the dispatch callback to the
// extracted function.

/** Callback invoked once per decoded MIDI event. The shell's
 *  `dispatchMidiMessage(status, a, b)` matches this signature. */
export type DispatchMidiMessage = (status: number, a: number, b: number) => void;

/** Parse one BLE-MIDI packet, calling `dispatch` once per event.
 *  No-op for buffers shorter than the minimum (3 bytes — header +
 *  timestamp-low + status). */
export function parseBleMidiPacket(buf: ArrayBuffer, dispatch: DispatchMidiMessage): void {
  const data = new Uint8Array(buf);
  if (data.length < 3) return;
  let runningStatus = 0;
  // Skip header byte at index 0; first timestamp at index 1.
  for (let i = 1; i < data.length; ) {
    // Each MIDI event in a BLE-MIDI packet is preceded by a timestamp
    // byte (high bit set). Running-status events may follow without a
    // new timestamp.
    if (data[i] & 0x80) {
      // Could be timestamp or status. Per spec, in a multi-event
      // packet a timestamp byte (followed by status) precedes each
      // event. Skip it.
      i++;
      if (i >= data.length) break;
      // Now data[i] should be a status or running data
      if (data[i] & 0x80) {
        const st = data[i];
        if (st >= 0xf8) {
          // System Realtime (0xF8–0xFE: clock / active sensing / reset):
          // standalone 1-byte message — carries NO data and must NOT
          // alter running status (MIDI 1.0 spec). Roland keyboards send
          // Active Sensing (0xFE) every ~250ms and BLE stacks coalesce
          // it into packets alongside note events; treating it as a
          // status byte used to poison runningStatus and consume the
          // rest of the packet, silently dropping note-on/off (stuck
          // notes on the user's GO:PIANO88).
          i++;
          continue;
        }
        if (st >= 0xf1 && st <= 0xf7) {
          // System Common (MTC quarter-frame / song position / song
          // select / tune request / stray EOX): clears running status
          // per spec. Skip its data bytes: F1/F3 = 1, F2 = 2, rest = 0.
          runningStatus = 0;
          i++;
          i += st === 0xf2 ? 2 : st === 0xf1 || st === 0xf3 ? 1 : 0;
          continue;
        }
        // Channel status (0x80–0xEF) or SysEx start (0xF0).
        runningStatus = st;
        i++;
      }
    }
    if (runningStatus === 0) {
      i++;
      continue;
    }
    const cmd = runningStatus & 0xf0;
    // 2-data-byte messages: note-off, note-on, poly-aftertouch, CC,
    // pitch-bend.
    if (cmd === 0x80 || cmd === 0x90 || cmd === 0xb0 || cmd === 0xa0 || cmd === 0xe0) {
      if (i + 1 >= data.length) break;
      const a = data[i] & 0x7f;
      const b = data[i + 1] & 0x7f;
      dispatch(runningStatus, a, b);
      i += 2;
    } else if (cmd === 0xc0 || cmd === 0xd0) {
      // 1-data-byte messages: program change, channel pressure.
      // Currently consumed but not dispatched (the shell only acts on
      // note + CC events). Advance past the data byte.
      if (i >= data.length) break;
      i++;
    } else if (runningStatus === 0xf0) {
      // SysEx — skip until the F7 end-of-exclusive marker.
      while (i < data.length && data[i] !== 0xf7) i++;
      if (i < data.length) i++;
      runningStatus = 0;
    } else {
      i++;
    }
  }
}
