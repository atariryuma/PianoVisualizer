import { describe, it, expect } from 'vitest';
import {
  initQualityHistoryState,
  resetQualityHistoryState,
  applyOnsetToHistory,
  type QualityHistoryOptions,
  type QualityHistoryState,
} from '../src/state/quality-history';

const OPTS: QualityHistoryOptions = {
  debounceMs: 80, // mic-side default
  minIoiMs: 100,
  maxIoiMs: 5000,
  ioiHistorySize: 16,
  amplitudeHistorySize: 30,
};

const tightOpts = (over: Partial<QualityHistoryOptions> = {}): QualityHistoryOptions => ({
  ...OPTS,
  ...over,
});

describe('initQualityHistoryState / resetQualityHistoryState', () => {
  it('initial state has empty buffers', () => {
    const s = initQualityHistoryState();
    expect(s.noteOnsetTimes).toEqual([]);
    expect(s.ioiHistory).toEqual([]);
    expect(s.amplitudeHistory).toEqual([]);
  });

  it('reset empties a populated state in place', () => {
    const s: QualityHistoryState = {
      noteOnsetTimes: [100, 300, 500],
      ioiHistory: [200, 200],
      amplitudeHistory: [0.4, 0.5, 0.6],
    };
    resetQualityHistoryState(s);
    expect(s.noteOnsetTimes).toEqual([]);
    expect(s.ioiHistory).toEqual([]);
    expect(s.amplitudeHistory).toEqual([]);
  });

  it('reset preserves the same array references (no reallocation)', () => {
    const s = initQualityHistoryState();
    const onsetsRef = s.noteOnsetTimes;
    const ioiRef = s.ioiHistory;
    const ampRef = s.amplitudeHistory;
    s.noteOnsetTimes.push(1, 2, 3);
    s.ioiHistory.push(100);
    s.amplitudeHistory.push(0.5);
    resetQualityHistoryState(s);
    expect(s.noteOnsetTimes).toBe(onsetsRef);
    expect(s.ioiHistory).toBe(ioiRef);
    expect(s.amplitudeHistory).toBe(ampRef);
  });
});

describe('applyOnsetToHistory — first onset', () => {
  it('records the timestamp and amplitude but produces no IOI', () => {
    const s = initQualityHistoryState();
    const r = applyOnsetToHistory(s, 1000, 0.42, OPTS);
    expect(r).toEqual({ recorded: true, ioi: null });
    expect(s.noteOnsetTimes).toEqual([1000]);
    expect(s.ioiHistory).toEqual([]);
    expect(s.amplitudeHistory).toEqual([0.42]);
  });
});

describe('applyOnsetToHistory — debounce', () => {
  it('rejects a same-event echo within debounceMs, but still records amplitude', () => {
    const s = initQualityHistoryState();
    applyOnsetToHistory(s, 1000, 0.5, OPTS);
    const r = applyOnsetToHistory(s, 1050, 0.55, OPTS); // 50ms — under 80ms debounce
    expect(r).toEqual({ recorded: false, ioi: null });
    expect(s.noteOnsetTimes).toEqual([1000]);
    expect(s.ioiHistory).toEqual([]);
    // Amplitude is pushed unconditionally, matching legacy behavior.
    expect(s.amplitudeHistory).toEqual([0.5, 0.55]);
  });

  it('accepts a follow-up onset exactly at debounceMs+1', () => {
    const s = initQualityHistoryState();
    applyOnsetToHistory(s, 1000, 0.5, OPTS);
    const r = applyOnsetToHistory(s, 1081, 0.5, OPTS); // 81ms > 80
    expect(r.recorded).toBe(true);
    expect(s.noteOnsetTimes).toEqual([1000, 1081]);
  });

  it('honors a tighter MIDI-side debounce', () => {
    const s = initQualityHistoryState();
    const midi = tightOpts({ debounceMs: 30 });
    applyOnsetToHistory(s, 1000, 0.5, midi);
    const r = applyOnsetToHistory(s, 1031, 0.5, midi); // 31ms > 30
    expect(r.recorded).toBe(true);
    expect(s.noteOnsetTimes.length).toBe(2);
  });
});

describe('applyOnsetToHistory — IOI window', () => {
  it('records an IOI inside [minIoiMs, maxIoiMs)', () => {
    const s = initQualityHistoryState();
    applyOnsetToHistory(s, 1000, 0.5, OPTS);
    const r = applyOnsetToHistory(s, 1500, 0.5, OPTS);
    expect(r).toEqual({ recorded: true, ioi: 500 });
    expect(s.ioiHistory).toEqual([500]);
  });

  it('rejects an IOI below minIoiMs (between debounceMs and 100ms)', () => {
    const s = initQualityHistoryState();
    const tight = tightOpts({ debounceMs: 30, minIoiMs: 100 });
    applyOnsetToHistory(s, 1000, 0.5, tight);
    const r = applyOnsetToHistory(s, 1080, 0.5, tight); // 80ms passes 30ms debounce, fails 100ms IOI floor
    expect(r.recorded).toBe(true);
    expect(r.ioi).toBeNull();
    expect(s.noteOnsetTimes).toEqual([1000, 1080]);
    expect(s.ioiHistory).toEqual([]);
  });

  it('rejects an IOI at or above maxIoiMs (long pause)', () => {
    const s = initQualityHistoryState();
    applyOnsetToHistory(s, 1000, 0.5, OPTS);
    const r = applyOnsetToHistory(s, 6500, 0.5, OPTS); // 5500ms > 5000
    expect(r.recorded).toBe(true);
    expect(r.ioi).toBeNull();
    expect(s.ioiHistory).toEqual([]);
  });
});

describe('applyOnsetToHistory — bounded growth', () => {
  it('caps amplitudeHistory at amplitudeHistorySize (FIFO)', () => {
    const s = initQualityHistoryState();
    const opts = tightOpts({ amplitudeHistorySize: 4 });
    for (let i = 0; i < 6; i++) {
      applyOnsetToHistory(s, 1000 + i * 200, i / 10, opts);
    }
    expect(s.amplitudeHistory.length).toBe(4);
    // First two (0.0, 0.1) evicted; last four kept in order.
    expect(s.amplitudeHistory).toEqual([0.2, 0.3, 0.4, 0.5]);
  });

  it('caps ioiHistory at ioiHistorySize (FIFO)', () => {
    const s = initQualityHistoryState();
    const opts = tightOpts({ ioiHistorySize: 3 });
    // 5 onsets → 4 IOIs of 200ms each → ioiHistory should hold last 3.
    for (let i = 0; i < 5; i++) {
      applyOnsetToHistory(s, 1000 + i * 200, 0.5, opts);
    }
    expect(s.ioiHistory).toEqual([200, 200, 200]);
  });

  it('caps noteOnsetTimes at ioiHistorySize+1 (so next IOI still has its prev)', () => {
    const s = initQualityHistoryState();
    const opts = tightOpts({ ioiHistorySize: 3 });
    for (let i = 0; i < 8; i++) {
      applyOnsetToHistory(s, 1000 + i * 200, 0.5, opts);
    }
    expect(s.noteOnsetTimes.length).toBe(4); // ioiHistorySize + 1
    // The most recent onset is preserved at the end.
    expect(s.noteOnsetTimes[s.noteOnsetTimes.length - 1]).toBe(2400);
  });

  it('the next IOI after a wraparound still computes correctly', () => {
    const s = initQualityHistoryState();
    const opts = tightOpts({ ioiHistorySize: 2 });
    applyOnsetToHistory(s, 1000, 0.5, opts);
    applyOnsetToHistory(s, 1200, 0.5, opts); // ioi 200 → [200]
    applyOnsetToHistory(s, 1400, 0.5, opts); // ioi 200 → [200, 200]
    applyOnsetToHistory(s, 1700, 0.5, opts); // ioi 300 → [200, 300] (200 evicted)
    expect(s.ioiHistory).toEqual([200, 300]);
  });
});

describe('applyOnsetToHistory — return value', () => {
  it('reports both recorded and ioi together when a fresh onset adds an IOI', () => {
    const s = initQualityHistoryState();
    applyOnsetToHistory(s, 1000, 0.5, OPTS);
    const r = applyOnsetToHistory(s, 1320, 0.5, OPTS);
    expect(r).toEqual({ recorded: true, ioi: 320 });
  });

  it('reports recorded:false when debounced, even though amplitude was pushed', () => {
    const s = initQualityHistoryState();
    applyOnsetToHistory(s, 1000, 0.5, OPTS);
    const r = applyOnsetToHistory(s, 1010, 0.6, OPTS);
    expect(r.recorded).toBe(false);
    expect(s.amplitudeHistory.length).toBe(2);
  });
});
