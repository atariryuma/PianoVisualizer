// Practice-mode scoring + timing — Phase 0d batch 36.
//
// Five concerns the practice flow uses every time the kid presses a
// key (or fails to):
//
//   1. medianRecentPitch() — neutralizes YIN's single-frame octave
//      errors at the moment of onset by taking the median of the
//      recent high-confidence pitches the mic-pipeline accumulates.
//      R2-3: 直近 PITCH_MEDIAN_WINDOW_MS（150ms）のエントリのみを対象に
//      する（時間失効なしだと休符明けに直前の音の音高を引きずる）。
//
//   2. matchNoteOnset(detectedMidi, isExact) — the funnel point for
//      both mic onsets (isExact=false) and MIDI presses (isExact=true).
//      STRICT match: only the currentNoteIdx (the very next expected
//      note) is considered — a wrong key never skips ahead in the
//      score to credit a same-pitch-class note further along the
//      timeline. A wrong key shows a fact-based "you played X" chip
//      (no miss counted, no score deduction — accuracy is hits/target);
//      in rhythm mode a MIDI wrong-press also breaks the section combo
//      and increments `extraPresses` (mash resistance — otherwise
//      sweeping every key still clears). Chord cluster matching
//      (notes within ±CHORD_MATE_TOLERANCE_MS of cur) lets the kid
//      play chord notes in any order without strict left-to-right
//      bias.
//
//   3. finalizeNoteHold(detectedMidi) — rhythm-mode only. On key
//      release, compare the physical hold time to the written
//      durMs; score = 1 at exact, 0 at full tolerance off. Guided
//      mode freezes the cursor on the current note so there's no
//      audio clock to compare against — finalize is a no-op.
//
//   4. practiceRealElapsedMs() — sample-accurate audio time. Uses
//      Tone.context.currentTime (NOT Tone.now() — that includes
//      lookAhead and would shift the visual countdown ahead of the
//      audible beeps). Offsets by audioOffsetMs ≈ outputLatency so
//      an on-the-beat press judges PERFECT.
//
//   5. practiceElapsedMs() — guided-mode aware time. Real time during
//      count-in so the 4-3-2-1 animates; after count-in, frozen at
//      the current note's timeMs so the lane parks the next-up note
//      at the hit line waiting for the kid. Rhythm/listen always use
//      real time (the song moves on its own).

import {
  isTimingInWindow,
  judgeForMode,
  TIMING_TIER_STYLE,
  LENGTH_TIER_STYLE,
  resolveLengthGrade,
  recordTimingJudgement,
  recordLengthJudgement,
  pushJudgeError,
  type TimingGrade,
  type JudgeProfile,
  type JudgeTally,
  type JudgeErrorRing,
} from '@piano/core';
import { PITCH_MEDIAN_WINDOW_MS, type RecentPitchEntry } from './core-opts';

/** Vertical band (fraction of screen height) where per-note hit effects spawn —
 *  the play zone near the falling-note hit line, above the keyboard. */
const HIT_FX_Y_FRAC = 0.72;
/** Every per-note verdict chip rides the SAME vertical bands at the pressed
 *  key's x, so feedback reads as one consistent system (they used to be
 *  scattered: timing centered, length at the key, misses centered). Timing /
 *  wrong-note / auto-miss verdicts sit above the hit effects; the length
 *  verdict sits lower (near the keyboard) so press + release chips never
 *  overprint each other. */
export const CHIP_Y_FRAC = 0.6;
export const LENGTH_CHIP_Y_FRAC = 0.82;
/** Keep chips fully on-screen for edge-of-keyboard notes. */
export const CHIP_EDGE_PX = 48;

/** Keep a verdict chip fully on-screen at the edges of the keyboard.
 *  Exported because practice-tick's auto-MISS chip must land in the same band
 *  as every other verdict — it had copied this expression with the constant
 *  inlined, so the "all chips ride one band" contract had two edge values. */
export function clampChipX(x: number, screenW: number): number {
  return Math.max(CHIP_EDGE_PX, Math.min(screenW - CHIP_EDGE_PX, x));
}
/** Chip throttle channels. The two bands above are independent visual slots,
 *  so they get independent throttle budgets — sharing one meant a release
 *  nudge could swallow the NEXT note's timing verdict at speed, which made
 *  the feedback look arbitrary. See intro-hint-ui.showHitChip. */
export const PRESS_CHIP_CHANNEL = 'press';
export const RELEASE_CHIP_CHANNEL = 'release';

/** Per-timing-grade feedback: chip kind + i18n key + effect scale + fallback
 *  tint. The burst/ripple take the NOTE's own colour (synesthesia/theme —
 *  same palette as free play and the lane tiles) so practice hits feel like
 *  the free-play visuals; the GRADE lives in the chip colour + effect size +
 *  the tile bloom. Counts stay modest so richer ≠ noisier. */
const TIMING_FX: Record<
  TimingGrade,
  { chip: string; textKey: string; color: string; burst: number; energy: number; ring: number }
> = {
  perfect: {
    chip: 'perfect',
    textKey: 'perfect',
    color: TIMING_TIER_STYLE.perfect.color,
    burst: 20,
    energy: 1.15,
    ring: 230,
  },
  great: {
    chip: 'great',
    textKey: 'gradeGreat',
    color: TIMING_TIER_STYLE.great.color,
    burst: 13,
    energy: 0.95,
    ring: 175,
  },
  good: {
    chip: 'good',
    textKey: 'gradeGood',
    color: TIMING_TIER_STYLE.good.color,
    burst: 8,
    energy: 0.7,
    ring: 0,
  },
};

/** Length-verdict colors — distinct from the timing palette so a release cue
 *  reads as its own channel: cyan pulse = held it right, amber = adjust.
 *  From the shared vocabulary (@piano/core LENGTH_TIER_STYLE) so the live
 *  pulse and the result breakdown can't drift apart. */
const LENGTH_GOOD_COLOR = LENGTH_TIER_STYLE.good.color;
const LENGTH_OFF_COLOR = LENGTH_TIER_STYLE.short.color;

/** Subset of the shell `state` we read/write. */
export interface PracticeScoringStateRef {
  /** Mic-onset pitch ring buffer the median walks.
   *  R2-3: `{ hz, t }` エントリ — t は書き込み時の tick 時刻。 */
  recentPitches?: RecentPitchEntry[];
  flow: number;
  combo: number;
  bestCombo: number;
}

/** A single note in the section timeline. Same fields the legacy
 *  OsmdLikeNote carries with the resolution flags the practice loop
 *  mutates. */
export interface PracticeNote {
  midi: number;
  hand?: string;
  timeMs?: number;
  durMs?: number;
  measureIdx?: number;
  inBarQuarters?: number;
  hit?: boolean;
  missed?: boolean;
  holdStartMs?: number;
  /** Wall-clock ms of the hit — drives the lane's moment-of-hit tile bloom. */
  hitFxMs?: number;
  _filtered?: boolean;
}

/** Subset of the practice ref the scoring functions mutate. */
export interface PracticeScoringRef {
  enabled: boolean;
  mode: 'guided' | 'rhythm' | 'listen';
  sectionNotes: PracticeNote[];
  currentNoteIdx: number;
  hits: number;
  sectionCombo: number;
  sectionBestCombo: number;
  timingScoreSum: number;
  durationScoreSum: number;
  durationScoredCount: number;
  pendingHolds: Map<number, PracticeNote>;
  /** 誤打カウント（rhythm × MIDI のみ）。減点はしない — 結果カードに事実
   *  として出すだけ + コンボが切れる（マッシュで★が取れる穴を塞ぐ）。
   *  マイクは誤検出があるので対象外。 */
  extraPresses?: number;
  /** 判定カウンタ（@piano/core JudgeTally）。チップと同じ grade をここへ
   *  積む — ライブHUDとリザルトの内訳が同一ソースを読むための単一地点。
   *  必須: createInitialPractice が常に生成する。optional にすると未配線の
   *  呼び出し側で「静かに集計されない」状態が作れてしまう。 */
  judge: JudgeTally;
  /** 直近の誤差リング（@piano/core JudgeErrorRing）。レーンの誤差バーが
   *  「早い/遅い」を分布として見せるためのソース — 段（tier）は品質のみを
   *  持つので、方向はここだけが持つ。judge と同様に必須。 */
  judgeErrors: JudgeErrorRing;
  startAudioTime: number;
  audioOffsetMs?: number | null;
  /** 明示ポーズ / タブ非表示で凍結中の生（オフセット前）経過ms。
   *  practice-visibility が freeze で設定・thaw で解除する。非 null の間、
   *  practiceRealElapsedMs はこの凍結値を返し、AudioContext クロックが
   *  進み続けてもレーン・カーソル・laneDrawFromIdx・採点が前進しない。 */
  _frozenRealElapsedMs?: number | null;
}

/** Tunables — passed in so the scoring is testable without pulling
 *  the whole CONFIG bag. Default values match the legacy CONFIG. */
export interface PracticeScoringTuning {
  /** Judgement windows for MIDI presses (exact input). */
  judgeMidi: JudgeProfile;
  /** Judgement windows for mic onsets (±30-40 ms detection jitter). Chosen
   *  per EVENT via `isExact`, not per session — a session can have both (a
   *  keyboard hot-plugged mid-section) and each press must be judged against
   *  the precision of the path it actually arrived on. */
  judgeMic: JudgeProfile;
  chordMateToleranceMs: number;
  durationMinTolMs: number;
  durationTolFraction: number;
  countInMs: number;
  /** Detection lag subtracted from the elapsed clock for MIC onsets
   *  (PianoCore.MIC_INPUT_LATENCY_MS). MIDI presses are exact → 0.
   *  Optional so older call sites default to no compensation. */
  micInputLatencyMs?: number;
}

/** Subset of the Tone surface practiceRealElapsedMs reads. */
export interface PracticeScoringToneRef {
  context?: { currentTime: number };
}

export interface PracticeScoringDeps {
  state: PracticeScoringStateRef;
  practice: PracticeScoringRef;
  tuning: PracticeScoringTuning;
  /** Pass `Tone` (the npm package / global). Undefined when Tone
   *  isn't loaded — fall back to performance.now() relative to
   *  startAudioTime treated as ms-from-epoch. */
  Tone: PracticeScoringToneRef | undefined;

  /** Visual feedback hooks. */
  showHitChip: (
    kind: string,
    text: string,
    xPx?: number,
    yPx?: number,
    /** Throttle channel — see PRESS_CHIP_CHANNEL / RELEASE_CHIP_CHANNEL. */
    channel?: string
  ) => void;
  spawnBurst: (x: number, y: number, count: number, energy: number, color?: string) => void;
  /** Expanding-ring pulse at a note's key (the "pop" on a clean hit + the
   *  length-OK cue on release). Optional so partial-DOM tests degrade. */
  spawnRipple?: (x: number, y: number, color: string, radius: number) => void;
  /** Rising particle stream from the hit zone — the free-play "light pillar".
   *  Fired on clean (perfect/great) hits only. Optional. */
  spawnStream?: (x: number, y: number, energy: number, color?: string) => void;
  /** MIDI → the note's own colour (synesthesia map when enabled, else theme
   *  palette — the SAME resolution free play and the lane tiles use), so
   *  practice hit effects match the rest of the app. Optional — falls back to
   *  the per-grade tint. */
  noteColor?: (midi: number) => string;
  /** MIDI number → screen x (the key's horizontal position) so per-note
   *  effects land under the key the kid pressed, not dead center. Optional —
   *  falls back to screen center when absent. */
  noteScreenX?: (midi: number) => number;
  /** Read fresh each call — the canvas could resize mid-section. */
  getScreen: () => { W: number; H: number };

  /** Bilingual translator. Reads 'youPlayedFmt', 'perfect', 'nice',
   *  'tooShort', 'tooLong'. */
  t: (key: string, vars?: Record<string, string>) => string;
  /** MIDI number → display name (e.g. 'C4'). */
  midiToName: (midi: number) => string;
  /** Diagnostic logger — receives one-line strings. Defaults to a
   *  no-op when omitted. */
  remoteLog?: (line: string) => void;
}

export interface PracticeScoring {
  medianRecentPitch(): number;
  /** Returns true on a hit (any chord mate match), false on miss.
   *  `inputLagMs` (optional) is per-event transport latency — e.g. the
   *  gap between a MIDI message's driver timestamp and handler execution
   *  — subtracted from the elapsed clock on top of the mic constant. */
  matchNoteOnset(detectedMidi: number, isExact: boolean, inputLagMs?: number): boolean;
  /** Rhythm-mode duration scoring on key release. */
  finalizeNoteHold(detectedMidi: number): void;
  /** Sample-accurate audio time, offset-corrected. */
  practiceRealElapsedMs(): number;
  /** Guided-mode-aware elapsed (frozen at current note in guided
   *  past count-in). Used by the lane drawer + matchNoteOnset itself. */
  practiceElapsedMs(): number;
}

/** Min gap between wrong-note chips so a kid mashing keys can't spam the
 *  HUD. Visualization only — no score penalty, no shame copy. */
const WRONG_NOTE_CHIP_THROTTLE_MS = 300;

export function createPracticeScoring(deps: PracticeScoringDeps): PracticeScoring {
  const log = deps.remoteLog ?? ((_l: string) => {});
  /** Wall-clock of the last wrong-note chip (rhythm-mode throttle). */
  let lastWrongChipMs = -Infinity;

  function medianRecentPitch(): number {
    const arr = deps.state.recentPitches;
    if (!arr || arr.length === 0) return 0;
    // R2-3: 直近 PITCH_MEDIAN_WINDOW_MS 以内のエントリだけで median を取る。
    // リング長（PITCH_MEDIAN_FRAMES=5）は YIN スロットル頻度に依存して
    // 「何秒ぶんか」が不定なので、時間失効が無いと休符明け・速いレガートで
    // 直前の音の音高を引きずり wrong-note 誤判定になる。窓内が空なら 0 を
    // 返し、呼び出し側（practice-tick の `|| pitchHz`）が生ピッチに
    // フォールバックする。
    const cutoff = performance.now() - PITCH_MEDIAN_WINDOW_MS;
    const fresh: number[] = [];
    for (const e of arr) {
      if (e.t >= cutoff) fresh.push(e.hz);
    }
    if (fresh.length === 0) return 0;
    fresh.sort((a, b) => a - b);
    return fresh[Math.floor(fresh.length / 2)];
  }

  function practiceRealElapsedMs(): number {
    // 凍結中（明示ポーズ/タブ非表示）は AudioContext クロックが進み続けても
    // 経過を凍結値へ固定。オフセットは現在値で引き直すのでポーズ中に
    // オーディオオフセットを調整しても整合する。
    const frozen = deps.practice._frozenRealElapsedMs;
    if (frozen != null) return frozen - (deps.practice.audioOffsetMs || 0);
    const tone = deps.Tone;
    const raw = tone?.context
      ? (tone.context.currentTime - deps.practice.startAudioTime) * 1000
      : performance.now() - deps.practice.startAudioTime * 1000;
    return raw - (deps.practice.audioOffsetMs || 0);
  }

  function practiceElapsedMs(): number {
    const realElapsed = practiceRealElapsedMs();
    if (deps.practice.mode === 'guided') {
      if (realElapsed < deps.tuning.countInMs) return realElapsed;
      const cur = deps.practice.sectionNotes[deps.practice.currentNoteIdx];
      return cur && cur.timeMs != null ? cur.timeMs : deps.tuning.countInMs;
    }
    return realElapsed;
  }

  /** Chip x for a note's key — clamped so edge-of-keyboard chips stay fully
   *  on-screen. Undefined (→ CSS-centered) when the shell didn't wire a key
   *  mapper, keeping partial-DOM tests / older shells working. */
  function chipX(midi: number): number | undefined {
    if (!deps.noteScreenX) return undefined;
    return clampChipX(deps.noteScreenX(midi), deps.getScreen().W);
  }

  function matchNoteOnset(detectedMidi: number, isExact: boolean, inputLagMs = 0): boolean {
    if (!deps.practice.enabled) return false;
    // Listen mode: the song plays itself, the kid is just watching/
    // listening. Don't judge or score; let any incidental key-presses
    // create free-play visuals (handled outside this function).
    if (deps.practice.mode === 'listen') return false;

    // Compensate input latency: the note was physically played BEFORE the
    // clock reads `elapsed`. Mic onsets carry a fixed detection lag; MIDI
    // presses are exact but may carry a per-event handler lag. Shifting
    // the elapsed clock back keeps an on-the-beat press from judging late.
    const latency = (isExact ? 0 : (deps.tuning.micInputLatencyMs ?? 0)) + inputLagMs;
    const elapsed = practiceElapsedMs() - latency;
    const notes = deps.practice.sectionNotes;
    // Eagerly skip past any already-resolved notes. The per-frame
    // skip-past loop normally advances currentNoteIdx, but a chord
    // played within a single frame would otherwise leave subsequent
    // presses pointing at the already-hit cur and drop them silently.
    let idx = deps.practice.currentNoteIdx;
    while (idx < notes.length && (notes[idx].hit || notes[idx].missed)) idx++;
    deps.practice.currentNoteIdx = idx;
    if (idx >= notes.length) return false;
    const cur = notes[idx];
    if (!cur || cur.timeMs == null) return false;

    // Judge against the profile for the path this press ARRIVED ON: MIDI is
    // sample-exact, the mic carries ±30-40 ms of detection jitter, so one set
    // of windows cannot serve both honestly (see @piano/core JudgeProfile).
    const profile = isExact ? deps.tuning.judgeMidi : deps.tuning.judgeMic;
    const dtSigned = elapsed - cur.timeMs; // +late, -early
    // The mode's admissibility rule lives in @piano/core (isTimingInWindow) so
    // this path and core's matchNoteOnset cannot drift apart.
    const inWindow = isTimingInWindow(deps.practice.mode, dtSigned, profile);

    // Find the played note inside the current chord cluster (cur and
    // any simultaneous notes within ±CHORD_MATE_TOLERANCE_MS). Order
    // within a chord is free — but each note must be physically
    // pressed (no auto-credit).
    let matched: PracticeNote | null = null;
    if (inWindow) {
      if (cur.midi === detectedMidi) {
        matched = cur;
      } else {
        for (let i = idx + 1; i < notes.length; i++) {
          const m = notes[i];
          if (m.timeMs == null) break;
          const diff = m.timeMs - cur.timeMs;
          if (diff > deps.tuning.chordMateToleranceMs) break;
          if (m.hit || m.missed) continue;
          if (m.midi === detectedMidi) {
            matched = m;
            break;
          }
        }
      }
    }

    // 和音の弾き直し救済: 部分正解の和音を「まるごと弾き直す」のは子どもの
    // いちばん自然なリトライだが、正解済みメンバーはカーソルの後ろにいる
    // ため、従来は youPlayed（まちがい）チップで叱られていた。現在の
    // クラスタ内に解決済みの同音があれば静かに無視する — チップ無し・
    // 減点無し・二重加点も無し。
    if (!matched) {
      const tol = deps.tuning.chordMateToleranceMs;
      let repress = false;
      for (let i = idx - 1; i >= 0; i--) {
        const m = notes[i];
        if (m.timeMs == null || cur.timeMs - m.timeMs > tol) break;
        if (m.midi === detectedMidi) {
          repress = true;
          break;
        }
      }
      if (!repress) {
        for (let i = idx + 1; i < notes.length; i++) {
          const m = notes[i];
          if (m.timeMs == null || m.timeMs - cur.timeMs > tol) break;
          if (m.midi === detectedMidi && (m.hit || m.missed)) {
            repress = true;
            break;
          }
        }
      }
      if (repress) {
        log('[Match] in=' + detectedMidi + ' re-press of resolved chord mate (ignored)');
        return false;
      }
    }

    log(
      '[Match] in=' +
        detectedMidi +
        (isExact ? ' (midi)' : ' (mic)') +
        ' expected=' +
        cur.midi +
        '@' +
        Math.round((cur.timeMs ?? 0) - elapsed) +
        'ms' +
        ' mode=' +
        deps.practice.mode +
        ' result=' +
        (matched ? (matched === cur ? 'HIT' : 'HIT(chord-mate)') : 'wrong-note')
    );

    if (!matched) {
      // Wrong-note feedback. Guided always shows it (the score is
      // frozen waiting for the right note). Rhythm shows a throttled,
      // fact-based chip too so the kid SEES which key was off — the
      // single most useful feedback in the moment. No score deduction
      // (accuracy is hits/target), no shame copy — but in rhythm mode a
      // MIDI wrong-press DOES break the section combo + count as an
      // extra press (mash resistance: without it, sweeping every key
      // still cleared the section — the "clear" lost its meaning).
      // Mic onsets are exempt (pitch misdetection would break combos
      // the kid didn't earn losing).
      if (deps.practice.mode === 'rhythm' && isExact) {
        deps.practice.sectionCombo = 0;
        deps.practice.extraPresses = (deps.practice.extraPresses ?? 0) + 1;
      }
      // Placed at the PLAYED key (same band as every other verdict chip).
      const now = performance.now();
      if (deps.practice.mode === 'guided') {
        // The RIGHT note pressed early (before the wait-window opens — e.g.
        // during the count-in) is not a mistake, it just isn't credited yet.
        // Never flash a "miss" for the note we're actually waiting for
        // (banned-list: no-shame). A genuinely wrong key still shows its
        // fact-based "you played X" chip.
        if (cur.midi !== detectedMidi) {
          deps.showHitChip(
            'miss',
            deps.t('youPlayedFmt', { v: deps.midiToName(detectedMidi) }),
            chipX(detectedMidi),
            deps.getScreen().H * CHIP_Y_FRAC,
            PRESS_CHIP_CHANNEL
          );
        }
      } else if (
        deps.practice.mode === 'rhythm' &&
        now - lastWrongChipMs >= WRONG_NOTE_CHIP_THROTTLE_MS
      ) {
        lastWrongChipMs = now;
        deps.showHitChip(
          'miss',
          deps.t('youPlayedFmt', { v: deps.midiToName(detectedMidi) }),
          chipX(detectedMidi),
          deps.getScreen().H * CHIP_Y_FRAC,
          PRESS_CHIP_CHANNEL
        );
      }
      return false;
    }

    const dtSignedMatched = elapsed - (matched.timeMs ?? 0);
    matched.hit = true;
    matched.holdStartMs = performance.now();
    // Timestamp the hit so the lane can bloom the tile at the moment of the
    // press (a satisfying pop). Separate from holdStartMs, which the release
    // path consumes for length scoring.
    matched.hitFxMs = performance.now();
    deps.practice.pendingHolds.set(detectedMidi, matched);
    deps.practice.hits++;
    deps.practice.sectionCombo++;
    if (deps.practice.sectionCombo > deps.practice.sectionBestCombo) {
      deps.practice.sectionBestCombo = deps.practice.sectionCombo;
    }
    // ONE decision for the tier the player is shown AND the credit that feeds
    // the timing percentage (@piano/core judgeForMode). These used to be
    // computed separately — an absolute threshold for the chip, a
    // window-relative ratio for the score — so a press 90 ms early was shown
    // as PERFECT and credited 25 % while 90 ms late was shown as PERFECT and
    // credited 74 %. Guided grades every onset perfect at full credit: its
    // clock waits for the kid, so there is no offset to measure.
    const isGuided = deps.practice.mode === 'guided';
    const { grade, score: ts } = judgeForMode(deps.practice.mode, dtSignedMatched, profile);
    deps.practice.timingScoreSum += ts;
    const fx = TIMING_FX[grade];
    // Tally the SAME grade the chip is about to show, and feed the error ring
    // the lane's hit-error bar reads. Guided contributes offset 0 (its clock
    // waits for the kid, so a signed offset would be meaningless) and no ring
    // entry at all — the tier count still reads as "notes played".
    recordTimingJudgement(deps.practice.judge, grade, isGuided ? 0 : dtSignedMatched);
    if (!isGuided) pushJudgeError(deps.practice.judgeErrors, dtSignedMatched);
    // Guided の和音: メンバー1音ごとに Perfect を出すと、まちがいチップと
    // 100ms スロットル（intro-hint-ui）を取り合い、「止まっているのに
    // Perfect だけ見える」が起きる。押下確認は鍵盤の点灯とレーンの緑
    // タイルが担うので、チップは和音クラスタが完成した瞬間に 1 回だけ
    // 出す（単音クラスタは従来どおり即時）。rhythm は音楽が進み続ける
    // ので従来どおり毎音出す。
    let showChip = true;
    if (deps.practice.mode === 'guided') {
      for (let i = idx; i < notes.length; i++) {
        const m = notes[i];
        if (m.timeMs == null || m.timeMs - cur.timeMs > deps.tuning.chordMateToleranceMs) break;
        if (!m.hit && !m.missed) {
          showChip = false;
          break;
        }
      }
    }
    const screen = deps.getScreen();
    if (showChip) {
      // Timing verdict — at the pressed key, same band as every other chip.
      deps.showHitChip(
        fx.chip,
        deps.t(fx.textKey),
        chipX(detectedMidi),
        screen.H * CHIP_Y_FRAC,
        PRESS_CHIP_CHANNEL
      );
    }
    deps.state.flow = Math.min(100, deps.state.flow + 6 + ts * 4);
    deps.state.combo++;
    if (deps.state.combo > deps.state.bestCombo) deps.state.bestCombo = deps.state.combo;
    // Free-play-style celebration AT the key the kid pressed: burst + ripple in
    // the NOTE's own colour (synesthesia/theme — the same palette free play and
    // the lane tiles use), sizes scaled by the timing grade, plus a rising
    // light stream on clean (perfect/great) hits. The grade signal stays in the
    // chip colour + effect size + the tile bloom.
    const fxX = deps.noteScreenX ? deps.noteScreenX(detectedMidi) : screen.W * 0.5;
    const fxY = screen.H * HIT_FX_Y_FRAC;
    const color = deps.noteColor?.(detectedMidi) ?? fx.color;
    deps.spawnBurst(fxX, fxY, fx.burst, fx.energy, color);
    if (fx.ring > 0) {
      deps.spawnRipple?.(fxX, fxY, color, fx.ring);
      deps.spawnStream?.(fxX, fxY, fx.energy, color);
    }
    // OSMD cursor advancement is driven by the per-frame skip-past
    // loop in updatePracticeFrame.
    return true;
  }

  function finalizeNoteHold(detectedMidi: number): void {
    const matched = deps.practice.pendingHolds.get(detectedMidi);
    if (!matched) return;
    deps.practice.pendingHolds.delete(detectedMidi);
    if (deps.practice.mode !== 'rhythm') return;
    if (!matched.holdStartMs || !matched.durMs) return;
    const heldMs = performance.now() - matched.holdStartMs;
    const expected = matched.durMs;
    const tol = Math.max(deps.tuning.durationMinTolMs, expected * deps.tuning.durationTolFraction);
    const score = Math.max(0, 1 - Math.abs(heldMs - expected) / tol);
    deps.practice.durationScoreSum += score;
    deps.practice.durationScoredCount++;

    // Note-length verdict — a SECOND visible dimension beyond "right note, right
    // time". Kept as its own channel so it doesn't fight the timing chip:
    //   • good hold → a soft cyan ring pulse at the key (no text — the distinct
    //     colour reads as "held it right" without adding clutter).
    //   • short / long → a gentle nudge chip placed LOW (near the key), so it
    //     never overprints the timing verdict in the upper band.
    // Gentle framing, no shame (banned-list).
    const screen = deps.getScreen();
    const lenX = deps.noteScreenX ? deps.noteScreenX(detectedMidi) : screen.W * 0.5;
    const lenY = screen.H * HIT_FX_Y_FRAC;
    const grade = resolveLengthGrade(heldMs, expected, tol);
    recordLengthJudgement(deps.practice.judge, grade);
    if (grade === 'good') {
      deps.spawnRipple?.(lenX, lenY, LENGTH_GOOD_COLOR, 150);
    } else {
      deps.spawnRipple?.(lenX, lenY, LENGTH_OFF_COLOR, 110);
      deps.showHitChip(
        grade === 'short' ? 'short' : 'long',
        deps.t(grade === 'short' ? 'lengthShort' : 'lengthLong'),
        chipX(detectedMidi) ?? lenX,
        screen.H * LENGTH_CHIP_Y_FRAC,
        RELEASE_CHIP_CHANNEL
      );
    }
  }

  return {
    medianRecentPitch,
    matchNoteOnset,
    finalizeNoteHold,
    practiceRealElapsedMs,
    practiceElapsedMs,
  };
}
