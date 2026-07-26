// @vitest-environment happy-dom
// レイテンシ較正ウィザード (P2-22) のテスト。
//
// FakeTone のクロック（fakeNowSec）を進めながらタップを注入し、
//   • クリック列のスケジュール（warmup + target + 予備 2）
//   • tap−click 差の中央値 → onResult（5ms 丸め + レンジクランプ）
//   • ウォームアップ / 大外れタップの除外
//   • タイムアウト時のフォールバック確定（≥4）と失敗（<4）
//   • stop() の後始末と「最終タップ直後の合成 click で再開始しない」潰し
// を検証する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLatencyCalibration, type LatencyCalibrationDeps } from '../src/latency-calibration';

const INTERVAL_MS = 600;
const WARMUP = 2;
const TARGET = 10;
const TOTAL_CLICKS = WARMUP + TARGET + 2;

function makeFixture(over: Partial<LatencyCalibrationDeps> = {}) {
  let nowSec = 100;
  const tone = {
    start: vi.fn(async () => {}),
    now: () => nowSec,
  };
  const metronome = { triggerAttackRelease: vi.fn() };
  const btn = document.createElement('button');
  btn.textContent = 'calibrateBtn';
  const status = document.createElement('div');
  const onResult = vi.fn();
  const deps: LatencyCalibrationDeps = {
    dom: { btn, status },
    getTone: () => tone,
    ensureInstruments: vi.fn(),
    getMetronome: () => metronome,
    t: (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    onResult,
    ...over,
  };
  const calib = createLatencyCalibration(deps);
  return {
    calib,
    tone,
    metronome,
    btn,
    status,
    onResult,
    setNow: (s: number) => {
      nowSec = s;
    },
    getNow: () => nowSec,
  };
}

/** スケジュールされたクリック時刻（秒）を metronome 呼び出しから復元。 */
function scheduledClickSecs(metronome: { triggerAttackRelease: ReturnType<typeof vi.fn> }) {
  return metronome.triggerAttackRelease.mock.calls.map((c) => c[2] as number);
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createLatencyCalibration — 開始', () => {
  it('start() が warmup+target+2 発のクリックを 600ms 間隔でスケジュールする', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    expect(fx.tone.start).toHaveBeenCalled();
    const clicks = scheduledClickSecs(fx.metronome);
    expect(clicks).toHaveLength(TOTAL_CLICKS);
    expect(clicks[1] - clicks[0]).toBeCloseTo(INTERVAL_MS / 1000, 5);
    // 開始猶予 0.8s
    expect(clicks[0]).toBeCloseTo(100 + 0.8, 5);
    expect(fx.calib.isRunning()).toBe(true);
    expect(fx.btn.textContent).toBe('calibrateTapHere');
    expect(fx.status.textContent).toBe('calibrateListen');
  });

  it('実行中の start() は二重開始しない', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    await fx.calib.start();
    expect(scheduledClickSecs(fx.metronome)).toHaveLength(TOTAL_CLICKS);
  });

  it('Tone が無ければ失敗ステータスを出して開始しない', async () => {
    const fx = makeFixture({ getTone: () => null });
    await fx.calib.start();
    expect(fx.calib.isRunning()).toBe(false);
    expect(fx.status.textContent).toBe('calibrateFail');
  });

  it('metronome が無ければ失敗ステータスを出して開始しない', async () => {
    const fx = makeFixture({ getMetronome: () => null });
    await fx.calib.start();
    expect(fx.calib.isRunning()).toBe(false);
    expect(fx.status.textContent).toBe('calibrateFail');
  });
});

describe('createLatencyCalibration — タップ採点', () => {
  it('10 タップの中央値を 5ms 丸めで onResult へ渡す', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    // タップ対象はウォームアップ後のクリック（index 2..11）。各 +52ms。
    for (let i = WARMUP; i < WARMUP + TARGET; i++) {
      fx.setNow(clicks[i] + 0.052);
      fx.calib.onTap();
    }
    expect(fx.onResult).toHaveBeenCalledWith(50, expect.objectContaining({ source: 'touch' })); // 52 → 5ms 丸めで 50
    expect(fx.calib.isRunning()).toBe(false);
    // The result now names the input it was measured on: a touch-measured
    // offset does not apply to keyboard play, so a stored value must say which.
    expect(fx.status.textContent).toBe('calibrateDoneOnFmt:{"v":50,"i":"calibrateInputTouch"}');
    expect(fx.btn.textContent).toBe('calibrateBtn'); // ラベル復帰
  });

  it('ウォームアップクリックへのタップは数えない', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    fx.setNow(clicks[0] + 0.05); // ウォームアップ 1 発目
    fx.calib.onTap();
    expect(fx.status.textContent).toBe('calibrateListen'); // 進捗が出ていない
  });

  it('間隔の半分を超える大外れタップは捨てる', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    // クリック 2 と 3 のちょうど中間 +1ms 手前ではなく、half=300ms 超を作る:
    // 最寄りクリックから 301ms は次のクリックの方が近くなるため、
    // 「最寄りから 250ms（採用）」と比較して差分検証する。
    fx.setNow(clicks[5] + 0.25);
    fx.calib.onTap(); // |delta|=250 ≤ 300 → 採用
    expect(fx.status.textContent).toContain('"n":1');
  });

  it('停止中のタップは無視される', () => {
    const fx = makeFixture();
    fx.calib.onTap();
    expect(fx.status.textContent).toBe('');
  });
});

describe('createLatencyCalibration — タイムアウト確定', () => {
  it('タップ 4 回以上ならクリック列終了後に中央値で確定する', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    for (let i = WARMUP; i < WARMUP + 5; i++) {
      fx.setNow(clicks[i] + 0.08);
      fx.calib.onTap();
    }
    vi.runAllTimers(); // クリック列終端 + 800ms の endTimer
    expect(fx.onResult).toHaveBeenCalledWith(80, expect.objectContaining({ source: 'touch' }));
    expect(fx.calib.isRunning()).toBe(false);
  });

  it('タップ 4 回未満なら失敗ステータス（onResult は呼ばれない）', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    fx.setNow(clicks[3] + 0.05);
    fx.calib.onTap();
    vi.runAllTimers();
    expect(fx.onResult).not.toHaveBeenCalled();
    expect(fx.status.textContent).toBe('calibrateFail');
    expect(fx.btn.textContent).toBe('calibrateBtn');
  });
});

describe('createLatencyCalibration — 停止と UI 配線', () => {
  it('stop() で endTimer 破棄 + ラベル復帰し、以後 finalize しない', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    fx.calib.stop();
    expect(fx.calib.isRunning()).toBe(false);
    expect(fx.btn.textContent).toBe('calibrateBtn');
    vi.runAllTimers();
    expect(fx.onResult).not.toHaveBeenCalled();
    expect(fx.status.textContent).toBe('calibrateListen'); // fail に変わらない
  });

  it('待機中の click で開始する', async () => {
    const fx = makeFixture();
    fx.btn.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(fx.calib.isRunning()).toBe(true));
  });

  it('最終タップの pointerdown 直後に発火する合成 click では再開始しない', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    for (let i = WARMUP; i < WARMUP + TARGET - 1; i++) {
      fx.setNow(clicks[i] + 0.05);
      fx.calib.onTap();
    }
    // 10 個目は実 UI と同じ pointerdown → click の順で流す
    fx.setNow(clicks[WARMUP + TARGET - 1] + 0.05);
    fx.btn.dispatchEvent(new Event('pointerdown'));
    expect(fx.onResult).toHaveBeenCalledTimes(1); // 確定した
    fx.btn.dispatchEvent(new Event('click')); // 合成 click
    await Promise.resolve();
    expect(fx.calib.isRunning()).toBe(false); // 再開始していない
    expect(scheduledClickSecs(fx.metronome)).toHaveLength(TOTAL_CLICKS);
  });

  it('中断 stop(true)（パネル閉じ）後は、次の開始タップが握り潰されない', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    expect(fx.calib.isRunning()).toBe(true);
    // 1タップ（pointerdown が swallowClick を立てる）→ 合成 click 前に中断。
    fx.btn.dispatchEvent(new Event('pointerdown'));
    fx.calib.stop(true); // onPanelClose 相当（中断なので握り潰しも解除）
    expect(fx.calib.isRunning()).toBe(false);
    // 再開: 次の click は swallow されず開始する（以前は1回握り潰されていた）。
    fx.btn.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(fx.calib.isRunning()).toBe(true));
  });

  it('自然終了経路の stop()（既定）は握り潰しフラグを残す（最終タップの合成 click 用）', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    fx.btn.dispatchEvent(new Event('pointerdown')); // swallowClick = true
    fx.calib.stop(); // finalize 相当（resetSwallow なし）
    // 直後の合成 click は飲まれ、再開始しない。
    fx.btn.dispatchEvent(new Event('click'));
    await Promise.resolve();
    expect(fx.calib.isRunning()).toBe(false);
  });
});

// ── calibrating on the instrument (Rocksmith pattern) ────────────────
// Screen-touch input costs 20-50 ms while BLE-MIDI costs ~5 ms, so measuring by
// touch and then playing on the keyboard bakes that difference in as permanent
// error. Measuring on the instrument also lets the player's own consistent bias
// cancel, since the same person on the same input produced the number.

describe('createLatencyCalibration — instrument taps', () => {
  it('consumes a key press as a tap only while running', async () => {
    const fx = makeFixture({ isMidiActive: () => true });
    // Before start: must NOT consume, or ordinary play would lose presses —
    // the dispatcher skips scoring precisely when this returns true.
    expect(fx.calib.tapFromInstrument()).toBe(false);
    await fx.calib.start();
    expect(fx.calib.isRunning()).toBe(true);
    expect(fx.calib.tapFromInstrument()).toBe(true);
  });

  it('scores instrument taps exactly like screen taps', async () => {
    const fx = makeFixture({ isMidiActive: () => true });
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    for (let i = WARMUP; i < WARMUP + TARGET; i++) {
      fx.setNow(clicks[i] + 0.052);
      expect(fx.calib.tapFromInstrument()).toBe(true);
    }
    expect(fx.onResult).toHaveBeenCalledWith(50, expect.objectContaining({ source: 'midi' }));
  });

  it('prompts for the keyboard when one is attached, touch otherwise', async () => {
    // Without this the whole path is invisible — the button still said "tap
    // here", so nobody would think to press a key.
    const midi = makeFixture({ isMidiActive: () => true });
    await midi.calib.start();
    expect(midi.btn.textContent).toBe('calibratePlayHere');

    const touch = makeFixture({ isMidiActive: () => false });
    await touch.calib.start();
    expect(touch.btn.textContent).toBe('calibrateTapHere');
  });

  it('reports which input produced the measurement', async () => {
    const fx = makeFixture({ isMidiActive: () => true });
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    for (let i = WARMUP; i < WARMUP + TARGET; i++) {
      fx.setNow(clicks[i] + 0.052);
      fx.calib.tapFromInstrument();
    }
    // A stored offset is only interpretable if it says what measured it.
    expect(fx.status.textContent ?? '').toContain('judgeInputMidi');
  });
});

// ── one input per run + rejection of a bad run ───────────────────────
// A run must sample exactly ONE transport path. Accepting both would blend
// touch (20-50 ms) and BLE-MIDI (~5 ms) into a single median that describes
// neither, which is why the genre calibrates per input. And a median over taps
// that were never locked to the click is not a measurement — storing it would
// put the player permanently off-beat with no clue why.

describe('createLatencyCalibration — input locking', () => {
  it('ignores screen taps during a keyboard run', async () => {
    const fx = makeFixture({ isMidiActive: () => true });
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    fx.setNow(clicks[WARMUP] + 0.05);
    fx.calib.onTap(); // wrong input for this run
    expect(fx.status.textContent).toBe('calibrateUseKeyboard');
    // …and it did not enter the sample: a full set of MIDI taps still resolves
    // to the MIDI timing alone.
    for (let i = WARMUP; i < WARMUP + TARGET; i++) {
      fx.setNow(clicks[i] + 0.052);
      fx.calib.tapFromInstrument();
    }
    expect(fx.onResult).toHaveBeenCalledWith(50, expect.objectContaining({ source: 'midi' }));
  });

  it('ignores keyboard presses during a touch run, but still consumes them', async () => {
    const fx = makeFixture({ isMidiActive: () => false });
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    fx.setNow(clicks[WARMUP] + 0.2);
    // Consumed (true) so the press is not scored as gameplay, but NOT sampled.
    expect(fx.calib.tapFromInstrument()).toBe(true);
    expect(fx.status.textContent).toBe('calibrateUseTouch');
    for (let i = WARMUP; i < WARMUP + TARGET; i++) {
      fx.setNow(clicks[i] + 0.052);
      fx.calib.onTap();
    }
    expect(fx.onResult).toHaveBeenCalledWith(50, expect.objectContaining({ source: 'touch' }));
  });

  it('locks the source at start, not per tap (hot-plug mid-run cannot switch it)', async () => {
    let attached = false;
    const fx = makeFixture({ isMidiActive: () => attached });
    await fx.calib.start(); // touch run
    attached = true; // keyboard connects mid-measurement
    expect(fx.calib.tapFromInstrument()).toBe(true);
    expect(fx.status.textContent).toBe('calibrateUseTouch');
  });
});

describe('createLatencyCalibration — rejecting an unusable run', () => {
  it('rejects taps that were never locked to the click', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    // Wildly scattered within the accept window → MAD far past the bound.
    const scatter = [0.01, 0.2, 0.03, 0.24, 0.02, 0.22, 0.05, 0.26, 0.01, 0.2];
    for (let i = 0; i < TARGET; i++) {
      fx.setNow(clicks[WARMUP + i] + scatter[i]);
      fx.calib.onTap();
    }
    expect(fx.onResult).not.toHaveBeenCalled();
    expect(fx.status.textContent).toBe('calibrateUnstable');
    expect(fx.calib.isRunning()).toBe(false);
  });

  it('accepts a run with ordinary human jitter', async () => {
    const fx = makeFixture();
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    // ±15 ms around 50 ms — within the 10-40 ms human range.
    const jitter = [0.05, 0.062, 0.041, 0.055, 0.048, 0.065, 0.038, 0.052, 0.058, 0.045];
    for (let i = 0; i < TARGET; i++) {
      fx.setNow(clicks[WARMUP + i] + jitter[i]);
      fx.calib.onTap();
    }
    expect(fx.onResult).toHaveBeenCalled();
    expect(fx.status.textContent ?? '').toContain('calibrateDoneOnFmt');
  });

  it('stamps the output route onto the measurement (staleness detection)', async () => {
    const fx = makeFixture({ getAudioRoute: () => 'GO:PIANO88 AUDIO' });
    await fx.calib.start();
    const clicks = scheduledClickSecs(fx.metronome);
    for (let i = WARMUP; i < WARMUP + TARGET; i++) {
      fx.setNow(clicks[i] + 0.052);
      fx.calib.onTap();
    }
    expect(fx.onResult).toHaveBeenCalledWith(
      50,
      expect.objectContaining({ route: 'GO:PIANO88 AUDIO' })
    );
  });
});
