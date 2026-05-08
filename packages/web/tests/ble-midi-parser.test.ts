// Tests for packages/web/src/ble-midi-parser.ts.
//
// BLE-MIDI 1.0 packet decoding edge cases. The legacy code is a port
// of the shell's parseBleMidiPacket — these tests pin the wire-format
// invariants that make the BLE keyboards (Roland GO:PIANO etc.) work
// while still rejecting truncated / malformed packets gracefully.

import { describe, it, expect, vi } from 'vitest';
import { parseBleMidiPacket } from '../src/ble-midi-parser';

/** Build an ArrayBuffer from a list of bytes (handy for table tests). */
function buf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('parseBleMidiPacket — happy path', () => {
  it('decodes a single 3-byte note-on event', () => {
    // header(0x80) timestamp(0x81) status(0x90) note(60) velocity(100)
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x90, 60, 100), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(0x90, 60, 100);
  });

  it('decodes a note-off (0x80) command', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x80, 60, 0), dispatch);
    expect(dispatch).toHaveBeenCalledWith(0x80, 60, 0);
  });

  it('decodes a control-change (0xB0) with sustain pedal', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0xb0, 64, 127), dispatch);
    expect(dispatch).toHaveBeenCalledWith(0xb0, 64, 127);
  });

  it('decodes pitch-bend (0xE0)', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0xe0, 0x00, 0x40), dispatch);
    expect(dispatch).toHaveBeenCalledWith(0xe0, 0, 0x40);
  });

  it('decodes poly-aftertouch (0xA0)', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0xa0, 60, 80), dispatch);
    expect(dispatch).toHaveBeenCalledWith(0xa0, 60, 80);
  });

  it('masks data bytes to 7 bits (clamps any high-bit leak)', () => {
    // Data bytes with high bit set are masked to & 0x7F per MIDI spec.
    // We feed 0x9F (note value with bit 7 set) → expect 0x1F = 31.
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x90, 0x9f, 0x9f), dispatch);
    expect(dispatch).toHaveBeenCalledWith(0x90, 31, 31);
  });
});

describe('parseBleMidiPacket — running status', () => {
  it('decodes back-to-back note-ons that share running status', () => {
    // header timestamp status(0x90) n=60 v=100 timestamp n=64 v=110
    // After the first event, runningStatus stays 0x90 — second event
    // has only timestamp (high-bit set) + 2 data bytes, no fresh status.
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x90, 60, 100, 0x82, 64, 110), dispatch);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, 0x90, 60, 100);
    expect(dispatch).toHaveBeenNthCalledWith(2, 0x90, 64, 110);
  });

  it('decodes an event with mid-packet status change', () => {
    // First event note-on (0x90), then mid-packet timestamp + new
    // status note-off (0x80).
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x90, 60, 100, 0x82, 0x80, 60, 0), dispatch);
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, 0x90, 60, 100);
    expect(dispatch).toHaveBeenNthCalledWith(2, 0x80, 60, 0);
  });

  it('decodes 3 events in one packet (chord)', () => {
    const dispatch = vi.fn();
    // C-E-G chord, all simultaneous — 3 note-ons under running status.
    parseBleMidiPacket(buf(0x80, 0x81, 0x90, 60, 100, 0x82, 64, 100, 0x83, 67, 100), dispatch);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch.mock.calls.map((c) => c[1])).toEqual([60, 64, 67]);
  });
});

describe('parseBleMidiPacket — 1-data-byte messages', () => {
  it('consumes program-change (0xC0) without dispatching (legacy contract)', () => {
    const dispatch = vi.fn();
    // Program change 0xC0 patch=12 — single data byte. The shell does
    // not currently route program-change downstream, so dispatch is
    // not called.
    parseBleMidiPacket(buf(0x80, 0x81, 0xc0, 12), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('consumes channel pressure (0xD0) without dispatching', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0xd0, 80), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('mixed 1-byte + 2-byte: PC then note-on parses both correctly', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0xc0, 12, 0x82, 0x90, 60, 100), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(0x90, 60, 100);
  });
});

describe('parseBleMidiPacket — SysEx', () => {
  it('skips a SysEx block until the F7 terminator', () => {
    // header timestamp F0 (sysex start) + 3 bytes + F7 (terminator) +
    // timestamp + note-on event after.
    const dispatch = vi.fn();
    parseBleMidiPacket(
      buf(0x80, 0x81, 0xf0, 0x7e, 0x7f, 0x06, 0xf7, 0x82, 0x90, 60, 100),
      dispatch
    );
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(0x90, 60, 100);
  });

  it('SysEx without F7 terminator → exits cleanly without dispatch', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0xf0, 0x7e, 0x7f, 0x06), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('parseBleMidiPacket — defensive paths', () => {
  it('empty buffer → no-op', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('short buffer (<3 bytes) → no-op', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('truncated 2-data-byte event → drops it', () => {
    // header timestamp note-on 60 — but missing velocity byte.
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x90, 60), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('truncated second event in a multi-event packet → first still emits', () => {
    // First event complete + second event status-only (no data bytes).
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x90, 60, 100, 0x82, 0x90, 64), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(0x90, 60, 100);
  });

  it('packet with no status byte yet (only timestamps) → no dispatch', () => {
    const dispatch = vi.fn();
    parseBleMidiPacket(buf(0x80, 0x81, 0x82, 0x83), dispatch);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
