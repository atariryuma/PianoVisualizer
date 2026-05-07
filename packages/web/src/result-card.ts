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

/** Practice slice the module reads + writes. */
export interface ResultCardPracticeRef {
  enabled: boolean;
  mode: string;
  sectionIdx: number;
  fullSongMode: boolean;
  tempoPct: number;
  hits: number;
  misses: number;
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
  mode: string;
  secId: string;
  fullSong?: boolean;
  stars: number;
  unlockedTempo: number | null;
  unlockedSecKey: string | null;
  streakDays: number | null;
}

export interface ResultCardSection {
  id: string;
  nameKey: string;
  isBoss?: boolean;
}

export interface ResultCardSong {
  titleKey: string;
  sections: ResultCardSection[];
}

/** Per-song progress slice the module reads + writes. */
export interface ResultCardSongProgress {
  unlockedTempos: Record<number, boolean>;
  unlockedSections: Record<string, boolean>;
  sections: Record<string, { stars: number; bestPct: number } | undefined>;
  history: Record<string, Array<{ d: number; a: number; t: number; s: number }>>;
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
  resMsg: HTMLElement;
  resUnlock: HTMLElement;
  resHistoryWrap: HTMLElement | null;
  resHistoryChart: HTMLCanvasElement;
  resNext: HTMLElement;
  resTryPlay: HTMLElement | null;
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
  /** Persist progress to localStorage. */
  savePracticeProgress(): void;
  /** Compute the star count from accPct / timingPct / durPct
   *  (PianoCore.computeStars). */
  computeStars(accPct: number, timingPct: number, durPct: number | null): number;
  /** Resolve the result tier from a star count
   *  (PianoCore.resolveResultTier). */
  resolveResultTier(stars: number): ResultTier;
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
  /** HiDPI canvas setup helper. */
  setupHiDPICanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D;
  /** [0..1] clamp helper (PianoCore.clamp01). */
  clamp01(v: number): number;
  /** i18n translator. */
  t(key: string, vars?: Record<string, string | number>): string;
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
  function renderResultCard(): void {
    const r = deps.practice._lastResult;
    if (!r) return;
    const currentSong = deps.getCurrentSong();
    // Full-song listen has no per-section anchor — fall back to the
    // song title for the subtitle line.
    const secLookup = currentSong?.sections.find((s) => s.id === r.secId);
    if (!r.fullSong && !secLookup) return;

    if (r.mode === 'listen') {
      deps.dom.resTitle.textContent = deps.t(r.fullSong ? 'listenedFullTitle' : 'listenedTitle');
      let subtitle: string;
      if (r.fullSong) {
        subtitle = currentSong ? deps.t(currentSong.titleKey) : '';
      } else {
        // !r.fullSong → secLookup is defined (early return guarantees it).
        const s = secLookup as ResultCardSection;
        subtitle = deps.t(s.nameKey) + (s.isBoss ? ' 👑' : '');
      }
      deps.dom.resSectionName.textContent = subtitle;
      deps.dom.resStars.style.display = 'none';
      document.querySelectorAll('#sectionResult .result-stat').forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      deps.dom.resMsg.textContent = deps.t(r.fullSong ? 'listenedFullMsg' : 'listenedMsg');
      deps.dom.resUnlock.textContent = '';
      if (deps.dom.resHistoryWrap) deps.dom.resHistoryWrap.classList.add('hidden');
      deps.dom.resNext.style.display = 'none';
      if (deps.dom.resTryPlay) deps.dom.resTryPlay.style.display = '';
      return;
    }

    // Rhythm/guided result. Past this point we always have a real
    // section (rhythm/guided never sets fullSong, so the early return
    // above guarantees secLookup).
    const sec = secLookup as ResultCardSection;
    deps.dom.resStars.style.display = '';
    document.querySelectorAll('#sectionResult .result-stat').forEach((el) => {
      (el as HTMLElement).style.display = '';
    });
    if (deps.dom.resTryPlay) deps.dom.resTryPlay.style.display = 'none';
    const tier = deps.resolveResultTier(r.stars);
    deps.dom.resTitle.textContent = deps.t(tier.titleKey);
    deps.dom.resSectionName.textContent = deps.t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
    deps.dom.resMsg.textContent = deps.t(tier.msgKey);
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
  }

  function completePracticeSection(): void {
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
    const isFullSong = deps.practice.mode === 'listen' && deps.practice.fullSongMode;

    // Listen mode: no scoring, no progress mutation, no unlocks. Hide
    // all score rows/stars and offer a "Try playing" button that
    // switches the kid into Guided on the same section — natural
    // pedagogical flow. Full-song listen takes the same branch but
    // stamps `fullSong: true` so renderResultCard swaps to the
    // "曲を聴き終わりました" copy.
    if (deps.practice.mode === 'listen') {
      deps.practice._lastResult = {
        mode: 'listen',
        secId: sec.id,
        fullSong: isFullSong,
        stars: 0,
        unlockedTempo: null,
        unlockedSecKey: null,
        streakDays: null,
      };
      renderResultCard();
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

    // Save to progress (per-song)
    const sp = deps.songProg();
    const prog = sp.sections[sec.id] || { stars: 0, bestPct: 0 };
    if (stars > prog.stars) prog.stars = stars;
    if (accPct > prog.bestPct) prog.bestPct = accPct;
    sp.sections[sec.id] = prog;

    deps.recordPracticeDay();

    // Decide which unlocks fire (pure, in @piano/core), then persist.
    // The result is the *facts* (which tempo / which section / streak
    // count) so renderResultCard can re-build the localized message
    // on language change without re-running the gating logic.
    const sectionNameKeys: Record<string, string> = {};
    for (const s of currentSong.sections) sectionNameKeys[s.id] = s.nameKey;
    const unlocks = deps.computeUnlocks({
      stars,
      tempoPct: deps.practice.tempoPct,
      sectionId: sec.id,
      sectionIds: deps.sectionIds,
      sectionNameKeys,
      unlockedTempos: sp.unlockedTempos,
      unlockedSections: sp.unlockedSections,
      streakCount: deps.practice.progress?.streakCount ?? 0,
    });
    const { unlockedTempo, unlockedSecKey, streakDays } = unlocks;
    if (unlockedTempo != null) sp.unlockedTempos[unlockedTempo] = true;
    if (unlockedSecKey != null) {
      const nextSec = deps.sectionIds[deps.sectionIds.indexOf(sec.id) + 1];
      sp.unlockedSections[nextSec] = true;
    }

    if (!sp.history[sec.id]) sp.history[sec.id] = [];
    const histArr = sp.history[sec.id];
    histArr.push({ d: Date.now(), a: accPct, t: timingPct, s: stars });
    if (histArr.length > 8) histArr.shift();
    const sectionHistory = histArr;

    deps.savePracticeProgress();

    // Snapshot context for renderResultCard (handles localized strings)
    // + re-render on language change. Numeric / visibility state below
    // isn't language-dependent so it stays imperative.
    deps.practice._lastResult = {
      mode: deps.practice.mode,
      secId: sec.id,
      stars,
      unlockedTempo,
      unlockedSecKey,
      streakDays,
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

    const nextIdx = deps.sectionIds.indexOf(sec.id) + 1;
    const hasNext =
      nextIdx > 0 &&
      nextIdx < deps.sectionIds.length &&
      !!deps.songProg().unlockedSections[deps.sectionIds[nextIdx]];
    deps.dom.resNext.style.display = hasNext ? '' : 'none';

    // Big celebration
    if (stars >= 3) {
      deps.effectGoldenBurst();
      deps.effectStarShower(8);
    } else if (stars >= 2) {
      deps.effectFlowerBurst();
      deps.effectStarShower(5);
    } else if (stars >= 1) {
      deps.effectStarShower(3);
    }

    if (sectionHistory.length >= 2 && deps.dom.resHistoryWrap) {
      deps.dom.resHistoryWrap.classList.remove('hidden');
      drawHistoryChart(deps, deps.dom.resHistoryChart, sectionHistory);
    } else if (deps.dom.resHistoryWrap) {
      deps.dom.resHistoryWrap.classList.add('hidden');
    }

    deps.dom.sectionResult.classList.add('visible');
    deps.practice._completing = false;
  }

  return { renderResultCard, completePracticeSection };
}

/** Growth chart — line graph of accuracy over the last 8 attempts.
 *  Exported so tests can call it directly without going through the
 *  whole completePracticeSection flow. */
export function drawHistoryChart(
  deps: Pick<ResultCardDeps, 'setupHiDPICanvas' | 'clamp01' | 't'>,
  canvas: HTMLCanvasElement,
  history: Array<{ d: number; a: number; t: number; s: number }>
): void {
  const w = 280;
  const h = 80;
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

  const last = history[n - 1];
  const prev = history[n - 2];
  const lastX = xAt(n - 1);
  const lastY = yAt(last.a);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.font = 'bold 11px sans-serif';
  c.textAlign = 'right';
  c.textBaseline = 'alphabetic';
  const labelOffsetY = lastY < padTop + 16 ? 14 : -6;
  c.fillText(last.a + '%', lastX - 5, lastY + labelOffsetY);

  const delta = last.a - prev.a;
  let txt: string;
  let col: string;
  if (delta >= 3) {
    txt = '↑ +' + delta + '%';
    col = '#7eff8a';
  } else if (delta <= -3) {
    txt = '↓ ' + delta + '%';
    col = '#ff8a9a';
  } else {
    txt = deps.t('trendSimilar');
    col = 'rgba(255,255,255,0.55)';
  }
  c.textAlign = 'left';
  c.fillStyle = col;
  c.font = 'bold 11px sans-serif';
  c.fillText(txt, padX, h - 4);

  c.textAlign = 'right';
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.font = '10px sans-serif';
  c.fillText(deps.t('growthChartFmt', { v: n }), padX + innerW, h - 4);
}
