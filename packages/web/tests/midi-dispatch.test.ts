// @vitest-environment happy-dom
//
// Tests for packages/web/src/midi-dispatch.ts.
//
// Covers:
//   • dispatch routes: 0x90+v>0 → noteOn (+matchNoteOnset in practice),
//     0x80 → noteOff, 0x90+v=0 → noteOff (running-status), 0xB0 → CC.
//   • BLE-redelivery dedupe: same (midi,velocity) within 30ms drops
//     silently; outside window or different velocity passes through;
//     reset() clears the cache.
//   • midiInput.lastEventTime tracking on every event.
//   • pulseBadge fires for noteOn only.
//   • onMessage forwards e.data → dispatch + handles short / null data
//     gracefully.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMidiDispatch, type MidiDispatch, type MidiDispatchDeps } from '../src/midi-dispatch';

interface Mocks {
  pulseMidiBadge: ReturnType<typeof vi.fn>;
  onMidiNoteOn: ReturnType<typeof vi.fn>;
  onMidiNoteOff: ReturnType<typeof vi.fn>;
  onMidiCC: ReturnType<typeof vi.fn>;
  matchNoteOnset: ReturnType<typeof vi.fn>;
}

function makeDispatch(
  over: Partial<MidiDispatchDeps> = {},
  mocks?: Partial<Mocks>
): { d: MidiDispatch; mocks: Mocks; deps: MidiDispatchDeps } {
  const m: Mocks = {
    pulseMidiBadge: vi.fn(),
    onMidiNoteOn: vi.fn(),
    onMidiNoteOff: vi.fn(),
    onMidiCC: vi.fn(),
    matchNoteOnset: vi.fn(),
    ...mocks,
  };
  const deps: MidiDispatchDeps = {
    midiInput: { lastEventTime: 0 },
    practice: { enabled: false },
    pulseMidiBadge: m.pulseMidiBadge,
    onMidiNoteOn: m.onMidiNoteOn,
    onMidiNoteOff: m.onMidiNoteOff,
    onMidiCC: m.onMidiCC,
    matchNoteOnset: m.matchNoteOnset,
    ...over,
  };
  return { d: createMidiDispatch(deps), mocks: m, deps };
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

// ─── command routing ───────────────────────────────────────────────

describe('dispatch — command routing', () => {
  it('0x90 + velocity > 0 → noteOn + pulseBadge', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 100);
    expect(mocks.onMidiNoteOn).toHaveBeenCalledWith(60, 100);
    expect(mocks.pulseMidiBadge).toHaveBeenCalledOnce();
    expect(mocks.onMidiNoteOff).not.toHaveBeenCalled();
  });

  it('0x80 → noteOff (no pulse)', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0x80, 60, 0);
    expect(mocks.onMidiNoteOff).toHaveBeenCalledWith(60);
    expect(mocks.pulseMidiBadge).not.toHaveBeenCalled();
  });

  it('0x90 + velocity = 0 → noteOff (running-status off)', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 0);
    expect(mocks.onMidiNoteOff).toHaveBeenCalledWith(60);
    expect(mocks.onMidiNoteOn).not.toHaveBeenCalled();
  });

  it('0xB0 → CC handler', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0xb0, 64, 127);
    expect(mocks.onMidiCC).toHaveBeenCalledWith(64, 127);
  });

  it('strips channel bits — 0x91 routes the same as 0x90', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0x91, 60, 100); // channel 1 note-on
    expect(mocks.onMidiNoteOn).toHaveBeenCalledWith(60, 100);
  });

  it('unknown commands (0xF0 SysEx etc) → no-op', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0xf0, 0, 0);
    expect(mocks.onMidiNoteOn).not.toHaveBeenCalled();
    expect(mocks.onMidiNoteOff).not.toHaveBeenCalled();
    expect(mocks.onMidiCC).not.toHaveBeenCalled();
  });

  it('updates midiInput.lastEventTime on every dispatch', () => {
    const { d, deps } = makeDispatch();
    vi.spyOn(performance, 'now').mockReturnValue(1234);
    d.dispatch(0xb0, 7, 100);
    expect(deps.midiInput.lastEventTime).toBe(1234);
  });

  it('practice + noteOn → matchNoteOnset(midi, true)', () => {
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.dispatch(0x90, 64, 100);
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true);
  });

  it('!practice + noteOn → no matchNoteOnset', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 64, 100);
    expect(mocks.matchNoteOnset).not.toHaveBeenCalled();
  });
});

// ─── BLE-redelivery dedupe ─────────────────────────────────────────

describe('dispatch — BLE dedupe', () => {
  it('drops the second of two identical noteOns within 30ms', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 100);
    nowSpy.mockReturnValue(20); // 20ms later
    d.dispatch(0x90, 60, 100);
    expect(mocks.onMidiNoteOn).toHaveBeenCalledOnce();
    expect(mocks.pulseMidiBadge).toHaveBeenCalledOnce();
  });

  it('passes second event when >30ms apart', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 100);
    nowSpy.mockReturnValue(40);
    d.dispatch(0x90, 60, 100);
    expect(mocks.onMidiNoteOn).toHaveBeenCalledTimes(2);
  });

  it('passes second event when velocity differs (different key)', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 100);
    nowSpy.mockReturnValue(15);
    d.dispatch(0x90, 60, 110); // same midi, different velocity
    expect(mocks.onMidiNoteOn).toHaveBeenCalledTimes(2);
  });

  it('passes second event when midi differs', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 100);
    nowSpy.mockReturnValue(15);
    d.dispatch(0x90, 64, 100);
    expect(mocks.onMidiNoteOn).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe noteOff events', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch();
    d.dispatch(0x80, 60, 0);
    d.dispatch(0x80, 60, 0);
    expect(mocks.onMidiNoteOff).toHaveBeenCalledTimes(2);
  });

  it('honors a custom dedupeWindowMs override', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch({ dedupeWindowMs: 100 });
    d.dispatch(0x90, 60, 100);
    nowSpy.mockReturnValue(50);
    d.dispatch(0x90, 60, 100); // within 100ms → drop
    expect(mocks.onMidiNoteOn).toHaveBeenCalledOnce();
    nowSpy.mockReturnValue(101);
    d.dispatch(0x90, 60, 100); // outside window → pass
    expect(mocks.onMidiNoteOn).toHaveBeenCalledTimes(2);
  });

  it('reset() clears the cache', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 100);
    d.reset();
    nowSpy.mockReturnValue(15); // would be deduped without reset
    d.dispatch(0x90, 60, 100);
    expect(mocks.onMidiNoteOn).toHaveBeenCalledTimes(2);
  });
});

// ─── onMessage forwarder ────────────────────────────────────────────

describe('onMessage', () => {
  it('forwards 3-byte data to dispatch', () => {
    const { d, mocks } = makeDispatch();
    d.onMessage({ data: [0x90, 60, 100] });
    expect(mocks.onMidiNoteOn).toHaveBeenCalledWith(60, 100);
  });

  it('forwards 2-byte data with b=0 (program change-style)', () => {
    const { d, mocks } = makeDispatch();
    d.onMessage({ data: [0xc0, 5] }); // PC — won't dispatch (no route)
    expect(mocks.onMidiNoteOn).not.toHaveBeenCalled();
    expect(mocks.onMidiCC).not.toHaveBeenCalled();
  });

  it('rejects truncated <2-byte data silently', () => {
    const { d, mocks } = makeDispatch();
    d.onMessage({ data: [0x90] });
    expect(mocks.onMidiNoteOn).not.toHaveBeenCalled();
  });

  it('rejects null data silently', () => {
    const { d, mocks } = makeDispatch();
    d.onMessage({ data: null });
    expect(mocks.onMidiNoteOn).not.toHaveBeenCalled();
  });

  it('rejects undefined data silently', () => {
    const { d, mocks } = makeDispatch();
    d.onMessage({ data: undefined });
    expect(mocks.onMidiNoteOn).not.toHaveBeenCalled();
  });

  it('accepts Uint8Array (the actual MIDIMessageEvent shape)', () => {
    const { d, mocks } = makeDispatch();
    d.onMessage({ data: new Uint8Array([0xb0, 64, 127]) });
    expect(mocks.onMidiCC).toHaveBeenCalledWith(64, 127);
  });
});
