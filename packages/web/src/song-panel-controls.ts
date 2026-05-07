// Song-panel controls — hand picker + mode picker + practice-toggles
// (ghost / metronome / fullSong) + songBack button. Phase 0d batch 7c
// extraction from legacy-app.js.
//
// Scope (UI-only — no audio / render-loop coupling):
//   • Hand row (#handRow .hand-btn) — Left / Both / Right; sets
//     `practice.handFilter` to 'L' | 'R' | null
//   • Mode row (#modeRow .hand-btn) — Listen / Guided / Rhythm; sets
//     `practice.mode` and triggers `renderSongPanel()` so the
//     mode-conditional rows update visibility (ghostRow shows only
//     in Rhythm; fullSongRow shows only in Listen)
//   • Ghost toggle / Metronome toggle / Full-song toggle — flip the
//     matching `practice.*` flag and re-render
//   • songBack — calls `returnToTitle()` (NOT just-hide-panel; the
//     earlier behavior left users on a bare Free Play canvas after
//     Title → Song → Back)
//
// Out of scope (left in shell — too tightly coupled to audio boot):
//   • songStart — initAudio + showRunningUI + initBgStars +
//     requestAnimationFrame(loop) + startPracticeSection
//   • renderSongPanel itself (~150 lines, future batch)
//   • startBtn (Free Play boot, similar audio-init coupling)

/** Practice slice — what the controls touch. Other practice fields
 *  exist; we only declare what the controls read or mutate. */
export interface SongPanelPracticeRef {
  handFilter: 'L' | 'R' | null;
  mode: string;
  ghostOn: boolean;
  metronomeOn: boolean;
  fullSongMode: boolean;
}

export interface SongPanelControlsDom {
  ghostToggle: HTMLElement | null;
  metronomeToggle: HTMLElement | null;
  fullSongToggle: HTMLElement | null;
  songBack: HTMLElement;
}

export interface SongPanelControlsDeps {
  dom: SongPanelControlsDom;
  practice: SongPanelPracticeRef;
  /** Re-render the entire song panel (header, section list, mode-
   *  conditional toggle rows, start button copy). Called after every
   *  mode flip so the dependent rows update. */
  renderSongPanel(): void;
  /** Back-to-title flow — provided by practice-flow.ts. */
  returnToTitle(): void;
}

/** Wire the song-panel button cluster. No return value — listeners are
 *  attached at construction. Re-render of the panel is driven by the
 *  shell calling `renderSongPanel()` initially; subsequent updates flow
 *  from the listeners themselves. */
export function createSongPanelControls(deps: SongPanelControlsDeps): void {
  // ─── hand row (Left / Both / Right) ───────────────────────────────
  document.querySelectorAll('#handRow .hand-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const h = btn.getAttribute('data-hand');
      deps.practice.handFilter = h === 'L' || h === 'R' ? h : null;
      document
        .querySelectorAll('#handRow .hand-btn')
        .forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // ─── mode row (Listen / Guided / Rhythm) ──────────────────────────
  document.querySelectorAll('#modeRow .hand-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.getAttribute('data-mode');
      if (m === 'listen' || m === 'guided' || m === 'rhythm') {
        deps.practice.mode = m;
      }
      deps.renderSongPanel();
    });
  });

  // ─── practice-toggles (ghost / metronome / full-song) ─────────────
  deps.dom.ghostToggle?.addEventListener('click', () => {
    deps.practice.ghostOn = !deps.practice.ghostOn;
    deps.renderSongPanel();
  });
  deps.dom.metronomeToggle?.addEventListener('click', () => {
    deps.practice.metronomeOn = !deps.practice.metronomeOn;
    deps.renderSongPanel();
  });
  deps.dom.fullSongToggle?.addEventListener('click', () => {
    deps.practice.fullSongMode = !deps.practice.fullSongMode;
    deps.renderSongPanel();
  });

  // ─── songBack (returns to title screen) ───────────────────────────
  // selectSong is only ever wired from the title screen, so Back must
  // return to the title even when state.running is true. Earlier
  // "if running, just hide the panel" behavior landed users on a bare
  // Free Play canvas after Title → Song → Back, contradicting intent.
  deps.dom.songBack.addEventListener('click', () => {
    deps.returnToTitle();
  });
}
