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
    // Default true — most existing tests assert "session is running"
    // by implication. The gated tests below override it to false.
    isSessionRunning: () => true,
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

  it('practice + running session + noteOn → matchNoteOnset(midi, true, 0)', () => {
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.dispatch(0x90, 64, 100);
    // P1-11: dispatch() 直呼び（BLE 経路相当）は timeStamp が無いので lag=0。
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true, 0);
  });

  it('!practice + noteOn → no matchNoteOnset', () => {
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 64, 100);
    expect(mocks.matchNoteOnset).not.toHaveBeenCalled();
  });

  it('practice + session NOT running + noteOn → no matchNoteOnset (cursor stays put)', () => {
    // Practice is enabled but the session is paused (e.g. user is on
    // the settings panel or the post-section result card). A
    // physical key press should NOT phantom-advance the cursor.
    const { d, mocks } = makeDispatch({
      practice: { enabled: true },
      isSessionRunning: () => false,
    });
    d.dispatch(0x90, 64, 100);
    // Note-on visuals + badge still fire (we want the user to see
    // their press), only the practice-match call is suppressed.
    expect(mocks.onMidiNoteOn).toHaveBeenCalledWith(64, 100);
    expect(mocks.pulseMidiBadge).toHaveBeenCalledOnce();
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

  it('a note-off between identical noteOns clears the dedupe so a fast re-strike passes', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { d, mocks } = makeDispatch();
    d.dispatch(0x90, 60, 100); // note-on
    nowSpy.mockReturnValue(10);
    d.dispatch(0x80, 60, 0); // proper note-off → clears the dedupe key for 60
    nowSpy.mockReturnValue(15); // still within 30ms of the first note-on
    d.dispatch(0x90, 60, 100); // legit staccato re-strike must NOT be swallowed
    expect(mocks.onMidiNoteOn).toHaveBeenCalledTimes(2);
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

// ─── P1-11: event.timeStamp → inputLagMs 貫通 ──────────────────────

describe('onMessage — P1-11 per-event 遅延補正', () => {
  it('timeStamp からハンドラ遅延を算出して matchNoteOnset へ渡す', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    // イベント発生 960ms → ハンドラ実行 1000ms = 40ms 遅延。
    d.onMessage({ data: [0x90, 64, 100], timeStamp: 960 });
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true, 40);
  });

  it('timeStamp が無いイベント（BLE ポリフィル等）は lag=0', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.onMessage({ data: [0x90, 64, 100] });
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true, 0);
  });

  it('負の lag（timeStamp が未来 = クロック不整合）は 0 にクランプ', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.onMessage({ data: [0x90, 64, 100], timeStamp: 1500 });
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true, 0);
  });

  it('1000ms 超の異常 lag（バックグラウンド復帰バースト等）は 0 にクランプ', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.onMessage({ data: [0x90, 64, 100], timeStamp: 3000 }); // lag=2000ms
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true, 0);
  });

  it('ちょうど 1000ms の lag は補正に使う（境界は inclusive）', () => {
    vi.spyOn(performance, 'now').mockReturnValue(2000);
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.onMessage({ data: [0x90, 64, 100], timeStamp: 1000 });
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true, 1000);
  });

  it('非有限 timeStamp（NaN/Infinity）は lag=0', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.onMessage({ data: [0x90, 64, 100], timeStamp: Number.NaN });
    expect(mocks.matchNoteOnset).toHaveBeenCalledWith(64, true, 0);
  });

  it('noteOff / CC 経路は lag があっても従来どおり（matchNoteOnset を呼ばない）', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { d, mocks } = makeDispatch({ practice: { enabled: true } });
    d.onMessage({ data: [0x80, 64, 0], timeStamp: 960 });
    d.onMessage({ data: [0xb0, 64, 127], timeStamp: 960 });
    expect(mocks.matchNoteOnset).not.toHaveBeenCalled();
    expect(mocks.onMidiNoteOff).toHaveBeenCalledWith(64);
    expect(mocks.onMidiCC).toHaveBeenCalledWith(64, 127);
  });
});
