// Practice-tick — the per-frame hot path that walks the active section's
// note timeline, marks missed/auto-advanced notes, matches mic onsets,
// updates the progress HUD, and detects section completion.
// Phase 0d batch 8 extraction from legacy-app.js.
//
// Called from the main `loop()` once per frame whenever `practice.enabled`.
// Order of operations matters and is annotated inline:
//
//   1. Diagnostic log (1Hz, REMOTE_LOG_ENABLED only) — snapshot of cursor
//      / expected / next note for telemetry.
//   2. Auto-mark notes (rhythm: missed-when-window-expires; listen:
//      auto-advance to keep OSMD cursor synced with the audio).
//   3. Match an incoming mic onset to a note (only when no MIDI keyboard
//      is connected — MIDI scoring is fed via matchNoteOnset directly
//      from the Web MIDI noteOn handler, not from here).
//   4. Skip past resolved notes so the next-expected pointer keeps up.
//   5. Update progress HUD (rate-limited to 10Hz).
//   6. Section-complete detection → schedule completePracticeSection.
//
// Out of scope (stays in shell):
//   • completePracticeSection — touches scoring + unlocks + history +
//     progress persistence; tied to result-card render.
//   • drawPracticeLane — render concern, runs in the render-loop batch.
//   • The MIDI noteOn → matchNoteOnset path (chord-window dispatch).

/** Practice slice the tick reads + writes. */
export interface PracticeTickPracticeRef {
  enabled: boolean;
  /** ループ練習トグル — ON かつ非 listen ならセクション完了時に結果カード
   *  ではなく同セクションを即再スタートする。 */
  loopOn?: boolean;
  /** True while an explicit pause (settings panel / ⏸) holds the session.
   *  The tick skips entirely so the still-ticking AudioContext clock can't
   *  auto-miss the whole section behind a modal. */
  paused?: boolean;
  mode: string;
  sectionNotes: PracticeTickNote[];
  currentNoteIdx: number;
  hits: number;
  misses: number;
  sectionCombo: number;
  _completing: boolean;
  _completionTimer: ReturnType<typeof setTimeout> | null;
  _dbgNextLog?: number;
  _lastProgUpdate: number;
  _sectionTargetCount?: number;
}

/** Per-note shape touched by the tick. Mirrors the legacy
 *  OsmdLikeNote shape with only the fields the tick reads + writes. */
export interface PracticeTickNote {
  midi: number;
  timeMs: number;
  durMs: number;
  measureIdx?: number;
  inBarQuarters?: number;
  hit?: boolean;
  missed?: boolean;
  _filtered?: boolean;
}

/** MIDI input gate — when `enabled` is true, mic onsets are ignored
 *  for scoring. The MIDI noteOn handler feeds matchNoteOnset directly. */
export interface PracticeTickMidiInput {
  enabled: boolean;
}

/** OSMD cursor accessor — the tick reads `cursor.iterator.CurrentMeasureIndex`
 *  for the diagnostic log (the iterator is the source of truth for
 *  measure tracking now; no shadow counter in the shell). */
export interface PracticeTickOsmdRef {
  cursor?: {
    iterator?: {
      CurrentMeasureIndex?: number;
    };
  } | null;
}

export interface PracticeTickDom {
  /** Progress text display in the practice top-bar — '12 / 47'. */
  ptbProgress: HTMLElement;
}

export interface PracticeTickDeps {
  dom: PracticeTickDom;
  practice: PracticeTickPracticeRef;
  midiInput: PracticeTickMidiInput;
  /** Live OSMD instance for the cursor read-out (diagnostic only).
   *  May be null between section transitions. */
  getOsmd(): PracticeTickOsmdRef | null;
  /** Practice elapsed-ms accessor — driven by Tone.now() in the shell. */
  practiceElapsedMs(): number;
  /** Hit window in ms (PianoCore.HIT_WINDOW_MS). */
  hitWindowMs: number;
  /** Stable pitch helper — running median of recent samples. */
  medianRecentPitch(): number | null;
  /** Score an incoming onset against the note timeline. The chord-
   *  window forward-search is internal to the legacy implementation. */
  matchNoteOnset(detectedMidi: number, fromMidiInput: boolean): void;
  /** Show the floating chip ('miss' / 'perfect' / 'nice') in the HUD. */
  showHitChip(kind: 'miss' | 'perfect' | 'nice', label: string): void;
  /** i18n translator. */
  t(key: string): string;
  /** Section-complete handler — tick fires it after a 600ms grace
   *  timer to absorb any trailing notes. */
  completePracticeSection(): void;
  /** ループ用の同セクション再スタート（練習時間の記録も内包 — shell 配線）。
   *  未配線の旧シェルでは completePracticeSection にフォールバック。 */
  restartSectionForLoop?(): void;
  /** Guided つまずきヒント (P2-14) — 期待音をそっと鳴らす。 */
  playGuidedHint?(midi: number): void;
  /** Remote diagnostic logging. Provide a no-op when disabled to
   *  avoid the 1Hz dispatch overhead. */
  remoteLogEnabled: boolean;
  remoteLog(msg: string): void;
  /** Diagnostic helper that stringifies note state for the live
   *  playback-tick log (kept here as a callback so the shell can
   *  match the legacy emoji shorthand). */
  noteStateLabel(n: PracticeTickNote): string;
}

/** Guided で同じノートに止まったままヒント音を鳴らすまでの時間 (P2-14)。 */
const GUIDED_HINT_MS = 7000;

/** Build the tick closure. Returns the per-frame tick function. The
 *  shell stores it under the legacy `updatePractice` short name and
 *  calls it from inside the main render loop. */
export function createPracticeTick(
  deps: PracticeTickDeps
): (timeMs: number, isOnsetNote: boolean, pitchHz: number | null) => void {
  // Guided つまずき検出のクロージャ状態。ノート配列の identity 比較で
  // セクション再スタート（同じ idx=0 でも配列は作り直される）を検出する。
  let hintNotes: PracticeTickNote[] | null = null;
  let hintIdx = -1;
  let hintSince = 0;
  let lastTickMs = 0;
  return function updatePractice(
    timeMs: number,
    isOnsetNote: boolean,
    pitchHz: number | null
  ): void {
    if (!deps.practice.enabled || deps.practice.paused) return;
    const elapsed = deps.practiceElapsedMs();
    const notes = deps.practice.sectionNotes;
    const len = notes.length;

    // 1. DIAG — live playback tick, 1 Hz. Compact snapshot of cursor /
    //    expected / next so cursor-vs-note alignment regressions are
    //    visible in the remote log without flooding the channel.
    if (deps.remoteLogEnabled && len > 0) {
      const dbgNext = deps.practice._dbgNextLog;
      if (dbgNext === undefined || timeMs >= dbgNext) {
        deps.practice._dbgNextLog = timeMs + 1000;
        let expIdx = -1;
        for (let i = 0; i < len; i++) {
          if (notes[i].timeMs > elapsed) break;
          expIdx = i;
        }
        const exp = expIdx >= 0 ? notes[expIdx] : null;
        const next = expIdx + 1 < len ? notes[expIdx + 1] : null;
        let hit = 0,
          miss = 0,
          pend = 0;
        for (const n of notes) {
          if (n._filtered) continue;
          if (n.hit) hit++;
          else if (n.missed) miss++;
          else pend++;
        }
        const osmd = deps.getOsmd();
        const curM = osmd?.cursor?.iterator?.CurrentMeasureIndex ?? -1;
        deps.remoteLog(
          '[DIAG/play.tick] t=' +
            elapsed.toFixed(0) +
            'ms' +
            ' mode=' +
            deps.practice.mode +
            ' | progress hit=' +
            hit +
            ' miss=' +
            miss +
            ' pend=' +
            pend +
            '/' +
            len +
            ' curIdx=' +
            deps.practice.currentNoteIdx +
            ' | exp=' +
            (exp
              ? '{i=' +
                expIdx +
                ' t=' +
                exp.timeMs.toFixed(0) +
                ' m=' +
                exp.measureIdx +
                ' q=' +
                (exp.inBarQuarters ?? 0).toFixed(2) +
                ' midi=' +
                exp.midi +
                deps.noteStateLabel(exp) +
                ' dt=' +
                (elapsed - exp.timeMs).toFixed(0) +
                '}'
              : 'none') +
            ' next=' +
            (next
              ? '{i=' +
                (expIdx + 1) +
                ' t=' +
                next.timeMs.toFixed(0) +
                ' m=' +
                next.measureIdx +
                ' q=' +
                (next.inBarQuarters ?? 0).toFixed(2) +
                ' midi=' +
                next.midi +
                ' in=' +
                (next.timeMs - elapsed).toFixed(0) +
                '}'
              : 'none') +
            ' | cursor m=' +
            curM
        );
      }
    }

    // 2. Auto-mark notes by mode.
    //    - Rhythm: miss when the hit-window expires (Guided waits for
    //      input; Listen plays itself, so neither auto-misses).
    //    - Listen: auto-advance the cursor (mark `hit`, not `missed`)
    //      so the OSMD cursor + lane stay synced with the audio.
    if (deps.practice.mode === 'rhythm') {
      for (let i = deps.practice.currentNoteIdx; i < len; i++) {
        const n = notes[i];
        if (n.hit || n.missed) continue;
        if (elapsed > n.timeMs + deps.hitWindowMs) {
          n.missed = true;
          deps.practice.misses++;
          deps.practice.sectionCombo = 0;
          deps.showHitChip('miss', deps.t('missChip'));
        }
        if (n.timeMs - elapsed > deps.hitWindowMs) break;
      }
    } else if (deps.practice.mode === 'listen') {
      for (let i = deps.practice.currentNoteIdx; i < len; i++) {
        const n = notes[i];
        if (n.hit || n.missed) continue;
        if (elapsed >= n.timeMs) n.hit = true;
        else break;
      }
    }

    // 3. Match an incoming mic onset. While a MIDI keyboard is
    //    connected, mic is fully suppressed for *scoring* — sustained
    //    piano sound, ambient noise, or the kid's voice between MIDI
    //    presses can otherwise credit a wrong note (especially under
    //    the chord-forgiveness forward-search). Visualizer effects
    //    keep their own recency window (see drawMidiBeams path).
    if (!deps.midiInput.enabled && isOnsetNote && pitchHz != null && pitchHz > 0) {
      const stablePitch = deps.medianRecentPitch() || pitchHz;
      const detectedMidi = Math.round(12 * Math.log2(stablePitch / 440) + 69);
      deps.matchNoteOnset(detectedMidi, false);
    }

    // 4. Skip past resolved notes. The OSMD cursor follows
    //    currentNoteIdx via the per-frame sync in drawPracticeLane —
    //    no need to nudge it here (chord notes share an iterator
    //    step, so successive setOsmdCursorToNote calls within a
    //    chord are no-ops anyway).
    while (
      deps.practice.currentNoteIdx < len &&
      (notes[deps.practice.currentNoteIdx].hit || notes[deps.practice.currentNoteIdx].missed)
    ) {
      deps.practice.currentNoteIdx++;
    }

    // 4.5 Guided つまずきヒント (P2-14): 同じノートで 7 秒止まっていたら
    //     期待音をメロディシンセ（柔らかい sine）でそっと 1 回鳴らし、
    //     7 秒ごとに再アーム。ポーズ・タブ非表示による rAF ギャップは
    //     hintSince をスライドさせて「再開直後に即ヒント」を防ぐ。
    if (deps.practice.mode === 'guided' && deps.playGuidedHint) {
      const idx = deps.practice.currentNoteIdx;
      if (lastTickMs > 0 && timeMs - lastTickMs > 400) {
        hintSince += timeMs - lastTickMs;
      }
      if (notes !== hintNotes || idx !== hintIdx) {
        hintNotes = notes;
        hintIdx = idx;
        hintSince = timeMs;
      } else if (idx < len && elapsed > 0 && timeMs - hintSince >= GUIDED_HINT_MS) {
        deps.playGuidedHint(notes[idx].midi);
        hintSince = timeMs;
      }
    }
    lastTickMs = timeMs;

    // 5. Progress HUD — rate-limited to 10Hz.
    if (timeMs - deps.practice._lastProgUpdate > 100) {
      deps.practice._lastProgUpdate = timeMs;
      const target = deps.practice._sectionTargetCount || len;
      deps.dom.ptbProgress.textContent = deps.practice.hits + deps.practice.misses + ' / ' + target;
    }

    // 6. Section complete?
    let isComplete = deps.practice.currentNoteIdx >= len;
    if (!isComplete && deps.practice.mode !== 'guided') {
      const last = notes[len - 1];
      isComplete = !!(last && elapsed > last.timeMs + last.durMs + deps.hitWindowMs + 400);
    }
    if (!deps.practice._completing && isComplete) {
      deps.practice._completing = true;
      // Race guard: if the user taps "quit" / Home during this 600 ms,
      // we disabled practice but the timer would still fire and credit
      // the section. Re-check practice.enabled at fire time.
      deps.practice._completionTimer = setTimeout(() => {
        deps.practice._completionTimer = null;
        if (deps.practice.enabled && deps.practice._completing) {
          // ループ練習: 結果カードを出さず同セクションへ。listen は一回性の
          // 視聴なので通常完了（トグル自体も listen では非表示）。
          if (
            deps.practice.loopOn &&
            deps.practice.mode !== 'listen' &&
            deps.restartSectionForLoop
          ) {
            deps.practice._completing = false;
            deps.restartSectionForLoop();
          } else {
            deps.completePracticeSection();
          }
        }
      }, 600);
    }
  };
}
