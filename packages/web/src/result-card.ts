// Section result card — Phase 0d batch 10 extraction from legacy-app.js.
//
// Three cohesive functions covering "what happens after the kid finishes
// (or auto-finishes) a section":
//
//   • completePracticeSection() — called from the practice-tick's
//     section-complete grace timer. Stops audio, scores the run
//     (accPct / timingPct / durPct → stars), persists to per-song
//     progress, fires unlock gating (tempo / next section / streak),
//     records a daily streak entry, snapshots the result for re-render
//     on language change, then hands off to renderResultCard +
//     drawHistoryChart for visual presentation.
//
//   • renderResultCard() — paints the result modal from the cached
//     `practice._lastResult`. Idempotent — also called from the global
//     langchange listener so a JP↔EN flip while the card is visible
//     re-renders the localized strings without re-running scoring.
//
//   • drawHistoryChart(canvas, history) — line graph of the last 8
//     attempts' accuracy, with star halos for ≥3-star clears, current
//     value label, and a colored trend delta vs the previous run.

import { FULL_SONG_SECTION_ID } from '@piano/core';
import type { PracticeMode, SectionFocus } from '@piano/core';

/** Sentinel `getStretchSongId()` returns at endgame (every touched song maxed
 *  out) so the stretch button routes to "add more songs" instead of vanishing
 *  — the old dead-end. Not a real song id; shell-ui intercepts it. */
export const ADD_SONG_SENTINEL = '__addsong';

/** Practice slice the module reads + writes. */
export interface ResultCardPracticeRef {
  enabled: boolean;
  mode: PracticeMode;
  sectionIdx: number;
  fullSongMode: boolean;
  tempoPct: number;
  /** One-hand filter — read so the retry-with-support button doesn't
   *  suggest "right hand only" when a hand filter is already active. */
  handFilter?: 'L' | 'R' | null;
  hits: number;
  misses: number;
  /** 誤打カウント（rhythm × MIDI）— 0 超で事実行を表示（減点なし）。 */
  extraPresses?: number;
  sectionCombo: number;
  sectionBestCombo: number;
  timingScoreSum: number;
  durationScoreSum: number;
  durationScoredCount: number;
  _completing: boolean;
  _sectionTargetCount?: number;
  pendingHolds: { clear(): void };
  progress: { streakCount?: number } | null;
  _lastResult: ResultSnapshot | null;
}

/** Snapshot retained on `practice._lastResult` so renderResultCard can
 *  re-paint on a language change without re-running scoring. */
export interface ResultSnapshot {
  mode: PracticeMode;
  secId: string;
  fullSong?: boolean;
  stars: number;
  unlockedTempo: number | null;
  unlockedSecKey: string | null;
  streakDays: number | null;
  /** Trailing run of 0-star attempts ending at this one. >=2 escalates
   *  the tier0 copy to gentler "tough section" framing + Listen hint. */
  zeroStarStreak?: number;
  /** Knowledge-of-Performance coaching for this run (strength + next step
   *  + which stat row to emphasise). null on ★3 (mastery — celebrate, don't
   *  coach) and on listen/guided. Retained so a langchange re-render keeps
   *  the tip without re-scoring. */
  focus?: SectionFocus | null;
  /** One-tap "retry with support" strategy shown on a 0-star scored run
   *  (listen-first / one-hand / slower tempo — from planSectionScaffold).
   *  null/undefined hides the button. Snapshot-retained for langchange. */
  retryStrategy?: 'listen' | 'oneHand' | 'slowTempo' | null;
  /** Resolved slower tempo (%) when retryStrategy === 'slowTempo'. */
  retryTempo?: number | null;
  /** Tempo % the section was just played at — drives the speed-trainer
   *  step-up button (planTempoStepUp). Snapshot-retained so a langchange
   *  re-render recomputes against the played tempo, not a since-changed one. */
  tempoPct?: number;
}

export interface ResultCardSection {
  id: string;
  nameKey: string;
  isBoss?: boolean;
}

export interface ResultCardSong {
  id: string;
  titleKey: string;
  sections: ResultCardSection[];
}

/** Per-song progress slice the module reads + writes. */
export interface ResultCardSongProgress {
  unlockedTempos: Record<number, boolean>;
  unlockedSections: Record<string, boolean>;
  sections: Record<string, { stars: number; bestPct: number; bestCombo?: number } | undefined>;
  history: Record<string, Array<{ d: number; a: number; t: number; s: number; tempoPct?: number }>>;
}

/** Tier shape returned by PianoCore.resolveResultTier. */
export interface ResultTier {
  titleKey: string;
  msgKey: string;
}

/** Unlocks bag returned by PianoCore.computeUnlocks. */
export interface UnlocksResult {
  unlockedTempo: number | null;
  unlockedSecKey: string | null;
  streakDays: number | null;
}

/** DOM elements the module touches. */
export interface ResultCardDom {
  sectionResult: HTMLElement;
  resTitle: HTMLElement;
  resSectionName: HTMLElement;
  resStars: HTMLElement;
  resAcc: HTMLElement;
  resTiming: HTMLElement;
  resDuration: HTMLElement;
  resDurationRow: HTMLElement | null;
  resCombo: HTMLElement;
  /** 誤打の事実行（rhythm のみ・0 は非表示）。optional — 旧 DOM 互換。 */
  resExtraRow?: HTMLElement | null;
  resExtra?: HTMLElement | null;
  resMsg: HTMLElement;
  /** Knowledge-of-Performance coaching line (strength + next step). Optional
   *  so partial-DOM tests and older shells degrade gracefully. */
  resFocus?: HTMLElement | null;
  resUnlock: HTMLElement;
  // Self-assessment (SRL reflection) — all optional so the card still renders
  // if the block is absent.
  resSelfAssess?: HTMLElement | null;
  resFeelTricky?: HTMLElement | null;
  resFeelOk?: HTMLElement | null;
  resFeelGreat?: HTMLElement | null;
  resFeelResult?: HTMLElement | null;
  resHistoryWrap: HTMLElement | null;
  resHistoryChart: HTMLCanvasElement;
  resNext: HTMLElement;
  resStretch: HTMLElement | null;
  resTryPlay: HTMLElement | null;
  /** "Retry with support" one-tap button (0-star scored runs). Optional so
   *  partial-DOM tests degrade gracefully. Click is wired in practice-flow;
   *  this module only sets label + dataset.strategy/tempo + visibility. */
  resRetrySlow?: HTMLElement | null;
  /** Speed-trainer "climb to the next tempo" one-tap button (shown on a
   *  cleared run below 100%). Click wired in practice-flow; this module sets
   *  label + dataset.tempo + visibility. Optional for partial-DOM tests. */
  resTempoUp?: HTMLElement | null;
}

export interface ResultCardDeps {
  dom: ResultCardDom;
  practice: ResultCardPracticeRef;
  /** Live current-song accessor (returns null between selections). */
  getCurrentSong(): ResultCardSong | null;
  /** Per-song progress accessor — fresh slice for each completion so
   *  star + unlock state writes go to the right place. */
  songProg(): ResultCardSongProgress;
  /** Static list of section IDs in playback order (e.g.
   *  `['a1', 'b', 'a2']`). Used for next-section gating. */
  sectionIds: string[];
  /** Stop Tone.Transport + dispose scheduled events. */
  stopPracticeAudio(): void;
  /** Release the screen wake lock. */
  releaseWakeLock(): void;
  /** Record a practice day for the streak counter. */
  recordPracticeDay(): void;
  /** Accumulate this attempt's practice time onto today's minutes bucket
   *  (shell computes elapsed + persists). Called once per completion, all
   *  modes — listening time is practice time too. Optional so older
   *  shells / partial tests degrade to no tracking. */
  recordPracticeMinutes?(): void;
  /** Persist progress to localStorage. */
  savePracticeProgress(): void;
  /** Compute the star count from accPct / timingPct / durPct
   *  (PianoCore.computeStars). */
  computeStars(accPct: number, timingPct: number, durPct: number | null): number;
  /** Resolve the result tier from a star count
   *  (PianoCore.resolveResultTier). */
  resolveResultTier(stars: number): ResultTier;
  /** Pick the Knowledge-of-Performance coaching for a scored run
   *  (PianoCore.pickSectionFocus). Returns null on ★3. */
  pickSectionFocus(
    accPct: number,
    timingPct: number,
    durPct: number | null,
    stars: number
  ): SectionFocus | null;
  /** Scaffold planner (PianoCore.planSectionScaffold) — drives the
   *  "retry with support" strategy on a 0-star run. Optional so older
   *  shells / partial tests degrade to no button. */
  planSectionScaffold?(history: ReadonlyArray<{ a: number; s: number }>): {
    show: boolean;
    depth: number;
    strategy: 'listen' | 'oneHand' | 'slowTempo';
  };
  /** Tempo tiers (PianoCore.TEMPO_TIERS, slowest first) + unlock check —
   *  used to resolve the slower-tempo retry target. Optional with
   *  planSectionScaffold. */
  tempoTiers?: readonly number[];
  /** Speed trainer (PianoCore.planTempoStepUp) — next tempo tier to offer on
   *  a cleared run, or null. Optional so partial-DOM tests degrade to no
   *  button. */
  planTempoStepUp?(currentTempoPct: number, stars: number): number | null;
  /** Decide which unlocks fire (PianoCore.computeUnlocks — pure). */
  computeUnlocks(args: {
    stars: number;
    tempoPct: number;
    sectionId: string;
    sectionIds: string[];
    sectionNameKeys: Record<string, string>;
    unlockedTempos: Record<number, boolean>;
    unlockedSections: Record<string, boolean>;
    streakCount: number;
  }): UnlocksResult;
  /** Particle/visual effects fired on star milestones. */
  effectGoldenBurst(): void;
  effectStarShower(count: number): void;
  effectFlowerBurst(): void;
  /** Milestone piano fanfare for a full-song clear (result screen only —
   *  same design rule as playStampCelebration: no gameplay SE). Optional so
   *  partial-DOM tests / older shells degrade to silence. */
  playSongClear?(): void;
  /** HiDPI canvas setup helper. */
  setupHiDPICanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D;
  /** [0..1] clamp helper (PianoCore.clamp01). */
  clamp01(v: number): number;
  /** i18n translator. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** When true, completePracticeSection writes a [DIAG-FULLSONG]
   *  line on the listen+fullSong path so we can spot whether the
   *  fullSongMode flag is being reset (or persisted into the next
   *  selectSong). Production: false. */
  remoteLogEnabled?: boolean;
  /** Optional hook fired once per attempt after progress is persisted.
   *  Shell uses it to evaluate stamps + paint meta-progression UI. */
  onSectionAttemptDone?: (input: AttemptCompletionInput) => readonly string[];
  /** Optional: returns a song ID *other than the current one* the kid
   *  could try next, for the result-card's "Stretch piece" button.
   *  Returns null when no candidate. Shell wires from journal-modal's
   *  pickNearCompletion across the library. */
  getStretchSongId?: () => string | null;
}

export interface AttemptCompletionInput {
  /** The song id whose progress was just written. */
  songId: string;
  /** Section id within that song. */
  sectionId: string;
  /** Final star count awarded this attempt (0–3). */
  stars: number;
  /** Hit percentage 0–100. */
  accPct: number;
  /** Tempo tier used (60/75/90/100). */
  tempoPct: number;
  /** Mid-section best combo run (sectionBestCombo). */
  sectionBestCombo: number;
  /** True for listen-mode attempts — completion stamps gate on this. */
  isListenMode: boolean;
  /** Stars THIS section had before this attempt landed. */
  priorStars: number;
  /** bestPct THIS section had before this attempt landed. */
  priorBestPct: number;
}

export interface ResultCard {
  /** Re-paint the result modal from the cached snapshot. Idempotent —
   *  safe to call from langchange. No-ops when there's no snapshot yet. */
  renderResultCard(): void;
  /** Section-complete handler — called from the practice-tick after the
   *  600ms grace timer. Idempotent on the audio-stop path; the caller
   *  guarantees `practice.enabled` was true when scheduled. */
  completePracticeSection(): void;
}

export function createResultCard(deps: ResultCardDeps): ResultCard {
  // The stat row to emphasise is the `.result-stat` ancestor of each value
  // span. Map a focus dimension to that row element.
  const focusRowFor = (dim: SectionFocus['focusDim']): HTMLElement | null => {
    const span =
      dim === 'accuracy'
        ? deps.dom.resAcc
        : dim === 'timing'
          ? deps.dom.resTiming
          : deps.dom.resDuration;
    return (span?.closest?.('.result-stat') as HTMLElement | null) ?? span?.parentElement ?? null;
  };

  /** Clear the coaching line + any row emphasis. Idempotent — called on
   *  every render so listen/guided/★3 cards never inherit a stale tip. */
  const clearFocus = (): void => {
    for (const dim of ['accuracy', 'timing', 'duration'] as const) {
      focusRowFor(dim)?.classList.remove('focus-row');
    }
    if (deps.dom.resFocus) {
      deps.dom.resFocus.textContent = '';
      deps.dom.resFocus.style.display = 'none';
    }
  };

  /** Paint the strength + next-step line and tint the matching stat row. */
  const applyFocus = (focus: SectionFocus): void => {
    if (deps.dom.resFocus) {
      deps.dom.resFocus.textContent = deps.t('sectionFocusFmt', {
        s: deps.t(focus.strengthKey),
        f: deps.t(focus.focusKey),
      });
      deps.dom.resFocus.style.display = '';
    }
    focusRowFor(focus.focusDim)?.classList.add('focus-row');
  };

  // ── Self-assessment (self-regulated-learning reflection) ──
  // One optional, non-persisted tap. The choice lives only in this closure
  // and resets per new result, so nothing is stored about the child's mood
  // (kid-initiated reflection, not surveillance). Listeners attach once.
  type FeelRating = 'tricky' | 'ok' | 'great';
  let selfAssessChoice: FeelRating | null = null;
  const feelButtons: Array<{ rating: FeelRating; el?: HTMLElement | null }> = [
    { rating: 'tricky', el: deps.dom.resFeelTricky },
    { rating: 'ok', el: deps.dom.resFeelOk },
    { rating: 'great', el: deps.dom.resFeelGreat },
  ];

  /** Which reply to show. The "Win" variants (which reference doing well)
   *  fire only on a scored run that actually cleared (★2+); every other path
   *  uses a reply that makes no score claim, so it's safe for guided/listen
   *  and never contradicts a kid who felt great on a low score. */
  const replyKeyFor = (rating: FeelRating, r: ResultSnapshot | null): string => {
    const cleared = r?.mode === 'rhythm' && (r?.stars ?? 0) >= 2;
    if (rating === 'tricky') return cleared ? 'selfAssessReplyTrickyWin' : 'selfAssessReplyTricky';
    if (rating === 'ok') return 'selfAssessReplyOk';
    return cleared ? 'selfAssessReplyGreatWin' : 'selfAssessReplyGreat';
  };

  /** Reset (new result) or re-paint (langchange) the self-assess block from
   *  the current closure choice + snapshot. Reads `selfAssessChoice` live. */
  const renderSelfAssess = (r: ResultSnapshot | null): void => {
    if (!deps.dom.resSelfAssess) return;
    deps.dom.resSelfAssess.style.display = '';
    for (const b of feelButtons) {
      b.el?.classList.toggle('chosen', b.rating === selfAssessChoice);
    }
    if (deps.dom.resFeelResult) {
      if (selfAssessChoice) {
        deps.dom.resFeelResult.textContent = deps.t(replyKeyFor(selfAssessChoice, r));
        deps.dom.resFeelResult.style.display = '';
      } else {
        deps.dom.resFeelResult.textContent = '';
        deps.dom.resFeelResult.style.display = 'none';
      }
    }
  };

  for (const b of feelButtons) {
    b.el?.addEventListener('click', () => {
      // Ignore taps on a stale/empty card.
      if (!deps.practice._lastResult) return;
      selfAssessChoice = b.rating;
      renderSelfAssess(deps.practice._lastResult);
    });
  }

  /** Paint the "retry with support" one-tap button from the snapshot.
   *  Shown only on a 0-star scored run (retryStrategy set). The CLICK is
   *  wired in practice-flow — this module publishes the strategy via
   *  dataset so a langchange re-render keeps label + behavior in sync. */
  const renderRetrySupport = (r: ResultSnapshot): void => {
    const btn = deps.dom.resRetrySlow as (HTMLElement & { dataset: DOMStringMap }) | null;
    if (!btn) return;
    const strat = r.mode === 'rhythm' ? (r.retryStrategy ?? null) : null;
    if (!strat) {
      btn.style.display = 'none';
      delete btn.dataset.strategy;
      delete btn.dataset.tempo;
      return;
    }
    btn.style.display = '';
    btn.dataset.strategy = strat;
    btn.dataset.tempo = r.retryTempo != null ? String(r.retryTempo) : '';
    btn.textContent =
      strat === 'slowTempo'
        ? deps.t('resRetrySlowFmt', { v: r.retryTempo ?? '' })
        : strat === 'oneHand'
          ? deps.t('resRetryOneHand')
          : deps.t('resRetryListen');
  };

  /** Speed trainer: on a CLEARED rhythm run below 100%, offer a one-tap
   *  "climb to the next tempo" button. planTempoStepUp gates on ★2+ (the same
   *  gate that unlocks the tier). Click is wired in practice-flow via
   *  dataset.tempo. Hidden for listen/guided and at the top of the ladder. */
  const renderTempoUp = (r: ResultSnapshot): void => {
    const btn = deps.dom.resTempoUp as (HTMLElement & { dataset: DOMStringMap }) | null;
    if (!btn) return;
    const next =
      r.mode === 'rhythm' && r.tempoPct != null
        ? (deps.planTempoStepUp?.(r.tempoPct, r.stars) ?? null)
        : null;
    if (next == null) {
      btn.style.display = 'none';
      delete btn.dataset.tempo;
      return;
    }
    btn.style.display = '';
    btn.dataset.tempo = String(next);
    btn.textContent = deps.t('resTempoUpFmt', { v: next });
  };

  /** Paint the stretch/"add more songs" button from getStretchSongId. A real
   *  song id → "try a stretch piece"; the ADD_SONG_SENTINEL → "add more songs"
   *  (endgame). Sets data-i18n too so a langchange keeps the right label. */
  const paintStretchButton = (): void => {
    const btn = deps.dom.resStretch;
    if (!btn) return;
    const stretchId = deps.getStretchSongId?.() ?? null;
    if (!stretchId) {
      btn.style.display = 'none';
      btn.dataset.songId = '';
      return;
    }
    btn.style.display = '';
    btn.dataset.songId = stretchId;
    const key = stretchId === ADD_SONG_SENTINEL ? 'stretchAddSong' : 'stretchBtn';
    btn.setAttribute('data-i18n', key);
    btn.textContent = deps.t(key);
  };

  function renderResultCard(): void {
    const r = deps.practice._lastResult;
    if (!r) return;
    const currentSong = deps.getCurrentSong();
    // Full-song listen has no per-section anchor — fall back to the
    // song title for the subtitle line.
    const secLookup = currentSong?.sections.find((s) => s.id === r.secId);
    if (!r.fullSong && !secLookup) return;

    if (r.mode === 'listen' || r.mode === 'guided') {
      let title: string;
      let msg: string;
      let subtitle: string;
      if (r.mode === 'guided') {
        title = deps.t('guidedCompleteTitle');
        msg = deps.t('guidedCompleteMsg');
      } else if (r.fullSong) {
        title = deps.t('listenedFullTitle');
        msg = deps.t('listenedFullMsg');
      } else {
        title = deps.t('listenedTitle');
        msg = deps.t('listenedMsg');
      }
      if (r.fullSong) {
        subtitle = currentSong ? deps.t(currentSong.titleKey) : '';
      } else {
        const s = secLookup as ResultCardSection;
        subtitle = deps.t(s.nameKey) + (s.isBoss ? ' 👑' : '');
      }
      deps.dom.resTitle.textContent = title;
      deps.dom.resSectionName.textContent = subtitle;
      deps.dom.resMsg.textContent = msg;
      deps.dom.resUnlock.textContent = '';
      clearFocus();
      deps.dom.resStars.style.display = 'none';
      document.querySelectorAll('#sectionResult .result-stat').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      if (deps.dom.resHistoryWrap) deps.dom.resHistoryWrap.classList.add('hidden');
      if (r.mode === 'listen') {
        deps.dom.resNext.style.display = 'none';
        if (deps.dom.resTryPlay) deps.dom.resTryPlay.style.display = '';
      } else if (deps.dom.resTryPlay) {
        deps.dom.resTryPlay.style.display = 'none';
      }
      // Stretch button: handled per-mode in completePracticeSection
      // (the listen branch hides it; guided + rhythm set it via stretchId).
      if (deps.dom.resStretch) deps.dom.resStretch.style.display = 'none';
      renderRetrySupport(r); // hides — never shown for listen/guided
      renderTempoUp(r); // hides — never shown for listen/guided
      renderSelfAssess(r);
      return;
    }

    // Past this point we're in rhythm. `fullSong` here means the scored
    // 1曲チャレンジ (secId === FULL_SONG_SECTION_ID) — there is no real
    // section to look up, so the subtitle falls back to the song title.
    const sec = secLookup as ResultCardSection | undefined;
    deps.dom.resStars.style.display = '';
    document.querySelectorAll('#sectionResult .result-stat').forEach((el) => {
      (el as HTMLElement).style.display = '';
    });
    if (deps.dom.resTryPlay) deps.dom.resTryPlay.style.display = 'none';
    const tier = deps.resolveResultTier(r.stars);
    const escalatedZeroStar = r.stars === 0 && (r.zeroStarStreak ?? 0) >= 2;
    let titleKey = escalatedZeroStar ? 'tier0RetryTitle' : tier.titleKey;
    let msgKey = escalatedZeroStar ? 'tier0RetryMsg' : tier.msgKey;
    // Full-song clear (★1+) gets the milestone framing — the practice path's
    // endpoint is "played the whole song", not another section tier. 0★ keeps
    // the gentle tier0 / tough-section copy (no shame — banned-list).
    if (r.fullSong && r.stars >= 1) {
      titleKey = 'songClearTitle';
      msgKey = 'songClearMsg';
    }
    deps.dom.resTitle.textContent = deps.t(titleKey);
    deps.dom.resSectionName.textContent = r.fullSong
      ? currentSong
        ? '👑 ' + deps.t(currentSong.titleKey)
        : ''
      : deps.t((sec as ResultCardSection).nameKey) +
        ((sec as ResultCardSection).isBoss ? ' 👑' : '');
    deps.dom.resMsg.textContent = deps.t(msgKey);
    let unlockedMsg = '';
    if (r.unlockedTempo) {
      unlockedMsg += deps.t('tempoUnlockedFmt', { v: r.unlockedTempo });
    }
    if (r.unlockedSecKey) {
      unlockedMsg += deps.t('sectionUnlockedFmt', { v: deps.t(r.unlockedSecKey) });
    }
    if (r.streakDays) {
      unlockedMsg += deps.t('streakDaysFmt', { v: r.streakDays });
    }
    deps.dom.resUnlock.textContent = unlockedMsg.trim();

    // Knowledge-of-Performance coaching: one strength + one next step, with
    // the weak stat row tinted. Absent on ★3 (focus is null) — a clean run
    // celebrates rather than gets coached (faded feedback).
    clearFocus();
    if (r.focus) applyFocus(r.focus);

    renderRetrySupport(r);
    renderTempoUp(r);
    renderSelfAssess(r);
  }

  function completePracticeSection(): void {
    // New attempt → clear any prior self-assessment so the reflection prompt
    // starts fresh (the renderResultCard calls below repaint it).
    selfAssessChoice = null;
    deps.practice.enabled = false;
    deps.stopPracticeAudio();
    deps.releaseWakeLock();
    deps.practice.pendingHolds.clear();

    const currentSong = deps.getCurrentSong();
    if (!currentSong) {
      deps.practice._completing = false;
      return;
    }
    // Defensive: sections[] may be empty if loadCurrentScore hasn't
    // resolved yet, or if practice.sectionIdx drifted out of range
    // (e.g. result-card fired between selectSong and loadCurrentScore).
    // Without this guard the legacy code threw "Cannot read .id of
    // undefined" at runtime — the dev-mode benchmark caught it.
    const sec = currentSong.sections[deps.practice.sectionIdx];
    if (!sec) {
      deps.practice._completing = false;
      return;
    }
    // Practice-minute tracking — all modes (listening time is practice time
    // too). Lifetime-accumulating only; never a goal, never a shortfall.
    deps.recordPracticeMinutes?.();
    const isFullSong = deps.practice.mode === 'listen' && deps.practice.fullSongMode;

    // Listen mode: no scoring, no progress mutation, no unlocks. Hide
    // all score rows/stars and offer a "Try playing" button that
    // switches the kid into Guided on the same section — natural
    // pedagogical flow. Full-song listen takes the same branch but
    // stamps `fullSong: true` so renderResultCard swaps to the
    // "曲を聴き終わりました" copy.
    if (deps.practice.mode === 'listen') {
      // [DIAG-FULLSONG] Capture the moment the listen completion
      // fires, including whether fullSongMode is still set after
      // result-card display. The legacy code does NOT clear
      // fullSongMode here — the log will show that flag persisting
      // into the next selectSong.
      if (deps.remoteLogEnabled) {
        console.log(
          '[DIAG-FULLSONG] completePracticeSection listen ' +
            JSON.stringify({
              secId: sec.id,
              fullSong: isFullSong,
              practiceMode: deps.practice.mode,
              fullSongMode: deps.practice.fullSongMode,
              practiceEnabled: deps.practice.enabled,
            })
        );
      }
      deps.practice._lastResult = {
        mode: 'listen',
        secId: sec.id,
        fullSong: isFullSong,
        stars: 0,
        unlockedTempo: null,
        unlockedSecKey: null,
        streakDays: null,
      };
      // Listen-mode also fires the attempt hook so lifetime/streak
      // stamps tick after a listen-through.
      if (deps.onSectionAttemptDone) {
        deps.onSectionAttemptDone({
          songId: currentSong.id,
          sectionId: sec.id,
          stars: 0,
          accPct: 0,
          tempoPct: deps.practice.tempoPct,
          sectionBestCombo: 0,
          isListenMode: true,
          priorStars: 0,
          priorBestPct: 0,
        });
      }
      // Bug fix (2026-05-08): clear fullSongMode after a fullSong
      // listen completes so the toggle doesn't carry into the next
      // selectSong. Without this, the next song's startPracticeSection
      // saw stale `fullSongMode: true`, called buildFullSongNotes()
      // which returned empty for some songs, and completePracticeSection
      // re-fired immediately on a 0-note timeline. Diagnostic log
      // (server.log [DIAG-FULLSONG]) confirmed this race in the wild.
      if (isFullSong) {
        deps.practice.fullSongMode = false;
      }
      renderResultCard();
      deps.dom.sectionResult.classList.add('visible');
      deps.practice._completing = false;
      return;
    }

    if (deps.practice.mode === 'guided') {
      // Guided full-song run（1曲チャレンジのガイド練習） — subtitle は曲名、
      // Next は非表示（全曲を弾き終えた後に「次のパート」は無い）。
      const isFullSongGuided = !!deps.practice.fullSongMode;
      deps.practice._lastResult = {
        mode: 'guided',
        secId: isFullSongGuided ? FULL_SONG_SECTION_ID : sec.id,
        fullSong: isFullSongGuided,
        stars: 0,
        unlockedTempo: null,
        unlockedSecKey: null,
        streakDays: null,
      };
      renderResultCard();
      // F1: 実 section id に統一（rhythm 側と同じ理由）。currentSong 未取得時は
      // 静的リストにフォールバック。
      const realSectionIds = deps.getCurrentSong()?.sections.map((s) => s.id) ?? deps.sectionIds;
      const nextIdx = realSectionIds.indexOf(sec.id) + 1;
      const hasNext =
        !isFullSongGuided &&
        nextIdx > 0 &&
        nextIdx < realSectionIds.length &&
        !!deps.songProg().unlockedSections[realSectionIds[nextIdx]];
      deps.dom.resNext.style.display = hasNext ? '' : 'none';
      paintStretchButton();
      deps.dom.sectionResult.classList.add('visible');
      deps.practice._completing = false;
      return;
    }

    const total = deps.practice._sectionTargetCount || 0;
    const accPct = total > 0 ? Math.round((deps.practice.hits / total) * 100) : 0;
    const timingPct =
      deps.practice.hits > 0
        ? Math.round((deps.practice.timingScoreSum / deps.practice.hits) * 100)
        : 0;
    const durPct =
      deps.practice.durationScoredCount > 0
        ? Math.round((deps.practice.durationScoreSum / deps.practice.durationScoredCount) * 100)
        : null;
    const stars = deps.computeStars(accPct, timingPct, durPct);

    // Scored full-song run（1曲チャレンジ）: stars/bestPct/history persist
    // under the reserved FULL_SONG_SECTION_ID pseudo-section, so seals and
    // whole-song stamp predicates (which walk real section IDs) stay intact.
    const isFullSongRun = !!deps.practice.fullSongMode;
    const progressKey = isFullSongRun ? FULL_SONG_SECTION_ID : sec.id;

    // Save to progress (per-song)
    const sp = deps.songProg();
    const prog = sp.sections[progressKey] || { stars: 0, bestPct: 0 };
    // Capture pre-attempt values before the overwrites below so the
    // improvement-based stamp predicates can compare against them.
    const priorStars = prog.stars;
    const priorBestPct = prog.bestPct;
    if (stars > prog.stars) prog.stars = stars;
    if (accPct > prog.bestPct) prog.bestPct = accPct;
    // J3: persist the section's lifetime-best combo (non-decreasing) so the
    // journal can show a self-best combo per song — the rhythm-game headline
    // metric that was previously computed then thrown away.
    if (deps.practice.sectionBestCombo > (prog.bestCombo ?? 0)) {
      prog.bestCombo = deps.practice.sectionBestCombo;
    }
    sp.sections[progressKey] = prog;

    deps.recordPracticeDay();

    // Decide which unlocks fire (pure, in @piano/core), then persist.
    // The result is the *facts* (which tempo / which section / streak
    // count) so renderResultCard can re-build the localized message
    // on language change without re-running the gating logic.
    const sectionNameKeys: Record<string, string> = {};
    for (const s of currentSong.sections) sectionNameKeys[s.id] = s.nameKey;
    // Use the song's REAL section IDs, not the hardcoded A1/B/A2 (`deps.
    // sectionIds`). A 1-section song otherwise unlocks a phantom next section
    // ('B'), surfacing a bogus "Next →" button after its only section.
    const realSectionIds = currentSong.sections.map((s) => s.id);
    // 1曲チャレンジは progressKey='__full' で渡す — realSectionIds に無い ID
    // なので「次のセクション解錠」は発火せず、★2+ のテンポ解錠だけが効く
    // （通しでも速さの階段は登れる）。
    const unlocks = deps.computeUnlocks({
      stars,
      tempoPct: deps.practice.tempoPct,
      sectionId: progressKey,
      sectionIds: realSectionIds,
      sectionNameKeys,
      unlockedTempos: sp.unlockedTempos,
      unlockedSections: sp.unlockedSections,
      streakCount: deps.practice.progress?.streakCount ?? 0,
    });
    const { unlockedTempo, unlockedSecKey, streakDays } = unlocks;
    if (unlockedTempo != null) sp.unlockedTempos[unlockedTempo] = true;
    if (unlockedSecKey != null) {
      // Verify the lookup before writing — a non-standard / single-section
      // song's sec.id may be at the end (or absent), so indexOf+1 must not
      // fall back to flipping realSectionIds[0].
      const curIdx = realSectionIds.indexOf(progressKey);
      const nextSec = curIdx >= 0 ? realSectionIds[curIdx + 1] : undefined;
      if (nextSec) sp.unlockedSections[nextSec] = true;
    }

    if (!sp.history[progressKey]) sp.history[progressKey] = [];
    const histArr = sp.history[progressKey];
    histArr.push({
      d: Date.now(),
      a: accPct,
      t: timingPct,
      s: stars,
      tempoPct: deps.practice.tempoPct,
    });
    if (histArr.length > 8) histArr.shift();
    const sectionHistory = histArr;

    deps.savePracticeProgress();

    // Fire after persist so any downstream evaluation sees the latest progress.
    if (deps.onSectionAttemptDone) {
      deps.onSectionAttemptDone({
        songId: currentSong.id,
        sectionId: progressKey,
        stars,
        accPct,
        tempoPct: deps.practice.tempoPct,
        sectionBestCombo: deps.practice.sectionBestCombo,
        isListenMode: false,
        priorStars,
        priorBestPct,
      });
    }

    // Count trailing 0-star attempts (including this one) so the
    // renderer can escalate to gentler tier0 copy after 2+ consecutive.
    let zeroStarStreak = 0;
    for (let i = histArr.length - 1; i >= 0; i--) {
      if ((histArr[i]?.s ?? 1) === 0) zeroStarStreak++;
      else break;
    }

    // "Retry with support" one-tap: on a 0-star run, offer the scaffold
    // strategy right on the card (previously the kid had to go back to
    // the song panel to find the pre-flight nudge). Strategy escalates
    // with struggle depth via planSectionScaffold; slow-tempo resolves to
    // the slowest unlocked tier (50/60 are always open), and falls back
    // sideways when it can't apply (already slowest / already one-handed).
    let retryStrategy: 'listen' | 'oneHand' | 'slowTempo' | null = null;
    let retryTempo: number | null = null;
    if (stars === 0 && deps.planSectionScaffold) {
      const plan = deps.planSectionScaffold(histArr.map((h) => ({ a: h.a ?? 0, s: h.s ?? 0 })));
      retryStrategy = plan.strategy;
      if (retryStrategy === 'slowTempo') {
        const slowest = (deps.tempoTiers ?? []).find((tier) => sp.unlockedTempos[tier]);
        if (slowest != null && slowest < deps.practice.tempoPct) {
          retryTempo = slowest;
        } else {
          retryStrategy = 'oneHand'; // already at the slowest tempo
        }
      }
      if (retryStrategy === 'oneHand' && deps.practice.handFilter) {
        retryStrategy = 'listen'; // already one-handed — suggest hearing it
      }
    }

    deps.practice._lastResult = {
      mode: deps.practice.mode,
      secId: progressKey,
      fullSong: isFullSongRun,
      stars,
      unlockedTempo,
      unlockedSecKey,
      streakDays,
      zeroStarStreak,
      focus: deps.pickSectionFocus(accPct, timingPct, durPct, stars),
      retryStrategy,
      retryTempo,
      tempoPct: deps.practice.tempoPct,
    };
    renderResultCard();
    deps.dom.resStars.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span');
      span.textContent = '★';
      if (i >= stars) span.className = 'empty';
      deps.dom.resStars.appendChild(span);
    }
    deps.dom.resAcc.textContent = accPct + '%';
    deps.dom.resTiming.textContent = timingPct + '%';
    if (durPct == null) {
      if (deps.dom.resDurationRow) deps.dom.resDurationRow.style.display = 'none';
    } else {
      if (deps.dom.resDurationRow) deps.dom.resDurationRow.style.display = '';
      deps.dom.resDuration.textContent = durPct + '%';
    }
    deps.dom.resCombo.textContent = String(deps.practice.sectionBestCombo);
    // 誤打の事実行（A4 マッシュ耐性の可視化側）— rhythm のみカウントされ、
    // 0 なら行ごと非表示。数字そのものがフィードバックで、赤も説教もなし。
    const extraPresses = deps.practice.extraPresses ?? 0;
    if (deps.dom.resExtraRow) {
      deps.dom.resExtraRow.style.display = extraPresses > 0 ? '' : 'none';
      if (deps.dom.resExtra) deps.dom.resExtra.textContent = String(extraPresses);
    }

    // F1: 解錠書き込み側（computeUnlocks）は realSectionIds を使うのに、この
    // Next 可視判定だけ静的 deps.sectionIds(['A1','B','A2'])に取り残されていた。
    // 実 section id（上で算出済み realSectionIds）に統一（将来 id 変更で崩れる痕跡）。
    // 1曲チャレンジ（progressKey='__full'）は indexOf=-1 → nextIdx=0 → 非表示。
    const nextIdx = realSectionIds.indexOf(progressKey) + 1;
    const hasNext =
      nextIdx > 0 &&
      nextIdx < realSectionIds.length &&
      !!deps.songProg().unlockedSections[realSectionIds[nextIdx]];
    deps.dom.resNext.style.display = hasNext ? '' : 'none';

    paintStretchButton();

    // Big celebration. A full-song clear (★1+) is the practice path's
    // summit — always gets the golden-burst treatment regardless of tier
    // (milestone celebration, not performance-contingent gating).
    if (isFullSongRun && stars >= 1) {
      deps.effectGoldenBurst();
      deps.effectFlowerBurst();
      deps.effectStarShower(10);
      // The one live-adjacent milestone that gets audio: a full-song clear is
      // the summit of the practice path. A short piano fanfare on the result
      // screen (not during play) — fills the MIDI/headphone silence without
      // adding gameplay SE.
      deps.playSongClear?.();
    } else if (stars >= 3) {
      deps.effectGoldenBurst();
      deps.effectStarShower(8);
    } else if (stars >= 2) {
      deps.effectFlowerBurst();
      deps.effectStarShower(5);
    } else if (stars >= 1) {
      deps.effectStarShower(3);
    }

    // グラフ canvas は幅を clientWidth で実測するので、カードを可視化した
    // 「後」に描く。display:none のまま描くと clientWidth=0 → 280px 固定になり、
    // モーダル内容幅(~312px)より狭いグラフが残って「幅が合わない」に見えていた。
    const showHistory = sectionHistory.length >= 2 && !!deps.dom.resHistoryWrap;
    if (deps.dom.resHistoryWrap) {
      deps.dom.resHistoryWrap.classList.toggle('hidden', !showHistory);
    }

    deps.dom.sectionResult.classList.add('visible');
    if (showHistory) {
      drawHistoryChart(deps, deps.dom.resHistoryChart, sectionHistory);
    }
    deps.practice._completing = false;
  }

  return { renderResultCard, completePracticeSection };
}

/** Growth chart — two trend lines over the last 8 attempts: accuracy (gold,
 *  primary, with 3-star halos) and timing (cyan). Caption is a growth-framed,
 *  self-referenced trajectory (best-yet / up-since-first / keep-going) — never
 *  a loss-frame. Exported so tests can call it directly without going through
 *  the whole completePracticeSection flow. */
export function drawHistoryChart(
  deps: Pick<ResultCardDeps, 'setupHiDPICanvas' | 'clamp01' | 't'>,
  canvas: HTMLCanvasElement,
  history: Array<{ d: number; a: number; t: number; s: number }>
): void {
  // 幅はカード内容幅に追従（CSS が width:100% で伸ばす → clientWidth を実測）。
  // 端末で 260〜324px 程度に収まり、iPad で余白に埋もれず、狭い iPhone でも
  // はみ出さない。レイアウト前（clientWidth=0）や happy-dom は 280 に退避。
  // 高さは 80→104 に増やし、高得点(90〜100%)帯でも折れ線が潰れず読める
  // （0〜100% 固定軸は"正直さ"のため維持 — 自動スケールで小差を誇張しない）。
  const w = Math.max(240, Math.round(canvas.clientWidth) || 280);
  const h = 104;
  const c = deps.setupHiDPICanvas(canvas, w, h);
  c.clearRect(0, 0, w, h);
  if (!history || history.length < 2) return;

  const padX = 22;
  const padTop = 12;
  const padBottom = 18;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const n = history.length;

  // Grid (0/50/100%)
  c.strokeStyle = 'rgba(255,255,255,0.08)';
  c.lineWidth = 1;
  for (let lvl = 0; lvl <= 2; lvl++) {
    const y = padTop + (lvl / 2) * innerH;
    c.beginPath();
    c.moveTo(padX, y);
    c.lineTo(padX + innerW, y);
    c.stroke();
  }

  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.font = '9px sans-serif';
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillText('100%', padX - 4, padTop);
  c.fillText('50', padX - 4, padTop + innerH / 2);
  c.fillText('0', padX - 4, padTop + innerH);

  const xAt = (i: number): number => (n === 1 ? padX + innerW / 2 : padX + (i / (n - 1)) * innerW);
  const yAt = (v: number): number => padTop + innerH * (1 - deps.clamp01(v / 100));

  // Timing trend (cyan) — drawn first so the primary accuracy line sits on
  // top. Same 0–100% axis, so both share yAt().
  c.strokeStyle = 'rgba(120, 210, 255, 0.7)';
  c.lineWidth = 1.6;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xAt(i);
    const y = yAt(history[i].t);
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  for (let i = 0; i < n; i++) {
    c.beginPath();
    c.arc(xAt(i), yAt(history[i].t), 2.4, 0, Math.PI * 2);
    c.fillStyle = '#78d2ff';
    c.fill();
  }

  // Accuracy trend (gold) — primary line, with a halo on 3-star clears.
  c.strokeStyle = 'rgba(255, 215, 0, 0.85)';
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xAt(i);
    const y = yAt(history[i].a);
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  for (let i = 0; i < n; i++) {
    const x = xAt(i);
    const y = yAt(history[i].a);
    c.beginPath();
    c.arc(x, y, 3.2, 0, Math.PI * 2);
    c.fillStyle = '#ffd700';
    c.fill();
    if (history[i].s >= 3) {
      c.strokeStyle = 'rgba(255, 220, 80, 0.9)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.stroke();
    }
  }

  // Endpoint value labels, colour-keyed to each line (doubles as a legend
  // cue). Nudge the timing label off the accuracy one when the two endpoints
  // are close so they don't overprint.
  const last = history[n - 1];
  const lastX = xAt(n - 1);
  const accY = yAt(last.a);
  const timeY = yAt(last.t);
  c.textAlign = 'right';
  c.textBaseline = 'alphabetic';
  const accOffsetY = accY < padTop + 16 ? 14 : -6;
  c.fillStyle = '#ffe27a';
  c.font = 'bold 11px sans-serif';
  c.fillText(last.a + '%', lastX - 5, accY + accOffsetY);
  const close = Math.abs(accY - timeY) < 12;
  const timeOffsetY = close ? (accOffsetY < 0 ? 14 : -6) : timeY < padTop + 14 ? 13 : -5;
  c.fillStyle = '#9fdcff';
  c.font = 'bold 10px sans-serif';
  c.fillText(last.t + '%', lastX - 5, timeY + timeOffsetY);

  // Growth-framed trajectory caption — self-referenced to the kid's own past,
  // never a loss-frame (banned-list): new personal best > gain-since-first >
  // neutral encouragement. There is no "you went down" branch by design.
  const first = history[0];
  let bestPrev = 0;
  for (let i = 0; i < n - 1; i++) bestPrev = Math.max(bestPrev, history[i].a);
  let txt: string;
  let col: string;
  if (last.a > bestPrev) {
    txt = deps.t('trendBestYet');
    col = '#ffd86a';
  } else if (last.a > first.a) {
    txt = deps.t('trendUpFmt', { v: last.a - first.a });
    col = '#7eff8a';
  } else {
    txt = deps.t('trendKeepGoing');
    col = 'rgba(255,255,255,0.6)';
  }
  c.textAlign = 'left';
  c.fillStyle = col;
  c.font = 'bold 11px sans-serif';
  c.fillText(txt, padX, h - 4);

  // Legend (bottom-right): gold = accuracy, cyan = timing. Fixed offsets so we
  // never call measureText (the happy-dom test ctx doesn't implement it).
  const legY = h - 7;
  const accDotX = padX + innerW - 96;
  const timeDotX = padX + innerW - 44;
  c.font = '9px sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffd700';
  c.beginPath();
  c.arc(accDotX, legY, 2.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fillText(deps.t('legendAccuracy'), accDotX + 5, legY);
  c.fillStyle = '#78d2ff';
  c.beginPath();
  c.arc(timeDotX, legY, 2.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fillText(deps.t('legendTiming'), timeDotX + 5, legY);
}
