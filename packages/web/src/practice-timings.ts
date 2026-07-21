// Practice timing math + section-banner UI — Phase 0d batch 55.
//
// Three tightly-coupled timing helpers + the section-banner DOM
// writer, bundled because every caller of `recomputePracticeTimings`
// or `showSectionBanner` is in the practice-section-start path.
//
//   - effectiveTempoPct(): listen+fullSong → 100 (don't slow down a
//     full-song playthrough); otherwise practice.tempoPct (60/75/90/
//     100 from the kid's slider).
//
//   - practiceBeatMs(): one beat (quarter note) in milliseconds at
//     the current effective tempo. Falls back to 72 BPM when the
//     song record is missing a bpm field (older user-imported
//     scores).
//
//   - recomputePracticeTimings(): refresh the COUNT_IN_MS and
//     LANE_LOOKAHEAD_MS shell lets, then push them into the practice-
//     lane factory's hot-path settings. The lane is a singleton so
//     the first frame after this call sees the new tempo.
//
//   - showSectionBanner(): set the banner text, force-reflow + add
//     'show' class so the CSS animation restarts on every section
//     transition. The 👑 prefix marks "boss" sections so a kid sees
//     the harder one coming.
//
// `currentSong` flows through a thunk because the legacy shell binds
// it as a mutable let elsewhere; fresh on every call so a song
// change re-uses the new bpm immediately.

import { isFixedTempoMode, countInMeterAtAnchor } from '@piano/core';
import type { PracticeMode, MeasureGridEntry, PracticeTimingMeter } from '@piano/core';
import { fullSongAnchorSec } from './section-notes';
import type { SectionNotesSong } from './section-notes';

export interface PracticeTimingsPracticeRef {
  mode: PracticeMode;
  fullSongMode: boolean;
  tempoPct: number;
  /** カウントインのアンカー（セクション）解決に使う現在セクション。
   *  recomputePracticeTimings に明示 sectionIdx が渡らない旧経路の
   *  フォールバック。省略時 0。 */
  sectionIdx?: number;
}

export interface PracticeTimingsSong {
  bpm?: number;
  /** 小節グリッド（展開後時計）— あればカウントインを拍子の整数小節で
   *  組み、弱起の GO（ダウンビート）シフトを計算する。 */
  measureGrid?: MeasureGridEntry[];
  /** 先頭拍子（グリッドが無い曲の二次ソース — OSMD Sheet 由来）。 */
  timeSig?: { beats: number; beatType: number };
  /** セクション境界（展開後時計）— アンカー解決に startSec だけ読む。 */
  sections?: Array<{ startSec: number }>;
  /** 全曲再生アンカー（fullSongAnchorSec）の入力。 */
  notes?: Array<{ timeSec: number }>;
  backingNotes?: Array<{ timeSec: number }>;
}

export interface PracticeTimingsCoreFns {
  /** PianoCore.practiceBeatMs. */
  practiceBeatMs(bpm: number, tempoPct: number): number;
  /** PianoCore.computePracticeTimings — produces COUNT_IN_MS,
   *  LANE_LOOKAHEAD_MS, and the count-in beat count, all scaled to the
   *  current beat duration. 拍子（meter）指定時は整数小節で組まれる。 */
  computePracticeTimings(
    beatMs: number,
    opts?: { meter?: PracticeTimingMeter }
  ): {
    countInMs: number;
    laneLookaheadMs: number;
    beats: number;
    clickMs?: number;
  };
}

export interface PracticeTimingsLane {
  /** Refresh the in-memory lane scaffolding so the next frame's
   *  count-in + descent rate match the new section's tempo.
   *  countInBeats / countInClickMs / countInGoMs はカウントダウン数字と
   *  可聴クリック列を一致させるための追加情報（省略時は旧挙動）。 */
  setTimings(timings: {
    countInMs: number;
    laneLookaheadMs: number;
    countInBeats?: number;
    countInClickMs?: number;
    countInGoMs?: number;
  }): void;
}

export interface PracticeTimingsDeps {
  /** Lazy lookup — `practice` is declared after this factory site
   *  in the legacy shell (TDZ). */
  getPractice: () => PracticeTimingsPracticeRef;
  /** Lazy lookup — `currentSong` is a shell mutable let. */
  getCurrentSong: () => PracticeTimingsSong | null;
  /** PianoCore math fns. */
  fns: PracticeTimingsCoreFns;
  /** Setters that write back to the shell's COUNT_IN_MS /
   *  COUNT_IN_BEATS / LANE_LOOKAHEAD_MS lets. */
  setCountInMs: (ms: number) => void;
  /** Optional — older call sites that don't track the beat count can
   *  omit it. */
  setCountInBeats?: (n: number) => void;
  /** クリック間隔 ms（COUNT_IN_CLICK_MS）。省略可（旧呼び出し互換）。 */
  setCountInClickMs?: (ms: number) => void;
  /** GO（ダウンビート）時刻 ms（COUNT_IN_GO_MS）。省略可。 */
  setCountInGoMs?: (ms: number) => void;
  setLaneLookaheadMs: (ms: number) => void;
  /** Lazy lookup — practice-lane scaffolding singleton is built
   *  later in the shell; thunk avoids TDZ. */
  getPracticeLane: () => PracticeTimingsLane;
  /** Section-banner DOM target. Optional null guard mirrors the
   *  legacy `if (!DOM.sectionBanner) return` path. */
  sectionBannerEl: HTMLElement | null;
  /** Goal-gradient hint chip below the banner (#sectionBannerHint).
   *  journal-modal writes its text; showSectionBanner flashes it with the
   *  banner (same 2.6s arc). Optional — older shells / tests omit it. */
  sectionBannerHintEl?: HTMLElement | null;
  /** i18n. */
  t: (key: string) => string;
}

export interface PracticeTimings {
  effectiveTempoPct(): number;
  practiceBeatMs(): number;
  /** sectionIdx: これから開始するセクション（start-practice-section が
   *  practice.sectionIdx を更新する前に呼ぶため明示引数で受ける）。
   *  省略時は practice.sectionIdx（テンポ変更などの再計算経路）。 */
  recomputePracticeTimings(sectionIdx?: number): void;
  showSectionBanner(sec: { nameKey: string; isBoss?: boolean }): void;
}

export function createPracticeTimings(deps: PracticeTimingsDeps): PracticeTimings {
  function effectiveTempoPct(): number {
    const p = deps.getPractice();
    if (isFixedTempoMode(p.mode, p.fullSongMode)) return 100;
    return p.tempoPct || 100;
  }

  function practiceBeatMs(): number {
    const song = deps.getCurrentSong();
    return deps.fns.practiceBeatMs((song && song.bpm) || 72, effectiveTempoPct());
  }

  function recomputePracticeTimings(sectionIdx?: number): void {
    const p = deps.getPractice();
    const song = deps.getCurrentSong();
    const grid = song?.measureGrid;
    // 全曲ターゲット（listen の通し再生 + guided/rhythm の 1曲チャレンジ）
    // はカウントインのアンカーを曲頭（最初のアタック）に置く。
    const isFullSong = !!p.fullSongMode;

    // カウントインのアンカー（この時刻の音が countInMs に鳴る）と拍子。
    // グリッドがあれば「アンカー小節（弱起なら次の完全小節）の拍子」、
    // 無ければ先頭拍子（song.timeSig — OSMD フォールバック込み）、
    // それも無ければ meter なし = 従来の四分音符 4 拍ターゲット。
    let meter: PracticeTimingMeter | null = song?.timeSig ?? null;
    let anchorSec = 0;
    if (grid && grid.length > 0) {
      const idx = sectionIdx ?? p.sectionIdx ?? 0;
      anchorSec = isFullSong
        ? fullSongAnchorSec(song as SectionNotesSong)
        : (song?.sections?.[idx]?.startSec ?? 0);
      meter = countInMeterAtAnchor(grid, anchorSec) ?? meter;
    }

    const timings = deps.fns.computePracticeTimings(
      practiceBeatMs(),
      meter && meter.beats > 0 && meter.beatType > 0 ? { meter } : undefined
    );
    const beats = timings.beats > 0 ? timings.beats : 4;
    const clickMs =
      timings.clickMs && timings.clickMs > 0 ? timings.clickMs : timings.countInMs / beats;
    // GO（カウントイン終端の合図 = 弾き始め）は「最初の音」= countInMs に置く。
    // 弱起（アウフタクト）曲でも「GO が出たら弾き始める」で一致する。
    // 以前は GO = ダウンビート（countInMs + ピックアップ長）だったが、弱起だと
    // GO が演奏開始より後ろに来て、子どもがピックアップ音を弾き逃す原因だった
    // （エリーゼのため に等）。音楽的な厳密さ = 走行メトロノームの小節頭
    // アクセントは実ダウンビートのまま（buildMetronomeEvents が
    // section-notes 側で独立にピックアップ補正して算出）なので、伴奏の拍節感は
    // 保たれる。ノート写像（relSec × speedFactor + countInMs）も不変。
    const goMs = timings.countInMs;

    deps.setCountInMs(timings.countInMs);
    deps.setCountInBeats?.(beats);
    deps.setCountInClickMs?.(clickMs);
    deps.setCountInGoMs?.(goMs);
    deps.setLaneLookaheadMs(timings.laneLookaheadMs);
    // Refresh in lockstep so the first frame's count-in + descent
    // rate match the new section's tempo. カウントダウン数字が可聴
    // クリック列と同じアンカー（GO 逆向き配置）を使うよう追加情報も渡す。
    deps.getPracticeLane().setTimings({
      laneLookaheadMs: timings.laneLookaheadMs,
      countInMs: timings.countInMs,
      countInBeats: beats,
      countInClickMs: clickMs,
      countInGoMs: goMs,
    });
  }

  function showSectionBanner(sec: { nameKey: string; isBoss?: boolean }): void {
    if (!deps.sectionBannerEl) return;
    deps.sectionBannerEl.textContent = (sec.isBoss ? '👑 ' : '') + deps.t(sec.nameKey);
    deps.sectionBannerEl.classList.remove('show');
    void deps.sectionBannerEl.offsetWidth; // restart animation
    deps.sectionBannerEl.classList.add('show');
    // Flash the goal-gradient hint chip in the same 2.6s arc — but only when
    // journal-modal painted text into it (near-completion songs). Restart the
    // animation the same way so back-to-back sections re-flash cleanly.
    const hint = deps.sectionBannerHintEl;
    if (hint && hint.textContent !== '') {
      hint.classList.remove('show');
      void hint.offsetWidth;
      hint.classList.add('show');
    }
  }

  return { effectiveTempoPct, practiceBeatMs, recomputePracticeTimings, showSectionBanner };
}
