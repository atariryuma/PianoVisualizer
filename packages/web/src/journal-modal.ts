// Practice journal modal (0.14) — 3 tabs (repertoire / stamps / calendar)
// plus title-screen mastery strip and result-card stamp-earned rows.

import * as PianoCore from '@piano/core';
import type {
  PracticeProgress,
  MasterySongDef,
  SongMastery,
  StampDef,
  StampCategory,
  StampContext,
} from '@piano/core';

/** Minimum shape the modal needs to know about each song. The shell
 *  feeds a list assembled from its SONGS registry (built-in + user). */
export interface JournalSongRef {
  id: string;
  titleKey: string;
  composer?: string;
  /** Kid-friendly difficulty band — drives the 🌱/🌿/🌳/🏔️ badge. */
  difficulty?: 'sprout' | 'leaf' | 'tree' | 'mountain';
  sections: Array<{ id: string; nameKey: string }>;
}

export interface JournalModalDom {
  journalBtn: HTMLElement;
  journalModal: HTMLElement;
  journalCloseBtn: HTMLElement;
  journalPianistCard: HTMLElement;
  journalWeeklyMeter: HTMLElement;
  journalLibraryRollup: HTMLElement;
  journalRepertoireList: HTMLElement;
  journalStampsGrid: HTMLElement;
  journalCalendar: HTMLElement;
  journalActivityList: HTMLElement;
  libraryMasteryStrip: HTMLElement;
  resStampsEarned: HTMLElement;
  sectionBannerHint: HTMLElement;
}

export interface PianistIdentity {
  name?: string;
  commitYear?: number;
  avatar?: string;
}

export interface JournalModalDeps {
  dom: JournalModalDom;
  /** Live progress accessor — fresh fetch each call so re-opens after
   *  practice see the latest stars/stamps without re-injecting deps. */
  getProgress(): PracticeProgress;
  /** Live song-list accessor — built-in + user songs merged. The
   *  caller decides order. */
  getSongs(): readonly JournalSongRef[];
  /** Persist progress to localStorage. Called after stamp evaluation
   *  mutates `progress.earnedStamps`. */
  saveProgress(): void;
  /** Live session peak-flow accessor — feeds flow_peak_80 /
   *  flow_peak_max predicates. Optional; missing returns 0. */
  getSessionPeakFlow?(): number;
  /** Stamp definitions table — defaults to DEFAULT_STAMPS, swappable
   *  for tests. */
  stamps?: readonly StampDef[];
  /** i18n translator. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** Format a Date as YYYY-MM-DD (PianoCore.formatDateKey). */
  formatDateKey(d: Date): string;
  /** Optional: jump the kid into a song's panel from the repertoire
   *  tab. When provided, each book becomes clickable. */
  selectSong?: (songId: string) => void;
  /** Live read of the pianist identity stored in prefs. Optional —
   *  modal hides the card when omitted (preserves backward compat). */
  getPianistIdentity?(): PianistIdentity;
  /** Persist the kid's chosen name + commit-year. */
  setPianistIdentity?(id: PianistIdentity): void;
  /** Open the pianist-edit modal. Owned by the shell so the modal can
   *  re-paint its inputs from current prefs before opening. */
  openPianistEditor?(): void;
}

/** Shape result-card hands the journal at section-complete time. */
export interface JournalAttemptInput {
  songId: string;
  sectionId: string;
  stars: number;
  accPct: number;
  tempoPct: number;
  sectionBestCombo: number;
  isListenMode: boolean;
  priorStars: number;
  priorBestPct: number;
}

export interface JournalModal {
  open(initialTab?: JournalTab): void;
  close(): void;
  render(): void;
  renderLibraryStrip(): void;
  renderStampsEarned(ids: readonly string[]): void;
  /** Apply a just-completed attempt — runs stamp evaluation, persists,
   *  paints the +1 strip on the result-card, and refreshes the
   *  library-mastery strip on the title screen. Returns the IDs awarded
   *  this attempt so the caller can also log them. */
  applyAttempt(input: JournalAttemptInput): readonly string[];
  /** Look up a stamp definition by ID — used by the shell to inspect
   *  rarity for layered celebration effects. */
  getStampDef(id: string): StampDef | undefined;
  /** Paint the section-banner hint line for a song. No-op when the
   *  song has no near-completion target (clears any prior hint text). */
  paintSectionBannerHint(songId: string): void;
  /** Return the top near-completion song id that isn't `excludeSongId`,
   *  or null if no other song is close to a seal upgrade. Used by the
   *  result-card's "Stretch piece" button to feed forward to a new piece. */
  pickStretchSong(excludeSongId: string): string | null;
  isOpen(): boolean;
}

export type JournalTab = 'repertoire' | 'stamps' | 'calendar';

const TAB_IDS: readonly JournalTab[] = ['repertoire', 'stamps', 'calendar'] as const;

const DIFFICULTY_ICONS: Record<NonNullable<JournalSongRef['difficulty']>, string> = {
  sprout: '🌱',
  leaf: '🌿',
  tree: '🌳',
  mountain: '🏔️',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Local-time Monday at 00:00 for the ISO week containing `d`. */
function startOfIsoWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay() || 7; // Sun=7 in ISO terms
  out.setDate(out.getDate() - (dow - 1));
  return out;
}

/** Visual tint per rarity — drives the stamp grid's badge color. */
const RARITY_CLASS: Record<string, string> = {
  common: 'rarity-common',
  rare: 'rarity-rare',
  epic: 'rarity-epic',
  legendary: 'rarity-legendary',
};

const CATEGORY_LABEL_KEY: Record<StampCategory, string> = {
  completion: 'stampCatCompletion',
  performance: 'stampCatPerformance',
  practice: 'stampCatPractice',
  milestone: 'stampCatMilestone',
};

/** Pick the seal-tier glyph + label key. */
function sealGlyph(seal: SongMastery['seal']): { icon: string; labelKey: string } {
  switch (seal) {
    case 'platinum':
      return { icon: '💎', labelKey: 'sealPlatinum' };
    case 'gold':
      return { icon: '🥇', labelKey: 'sealGold' };
    case 'silver':
      return { icon: '🥈', labelKey: 'sealSilver' };
    case 'bronze':
      return { icon: '🥉', labelKey: 'sealBronze' };
    default:
      return { icon: '🌱', labelKey: 'sealNone' };
  }
}

export function createJournalModal(deps: JournalModalDeps): JournalModal {
  const stamps = deps.stamps ?? PianoCore.DEFAULT_STAMPS;

  function songRefToDef(s: JournalSongRef): MasterySongDef {
    return { id: s.id, sectionIds: s.sections.map((sec) => sec.id) };
  }

  function setActiveTab(tab: JournalTab): void {
    const buttons = deps.dom.journalModal.querySelectorAll('.journal-tab');
    buttons.forEach((b) => {
      const el = b as HTMLElement;
      const isActive = el.dataset.tab === tab;
      el.classList.toggle('active', isActive);
    });
    const bodies = deps.dom.journalModal.querySelectorAll('.journal-tab-body');
    bodies.forEach((b) => {
      const el = b as HTMLElement;
      const isActive = el.dataset.tabBody === tab;
      el.hidden = !isActive;
    });
  }

  function renderLibraryRollup(): void {
    const progress = deps.getProgress();
    const songs = deps.getSongs().map(songRefToDef);
    const lib = PianoCore.computeLibraryMastery(songs, progress);
    const earnedCount = Object.keys(progress.earnedStamps ?? {}).length;
    const totalStamps = stamps.length;

    // Weekly growth (positive-only): collect every section's attempts and ask
    // the library-growth aggregate for the best axis the kid improved this
    // week. Defensive iteration mirrors the calendar tab's history walk.
    const weekStartMs = startOfIsoWeek(new Date()).getTime();
    const sectionAttempts: Array<Array<{ d: number; a: number; t: number }>> = [];
    for (const sp of Object.values(progress.songs ?? {})) {
      for (const hist of Object.values(sp.history ?? {})) {
        if (!Array.isArray(hist)) continue;
        const rows: Array<{ d: number; a: number; t: number }> = [];
        for (const h of hist) {
          if (
            h != null &&
            typeof h === 'object' &&
            typeof (h as { d?: unknown }).d === 'number' &&
            typeof (h as { a?: unknown }).a === 'number' &&
            typeof (h as { t?: unknown }).t === 'number'
          ) {
            const e = h as { d: number; a: number; t: number };
            rows.push({ d: e.d, a: e.a, t: e.t });
          }
        }
        if (rows.length) sectionAttempts.push(rows);
      }
    }
    const growth = PianoCore.weeklyLibraryGrowth(sectionAttempts, weekStartMs);
    let growthRow = '';
    if (growth.axis) {
      const fmt = growth.axis === 'accuracy' ? 'rollupGrowthAccFmt' : 'rollupGrowthTimeFmt';
      growthRow =
        '<div class="rollup-row rollup-growth">' +
        '<span class="rollup-icon">📈</span>' +
        '<span class="rollup-label">' +
        deps.t('rollupGrowthLabel') +
        '</span>' +
        '<span class="rollup-value">' +
        deps.t(fmt, { v: growth.gainPct }) +
        '</span>' +
        '</div>';
    }

    deps.dom.journalLibraryRollup.innerHTML =
      '<div class="rollup-row">' +
      '<span class="rollup-icon">⭐</span>' +
      '<span class="rollup-label">' +
      deps.t('rollupStarsLabel') +
      '</span>' +
      '<span class="rollup-value">' +
      deps.t('rollupStarsFmt', { earned: lib.starsEarned, total: lib.starsPossible }) +
      '</span>' +
      '<span class="rollup-percent">' +
      lib.percent +
      '%</span>' +
      '</div>' +
      '<div class="rollup-row">' +
      '<span class="rollup-icon">🏅</span>' +
      '<span class="rollup-label">' +
      deps.t('rollupStampsLabel') +
      '</span>' +
      '<span class="rollup-value">' +
      deps.t('rollupStampsFmt', { earned: earnedCount, total: totalStamps }) +
      '</span>' +
      '</div>' +
      '<div class="rollup-row">' +
      '<span class="rollup-icon">📅</span>' +
      '<span class="rollup-label">' +
      deps.t('rollupDaysLabel') +
      '</span>' +
      '<span class="rollup-value">' +
      deps.t('rollupDaysFmt', { n: progress.streakDays?.length ?? 0 }) +
      '</span>' +
      '</div>' +
      growthRow;
  }

  function renderRepertoireTab(): void {
    const progress = deps.getProgress();
    const songs = deps.getSongs();
    const target = deps.dom.journalRepertoireList;
    target.innerHTML = '';

    for (const song of songs) {
      const def = songRefToDef(song);
      const sm = PianoCore.computeSongMastery(def, progress.songs?.[song.id]);
      const seal = sealGlyph(sm.seal);
      const book = document.createElement('div');
      book.className = 'jr-book' + (deps.selectSong ? ' jr-book-clickable' : '');
      book.dataset.songId = song.id;

      // Ring + percent
      const ring = document.createElement('div');
      ring.className = 'jr-ring jr-ring-' + sm.seal;
      ring.style.background =
        'conic-gradient(var(--jr-ring-on) ' + sm.percent + '%, var(--jr-ring-off) 0)';
      ring.innerHTML =
        '<div class="jr-ring-inner">' +
        '<span class="jr-ring-percent">' +
        sm.percent +
        '%</span>' +
        '<span class="jr-ring-seal" title="' +
        deps.t(seal.labelKey) +
        '">' +
        seal.icon +
        '</span>' +
        '</div>';
      book.appendChild(ring);

      const body = document.createElement('div');
      body.className = 'jr-book-body';
      const title = document.createElement('div');
      title.className = 'jr-book-title';
      title.textContent = deps.t(song.titleKey);
      if (song.difficulty) {
        const diff = document.createElement('span');
        diff.className = 'jr-book-difficulty';
        diff.title = deps.t('difficulty' + capitalize(song.difficulty));
        diff.textContent = DIFFICULTY_ICONS[song.difficulty];
        title.appendChild(diff);
      }
      body.appendChild(title);

      if (song.composer) {
        const sub = document.createElement('div');
        sub.className = 'jr-book-composer';
        sub.textContent = song.composer;
        body.appendChild(sub);
      }

      const dotsRow = document.createElement('div');
      dotsRow.className = 'jr-section-dots';
      for (const sec of sm.sections) {
        const dot = document.createElement('div');
        dot.className = 'jr-dot jr-dot-stars-' + sec.stars + (sec.unlocked ? '' : ' jr-dot-locked');
        const sectionNameKey = song.sections.find((s) => s.id === sec.id)?.nameKey ?? sec.id;
        dot.title =
          deps.t(sectionNameKey) +
          ' · ' +
          (sec.unlocked ? '★'.repeat(sec.stars) + '☆'.repeat(3 - sec.stars) : '🔒');
        dot.textContent = sec.unlocked ? '★'.repeat(sec.stars) || '·' : '🔒';
        dotsRow.appendChild(dot);
      }
      body.appendChild(dotsRow);

      const tempos = document.createElement('div');
      tempos.className = 'jr-tempo-pips';
      const sp = progress.songs?.[song.id];
      for (const t of [60, 75, 90, 100]) {
        const pip = document.createElement('span');
        const unlocked = sp?.unlockedTempos?.[String(t)] === true || t === 60;
        pip.className = 'jr-tempo-pip' + (unlocked ? ' jr-tempo-pip-on' : '');
        pip.textContent = String(t);
        tempos.appendChild(pip);
      }
      body.appendChild(tempos);

      book.appendChild(body);

      if (deps.selectSong) {
        book.addEventListener('click', () => {
          deps.selectSong?.(song.id);
          close();
        });
      }
      target.appendChild(book);
    }

    if (songs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'jr-empty';
      empty.textContent = deps.t('journalEmptyRepertoire');
      target.appendChild(empty);
    }
  }

  function renderStampsTab(): void {
    const progress = deps.getProgress();
    const target = deps.dom.journalStampsGrid;
    target.innerHTML = '';

    const groups = PianoCore.groupStampsByCategory(stamps);
    for (const cat of ['completion', 'performance', 'practice', 'milestone'] as const) {
      const groupDefs = groups[cat];
      if (groupDefs.length === 0) continue;
      const section = document.createElement('div');
      section.className = 'jr-stamp-section';

      const label = document.createElement('div');
      label.className = 'jr-stamp-section-label';
      const earnedInCat = groupDefs.filter((s) => progress.earnedStamps?.[s.id]).length;
      label.innerHTML =
        '<span>' +
        deps.t(CATEGORY_LABEL_KEY[cat]) +
        '</span>' +
        '<span class="jr-stamp-count">' +
        earnedInCat +
        ' / ' +
        groupDefs.length +
        '</span>';
      section.appendChild(label);

      const grid = document.createElement('div');
      grid.className = 'jr-stamp-grid';
      for (const stamp of groupDefs) {
        const earned = !!progress.earnedStamps?.[stamp.id];
        const tile = document.createElement('div');
        tile.className =
          'jr-stamp' +
          (earned ? ' jr-stamp-on' : ' jr-stamp-off') +
          ' ' +
          RARITY_CLASS[stamp.rarity];
        const tipLine =
          earned && stamp.tipKey
            ? '<div class="jr-stamp-tip">💡 ' + deps.t(stamp.tipKey) + '</div>'
            : '';
        tile.innerHTML =
          '<div class="jr-stamp-icon">' +
          (earned ? stamp.icon : '❓') +
          '</div>' +
          '<div class="jr-stamp-name">' +
          (earned ? deps.t(stamp.nameKey) : deps.t('stampHidden')) +
          '</div>' +
          '<div class="jr-stamp-desc">' +
          deps.t(stamp.descKey) +
          '</div>' +
          tipLine;
        grid.appendChild(tile);
      }
      section.appendChild(grid);
      target.appendChild(section);
    }
  }

  function renderCalendarTab(): void {
    const progress = deps.getProgress();
    const target = deps.dom.journalCalendar;
    const activity = deps.dom.journalActivityList;
    target.innerHTML = '';
    activity.innerHTML = '';

    const DAYS = 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayKeySet = new Set(progress.streakDays ?? []);

    // Build a Map<dayKey, sectionLabels[]> from history entries.
    const sectionsByDay = new Map<string, Set<string>>();
    for (const [songId, sp] of Object.entries(progress.songs ?? {})) {
      for (const [secId, hist] of Object.entries(sp.history ?? {})) {
        if (!Array.isArray(hist)) continue;
        for (const h of hist) {
          if (
            h != null &&
            typeof h === 'object' &&
            'd' in (h as Record<string, unknown>) &&
            typeof (h as { d?: number }).d === 'number'
          ) {
            const d = new Date((h as { d: number }).d);
            const key = deps.formatDateKey(d);
            if (!sectionsByDay.has(key)) sectionsByDay.set(key, new Set());
            sectionsByDay.get(key)?.add(songId + ':' + secId);
          }
        }
      }
    }

    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = deps.formatDateKey(d);
      const cell = document.createElement('div');
      const practiced = dayKeySet.has(key) || sectionsByDay.has(key);
      cell.className = 'jr-cal-cell' + (practiced ? ' jr-cal-cell-on' : '');
      cell.title = key + (practiced ? ' · ' + deps.t('calendarPracticed') : '');
      cell.textContent = String(d.getDate());
      target.appendChild(cell);
    }

    // Lifetime + best summary — loss-frame-free framing (Hanus & Fox 2015).
    const lifetimeDays = progress.streakDays?.length ?? 0;
    // Practice minutes — today + lifetime, cumulative-only (no goals, no
    // shortfall copy — banned-list). Hidden until the first minute lands
    // so a fresh install doesn't open on a row of zeros.
    const minutesByDay = progress.minutesByDay ?? {};
    const todayMin = Math.round(minutesByDay[deps.formatDateKey(today)] ?? 0);
    let lifetimeMin = 0;
    for (const v of Object.values(minutesByDay)) {
      if (Number.isFinite(v) && v > 0) lifetimeMin += v;
    }
    lifetimeMin = Math.round(lifetimeMin);
    const minuteStats =
      lifetimeMin >= 1
        ? '<div class="jr-cal-stat"><span class="jr-cal-stat-label">' +
          deps.t('calendarTodayMinutes') +
          '</span><span class="jr-cal-stat-value">' +
          deps.t('minutesValueFmt', { v: todayMin }) +
          '</span></div>' +
          '<div class="jr-cal-stat"><span class="jr-cal-stat-label">' +
          deps.t('calendarLifetimeMinutes') +
          '</span><span class="jr-cal-stat-value">' +
          deps.t('minutesValueFmt', { v: lifetimeMin }) +
          '</span></div>'
        : '';
    const summary = document.createElement('div');
    summary.className = 'jr-cal-summary';
    summary.innerHTML =
      '<div class="jr-cal-stat"><span class="jr-cal-stat-label">' +
      deps.t('calendarLifetimeDays') +
      '</span><span class="jr-cal-stat-value">' +
      lifetimeDays +
      '</span></div>' +
      '<div class="jr-cal-stat"><span class="jr-cal-stat-label">' +
      deps.t('calendarCurrentStreak') +
      '</span><span class="jr-cal-stat-value">' +
      (progress.streakCount ?? 0) +
      '</span></div>' +
      minuteStats;
    activity.appendChild(summary);

    if (lifetimeDays === 0) {
      const empty = document.createElement('div');
      empty.className = 'jr-empty';
      empty.textContent = deps.t('journalEmptyCalendar');
      activity.appendChild(empty);
    }
  }

  function renderPianistCard(): void {
    const target = deps.dom.journalPianistCard;
    if (!target || !deps.getPianistIdentity) {
      if (target) target.innerHTML = '';
      return;
    }
    const id = deps.getPianistIdentity();
    target.innerHTML = '';
    target.classList.toggle('is-empty', !id.name);

    if (!id.name) {
      const cta = document.createElement('button');
      cta.className = 'pianist-card-cta';
      cta.textContent = deps.t('pianistCardCta');
      cta.addEventListener('click', openEditor);
      target.appendChild(cta);
      return;
    }

    const avatar = document.createElement('div');
    avatar.className = 'pianist-card-avatar';
    avatar.textContent = id.avatar ?? '🎹';
    target.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'pianist-card-body';
    const name = document.createElement('div');
    name.className = 'pianist-card-name';
    name.textContent = id.name;
    body.appendChild(name);

    if (id.commitYear) {
      const sub = document.createElement('div');
      sub.className = 'pianist-card-commit';
      const today = new Date();
      // Approximate days remaining — uses Jan 1 of commit year as the
      // anchor so kids see a tangible countdown without us asking for
      // a month/day. Negative values fall back to a "goal reached" copy.
      const goalMs = new Date(id.commitYear, 0, 1).getTime();
      const daysLeft = Math.round((goalMs - today.getTime()) / 86400000);
      if (daysLeft > 0) {
        sub.textContent =
          deps.t('pianistCommitFmt', { y: id.commitYear }) +
          ' · ' +
          deps.t('pianistDaysLeftFmt', { n: daysLeft });
      } else {
        sub.textContent = deps.t('pianistGoalReached');
      }
      body.appendChild(sub);
    }
    target.appendChild(body);

    const edit = document.createElement('button');
    edit.className = 'pianist-card-edit';
    edit.textContent = '✎';
    edit.title = deps.t('pianistEditTitle');
    edit.setAttribute('aria-label', deps.t('pianistEditTitle'));
    edit.addEventListener('click', openEditor);
    target.appendChild(edit);
  }

  function openEditor(): void {
    deps.openPianistEditor?.();
  }

  function renderWeeklyMeter(): void {
    const target = deps.dom.journalWeeklyMeter;
    if (!target) return;
    const progress = deps.getProgress();
    const days = progress.streakDays ?? [];
    if (days.length === 0) {
      target.innerHTML = '';
      return;
    }
    const now = new Date();
    const monday = startOfIsoWeek(now);
    const weekDays = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDays.add(deps.formatDateKey(d));
    }
    let count = 0;
    for (const k of days) if (weekDays.has(k)) count++;
    const target3 = 3;
    const reached = count >= target3;
    target.innerHTML =
      '<div class="weekly-meter-row">' +
      '<span class="weekly-meter-label">' +
      deps.t('weeklyMeterLabel') +
      '</span>' +
      '<span class="weekly-meter-value' +
      (reached ? ' weekly-meter-reached' : '') +
      '">' +
      deps.t('weeklyMeterFmt', { n: count, target: target3 }) +
      (reached ? ' ✓' : '') +
      '</span>' +
      '</div>';
  }

  function render(): void {
    renderPianistCard();
    renderWeeklyMeter();
    renderLibraryRollup();
    renderRepertoireTab();
    renderStampsTab();
    renderCalendarTab();
  }

  function renderLibraryStrip(): void {
    const progress = deps.getProgress();
    const songRefs = deps.getSongs();
    const target = deps.dom.libraryMasteryStrip;
    target.innerHTML = '';
    if (songRefs.length === 0) return;

    const songs = songRefs.map(songRefToDef);
    const lib = PianoCore.computeLibraryMastery(songs, progress);
    const earnedStamps = Object.keys(progress.earnedStamps ?? {}).length;

    const stats = document.createElement('div');
    stats.className = 'lib-strip-stats';
    for (const [icon, key, vars] of [
      ['⭐', 'libStripStarsFmt', { earned: lib.starsEarned, total: lib.starsPossible }],
      ['🏅', 'libStripStampsFmt', { n: earnedStamps }],
      ['📅', 'libStripDaysFmt', { n: progress.streakDays?.length ?? 0 }],
    ] as const) {
      const span = document.createElement('span');
      span.className = 'lib-strip-stat';
      span.textContent = icon + ' ' + deps.t(key, vars);
      stats.appendChild(span);
    }
    target.appendChild(stats);

    // titleKey resolves to a translated string the user can author via the
    // rename-song flow — must NOT round-trip through innerHTML.
    const near = PianoCore.pickNearCompletion(songs, progress, 1);
    if (near.length > 0) {
      const songRef = songRefs.find((s) => s.id === near[0].songId);
      if (songRef) {
        const nearEl = document.createElement('div');
        nearEl.className = 'lib-strip-near';
        nearEl.textContent = deps.t('libStripNearFmt', {
          song: deps.t(songRef.titleKey),
          n: near[0].starsToNext,
        });
        target.appendChild(nearEl);
      }
    }
  }

  function renderStampsEarned(ids: readonly string[]): void {
    const target = deps.dom.resStampsEarned;
    if (!target) return;
    target.innerHTML = '';
    if (ids.length === 0) return;
    for (const id of ids) {
      const def = stamps.find((s) => s.id === id);
      if (!def) continue;
      const row = document.createElement('div');
      row.className = 'jr-earned-row';
      const head = document.createElement('div');
      head.className = 'jr-earned-head';
      const icon = document.createElement('span');
      icon.className = 'jr-earned-icon';
      icon.textContent = def.icon;
      const name = document.createElement('span');
      name.className = 'jr-earned-name';
      name.textContent = deps.t(def.nameKey);
      const burst = document.createElement('span');
      burst.className = 'jr-earned-burst';
      burst.textContent = '+1';
      head.appendChild(icon);
      head.appendChild(name);
      head.appendChild(burst);
      row.appendChild(head);
      if (def.tipKey) {
        const tip = document.createElement('div');
        tip.className = 'jr-earned-tip';
        tip.textContent = deps.t(def.tipKey);
        row.appendChild(tip);
      }
      target.appendChild(row);
    }
  }

  function getStampDef(id: string): StampDef | undefined {
    return stamps.find((s) => s.id === id);
  }

  function pickStretchSong(excludeSongId: string): string | null {
    const songRefs = deps.getSongs();
    const songs = songRefs.map(songRefToDef);
    const near = PianoCore.pickNearCompletion(songs, deps.getProgress(), songs.length);
    for (const entry of near) {
      if (entry.songId !== excludeSongId) return entry.songId;
    }
    return null;
  }

  function clearSectionBannerHint(): void {
    const target = deps.dom.sectionBannerHint;
    if (!target) return;
    if (target.textContent !== '') target.textContent = '';
    target.classList.remove('show');
  }

  function paintSectionBannerHint(songId: string): void {
    const target = deps.dom.sectionBannerHint;
    if (!target) return;
    const songRef = deps.getSongs().find((s) => s.id === songId);
    if (!songRef) return clearSectionBannerHint();
    const near = PianoCore.pickNearCompletion([songRefToDef(songRef)], deps.getProgress(), 1);
    if (near.length === 0 || near[0].starsToNext <= 0) return clearSectionBannerHint();
    const entry = near[0];
    target.textContent =
      '⭐ ' +
      deps.t('sectionBannerHintFmt', {
        n: entry.starsToNext,
        seal: deps.t(sealGlyph(entry.nextSeal).labelKey),
      });
    target.classList.add('show');
  }

  function applyAttempt(input: JournalAttemptInput): readonly string[] {
    const progress = deps.getProgress();
    // The song's REAL section IDs — so the "whole song" stamps evaluate the
    // sections the song actually has, not the phantom A1/B/A2 that
    // getSongProgress injects (a 1-section import must not need a never-
    // existent B/A2). Same source mastery uses (songRefToDef).
    const song = deps.getSongs().find((s) => s.id === input.songId);
    const ctx: StampContext = {
      progress,
      attempt: input,
      sectionIds: song ? song.sections.map((s) => s.id) : [],
      sessionPeakFlow: deps.getSessionPeakFlow?.(),
      knownSongIds: deps.getSongs().map((s) => s.id),
    };
    const { newlyEarned } = PianoCore.applyStampEvaluation(ctx, stamps);
    if (newlyEarned.length > 0) {
      deps.saveProgress();
    }
    renderStampsEarned(newlyEarned);
    renderLibraryStrip();
    paintSectionBannerHint(input.songId);
    return newlyEarned;
  }

  function open(initialTab: JournalTab = 'repertoire'): void {
    if (!TAB_IDS.includes(initialTab)) initialTab = 'repertoire';
    render();
    setActiveTab(initialTab);
    deps.dom.journalModal.classList.add('visible');
  }

  function close(): void {
    deps.dom.journalModal.classList.remove('visible');
  }

  function isOpen(): boolean {
    return deps.dom.journalModal.classList.contains('visible');
  }

  // Wire button + tabs + close once at construction.
  deps.dom.journalBtn.addEventListener('click', () => open());
  deps.dom.journalCloseBtn.addEventListener('click', () => close());
  deps.dom.journalModal.addEventListener('click', (e) => {
    const tgt = e.target as HTMLElement;
    if (tgt === deps.dom.journalModal) close(); // backdrop click
    const tabBtn = tgt.closest('.journal-tab') as HTMLElement | null;
    if (tabBtn && deps.dom.journalModal.contains(tabBtn)) {
      const tab = tabBtn.dataset.tab as JournalTab | undefined;
      if (tab && TAB_IDS.includes(tab)) setActiveTab(tab);
    }
  });

  return {
    open,
    close,
    render,
    renderLibraryStrip,
    renderStampsEarned,
    applyAttempt,
    getStampDef,
    paintSectionBannerHint,
    pickStretchSong,
    isOpen,
  };
}
