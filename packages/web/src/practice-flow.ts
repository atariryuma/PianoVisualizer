// Practice-flow controls — quit / retry / next / try-play / summary close
// + back-to-title navigation. Phase 0d batch 7b extraction from
// legacy-app.js.
//
// Scope (cohesive: "what happens between practice sections + back to
// title"):
//   • ptbQuit — quit during practice (cleanup audio + MIDI + wake-lock,
//     pop the song panel back open)
//   • ptbToggleOsmd — show/hide OSMD score overlay
//   • resQuit — close result card and return to song panel
//   • resRetry — restart current section
//   • resTryPlay — Listen-mode → "Try playing" shortcut (flips to Guided)
//   • resNext — advance to next unlocked section
//   • sumClose — close session summary modal
//   • homeBtn / sumHome / resHome — three "🏠 Title" buttons that all
//     call `returnToTitle()`
//
// Exposes `returnToTitle()` so the shell's "Back" button on the song
// panel can drive the same flow.
//
// Out of scope (lives in legacy-app.js / @piano/core):
//   • startPracticeSection (huge — Tone.Transport schedule + section
//     timeline build + OSMD cursor reset, see practice-tick batch)
//   • renderSongPanel (~150 lines, song-panel batch)
//   • stopPracticeAudio + releaseWakeLock (audio pipeline)
//   • resetSession (state-machine + free-play quest reset)
//
// Cross-section concurrency: `_practiceTransitioning` debounces double-
// tap on Retry / Next on slow iPads. Without it,
// `startPracticeSection` enters twice and the second call's Tone.Transport
// stop/cancel/schedule races the first's incomplete cleanup.

import type { Lang } from '@piano/core';

/** Practice slice — the controls touch transport + completion + per-hold
 *  state when the user quits or retries mid-section. */
export interface PracticeFlowPracticeRef {
  enabled: boolean;
  sectionIdx: number;
  mode: string;
  /** Written by the retry-with-support button (listen strategy). */
  fullSongMode?: boolean;
  /** Written by the retry-with-support button (one-hand strategy). */
  handFilter?: 'L' | 'R' | null;
  /** Written by the retry-with-support button (slow-tempo strategy). */
  tempoPct?: number;
  _completing: boolean;
  _completionTimer: ReturnType<typeof setTimeout> | null;
  /** Map<midi, OsmdLikeNote> — held notes; cleared on quit. */
  pendingHolds: { clear(): void };
  // Other practice fields exist; we only declare what this module reads.
}

/** Game-state slice used by `returnToTitle` to detect a live session. */
export interface PracticeFlowStateRef {
  running: boolean;
}

/** MIDI runtime slice — note-on tracking is cleared on quit so a
 *  "stuck key" from the previous section doesn't bleed into the next
 *  practice / free-play session. */
export interface PracticeFlowMidiRef {
  activeNotes: { clear(): void };
  sustainedNotes: { clear(): void };
}

/** Minimal song shape — only what the result-card "Next" button needs
 *  to validate the next section's unlock state. */
export interface PracticeFlowSong {
  sections: Array<{ id: string }>;
}

/** Per-song progress slice — `unlockedSections[id]` truthy means the
 *  next-section button can advance. */
export interface PracticeFlowSongProgress {
  unlockedSections: Record<string, unknown>;
}

/** DOM elements wired by the controls. */
export interface PracticeFlowDom {
  ptbQuit: HTMLElement;
  ptbToggleOsmd: HTMLElement;
  /** ⏸ 一時停止ボタン — 旧 DOM には無いので optional。 */
  ptbPause?: HTMLElement | null;
  resQuit: HTMLElement;
  resRetry: HTMLElement;
  /** "Retry with support" — applies the scaffold strategy published by
   *  result-card (dataset.strategy/tempo), then retries the section. */
  resRetrySlow?: HTMLElement | null;
  /** Speed trainer — result-card publishes dataset.tempo; this restarts the
   *  same section at that higher tempo. */
  resTempoUp?: HTMLElement | null;
  resTryPlay: HTMLElement | null;
  resNext: HTMLElement;
  sumClose: HTMLElement;
  homeBtn: HTMLElement;
  sumHome: HTMLElement;
  resHome: HTMLElement;
  practiceHud: HTMLElement;
  osmdContainer: HTMLElement;
  songPanel: HTMLElement;
  sectionResult: HTMLElement;
  sessionSummary: HTMLElement;
  hud: HTMLElement;
  questDisplay: HTMLElement;
  micMeter: HTMLElement;
  startScreen: HTMLElement;
}

export interface PracticeFlowDeps {
  dom: PracticeFlowDom;
  practice: PracticeFlowPracticeRef;
  state: PracticeFlowStateRef;
  midiState: PracticeFlowMidiRef;
  /** Live current-song reference for the Next button's section lookup. */
  getCurrentSong(): PracticeFlowSong | null;
  /** Per-song progress accessor (used to gate the Next button). */
  songProg(): PracticeFlowSongProgress;
  /** Restart / advance a section. Wraps Tone.Transport reset + OSMD
   *  cursor + section-notes rebuild. The shell's `startPracticeSection`. */
  startPracticeSection(sectionIdx: number): Promise<void>;
  /** Re-render the song-panel header + section list + tempo row +
   *  ghost/metronome/full-song toggles. */
  renderSongPanel(): void;
  /** Stop Tone.Transport + dispose scheduled events. */
  stopPracticeAudio(): void;
  /** Release the screen wake lock — sustained playing keeps it; on
   *  quit + return-to-title we drop it. */
  releaseWakeLock(): void;
  /** Hide the intro-hint pill (👻 ghost / mic-permission etc.). */
  hideIntroHint(): void;
  /** Stop the periodic MIDI rescan poller (started when the page loads). */
  stopMidiAutoRescan(): void;
  /** Reset the free-play session counters / quest progress. Called
   *  from sumClose and from returnToTitle when state.running. */
  resetSession(): void;
  /** Currently unused but kept for parity with legacy comment that
   *  references lang re-rendering on title return. */
  getLang?(): Lang;
  /** 明示ポーズ (⏸ ボタン)。practice-visibility の explicitHold ラッチを
   *  操作する。設定パネルと同じ経路（shell-midi 経由）。 */
  pausePractice?(): void;
  resumePractice?(): void;
  isPracticePaused?(): boolean;
  /** i18n — ⏸ ボタンのラベル切り替え用（pausePractice / resumePractice）。 */
  t?(key: string): string;
}

export interface PracticeFlow {
  /** Programmatic back-to-title — used by song-panel "Back" button. */
  returnToTitle(): void;
  /** Re-entrancy-guarded section transition. Used by Retry, Try-Play,
   *  and Next handlers. */
  transitionToSection(idx: number): Promise<void>;
}

/** Wire all practice-flow controls. Returns `{ returnToTitle,
 *  transitionToSection }` so callers (song-panel Back, future modules)
 *  can drive the same flows. All listener wiring is internal — call
 *  this once during shell bootstrap. */
export function createPracticeFlow(deps: PracticeFlowDeps): PracticeFlow {
  let transitioning = false;

  /** ⏸ ボタンの表示を実ポーズ状態に同期。設定パネル経由の resume で
   *  状態が変わることもあるため、window の practicepausechange でも呼ぶ。 */
  function syncPauseBtn(): void {
    const btn = deps.dom.ptbPause;
    if (!btn) return;
    const paused = !!deps.isPracticePaused?.();
    btn.textContent = paused ? '▶' : '⏸';
    const key = paused ? 'resumePractice' : 'pausePractice';
    btn.setAttribute('data-i18n-title', key);
    const label = deps.t ? deps.t(key) : key;
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', label);
  }

  async function transitionToSection(idx: number): Promise<void> {
    if (transitioning) return;
    transitioning = true;
    try {
      // 完了 600ms 猶予内に ⏸ された等でラッチが残っていると、次セクションの
      // tick が永久にスキップされる。遷移前に必ずクリアする。
      deps.resumePractice?.();
      syncPauseBtn();
      await deps.startPracticeSection(idx);
    } finally {
      transitioning = false;
    }
  }

  function returnToTitle(): void {
    // 明示ポーズのラッチを解除（Transport は直後の stopPracticeAudio が止める）。
    deps.resumePractice?.();
    syncPauseBtn();
    if (deps.practice.enabled || deps.practice._completing) {
      deps.practice.enabled = false;
      deps.practice._completing = false;
      if (deps.practice._completionTimer) {
        clearTimeout(deps.practice._completionTimer);
        deps.practice._completionTimer = null;
      }
      try {
        deps.stopPracticeAudio();
      } catch {
        /* already stopped */
      }
      try {
        deps.releaseWakeLock();
      } catch {
        /* never acquired */
      }
    }
    deps.dom.songPanel.classList.remove('visible');
    deps.dom.sessionSummary.classList.remove('visible');
    deps.dom.sectionResult.classList.remove('visible');
    deps.dom.practiceHud.classList.remove('visible');
    deps.dom.osmdContainer.classList.remove('visible');
    deps.dom.hud.style.display = 'none';
    // Wipe stale free-play quest UI.
    deps.dom.questDisplay.classList.remove('visible');
    deps.hideIntroHint();
    deps.dom.micMeter.classList.remove('visible');
    deps.stopMidiAutoRescan();
    // Returning to title resets the dismiss state so the intro guidance
    // (BLE pairing prompt etc.) shows again on next launch.
    if (deps.state.running) deps.resetSession();
    deps.dom.startScreen.style.display = 'flex';
    document.body.classList.add('title-screen');
  }

  // ─── ptbPause (⏸ 一時停止 / ▶ 再開) ──────────────────────────────
  deps.dom.ptbPause?.addEventListener('click', () => {
    if (!deps.practice.enabled) return;
    if (deps.isPracticePaused?.()) deps.resumePractice?.();
    else deps.pausePractice?.();
    syncPauseBtn();
  });
  // 設定パネル経由の pause/resume でも表示を同期（bootstrap がイベントを発火）。
  window.addEventListener('practicepausechange', syncPauseBtn);

  // ─── ptbQuit (during-practice quit) ───────────────────────────────
  deps.dom.ptbQuit.addEventListener('click', () => {
    if (!deps.practice.enabled && !deps.practice._completing) return;
    // ポーズ中の quit でもラッチが残らないよう先に解除。
    deps.resumePractice?.();
    syncPauseBtn();
    deps.practice.enabled = false;
    // Cancel the in-flight section-complete timer so a quit during the
    // 600 ms grace doesn't credit progress for an abandoned section.
    if (deps.practice._completionTimer) {
      clearTimeout(deps.practice._completionTimer);
      deps.practice._completionTimer = null;
      deps.practice._completing = false;
    }
    deps.stopPracticeAudio();
    deps.releaseWakeLock();
    // Clear any keys still held when bailing out of practice mode.
    deps.midiState.activeNotes.clear();
    deps.midiState.sustainedNotes.clear();
    deps.practice.pendingHolds.clear();
    deps.dom.practiceHud.classList.remove('visible');
    deps.dom.osmdContainer.classList.remove('visible');
    deps.dom.songPanel.classList.add('visible');
    deps.renderSongPanel();
  });

  // ─── ptbToggleOsmd (score overlay show/hide) ─────────────────────
  deps.dom.ptbToggleOsmd.addEventListener('click', () => {
    deps.dom.osmdContainer.classList.toggle('visible');
  });

  // ─── result-card buttons ──────────────────────────────────────────
  deps.dom.resQuit.addEventListener('click', () => {
    // 明示ポーズのラッチ/凍結クロックを解除（他の出口 returnToTitle/ptbQuit は
    // 呼ぶが resQuit だけ抜けていた。完了猶予600ms中にポーズ→タイマー発火で
    // 結果カードが出た場合、ここを通らないと explicitHold/paused/_frozen が残留）。
    deps.resumePractice?.();
    deps.dom.sectionResult.classList.remove('visible');
    deps.dom.practiceHud.classList.remove('visible');
    deps.dom.osmdContainer.classList.remove('visible');
    deps.dom.songPanel.classList.add('visible');
    deps.renderSongPanel();
  });
  deps.dom.resRetry.addEventListener('click', () => {
    deps.dom.sectionResult.classList.remove('visible');
    void transitionToSection(deps.practice.sectionIdx);
  });
  // "Retry with support" (0★のみ表示) — result-card が dataset に載せた
  // スキャフォールド戦略を適用して同セクションを再開。song-panel の手動
  // 行と同じ副作用フリーな書き込みなので、子どもは後から自由に変えられる。
  deps.dom.resRetrySlow?.addEventListener('click', () => {
    const btn = deps.dom.resRetrySlow as HTMLElement & { dataset: DOMStringMap };
    const strategy = btn.dataset.strategy;
    if (strategy === 'listen') {
      deps.practice.mode = 'listen';
      deps.practice.fullSongMode = false;
    } else if (strategy === 'oneHand') {
      deps.practice.handFilter = 'R';
    } else if (strategy === 'slowTempo') {
      const tempo = parseInt(btn.dataset.tempo || '', 10);
      if (Number.isFinite(tempo) && tempo > 0) deps.practice.tempoPct = tempo;
    }
    deps.dom.sectionResult.classList.remove('visible');
    void transitionToSection(deps.practice.sectionIdx);
  });
  // Speed trainer — "🚀 climb to the next tempo" (cleared runs). Sets the
  // higher tempo published by result-card and retries the same section. Same
  // side-effect-free write as the manual tempo row; the kid can still change
  // it by hand afterwards. Achievement-gated, no time pressure.
  deps.dom.resTempoUp?.addEventListener('click', () => {
    const btn = deps.dom.resTempoUp as HTMLElement & { dataset: DOMStringMap };
    const tempo = parseInt(btn.dataset.tempo || '', 10);
    if (Number.isFinite(tempo) && tempo > 0) deps.practice.tempoPct = tempo;
    deps.dom.sectionResult.classList.remove('visible');
    void transitionToSection(deps.practice.sectionIdx);
  });
  // Listen-mode → "Try playing" shortcut: same section, but switch to Guided.
  deps.dom.resTryPlay?.addEventListener('click', () => {
    deps.dom.sectionResult.classList.remove('visible');
    deps.practice.mode = 'guided';
    void transitionToSection(deps.practice.sectionIdx);
  });
  deps.dom.resNext.addEventListener('click', () => {
    const song = deps.getCurrentSong();
    if (!song) return;
    const nextIdx = Math.min(deps.practice.sectionIdx + 1, song.sections.length - 1);
    const nextId = song.sections[nextIdx].id;
    if (!deps.songProg().unlockedSections[nextId]) return;
    deps.practice.sectionIdx = nextIdx;
    deps.dom.sectionResult.classList.remove('visible');
    void transitionToSection(nextIdx);
  });

  // ─── session summary close ────────────────────────────────────────
  deps.dom.sumClose.addEventListener('click', () => {
    deps.dom.sessionSummary.classList.remove('visible');
    deps.resetSession();
  });

  // ─── 🏠 Title buttons ─────────────────────────────────────────────
  deps.dom.homeBtn.addEventListener('click', returnToTitle);
  deps.dom.sumHome.addEventListener('click', returnToTitle);
  deps.dom.resHome.addEventListener('click', returnToTitle);

  return { returnToTitle, transitionToSection };
}
