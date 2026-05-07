// Session summary modal — Phase 0d batch 11 extraction from legacy-app.js.
//
// Free-play session-end card. Distinct from result-card.ts (which fires
// on practice-section completion). Cohesive surface:
//
//   • saveBestScores — persist all-time best combo / peak flow /
//     session-count counters to localStorage. Returns the merged best
//     bag for the caller to embed in the summary snapshot.
//   • renderSessionSummaryText — paint the localized parts of the
//     summary modal from `state._lastSummary`. Idempotent — also
//     called from the langchange listener so a JP↔EN flip while the
//     modal is visible re-renders without an animation replay.
//   • showSessionSummary — entry point: snapshots state into
//     `state._lastSummary`, persists best, kicks the radar chart's
//     animated grow-in.
//   • drawRadarChart — internal canvas helper, animates a 3-axis radar
//     (Stability / Rhythm / Dynamics) over 800ms with ease-out cubic.
//
// Out of scope:
//   • State mutation on close (resetSession) — lives in the shell;
//     the practice-flow.sumClose handler handles that.

/** All-time best counters persisted in localStorage as `pianoViz_best`. */
export interface BestScores {
  bestCombo: number;
  peakFlow: number;
  totalSessions: number;
}

/** Snapshot held under `state._lastSummary` so renderSessionSummaryText
 *  can replay the same numbers on language toggle without recomputing
 *  scores. */
export interface SessionSummarySnapshot {
  bestCombo: number;
  stageIdx: number;
  elapsed: number;
  completedQuests: string[];
  bestStat: BestScores;
}

/** Game-state slice the module reads + writes. */
export interface SessionSummaryStateRef {
  bestCombo: number;
  peakFlow: number;
  currentStage: number;
  completedQuests: string[];
  sessionStartTimeMs: number;
  stabilityScore: number;
  rhythmScore: number;
  dynamicsScore: number;
  _lastSummary: SessionSummarySnapshot | null;
}

/** CONFIG slice the renderer reads. */
export interface SessionSummaryConfig {
  STAGES: ReadonlyArray<unknown>;
  QUESTS: ReadonlyArray<{ id: string; nameKey: string }>;
}

export interface SessionSummaryDom {
  sessionSummary: HTMLElement;
  sumCombo: HTMLElement;
  sumStage: HTMLElement;
  sumTime: HTMLElement;
  sumQuestList: HTMLElement;
  sumBest: HTMLElement;
  radarChart: HTMLCanvasElement;
}

export interface SessionSummaryDeps {
  dom: SessionSummaryDom;
  state: SessionSummaryStateRef;
  config: SessionSummaryConfig;
  /** localStorage helpers — reused from the legacy `loadJSON` /
   *  `saveJSON` shell utilities. */
  loadJSON<T>(key: string, fallback: T): T;
  saveJSON(key: string, val: unknown): void;
  /** Stage label resolver — pulls from the localized stage-name table.
   *  Mirrors the legacy `stageLabel()` helper that wraps
   *  `PianoCore.stageLabel`. */
  stageLabel(stage: unknown): string | null;
  /** Format milliseconds as 'mm:ss' (PianoCore.formatTime). */
  formatTime(ms: number): string;
  /** i18n translator. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** HiDPI canvas setup helper. */
  setupHiDPICanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D;
}

export interface SessionSummary {
  /** Persist all-time best counters + return the merged record so the
   *  caller can embed it in the summary snapshot. */
  saveBestScores(combo: number, flow: number): BestScores;
  /** Re-paint the localized parts of the modal from `state._lastSummary`.
   *  `animate=true` staggers the badge entry; `animate=false` just
   *  surfaces them immediately (langchange path). */
  renderSessionSummaryText(animate: boolean): void;
  /** Snapshot + show + animate the radar chart. Called from the
   *  free-play resetSession path on title return. */
  showSessionSummary(): void;
}

const BEST_DEFAULT: BestScores = { bestCombo: 0, peakFlow: 0, totalSessions: 0 };
const BEST_KEY = 'pianoViz_best';

export function createSessionSummary(deps: SessionSummaryDeps): SessionSummary {
  function loadBestScores(): BestScores {
    return deps.loadJSON(BEST_KEY, { ...BEST_DEFAULT });
  }

  function saveBestScores(combo: number, flow: number): BestScores {
    const best = loadBestScores();
    best.bestCombo = Math.max(best.bestCombo, combo);
    best.peakFlow = Math.max(best.peakFlow, Math.round(flow));
    best.totalSessions++;
    deps.saveJSON(BEST_KEY, best);
    return best;
  }

  function renderSessionSummaryText(animate: boolean): void {
    const s = deps.state._lastSummary;
    if (!s) return;
    deps.dom.sumCombo.textContent = String(s.bestCombo);
    const stage = deps.config.STAGES[s.stageIdx];
    deps.dom.sumStage.textContent = (stage !== undefined && deps.stageLabel(stage)) || '-';
    deps.dom.sumTime.textContent = deps.formatTime(s.elapsed);

    const total = deps.config.QUESTS.length;
    const sortedQuests = deps.config.QUESTS.slice().sort((a, b) => {
      const aDone = s.completedQuests.includes(a.id) ? 0 : 1;
      const bDone = s.completedQuests.includes(b.id) ? 0 : 1;
      return aDone - bDone;
    });
    let badgeHtml = '';
    for (let i = 0; i < sortedQuests.length; i++) {
      const q = sortedQuests[i];
      const done = s.completedQuests.includes(q.id);
      const cls = done ? 'sq-badge done' : 'sq-badge undone';
      const icon = done ? '⭐' : '⬜';
      badgeHtml +=
        '<div class="' +
        cls +
        '" style="animation-delay:' +
        i * 0.25 +
        's">' +
        '<span class="badge-icon">' +
        icon +
        '</span>' +
        '<span>' +
        deps.t(q.nameKey) +
        '</span></div>';
    }
    if (s.completedQuests.length === total) {
      badgeHtml +=
        '<div class="sq-all-clear" style="animation-delay:' +
        total * 0.25 +
        's">' +
        deps.t('sumAllClear') +
        '</div>';
    } else {
      badgeHtml +=
        '<div style="margin-top:6px;font-size:.75rem;color:rgba(255,255,255,.4);animation-delay:' +
        total * 0.25 +
        's">' +
        deps.t('sumQuestProgressFmt', {
          n: s.completedQuests.length,
          total,
        }) +
        '</div>';
    }
    deps.dom.sumQuestList.innerHTML = badgeHtml;

    if (animate) {
      requestAnimationFrame(() => {
        const badges = deps.dom.sumQuestList.querySelectorAll('.sq-badge, .sq-all-clear');
        badges.forEach((b, i) => setTimeout(() => b.classList.add('animate-in'), i * 250));
      });
    } else {
      // On lang re-render, surface badges immediately without re-staggering.
      deps.dom.sumQuestList
        .querySelectorAll('.sq-badge, .sq-all-clear')
        .forEach((b) => b.classList.add('animate-in'));
    }

    deps.dom.sumBest.textContent = deps.t('sumBestFmt', {
      combo: s.bestStat.bestCombo,
      flow: s.bestStat.peakFlow,
      n: s.bestStat.totalSessions,
    });
  }

  function showSessionSummary(): void {
    const elapsed = performance.now() - deps.state.sessionStartTimeMs;
    const best = saveBestScores(deps.state.bestCombo, deps.state.peakFlow);
    deps.state._lastSummary = {
      bestCombo: deps.state.bestCombo,
      stageIdx: deps.state.currentStage,
      elapsed,
      completedQuests: deps.state.completedQuests.slice(),
      bestStat: best,
    };
    renderSessionSummaryText(true);
    deps.dom.sessionSummary.classList.add('visible');
    drawRadarChart(
      deps,
      deps.dom.radarChart,
      ['Stability', 'Rhythm', 'Dynamics'],
      [deps.state.stabilityScore, deps.state.rhythmScore, deps.state.dynamicsScore]
    );
  }

  return { saveBestScores, renderSessionSummaryText, showSessionSummary };
}

/** Animated radar chart — 3 axes (Stability / Rhythm / Dynamics).
 *  Exported for direct testing; `showSessionSummary` is the production
 *  entry point. */
export function drawRadarChart(
  deps: Pick<SessionSummaryDeps, 'setupHiDPICanvas'>,
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[]
): void {
  const size = 200;
  const c = deps.setupHiDPICanvas(canvas, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const R = 70; // max radius
  const axes = labels.length;
  const angleStep = (Math.PI * 2) / axes;
  const startAngle = -Math.PI / 2; // top

  function getPoint(axisIndex: number, value: number): { x: number; y: number } {
    const angle = startAngle + axisIndex * angleStep;
    return {
      x: cx + Math.cos(angle) * R * value,
      y: cy + Math.sin(angle) * R * value,
    };
  }

  let progress = 0;
  const duration = 800; // ms
  const startTime = performance.now();

  function frame(now: number): void {
    progress = Math.min(1, (now - startTime) / duration);
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    c.clearRect(0, 0, size, size);

    // Grid rings (3 levels: 33%, 66%, 100%)
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    for (let level = 1; level <= 3; level++) {
      c.beginPath();
      for (let i = 0; i <= axes; i++) {
        const p = getPoint(i % axes, level / 3);
        if (i === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      }
      c.closePath();
      c.stroke();
    }

    // Axis lines
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < axes; i++) {
      const p = getPoint(i, 1);
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(p.x, p.y);
      c.stroke();
    }

    // Data polygon (animated grow-in via ease)
    c.beginPath();
    for (let i = 0; i <= axes; i++) {
      const v = values[i % axes] * ease;
      const p = getPoint(i % axes, v);
      if (i === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    }
    c.closePath();
    c.fillStyle = 'rgba(255, 215, 0, 0.15)';
    c.fill();
    c.strokeStyle = 'rgba(255, 215, 0, 0.7)';
    c.lineWidth = 2;
    c.stroke();

    // Data points
    for (let i = 0; i < axes; i++) {
      const v = values[i] * ease;
      const p = getPoint(i, v);
      c.beginPath();
      c.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      c.fillStyle = '#ffd700';
      c.fill();
    }

    // Labels with percentage
    c.font = '11px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < axes; i++) {
      const angle = startAngle + i * angleStep;
      const labelR = R + 22;
      const lx = cx + Math.cos(angle) * labelR;
      const ly = cy + Math.sin(angle) * labelR;
      const pct = Math.round(values[i] * 100 * ease);
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fillText(labels[i], lx, ly - 7);
      c.fillStyle = '#ffd700';
      c.font = 'bold 12px sans-serif';
      c.fillText(pct + '%', lx, ly + 7);
      c.font = '11px sans-serif';
    }

    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
