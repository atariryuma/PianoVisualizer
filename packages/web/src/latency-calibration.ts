// レイテンシ較正ウィザード (P2-22)。
//
// 手動 ms スライダーは小学生には扱えないため、「クリック音に合わせて
// 10 回タップ → タップと予定時刻の差の中央値を prefs.audioOffsetMs へ」
// のガイド付き較正を提供する。
//
// 計測のセマンティクス: メトロノーム音は AudioContext クロックの予定
// 時刻 + 出力レイテンシで「聞こえる」。子どもは聞こえた音に合わせて
// タップするので、tap − 予定時刻 = 出力レイテンシ + タッチ遅延 —
// これはまさに practiceRealElapsedMs から差し引かれる audioOffsetMs が
// 補正したい量そのもの。practice の採点経路と同じ量を同じ向きで測る。
//
// UI はボタン 1 個 + ステータス 1 行だけ（kid-simple）:
//   待機中: 「🎯 タップで自動そくてい」 → click で開始
//   実行中: ボタン自体がタップパッドになる（pointerdown = 1 タップ）。
//           進捗はステータス行（「3 / 10」）。停止操作は無し — クリック列
//           が終わるか 10 タップ集まれば自動終了（パネルを閉じても止まる）。
//
// banned-list 適合: 較正は子ども発のワンタップ操作で、成否に報酬も罰も
// ない。失敗時も「もう一回ためしてね」のみ。

/** Tone.js のうち較正が使う最小面。 */
import { AUDIO_OFFSET_MAX_MS, clamp } from '@piano/core';
import { diag } from './diag-sink';

export interface CalibrationToneRef {
  /** ユーザー操作起点の AudioContext resume。 */
  start(): Promise<unknown> | unknown;
  /** 現在時刻（秒、AudioContext クロック）。 */
  now(): number;
}

/** クリック音源 — practice-tone-audio の metronome (MembraneSynth)。 */
export interface CalibrationInstrument {
  triggerAttackRelease(...args: unknown[]): unknown;
}

export interface LatencyCalibrationDom {
  /** 開始ボタン兼タップパッド。 */
  btn: HTMLElement;
  /** 進捗・結果のステータス行。 */
  status: HTMLElement;
}

export interface LatencyCalibrationDeps {
  dom: LatencyCalibrationDom;
  getTone(): CalibrationToneRef | null | undefined;
  /** 楽器の遅延生成（practice-tone-audio.ensureInstruments）。 */
  ensureInstruments(): void;
  getMetronome(): CalibrationInstrument | null;
  t(key: string, vars?: Record<string, string | number>): string;
  /** 較正確定 — 中央値 (ms, スライダーレンジへクランプ・5ms 丸め済み)。 */
  /** Called with the measurement and how it was taken. `meta` matters because a
   *  touch-measured offset does not apply to keyboard play, and an offset
   *  measured on one audio route does not apply to another — the caller stores
   *  it so staleness can be detected later. */
  onResult(medianMs: number, meta: { source: 'midi' | 'touch'; route?: string }): void;
  /** True when MIDI is the ACTIVE input (a keyboard is attached AND the player
   *  hasn't pinned the mic). Named for the routing decision it receives — it
   *  used to be called `isMidiAttached`, i.e. the hardware fact, while being
   *  wired to `isMidiActive()`; after the two concepts were split, a name that
   *  asserts the wrong one is the only thing left that can mislead a reader. Drives the prompt ("play a key" vs "tap here") and
   *  the measured-on note in the result, because a touch-measured offset does
   *  not apply to keyboard play.
   *
   *  Deliberately the resolved source, not "a port is attached": calibrating on
   *  the keyboard while the app scores the mic would measure the wrong transport
   *  path — the whole point of locking the source is that the offset describes
   *  the input the player actually plays. Optional — older shells / partial
   *  tests fall back to the touch wording. */
  isMidiActive?(): boolean;
  /** Current audio output route name (e.g. "GO:PIANO88 AUDIO"). Stored with the
   *  measurement so the app can tell the player to re-measure after they change
   *  headphones/speakers — the standard "recalibrate when hardware changes"
   *  advice, made automatic. */
  getAudioRoute?(): string | undefined;
  /** クリック間隔 (ms)。既定 600（=100BPM、子どもが合わせやすい速さ）。 */
  intervalMs?: number;
  /** 採点しないウォームアップクリック数。既定 2。 */
  warmupClicks?: number;
  /** 必要タップ数。既定 10（レビュー指示のまま）。 */
  tapTarget?: number;
}

export interface LatencyCalibration {
  start(): Promise<void>;
  /** 予約済みタイマー破棄 + 状態リセット。resetSwallow=true は中断
   *  （パネル閉じ）から呼ぶ時に握り潰しフラグも解除する（再入時の開始
   *  タップ取りこぼし防止）。自然終了（finalize）は既定 false のまま。 */
  stop(resetSwallow?: boolean): void;
  isRunning(): boolean;
  /** 楽器（MIDI / マイク）からのタップ。較正中なら消費して true。 */
  tapFromInstrument(): boolean;
  /** テスト用に公開 — 実 UI では btn の pointerdown が呼ぶ。 */
  onTap(): void;
}

/** スライダーの可動域 (index.html の min/max/step と揃える)。 */
const OFFSET_MIN_MS = -50;
/** The offset ceiling is defined once, in @piano/core — this clamp, the
 *  auto-detect's clamp, and the settings slider's `max` all have to agree or a
 *  measurement accepted here gets clipped somewhere else. */
const OFFSET_MAX_MS = AUDIO_OFFSET_MAX_MS;
const OFFSET_STEP_MS = 5;
/** Fewest usable taps for a median to mean anything. */
const MIN_TAPS = 4;
/** Largest median-absolute-deviation accepted, in ms. Human tap jitter is
 *  10-40 ms even for trained players, and Rock Band's sensor auto-calibration
 *  lands within ~5-10 ms — past this the taps were not locked to the click, so
 *  the run is rejected rather than stored. */
const MAX_TAP_MAD_MS = 45;

export function createLatencyCalibration(deps: LatencyCalibrationDeps): LatencyCalibration {
  const intervalMs = deps.intervalMs ?? 600;
  const warmup = deps.warmupClicks ?? 2;
  const target = deps.tapTarget ?? 10;

  let running = false;
  /**
   * The ONE input this run measures. Locked at start() and enforced on every
   * tap.
   *
   * Accepting both would silently corrupt the measurement: screen touch costs
   * 20-50 ms and BLE-MIDI ~5 ms, so a mixed run produces a median of two
   * different transport paths — a number that describes neither. The genre
   * calibrates per input for exactly this reason (Rock Band calibrates each
   * instrument; Rocksmith calibrates from the guitar).
   */
  let source: 'midi' | 'touch' = 'touch';
  /** 予定クリック時刻（秒、AudioContext クロック）。 */
  let clickSecs: number[] = [];
  /** 採点済みタップの tap−click 差 (ms)。 */
  let deltas: number[] = [];
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  /** タップとして消費した pointerdown の後続 click で再開始しないための潰し。 */
  let swallowClick = false;

  function setStatus(msg: string): void {
    deps.dom.status.textContent = msg;
  }

  /** resetSwallow: パネル中断（閉じる）から呼ぶ時だけ握り潰しフラグを
   *  解除する。自然終了（finalize）経路では残す — 最終タップに続く合成
   *  click を飲んで再開始を防ぐため。中断時に残ると次回の「開始」タップが
   *  1回 swallow され「較正ボタンを2回押さないと始まらない」不具合になる
   *  （実行中に1タップ→click 発火前にパネルを閉じる等で再現）。 */
  function stop(resetSwallow = false): void {
    running = false;
    clickSecs = [];
    deltas = [];
    if (resetSwallow) swallowClick = false;
    if (endTimer) {
      clearTimeout(endTimer);
      endTimer = null;
    }
    deps.dom.btn.textContent = deps.t('calibrateBtn');
    deps.dom.btn.classList.remove('is-tapping');
  }

  /**
   * Median absolute deviation — a robust spread estimate. Used instead of
   * standard deviation because a single mistimed tap should not be able to
   * invalidate an otherwise clean run (which is also why the centre is a
   * median, not a mean).
   */
  function medianAbsDeviation(sorted: number[], median: number): number {
    const devs = sorted.map((d) => Math.abs(d - median)).sort((a, b) => a - b);
    const mid = Math.floor(devs.length / 2);
    return devs.length % 2 ? devs[mid] : (devs[mid - 1] + devs[mid]) / 2;
  }

  /**
   * One log record per calibration attempt, in every outcome.
   *
   * Calibration silently changes how everything is judged and used to leave no
   * trace at all — when a tester asked "what did the auto-measure produce?" the
   * only way to answer was to pull localStorage off the device. `console.log`
   * rather than remoteLog is deliberate: the native build hard-disables remote
   * logging (App Store compliance), but Capacitor forwards console to the
   * device log, which is exactly where this is needed.
   */
  function logAttempt(outcome: string, fields: Record<string, unknown>): void {
    // Through the ring, not a bare console.log: the calibration result is
    // exactly the kind of answer that used to be lost when the device log
    // stream died mid-session, and the only way to recover it was to pull
    // localStorage off the device by hand.
    diag('Calibrate', { outcome, input: source, ...fields });
  }

  function finalize(): void {
    const n = deltas.length;
    if (n < MIN_TAPS) {
      stop();
      logAttempt('aborted — too few usable taps', { taps: n, need: MIN_TAPS });
      setStatus(deps.t('calibrateFail'));
      return;
    }
    // 中央値 — 外れタップ（1 回の空振り・二度打ち）に頑健。
    const sorted = [...deltas].sort((a, b) => a - b);
    const mid = Math.floor(n / 2);
    const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const mad = medianAbsDeviation(sorted, median);

    // Reject an inconsistent run instead of storing its median. A median over
    // taps that were not actually locked to the click is not a measurement, and
    // silently accepting it puts the player permanently off-beat with no clue
    // why. For reference, Rock Band's sensor-based auto-calibration lands
    // within ~5-10 ms, and human tap jitter is 10-40 ms even for trained
    // players — so a MAD past this bound means "try again", not "here's your
    // latency".
    if (mad > MAX_TAP_MAD_MS) {
      stop();
      logAttempt('rejected — unstable taps', {
        taps: n,
        medianMs: +median.toFixed(1),
        madMs: +mad.toFixed(1),
        maxMadMs: MAX_TAP_MAD_MS,
      });
      setStatus(deps.t('calibrateUnstable'));
      return;
    }

    const stepped = Math.round(median / OFFSET_STEP_MS) * OFFSET_STEP_MS;
    const v = clamp(stepped, OFFSET_MIN_MS, OFFSET_MAX_MS);
    stop(); // does not clear `source` — the locked input survives for the report

    logAttempt('measured', {
      offsetMs: v,
      taps: n,
      medianRawMs: +median.toFixed(1),
      madMs: +mad.toFixed(1),
      clamped: v !== stepped,
      route: deps.getAudioRoute?.(),
    });
    deps.onResult(v, { source, route: deps.getAudioRoute?.() });
    setStatus(
      deps.t('calibrateDoneOnFmt', {
        v,
        i: deps.t(source === 'midi' ? 'judgeInputMidi' : 'calibrateInputTouch'),
      })
    );
  }

  async function start(): Promise<void> {
    if (running) return;
    const Tone = deps.getTone();
    if (!Tone) {
      setStatus(deps.t('calibrateFail'));
      return;
    }
    try {
      await Tone.start();
      deps.ensureInstruments();
    } catch {
      setStatus(deps.t('calibrateFail'));
      return;
    }
    const met = deps.getMetronome();
    if (!met) {
      setStatus(deps.t('calibrateFail'));
      return;
    }

    running = true;
    deltas = [];
    clickSecs = [];
    // 0.8 秒後に開始 — Tone.start() 直後のコンテキスト再開ラグを吸収。
    // クリック総数はウォームアップ + 目標 + 予備 2（10 個目のタップが
    // 最終クリックちょうどにならないよう余裕を持たせる）。
    const t0 = Tone.now() + 0.8;
    const totalClicks = warmup + target + 2;
    for (let i = 0; i < totalClicks; i++) {
      const at = t0 + (i * intervalMs) / 1000;
      clickSecs.push(at);
      try {
        met.triggerAttackRelease('C5', 0.05, at);
      } catch {
        /* 個々のクリック失敗は無視 — 中央値なので数発欠けても成立する */
      }
    }
    // Lock the input for the whole run and name it. Without naming it the
    // instrument path is invisible (the button still said "tap here", so nobody
    // would think to press a key); without locking it, taps from the other path
    // would contaminate the median.
    source = deps.isMidiActive?.() ? 'midi' : 'touch';
    deps.dom.btn.textContent = deps.t(source === 'midi' ? 'calibratePlayHere' : 'calibrateTapHere');
    // Turn the control into a real tap PAD for the duration: bigger target and
    // `touch-action: none` (see app.css #calibrateBtn.is-tapping). Without the
    // touch-action the pad fights its own scroll container — every tap nudged
    // the settings card and moved the target out from under the finger.
    deps.dom.btn.classList.add('is-tapping');
    setStatus(deps.t('calibrateListen'));
    // クリック列の終端 + 余韻で自動終了（タップが集まりきらなくても、
    // 4 回以上あれば中央値で確定する）。
    const endMs = (t0 - Tone.now()) * 1000 + totalClicks * intervalMs + 800;
    endTimer = setTimeout(finalize, endMs);
  }

  /** Score one tap against the nearest scheduled click. Source-agnostic — both
   *  entry points gate on `source` before calling this, so a sample can only
   *  ever come from the input this run locked onto. */
  function recordTap(): void {
    const Tone = deps.getTone();
    if (!Tone) return;
    const tapSec = Tone.now();
    // 最寄りの予定クリックに割り当てる。
    let best = -1;
    let bestAbs = Infinity;
    for (let i = 0; i < clickSecs.length; i++) {
      const d = Math.abs(tapSec - clickSecs[i]);
      if (d < bestAbs) {
        bestAbs = d;
        best = i;
      }
    }
    if (best < warmup) return; // ウォームアップは採点しない
    const delta = (tapSec - clickSecs[best]) * 1000;
    if (Math.abs(delta) > intervalMs / 2) return; // 大外れは捨てる
    deltas.push(delta);
    setStatus(deps.t('calibrateTap', { n: deltas.length, total: target }));
    if (deltas.length >= target) finalize();
  }

  /** Screen-tap entry point (the pad's pointerdown). */
  function onTap(): void {
    if (!running) return;
    // Wrong input for this run. Say so rather than ignoring silently — a tap
    // that does nothing with no explanation reads as a broken button.
    if (source !== 'touch') {
      setStatus(deps.t('calibrateUseKeyboard'));
      return;
    }
    recordTap();
  }

  // 実行中: pointerdown = タップ（click に先行して発火するので低遅延）。
  // 待機中: click = 開始。タップ消費後の合成 click は swallowClick で潰す
  // （最終タップで running が落ちた直後の click が再開始してしまうため）。
  deps.dom.btn.addEventListener('pointerdown', () => {
    if (running) {
      swallowClick = true;
      onTap();
    }
  });
  deps.dom.btn.addEventListener('click', () => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (!running) void start();
  });

  /** Feed an instrument press in as a tap. Returns true when calibration was
   *  actually running and consumed it, so the caller knows not to also score
   *  the press. This is the MIDI entry point: calibrating with the instrument
   *  the player actually plays is the standard (Rocksmith calibrates from the
   *  guitar), because screen-touch input costs 20-50 ms against BLE-MIDI's ~5 ms
   *  — calibrating by touch and then playing on the keyboard bakes that
   *  difference in as permanent error — and because the player's own consistent
   *  bias then cancels, having been measured on the same input by the same
   *  person. */
  function tapFromInstrument(): boolean {
    if (!running) return false;
    if (source !== 'midi') {
      // Calibration was started without a keyboard attached, so this run is a
      // touch run. Consume the press anyway (it must not be scored) but do not
      // let it into the sample.
      setStatus(deps.t('calibrateUseTouch'));
      return true;
    }
    recordTap();
    return true;
  }

  return { start, stop, isRunning: () => running, onTap, tapFromInstrument };
}
