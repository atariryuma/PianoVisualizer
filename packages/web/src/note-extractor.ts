// OSMD-iterator note extractor — Phase 0c typed shell module.
//
// Walks the OSMD cursor's iterator once, producing a flat note array
// with per-note (midi, hand, timeSec, durSec, measureIdx,
// inBarQuarters) and tie metadata. Lives in packages/web/ because it
// directly touches the OSMD object graph; the timing primitives it
// uses (computeLeadingMeasureBpms / timeAtInBarQuarters) live in
// @piano/core where they're pure-testable.
//
// === Timing model ===
//
// We use the XML-derived measure timing (xmlMeasureTiming) as the
// source of truth when available — that's the only way to handle
// <metronome beat-unit> correctly and to honor mid-measure tempo
// changes. OSMD is only consulted for the iterator state (cursor step
// → measure mapping, in-bar offset).
//
// The OSMD `length.realValue` for each note is in WHOLE-NOTE units;
// that's a pure score-relative quantity (how many quarter notes the
// note occupies), independent of tempo. We multiply by the local
// quarter-BPM (from the XML tempo segment that contains this note) to
// get duration in seconds.
//
// When XML parsing fails entirely we fall back to OSMD's TempoInBPM.

import { computeLeadingMeasureBpms, mergeTiedNotes, timeAtInBarQuarters } from '@piano/core';
import type { MeasureTimingResult, ScoreTiming } from '@piano/core';

/** A single extracted note. */
export interface ExtractedNote {
  midi: number;
  hand: 'L' | 'R';
  timeSec: number;
  durSec: number;
  measureIdx: number;
  inBarQuarters: number;
  tieStart: boolean;
  tieEnd: boolean;
}

/** 伴奏対象外パート（Voice 等）のノート。練習ノーツ・採点・レーンには
 *  一切入らず、再生（お手本 / 伴奏練習のメロディ）専用。hand は
 *  mergeTiedNotes のキー整合のためだけに 'B' 固定で持つ。 */
export interface BackingNote {
  midi: number;
  hand: 'B';
  timeSec: number;
  durSec: number;
  measureIdx: number;
  inBarQuarters: number;
  tieStart: boolean;
  tieEnd: boolean;
}

/** Per-extraction telemetry attached to the return when telemetry is on. */
export interface ExtractDiag {
  totalSteps: number;
  skippedNotes: number;
  tieReport: ReturnType<typeof mergeTiedNotes>;
}

export interface ExtractResult {
  notes: ExtractedNote[];
  /** 練習対象外パート（Voice / メロディ等）のノート。単一パート譜では
   *  常に空配列。 */
  backingNotes: BackingNote[];
  measureStartSec: number[];
  measureBpm: number[];
  /** Optional telemetry — undefined (not null) so the field is omittable
   *  when collectDiag=false, and the diag-load consumer's
   *  `_diag?: DiagExtractInfo` typing accepts the result directly. */
  _diag?: ExtractDiag;
}

export interface ExtractOptions {
  /** XML-derived per-measure timing — when present + length matches
   *  OSMD's measure count, used as the source of truth (handles
   *  <metronome beat-unit> + mid-bar tempo changes). */
  xmlMeasureTiming?: MeasureTimingResult | null;
  /** Same coverage check as `xmlMeasureTiming` — both must be
   *  consistent with OSMD's measure count to enable the XML path. */
  scoreTiming?: ScoreTiming | null;
  /** Collect telemetry (totalSteps / skippedNotes / tieReport) into
   *  the `_diag` field. Default false; production keeps it off. */
  collectDiag?: boolean;
}

/** OSMD iterator surface — the few properties we actually read. The
 *  full OSMD types are wide and unstable across versions; we depend
 *  only on the legacy-tested subset. */
interface OsmdIteratorLike {
  endReached: boolean;
  CurrentMeasureIndex: number;
  currentTimeStamp: { realValue: number };
  CurrentVoiceEntries: ReadonlyArray<{
    parentSourceStaffEntry?: { parentStaff?: { idInMusicSheet?: number } };
    /** OSMD marks grace-note voice entries here. We skip them — see the
     *  skip site for why that is the genre-standard call AND why OSMD's
     *  timestamps make any other choice wrong today. */
    IsGrace?: boolean;
    Notes?: ReadonlyArray<unknown>;
    notes?: ReadonlyArray<unknown>;
  }> | null;
  moveToNext(): void;
}

/** OSMD Instrument surface — パート判別に使う最小サブセット。
 *  Staff.idInMusicSheet は OSMD 1.9 の public field（楽譜全体での
 *  通し譜表番号）。 */
export interface OsmdInstrumentLike {
  Name?: string;
  /** OSMD MidiInstrument enum 値 = GM program − 1（0 = Acoustic Grand）。 */
  MidiInstrumentId?: number;
  Staves?: ReadonlyArray<{ idInMusicSheet?: number }>;
}

/** OSMD instance surface — same minimal-subset principle. */
interface OsmdLike {
  cursor: {
    iterator: OsmdIteratorLike;
    reset(): void;
  } | null;
  Sheet?: {
    SourceMeasures?: ReadonlyArray<{
      AbsoluteTimestamp?: { realValue: number };
      Duration?: { realValue: number };
      TempoInBPM?: number;
    }>;
    Instruments?: ReadonlyArray<OsmdInstrumentLike>;
  };
  /** 抽出中だけ CursorIgnoreRepetitions を立てるために読む（optional —
   *  テストスタブには無くてよい）。 */
  EngravingRules?: { CursorIgnoreRepetitions?: boolean };
}

/** Read a note from OSMD's voice-entry note list. The shape varies
 *  across OSMD versions; we touch only the fields the legacy walker
 *  used. */
interface OsmdNoteLike {
  isRest?(): boolean;
  halfTone?: number;
  length?: { realValue: number };
  /** MusicXML `print-object="no"`. The ONE property that decides whether a
   *  note is required — see the "printed = playable" note at the skip site.
   *  OSMD defaults it to `true`, so `=== false` is the only safe test (an
   *  older build / a test stub that omits it must keep the note). */
  PrintObject?: boolean;
  /** OSMD's cue flag. Read for DIAGNOSTICS ONLY — never to skip a note.
   *  OSMD collapses `<cue/>` and `<type size="cue">` into this single
   *  boolean (`getCueNoteAndNoteTypeXml`), and the second one means nothing
   *  but "engrave this small". */
  IsCueNote?: boolean;
  isCueNote?: boolean;
  NoteTie?: OsmdTieLike;
  Tie?: OsmdTieLike;
  notetie?: OsmdTieLike;
}

interface OsmdTieLike {
  StartNote?: unknown;
  startNote?: unknown;
  /** OSMD 1.9 の実 API — タイで繋がる全ノート（終端 = 最後の要素）。
   *  `EndNote` は OSMD 1.9 には存在しない（旧バージョン/スタブ互換の
   *  フォールバックとしてのみ残す）。 */
  Notes?: ReadonlyArray<unknown>;
  notes?: ReadonlyArray<unknown>;
  EndNote?: unknown;
  endNote?: unknown;
}

// ─── パート判別（伴奏練習: どのパートが「じぶんのパート」か） ────────
//
// 業界標準（SmartMusic の My Part / Accompaniment、Synthesia の
// Background トラック）に合わせ、多パート譜は「練習パート（ピアノ）」
// と「おともパート（Voice 等 → 再生専用）」に自動2区分する。
// ミキサー UI は出さない（子ども向け簡略化）。

/** 鍵盤楽器らしい名前（英・独・日）。 */
const KEYBOARD_NAME_RE =
  /piano|klavier|keyboard|clavier|keys|organ|harpsichord|cembalo|celesta|ピアノ|鍵盤/i;

/** GM ピアノ族 = program 1–8（OSMD enum 0–7）。 */
const GM_KEYBOARD_MAX = 7;

/** 譜表番号 → 役割（'R' / 'L' = 練習パートの手、'B' = おともパート）。
 *  practiceInstrumentIdx が null のときは判別不能（単一パート含む）で、
 *  従来どおり全譜表が練習対象（staff 0 = R、他 = L）。 */
export interface StaffPlan {
  practiceInstrumentIdx: number | null;
  staffHand: Map<number, 'R' | 'L' | 'B'>;
}

/**
 * Pure: OSMD の Instruments 配列から練習対象（鍵盤）パートを推定する。
 *
 * - パートが 0/1 個 → 判別不要（全部練習対象、従来挙動）。
 * - 「2段譜 +4 / 鍵盤らしい名前 +2 / GM ピアノ族音色 +2」で採点。
 * - **鍵盤らしいパート（score>0）が 2 つ以上ある場合は分割しない**
 *   （＝全譜表を練習対象。従来挙動）。ソロピアノを左手/右手の2パートに
 *   分けた譜面や連弾を、片方だけ練習・片方 backing（＝ガイドで無音）に
 *   誤分類しないため。分割するのは「鍵盤パートがちょうど1つ＋残りは
 *   明確に非鍵盤（score 0、例: Voice/Violin）」の伴奏譜のときだけ。
 * - 練習パートの第1譜表 = R、以降 = L。他パートの譜表は 'B'。
 */
export function pickPracticeStaffPlan(instruments: ReadonlyArray<OsmdInstrumentLike>): StaffPlan {
  const none: StaffPlan = { practiceInstrumentIdx: null, staffHand: new Map() };
  if (!instruments || instruments.length <= 1) return none;

  let bestIdx = -1;
  let bestScore = 0;
  let keyboardishCount = 0;
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    let score = 0;
    if ((inst.Staves?.length ?? 0) >= 2) score += 4;
    if (inst.Name && KEYBOARD_NAME_RE.test(inst.Name)) score += 2;
    const prog = inst.MidiInstrumentId;
    if (typeof prog === 'number' && prog >= 0 && prog <= GM_KEYBOARD_MAX) score += 2;
    if (score > 0) keyboardishCount++;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  // No keyboard part, or more than one keyboard-like part (solo piano split
  // into L/R parts, a duet, …): don't split — treat every staff as practice.
  // Splitting is only safe when exactly one part is keyboard-like and the
  // rest are clearly non-keyboard accompaniment (score 0).
  if (bestIdx < 0 || keyboardishCount > 1) return none;

  const staffHand = new Map<number, 'R' | 'L' | 'B'>();
  for (let i = 0; i < instruments.length; i++) {
    const staves = instruments[i].Staves ?? [];
    for (let j = 0; j < staves.length; j++) {
      const id = staves[j]?.idInMusicSheet;
      if (typeof id !== 'number') continue;
      staffHand.set(id, i === bestIdx ? (j === 0 ? 'R' : 'L') : 'B');
    }
  }
  return { practiceInstrumentIdx: bestIdx, staffHand };
}

/**
 * Walk OSMD's iterator once, producing the flat note timeline ready
 * for the practice-state engine. Tied notes are coalesced via
 * `mergeTiedNotes` before return.
 *
 * Safety: the outer loop has a 20,000-step counter so a misbehaving
 * iterator can't infinite-loop. Per-note try/catch increments
 * `skippedNotes` when an OSMD-version-specific shape mismatch throws.
 */
export function extractNotesFromOsmd(osmd: OsmdLike, opts: ExtractOptions = {}): ExtractResult {
  if (!osmd || !osmd.cursor) {
    return { notes: [], backingNotes: [], measureStartSec: [], measureBpm: [] };
  }

  const sourceMeasures = osmd.Sheet?.SourceMeasures ?? [];
  const measureCount = sourceMeasures.length;
  const measureStartSec = new Array<number>(measureCount).fill(0);
  const measureBpm = new Array<number>(measureCount).fill(72);
  const xmlMeasureTiming = opts.xmlMeasureTiming ?? null;
  const scoreTiming = opts.scoreTiming ?? null;
  const collectDiag = opts.collectDiag ?? false;

  const haveXml =
    !!xmlMeasureTiming &&
    !!scoreTiming &&
    xmlMeasureTiming.startSec.length === measureCount &&
    scoreTiming.measures.length === measureCount;

  if (haveXml) {
    const leadingBpms = computeLeadingMeasureBpms(scoreTiming!);
    for (let i = 0; i < measureCount; i++) {
      measureBpm[i] = leadingBpms[i];
      measureStartSec[i] = xmlMeasureTiming!.startSec[i];
    }
  } else {
    for (let i = 0; i < measureCount; i++) {
      const m = sourceMeasures[i];
      const bpm = m?.TempoInBPM || measureBpm[i - 1] || 72;
      measureBpm[i] = bpm;
      if (i > 0) {
        const prev = sourceMeasures[i - 1];
        const prevDurWhole = prev?.Duration?.realValue || 0.25;
        const prevDurSec = (prevDurWhole * 4 * 60) / measureBpm[i - 1];
        measureStartSec[i] = measureStartSec[i - 1] + prevDurSec;
      }
    }
  }

  const localTime = (
    measureIdx: number,
    inBarQuarters: number
  ): { offsetSec: number; localQBpm: number } => {
    if (!haveXml) {
      const bpm = measureBpm[measureIdx];
      return { offsetSec: (inBarQuarters * 60) / bpm, localQBpm: bpm };
    }
    return timeAtInBarQuarters(
      scoreTiming!.measures[measureIdx],
      measureBpm[measureIdx],
      inBarQuarters
    );
  };

  const notes: ExtractedNote[] = [];
  const backingNotes: BackingNote[] = [];
  const staffPlan = pickPracticeStaffPlan(osmd.Sheet?.Instruments ?? []);

  // リピート追走の抑止（2重抽出バグ修正）: OSMD のイテレータは
  // CursorIgnoreRepetitions=false（カーソル追従用の既定）だと |: :| で
  // バックジャンプし、リピート区間のノートが同一 timeSec で2回抽出さ
  // れていた。展開は playback-order が担うので、抽出ウォーク中だけ
  // フラグを立て、finally で復元する（カーソル追従の挙動は壊さない）。
  const rules = osmd.EngravingRules;
  const prevIgnoreRepetitions = rules?.CursorIgnoreRepetitions;
  if (rules) rules.CursorIgnoreRepetitions = true;

  osmd.cursor.reset();
  const it = osmd.cursor.iterator;
  let cursorStep = 0;
  let skippedNotes = 0;

  try {
    walkIterator();
  } finally {
    if (rules && prevIgnoreRepetitions !== undefined) {
      rules.CursorIgnoreRepetitions = prevIgnoreRepetitions;
    }
  }

  function walkIterator(): void {
    while (!it.endReached && cursorStep < 20000) {
      try {
        const measureIdx = it.CurrentMeasureIndex;
        const measure = sourceMeasures[measureIdx];
        const measureStartTs = measure?.AbsoluteTimestamp?.realValue || 0;
        // OSMD timestamps are in WHOLE-NOTE units. Convert to quarter notes.
        const inBarQuarters = Math.max(0, it.currentTimeStamp.realValue - measureStartTs) * 4;
        const { offsetSec, localQBpm } = localTime(measureIdx, inBarQuarters);
        const timeSec = measureStartSec[measureIdx] + offsetSec;
        const voiceEntries = it.CurrentVoiceEntries;
        if (voiceEntries) {
          for (const ve of voiceEntries) {
            // Grace notes are DISPLAYED but never required — which is the
            // assessment-app convention (SmartMusic does not assess grace
            // notes, trills or other ornaments), and is the one exception to
            // "printed = playable" below.
            //
            // It is also the only correct choice while OSMD reports what it
            // does: every grace voice entry carries the SAME timestamp as its
            // main note. Measured across the shipped library (alla_turca 282
            // grace entries, gnossienne 100, nocturne 19, fur_elise 3): 100 %
            // collide, 0 % get a distinct timestamp. Extracting them as-is
            // would stack acciaccatura + main note into one chord the learner
            // must strike simultaneously. Placing them properly needs
            // performance-practice time-stealing (shorten the main note, offset
            // each grace) — a separate change, not a flag flip. The XML timing
            // reducer (score-timing.ts) likewise excludes them from the
            // measure clock, so the two stay symmetric.
            if (ve.IsGrace) continue;
            let hand: 'L' | 'R' | undefined;
            let isBacking = false;
            try {
              const idx = ve.parentSourceStaffEntry?.parentStaff?.idInMusicSheet;
              if (typeof idx === 'number') {
                const planned = staffPlan.staffHand.get(idx);
                if (planned === 'B') isBacking = true;
                else if (planned) hand = planned;
                else hand = idx === 0 ? 'R' : 'L';
              }
            } catch {
              /* pitch fallback below */
            }
            const noteList: ReadonlyArray<unknown> = ve.Notes ?? ve.notes ?? [];
            for (const rawNote of noteList) {
              try {
                const note = rawNote as OsmdNoteLike;
                if (!note) continue;
                if (note.isRest && note.isRest()) continue;
                // ── "printed = playable" (2026-07-25) ──────────────────
                // Visibility, not engraving SIZE, decides whether a note is
                // required. `drawHiddenNotes:false` (osmd-init.ts) means the
                // learner never sees a `print-object="no"` note, so we must
                // never ask for one — those are the engraver's playback-only
                // realizations (K.545 bar 15 hides `A5 G5 A5 G5 A5 G5` behind
                // a printed `tr`; Clair de lune hides tie-continuation dupes).
                //
                // This REPLACED a skip on `IsCueNote`, which was the same bug
                // mirrored: OSMD's `getCueNoteAndNoteTypeXml` folds `<cue/>`
                // AND `<type size="cue">` into one flag, and the second is
                // pure engraving size — how a cadenza is set. Skipping on it
                // silently dropped whole passages that ARE printed: La
                // Campanella bars 75-87 / 103-105 (the entire right-hand run),
                // Liebestraum's two cadenzas, Moonlight iii, BWV 847.
                if (note.PrintObject === false) continue;
                if (note.halfTone == null) continue;
                const midi = note.halfTone + 12;
                if (!hand) hand = midi >= 60 ? 'R' : 'L';
                const lengthQuarters = (note.length?.realValue ?? 0.25) * 4;
                const durSec = Math.max(0.05, (lengthQuarters * 60) / localQBpm);
                let tieStart = false;
                let tieEnd = false;
                try {
                  const tie = note.NoteTie || note.Tie || note.notetie;
                  if (tie) {
                    const isStart = tie.StartNote === rawNote || tie.startNote === rawNote;
                    // OSMD 1.9 の Tie に EndNote は無い — 終端は Notes 配列の
                    // 最後の要素。EndNote 判定だけだと終端ノートが「start でも
                    // end でもない」→ 両フラグ付与になり、mergeTiedNotes の
                    // チェーン探索が真の終端で止まらず、同音の後続タイまで
                    // 過剰併合されていた。
                    const tieNotes = tie.Notes ?? tie.notes;
                    const isEnd =
                      Array.isArray(tieNotes) && tieNotes.length > 0
                        ? tieNotes[tieNotes.length - 1] === rawNote
                        : tie.EndNote === rawNote || tie.endNote === rawNote;
                    if (isStart && !isEnd) tieStart = true;
                    else if (isEnd && !isStart) tieEnd = true;
                    else {
                      tieStart = true;
                      tieEnd = true;
                    }
                  }
                } catch {
                  /* OSMD version differences */
                }
                if (isBacking) {
                  backingNotes.push({
                    midi,
                    hand: 'B',
                    timeSec,
                    durSec,
                    measureIdx,
                    inBarQuarters,
                    tieStart,
                    tieEnd,
                  });
                } else {
                  notes.push({
                    midi,
                    hand,
                    timeSec,
                    durSec,
                    measureIdx,
                    inBarQuarters,
                    tieStart,
                    tieEnd,
                  });
                }
              } catch {
                skippedNotes++;
              }
            }
          }
        }
      } catch {
        skippedNotes++;
      }
      try {
        it.moveToNext();
      } catch {
        break;
      }
      cursorStep++;
    }
    // ステップ上限に到達＝endReached 前に打ち切った＝楽譜が途中で切れて
    // いる。collectDiag の有無に関わらず警告し、切り詰めに気付けるようにする。
    if (!it.endReached && cursorStep >= 20000 && typeof console !== 'undefined') {
      console.warn('[OSMD] step cap reached — score truncated (' + cursorStep + ' steps)');
    }
  }
  try {
    osmd.cursor.reset();
  } catch {
    /* ignore */
  }

  notes.sort((a, b) => a.timeSec - b.timeSec || a.midi - b.midi);

  if (skippedNotes > 0 && typeof console !== 'undefined') {
    console.warn('[OSMD] skipped ' + skippedNotes + ' unformattable note(s)');
  }

  // Coalesce tied notes so the kid doesn't have to re-strike a held pitch.
  const tieReport = mergeTiedNotes(notes, { collectSamples: collectDiag });

  // おともパートも同様にタイ結合（別配列で行うことで、同音のパート間
  // タイ誤結合を構造的に防ぐ）。
  backingNotes.sort((a, b) => a.timeSec - b.timeSec || a.midi - b.midi);
  mergeTiedNotes(backingNotes, { collectSamples: false });

  return {
    notes,
    backingNotes,
    measureStartSec,
    measureBpm,
    ...(collectDiag ? { _diag: { totalSteps: cursorStep, skippedNotes, tieReport } } : {}),
  };
}
