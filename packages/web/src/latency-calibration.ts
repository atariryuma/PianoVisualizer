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
  onResult(medianMs: number): void;
  /** クリック間隔 (ms)。既定 600（=100BPM、子どもが合わせやすい速さ）。 */
  intervalMs?: number;
  /** 採点しないウォームアップクリック数。既定 2。 */
  warmupClicks?: number;
  /** 必要タップ数。既定 10（レビュー指示のまま）。 */
  tapTarget?: number;
}

export interface LatencyCalibration {
  start(): Promise<void>;
  /** 予約済みタイマー破棄 + 状態リセット（設定パネルを閉じたとき等）。 */
  stop(): void;
  isRunning(): boolean;
  /** テスト用に公開 — 実 UI では btn の pointerdown が呼ぶ。 */
  onTap(): void;
}

/** スライダーの可動域 (index.html の min/max/step と揃える)。 */
const OFFSET_MIN_MS = -50;
const OFFSET_MAX_MS = 200;
const OFFSET_STEP_MS = 5;

export function createLatencyCalibration(deps: LatencyCalibrationDeps): LatencyCalibration {
  const intervalMs = deps.intervalMs ?? 600;
  const warmup = deps.warmupClicks ?? 2;
  const target = deps.tapTarget ?? 10;

  let running = false;
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

  function stop(): void {
    running = false;
    clickSecs = [];
    deltas = [];
    if (endTimer) {
      clearTimeout(endTimer);
      endTimer = null;
    }
    deps.dom.btn.textContent = deps.t('calibrateBtn');
  }

  function finalize(): void {
    const n = deltas.length;
    if (n >= 4) {
      // 中央値 — 外れタップ（1 回の空振り・二度打ち）に頑健。
      const sorted = [...deltas].sort((a, b) => a - b);
      const mid = Math.floor(n / 2);
      const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const v = Math.max(
        OFFSET_MIN_MS,
        Math.min(OFFSET_MAX_MS, Math.round(median / OFFSET_STEP_MS) * OFFSET_STEP_MS)
      );
      stop();
      deps.onResult(v);
      setStatus(deps.t('calibrateDone', { v }));
    } else {
      stop();
      setStatus(deps.t('calibrateFail'));
    }
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
    deps.dom.btn.textContent = deps.t('calibrateTapHere');
    setStatus(deps.t('calibrateListen'));
    // クリック列の終端 + 余韻で自動終了（タップが集まりきらなくても、
    // 4 回以上あれば中央値で確定する）。
    const endMs = (t0 - Tone.now()) * 1000 + totalClicks * intervalMs + 800;
    endTimer = setTimeout(finalize, endMs);
  }

  function onTap(): void {
    if (!running) return;
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

  return { start, stop, isRunning: () => running, onTap };
}
