// Practice visibility policy.
//
// Browser backgrounding pauses rAF, but Web Audio's clock can keep
// advancing. If the practice clock is derived directly from that clock,
// the next visible frame can skip hundreds of notes. The policy here is
// simple: freeze the practice timeline on hidden, pause Tone.Transport
// when it is running, then resume from the same musical elapsed time.

export interface PracticeVisibilityPracticeRef {
  enabled: boolean;
  startAudioTime: number;
  /** Set true while an explicit pause (settings panel / ⏸ button) holds
   *  the session. practice-tick reads this to skip auto-miss + cursor
   *  advance so the AudioContext clock (which keeps ticking) can't drain
   *  the section behind a modal. */
  paused?: boolean;
  /** 再開リワインドの対象判定に読む（guided はクロックが待つので不要）。 */
  mode?: string;
  _cursorScanIdx?: number;
  _lastCursorNoteIdx?: number;
  /** リワインド時に 0 へ戻す — レーンの償却カーソルは前進専用なので、
   *  巻き戻した区間のタイルを再描画させるには再スキャンが要る。 */
  laneDrawFromIdx?: number;
  /** 凍結中の生（オフセット前）経過ms。practiceRealElapsedMs が読み、
   *  これが非 null の間だけ経過クロックが凍結する（両バグの根治点）。 */
  _frozenRealElapsedMs?: number | null;
}

export interface PracticeVisibilityToneRef {
  now?: () => number;
  context?: { currentTime?: number };
  Transport?: {
    state?: string;
    pause?: () => void;
    start?: (time?: number | string) => void;
    /** Transport 再生位置（秒）。リワインド再開で書き戻す。 */
    seconds?: number;
  };
}

export interface PracticeVisibilityDeps {
  practice: PracticeVisibilityPracticeRef;
  getTone: () => PracticeVisibilityToneRef | undefined | null;
  resumeLeadSec?: number;
  /** 再開リワインド量（ms）— ポーズ/バックグラウンド復帰時に、走行中の
   *  タイムライン（rhythm / listen）を数拍ぶん巻き戻して助走を作る
   *  （業界標準の resume runway — Rocksmith / Clone Hero 系）。巻き戻した
   *  区間の未解決ノートは再挑戦できる。省略 / 0 = 従来どおり即時再開。
   *  guided はクロックがノートを待つ設計なので常に対象外。 */
  getResumeRewindMs?: () => number;
  log?: (msg: string) => void;
}

export interface PracticeVisibilityController {
  /** Tab hidden — freeze the clock + pause Transport. No-op if already frozen. */
  onHidden(): void;
  /** Tab visible — resume, UNLESS an explicit pause still holds the
   *  session (a tab refocus mid-settings-panel must not un-pause). */
  onVisible(): void;
  /** Explicit pause (settings panel opened / ⏸ pressed). Freezes like
   *  onHidden AND sets practice.paused + an explicit-hold latch so a
   *  tab-visible event can't resume until resume() is called. */
  pause(): void;
  /** Explicit resume (settings panel closed / ▶ pressed). Clears the
   *  latch, rebases the clock, restarts Transport, clears practice.paused. */
  resume(): void;
  /** True while an explicit pause holds the session. */
  isPaused(): boolean;
}

const DEFAULT_RESUME_LEAD_SEC = 0.05;

export function createPracticeVisibilityController(
  deps: PracticeVisibilityDeps
): PracticeVisibilityController {
  const log = deps.log ?? ((m: string) => console.log(m));
  const resumeLeadSec = deps.resumeLeadSec ?? DEFAULT_RESUME_LEAD_SEC;
  let frozen: {
    elapsedSec: number;
    transportWasStarted: boolean;
  } | null = null;
  /** Latch set by pause(); an explicit pause survives tab visibility
   *  events (a refocus while the settings panel is open must not resume). */
  let explicitHold = false;

  function toneNowSec(tone: PracticeVisibilityToneRef | undefined | null): number {
    const ctxNow = tone?.context?.currentTime;
    if (typeof ctxNow === 'number' && Number.isFinite(ctxNow)) return ctxNow;
    const now = tone?.now?.();
    if (typeof now === 'number' && Number.isFinite(now)) return now;
    return performance.now() / 1000;
  }

  /** Freeze the practice timeline + pause Transport. Idempotent (guarded
   *  by `frozen`). Shared by tab-hidden and explicit pause. */
  function freeze(reason: string): void {
    if (!deps.practice.enabled || frozen) return;
    const tone = deps.getTone();
    const nowSec = toneNowSec(tone);
    // タイムライン未開始（startAudioTime が未来 = start-practice-section の
    // センチネル PRE_AUDIO_ANCHOR_SEC や、`await Tone.start()` 前・開始リード中）
    // では freeze しない。ここで凍らせると elapsed=0 の偽スナップショット＋
    // transportWasStarted=false を掴み、await 解決後に Transport が起動して
    // 「音だけ進み視覚は 0 に凍る」恒常デシンクになる（凍らせるものがまだ無い）。
    if (nowSec < (deps.practice.startAudioTime || 0)) return;
    const elapsedSec = Math.max(0, nowSec - (deps.practice.startAudioTime || 0));
    const transportWasStarted = tone?.Transport?.state === 'started';

    frozen = { elapsedSec, transportWasStarted };
    // 経過クロックを凍結（生値。オフセットは practiceRealElapsedMs 側で引く）。
    // これでポーズ中にレーン/カーソル/laneDrawFromIdx/採点が前進しない。
    deps.practice._frozenRealElapsedMs = elapsedSec * 1000;

    if (transportWasStarted && typeof tone?.Transport?.pause === 'function') {
      try {
        tone.Transport.pause();
      } catch {
        /* best-effort; the clock freeze below is still authoritative */
      }
    }

    log(
      '[PRACTICE-VISIBILITY] ' +
        reason +
        ' freeze ' +
        JSON.stringify({
          elapsedMs: Math.round(elapsedSec * 1000),
          transportWasStarted,
        })
    );
  }

  /** Rebase the clock from the frozen elapsed + restart Transport.
   *  Idempotent (guarded by `frozen`). Shared by tab-visible and resume. */
  function thaw(reason: string): void {
    if (!frozen) return;
    // セッションが既に終わっている（完了/quit 済み）なら、stale な凍結
    // 時刻で startAudioTime をリベースしたり空の Transport を再開したり
    // しない。凍結スナップショットは黙って破棄する。
    if (!deps.practice.enabled) {
      frozen = null;
      deps.practice._frozenRealElapsedMs = null;
      log('[PRACTICE-VISIBILITY] ' + reason + ' thaw skipped (practice disabled)');
      return;
    }
    const tone = deps.getTone();
    const leadSec = frozen.transportWasStarted ? resumeLeadSec : 0;
    const resumeAtSec = toneNowSec(tone) + leadSec;

    // 再開リワインド（resume runway）: 走行中タイムライン（Transport が
    // 動いていた = rhythm/listen）なら数拍巻き戻して助走を作る。ゴースト/
    // メトロノームの Transport イベントも同区間だけ再発火するので音と視覚が
    // 揃ったまま戻る。guided はノートが待つのでリワインド不要。
    const rewindMs =
      frozen.transportWasStarted && deps.practice.mode !== 'guided'
        ? Math.max(0, deps.getResumeRewindMs?.() ?? 0)
        : 0;
    const rewindSec = Math.min(frozen.elapsedSec, rewindMs / 1000);
    const elapsedSec = frozen.elapsedSec - rewindSec;

    deps.practice.startAudioTime = resumeAtSec - elapsedSec;
    if (rewindSec > 0) {
      // 前進専用の償却カーソルを全部リセット — 巻き戻した区間のタイル/
      // OSMD カーソルを再走査させる（次フレームで安価に追い付く）。
      deps.practice.laneDrawFromIdx = 0;
      deps.practice._cursorScanIdx = 0;
      deps.practice._lastCursorNoteIdx = -1;
    } else {
      // Keep the amortized scanner coherent with the frozen time. The next
      // frame will scan from the old index unless the elapsed time regressed.
      deps.practice._cursorScanIdx =
        deps.practice._lastCursorNoteIdx ?? deps.practice._cursorScanIdx;
    }

    if (frozen.transportWasStarted && typeof tone?.Transport?.start === 'function') {
      try {
        if (rewindSec > 0 && tone.Transport && typeof tone.Transport.seconds === 'number') {
          tone.Transport.seconds = elapsedSec;
        }
        tone.Transport.start(resumeAtSec);
      } catch {
        /* user gesture / platform recovery may require a manual restart */
      }
    }

    log(
      '[PRACTICE-VISIBILITY] ' +
        reason +
        ' resume ' +
        JSON.stringify({
          elapsedMs: Math.round(frozen.elapsedSec * 1000),
          rewindMs: Math.round(rewindSec * 1000),
          leadMs: Math.round(leadSec * 1000),
          transportResumed: frozen.transportWasStarted,
        })
    );
    frozen = null;
    // クロック解凍。startAudioTime は上でリベース済みなので、
    // 次フレームの practiceRealElapsedMs は凍結値から途切れず継続する。
    deps.practice._frozenRealElapsedMs = null;
  }

  function onHidden(): void {
    freeze('hidden');
  }

  function onVisible(): void {
    // A tab refocus while an explicit pause holds the session must NOT
    // resume — the settings panel / ⏸ is still up.
    if (explicitHold) return;
    thaw('visible');
  }

  function pause(): void {
    // Only hold a session that's actually running — the settings panel can
    // also be opened on the title / song-panel / result card, where there's
    // nothing to pause and setting practice.paused would be stray state.
    if (explicitHold || !deps.practice.enabled) return;
    explicitHold = true;
    deps.practice.paused = true;
    freeze('pause');
  }

  function resume(): void {
    if (!explicitHold) return;
    explicitHold = false;
    deps.practice.paused = false;
    // enabled=false のとき thaw は凍結を破棄するだけ（クロック不変）。
    thaw('resume');
  }

  return { onHidden, onVisible, pause, resume, isPaused: () => explicitHold };
}
