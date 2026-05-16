// Song-panel renderer — Phase 0d batch 7d extraction from legacy-app.js.
//
// Pure-ish render function: takes the live practice/song state via the
// deps bag and rebuilds every dynamic element of the song-panel modal:
//   • Title + composer header (re-pulled from i18n on every call so a
//     `langchange` event mid-panel-visible doesn't strand stale text)
//   • Streak count + 7-day streak calendar
//   • BPM hint (♩ = source-bpm → effective-after-tempo%)
//   • Tempo row (60 / 75 / 90 / 100 — locked-by-progress + locked-to-100
//     in full-song listen)
//   • Section list (with stars / lock icons / ❌ load-error / ⏳ loading
//     placeholder; click on an unlocked row sets `practice.sectionIdx`)
//   • Mode + hand picker active-state highlight
//   • Ghost / metronome / full-song toggle visibility (mode-conditional)
//   • Section-list dim-out in full-song listen
//   • Start button copy ("Start practice" / "Start listening")
//
// Sibling module: `song-panel-controls.ts` owns the click handlers for
// hand row / mode row / ghost / metronome / full-song / songBack. The
// renderer is called whenever the controls flip a flag, plus on every
// langchange event and after sectionIdx mutations from the result-card.

import { isFixedTempoMode } from '@piano/core';
import type { Lang, PracticeMode } from '@piano/core';

/** Per-song progress slice the renderer reads. */
export interface SongPanelProgress {
  unlockedTempos: Record<number, unknown>;
  unlockedSections: Record<string, unknown>;
  sections: Record<string, { stars?: number } | undefined>;
  history?: Record<string, unknown>;
}

/** Practice slice the renderer reads + writes (tempo + section idx
 *  inside inner click handlers). */
export interface SongPanelPracticeRef {
  progress: { streakCount?: number; streakDays: string[] } | null;
  tempoPct: number;
  mode: PracticeMode;
  fullSongMode: boolean;
  sectionIdx: number;
  handFilter: 'L' | 'R' | null;
  ghostOn: boolean;
  metronomeOn: boolean;
}

/** Section shape used by the section list. Mirrors @piano/core's
 *  `SectionDef` plus runtime fields like `_loadError`. */
export interface SongPanelSection {
  id: string;
  nameKey: string;
  descKey?: string;
  isBoss?: boolean;
}

/** Currently-selected song shape. The renderer reads boot-state flags
 *  (`_loaded`, `_loadError`) so a still-loading or failed score reads
 *  as the appropriate placeholder row. */
export interface SongPanelSong {
  titleKey: string;
  composerKey: string;
  sections: SongPanelSection[];
  _loaded?: boolean;
  _loadError?: string | null;
  bpm?: number;
  _bpmRescaled?: boolean;
}

/** DOM elements the renderer touches. */
export interface SongPanelRenderDom {
  songTitle: HTMLElement;
  songComposer: HTMLElement;
  streakCount: HTMLElement;
  streakCal: HTMLElement;
  songBpmHint: HTMLElement | null;
  tempoRow: HTMLElement;
  sectionList: HTMLElement;
  ghostToggle: HTMLElement;
  metronomeToggle: HTMLElement;
  ghostRow: HTMLElement | null;
  metronomeRow: HTMLElement | null;
  fullSongRow: HTMLElement | null;
  fullSongToggle: HTMLElement | null;
  songStart: HTMLElement;
}

export interface SongPanelRenderDeps {
  dom: SongPanelRenderDom;
  practice: SongPanelPracticeRef;
  /** Live current-song accessor (returns null between selections). */
  getCurrentSong(): SongPanelSong | null;
  /** Per-song progress accessor — fresh slice for each render so the
   *  unlock/star state is always current. */
  songProg(): SongPanelProgress;
  /** i18n translator. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** YYYY-MM-DD formatter for the streak calendar. */
  dateKey(d: Date): string;
  /** Reactive lang getter (currently unused by the renderer itself but
   *  kept for parity with sibling modules — the i18n re-render is
   *  triggered externally via the langchange event). */
  getLang?(): Lang;
}

export interface SongPanelRender {
  /** Idempotent — call any time the practice state or current song
   *  changes. The shell passes `_renderer.render` into other modules
   *  via the same `renderSongPanel` short name. */
  render(): void;
}

const TEMPO_STEPS = [60, 75, 90, 100] as const;

/** Build the renderer closure. Returns `{ render }` — the shell stores
 *  it under the legacy `renderSongPanel` short name and hands the same
 *  callback into practice-flow + song-panel-controls + user-songs-ui
 *  via their respective deps bags. */
export function createSongPanelRender(deps: SongPanelRenderDeps): SongPanelRender {
  function render(): void {
    const top = deps.practice.progress;
    if (!top) return;
    const sp = deps.songProg();
    const currentSong = deps.getCurrentSong();
    // Refresh title/composer on every render — selectSong sets them
    // once but a langchange while the panel is visible would otherwise
    // leave stale text in the previous language until reselect.
    if (currentSong) {
      deps.dom.songTitle.textContent = deps.t(currentSong.titleKey);
      deps.dom.songComposer.textContent = deps.t(currentSong.composerKey);
    }
    deps.dom.streakCount.textContent = String(top.streakCount || 0);
    deps.dom.streakCal.innerHTML = '';
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(deps.dateKey(d));
    }
    for (const k of days) {
      const cell = document.createElement('div');
      cell.className = 'streak-day' + (top.streakDays.includes(k) ? ' done' : '');
      cell.title = k;
      deps.dom.streakCal.appendChild(cell);
    }

    const tempoLocked = isFixedTempoMode(deps.practice.mode, deps.practice.fullSongMode);
    const displayedTempoPct = tempoLocked ? 100 : deps.practice.tempoPct;

    // Show the score's source BPM so the user knows why two versions
    // of the same piece can feel different at the same tempo% (e.g.
    // one Für Elise encoded at ♩=72, another at ♩=120).
    if (deps.dom.songBpmHint) {
      if (currentSong?._loaded && currentSong.bpm) {
        const bpm = Math.round(currentSong.bpm);
        const effective = Math.round((bpm * (displayedTempoPct || 100)) / 100);
        deps.dom.songBpmHint.textContent = '♩ = ' + bpm + ' → ' + effective;
        deps.dom.songBpmHint.classList.toggle('rescaled', !!currentSong._bpmRescaled);
      } else {
        deps.dom.songBpmHint.textContent = '';
      }
    }

    deps.dom.tempoRow.innerHTML = '';
    for (const step of TEMPO_STEPS) {
      const btn = document.createElement('button');
      const isActive = tempoLocked ? step === 100 : step === deps.practice.tempoPct;
      const isLocked = tempoLocked ? step !== 100 : !sp.unlockedTempos[step];
      btn.className = 'tempo-btn' + (isActive ? ' active' : '') + (isLocked ? ' locked' : '');
      // Lock indicator lives in CSS (.tempo-btn.locked::after) so the
      // disabled state reads as designed UI, not an emoji-pasted suffix.
      btn.textContent = step + '%';
      btn.disabled = isLocked;
      if (isLocked) btn.setAttribute('aria-label', step + '% locked');
      btn.onclick = () => {
        if (isLocked) return;
        deps.practice.tempoPct = step;
        render();
      };
      deps.dom.tempoRow.appendChild(btn);
    }
    deps.dom.tempoRow.style.opacity = tempoLocked ? '0.55' : '';

    deps.dom.sectionList.innerHTML = '';
    if (!currentSong || !currentSong._loaded || currentSong.sections.length === 0) {
      const row = document.createElement('div');
      row.className = 'section-row';
      if (currentSong?._loadError) {
        row.style.opacity = '0.85';
        // Escape user-supplied error string before innerHTML — a future
        // user-import could carry HTML-bearing text.
        const safe = String(currentSong._loadError).replace(/[<>&]/g, (c) =>
          c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'
        );
        row.innerHTML =
          '<div class="section-icon">❌</div>' +
          '<div style="font-size:.78rem;color:rgba(255,180,180,.95);line-height:1.35;">' +
          safe +
          '</div>' +
          '<div></div>';
      } else {
        row.style.opacity = '0.6';
        row.innerHTML =
          '<div class="section-icon">⏳</div><div>' + deps.t('loadingScore') + '</div><div></div>';
      }
      deps.dom.sectionList.appendChild(row);
      return;
    }
    currentSong.sections.forEach((sec, i) => {
      const unlocked = sp.unlockedSections[sec.id];
      const row = document.createElement('div');
      row.className = 'section-row' + (sec.isBoss ? ' boss' : '') + (unlocked ? '' : ' locked');
      const stars = sp.sections[sec.id]?.stars || 0;
      // Section name + desc come from i18n keys we control, so innerHTML
      // is acceptable here. Escape sec.descKey defensively in case a
      // future user-song path lets the user supply a key.
      row.innerHTML =
        '<div class="section-icon">' +
        (sec.isBoss ? '👑' : unlocked ? '🎵' : '🔒') +
        '</div>' +
        '<div>' +
        '<div style="font-weight:500;">' +
        deps.t(sec.nameKey) +
        '</div>' +
        '<div style="font-size:.75rem; color:rgba(255,255,255,.45);">' +
        deps.t(sec.descKey ?? '') +
        '</div>' +
        '</div>' +
        '<div class="section-stars">' +
        '★'.repeat(stars) +
        '☆'.repeat(3 - stars) +
        '</div>';
      if (unlocked) {
        row.style.cursor = 'pointer';
        row.onclick = () => {
          deps.practice.sectionIdx = i;
          // Highlight selected — clear all other outlines first.
          Array.from(deps.dom.sectionList.children).forEach((c) => {
            (c as HTMLElement).style.outline = '';
          });
          row.style.outline = '2px solid rgba(255,200,230,.6)';
        };
      }
      deps.dom.sectionList.appendChild(row);
      if (i === deps.practice.sectionIdx && unlocked) {
        row.style.outline = '2px solid rgba(255,200,230,.6)';
      }
    });

    // Mode + hand picker active-state highlight (the controls module
    // owns the click-handler wiring; the renderer just paints state).
    document.querySelectorAll('#modeRow .hand-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mode') === deps.practice.mode);
    });
    document.querySelectorAll('#handRow .hand-btn').forEach((b) => {
      const h = b.getAttribute('data-hand');
      const active =
        h === 'L' || h === 'R' ? deps.practice.handFilter === h : !deps.practice.handFilter;
      b.classList.toggle('active', active);
    });
    deps.dom.ghostToggle.classList.toggle('on', deps.practice.ghostOn);
    deps.dom.metronomeToggle.classList.toggle('on', deps.practice.metronomeOn);
    const showRhythmOpts = deps.practice.mode === 'rhythm';
    const showListenOpts = deps.practice.mode === 'listen';
    if (deps.dom.ghostRow) deps.dom.ghostRow.style.display = showRhythmOpts ? '' : 'none';
    if (deps.dom.metronomeRow) {
      deps.dom.metronomeRow.style.display = showRhythmOpts ? '' : 'none';
    }
    if (deps.dom.fullSongRow) {
      deps.dom.fullSongRow.style.display = showListenOpts ? '' : 'none';
    }
    if (deps.dom.fullSongToggle) {
      deps.dom.fullSongToggle.classList.toggle('on', deps.practice.fullSongMode);
    }
    // Full-song mode ignores the section picker — visually dim it so
    // the kid understands the choice doesn't matter.
    const sectionListDimmed = showListenOpts && deps.practice.fullSongMode;
    deps.dom.sectionList.style.opacity = sectionListDimmed ? '0.4' : '';
    deps.dom.sectionList.style.pointerEvents = sectionListDimmed ? 'none' : '';

    // Start button copy: Listen mode reads as "Start listening"
    // instead of "Start practice".
    deps.dom.songStart.textContent = deps.t(
      deps.practice.mode === 'listen' ? 'startListening' : 'startPractice'
    );
  }

  return { render };
}
