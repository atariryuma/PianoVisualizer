// Auto-section detection for user-added MusicXML scores.
//
// Emits 3 sections (A1 / B / A2) for any score with ≥3 measures; a very
// short score (`total < 3`, where a length-thirds split would overlap) gets a
// SINGLE A1 spanning the whole piece. Consumers must therefore handle a
// variable section count (1 or 3) — the section editor renders one row per
// actual section, and the progression reads a song's real `sectionIds` (not
// the hardcoded A1/B/A2 fallback). Boundary candidates are scored by musical
// priority:
//
//   1. <rehearsal> marks      — composer/editor's explicit roadmap
//   2. Double bar lines       — strongest structural hint after rehearsal marks
//   3. Forward repeat starts  — section boundary by convention
//   4. Key signature changes  — modulations often == new section
//   5. Time signature changes — meter shift often == new section
//   6. Length-thirds          — last-resort fallback
//
// Best candidate near each ideal-third position wins, with a per-measure
// distance penalty.

export interface SectionDef {
  id: 'A1' | 'B' | 'A2';
  nameKey: 'userSecA1' | 'userSecB' | 'userSecA2';
  descKey: 'userSecA1desc' | 'userSecBdesc' | 'userSecA2desc';
  startMeasure: number;
  isBoss: boolean;
}

export interface SectionCandidates {
  rehearsal: number[];
  doubleBar: number[];
  repeatFwd: number[];
  keyChange: number[];
  timeChange: number[];
  total: number;
}

export interface AutoSectionOptions {
  parser?: { parseFromString(text: string, type: string): Document };
  /** 走査対象パートの index（part-list 順、既定 0）。範囲外は 0 に
   *  フォールバック。 */
  partIndex?: number;
}

/**
 * Walk MusicXML and collect all candidate boundary measures, keyed by signal type.
 * Returned indices are 0-based source-measure indices.
 */
export function collectSectionCandidates(
  xmlText: string,
  opts: AutoSectionOptions = {}
): SectionCandidates {
  const ParserCtor = opts.parser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
  if (!ParserCtor) throw new Error('DOMParser not available; pass opts.parser');
  const parser = 'parseFromString' in ParserCtor ? ParserCtor : new (ParserCtor as any)();
  const dom = parser.parseFromString(xmlText, 'text/xml');
  const out: SectionCandidates = {
    rehearsal: [],
    doubleBar: [],
    repeatFwd: [],
    keyChange: [],
    timeChange: [],
    total: 0,
  };
  const partEls = dom.querySelectorAll('part');
  if (partEls.length === 0) return out;

  // 範囲外の partIndex は 0（先頭パート）にフォールバック。
  const rawIdx = opts.partIndex ?? 0;
  const partIdx = rawIdx >= 0 && rawIdx < partEls.length ? rawIdx : 0;
  const measures = partEls[partIdx].querySelectorAll('measure');
  out.total = measures.length;

  let prevKey: string | null = null;
  let prevTime: string | null = null;

  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];

    if (m.querySelector('direction-type > rehearsal')) out.rehearsal.push(i);

    const barlines = m.querySelectorAll('barline') as NodeListOf<Element>;
    for (let bi = 0; bi < barlines.length; bi++) {
      const bl = barlines[bi];
      const style = bl.querySelector('bar-style')?.textContent ?? '';
      if (style === 'light-light') {
        const loc = bl.getAttribute('location') ?? 'right';
        const idx = loc === 'right' ? i + 1 : i;
        if (idx > 0 && idx < measures.length) out.doubleBar.push(idx);
      }
      const repeats = bl.querySelectorAll('repeat') as NodeListOf<Element>;
      for (let ri = 0; ri < repeats.length; ri++) {
        if (repeats[ri].getAttribute('direction') === 'forward') out.repeatFwd.push(i);
      }
    }

    const keyEl = m.querySelector('attributes > key > fifths');
    if (keyEl) {
      const k = keyEl.textContent ?? '';
      if (prevKey != null && k !== prevKey) out.keyChange.push(i);
      prevKey = k;
    }

    const timeEl = m.querySelector('attributes > time');
    if (timeEl) {
      const sig =
        (timeEl.querySelector('beats')?.textContent ?? '') +
        '/' +
        (timeEl.querySelector('beat-type')?.textContent ?? '');
      if (prevTime != null && sig !== prevTime) out.timeChange.push(i);
      prevTime = sig;
    }
  }
  return out;
}

const CANDIDATE_SCORES = {
  rehearsal: 100,
  doubleBar: 80,
  repeatFwd: 60,
  keyChange: 50,
  timeChange: 40,
} as const;
const DISTANCE_PENALTY_PER_MEASURE = 4;

/**
 * Pick A1/B/A2 boundaries from the MusicXML text.
 *
 * @param xmlText Raw MusicXML.
 * @param measureCount Optional override; if omitted, uses the count from the first part.
 */
export function autoSectionDefs(
  xmlText: string,
  measureCount?: number,
  opts: AutoSectionOptions = {}
): SectionDef[] {
  const cand = collectSectionCandidates(xmlText, opts);
  const total = Math.max(1, measureCount ?? cand.total);

  // Degenerate output guard: with `total < 3`, the length-thirds fallback
  // produces overlapping or out-of-range boundaries (B starting at the same
  // measure as A1, or A2 = total - 1 = 0 / 1). Downstream `buildSectionNotes`
  // then yields an empty section. Collapse to a single A1 spanning the whole
  // piece — the section editor lets the user split it manually if desired.
  if (total < 3) {
    return [
      { id: 'A1', nameKey: 'userSecA1', descKey: 'userSecA1desc', startMeasure: 0, isBoss: false },
    ];
  }

  const pool: Array<{ idx: number; score: number }> = [];
  const pushAll = (idxs: number[], score: number) => {
    for (const i of idxs) {
      if (i > 0 && i < total) pool.push({ idx: i, score });
    }
  };
  pushAll(cand.rehearsal, CANDIDATE_SCORES.rehearsal);
  pushAll(cand.doubleBar, CANDIDATE_SCORES.doubleBar);
  pushAll(cand.repeatFwd, CANDIDATE_SCORES.repeatFwd);
  pushAll(cand.keyChange, CANDIDATE_SCORES.keyChange);
  pushAll(cand.timeChange, CANDIDATE_SCORES.timeChange);

  const idealB1 = Math.floor(total / 3);
  const idealB2 = Math.floor((2 * total) / 3);
  const tol = Math.max(2, Math.floor(total * 0.25));

  const pickNear = (target: number, exclude: number): number => {
    let best = target;
    let bestScore = -Infinity;
    for (const c of pool) {
      if (c.idx === exclude) continue;
      const dist = Math.abs(c.idx - target);
      if (dist > tol) continue;
      const score = c.score - dist * DISTANCE_PENALTY_PER_MEASURE;
      if (score > bestScore) {
        bestScore = score;
        best = c.idx;
      }
    }
    return best;
  };

  const b1 = pickNear(idealB1, -1);
  let b2 = pickNear(idealB2, b1);
  if (b2 <= b1) b2 = Math.min(total - 1, b1 + 1);

  return [
    { id: 'A1', nameKey: 'userSecA1', descKey: 'userSecA1desc', startMeasure: 0, isBoss: false },
    { id: 'B', nameKey: 'userSecB', descKey: 'userSecBdesc', startMeasure: b1, isBoss: false },
    { id: 'A2', nameKey: 'userSecA2', descKey: 'userSecA2desc', startMeasure: b2, isBoss: true },
  ];
}

// =====================================================================
// Section assembly — turns SectionDef[] (start-measure markers) into the
// PracticeSectionDef shape (start/end seconds) the practice runner consumes.
// =====================================================================

/** Source-note shape this assembler reads. Matches the bundled-song /
 *  user-song schema's pre-section row. */
export interface SectionBuildSourceNote {
  measureIdx: number;
  timeSec: number;
}

/** Optional per-source-measure start time array (length = source measure
 *  count). When provided, section starts align to the MEASURE BOUNDARY
 *  rather than the first note's onset — this preserves leading rests
 *  (anacrusis padding, mid-section opening rests) so the lane and the
 *  score's rest symbols stay visually aligned. */
export type MeasureStartSec = ReadonlyArray<number>;

export interface BuiltSection<TDef extends { id: string }> {
  id: TDef['id'];
  nameKey: string;
  descKey: string;
  isBoss: boolean;
  startSec: number;
  endSec: number;
}

/** Section def shape this assembler accepts — superset of the bundled and
 *  auto-section formats. */
export interface BuildSectionsInputDef {
  id: string;
  nameKey: string;
  descKey: string;
  isBoss?: boolean;
  startMeasure: number;
}

/**
 * Build per-section play windows from start-measure defs + the song's note
 * timeline. The section starts at its first measure's BOUNDARY when a
 * measureStartSec table is supplied — this preserves leading rests
 * (anacrusis padding / opening silence) so the lane's empty space at the
 * top of a section visually matches the score's leading rest. Without the
 * table we fall back to "first note's timeSec", which crops leading rests
 * (the legacy behavior — kept so older callers still work).
 *
 * Pure: no DOM, no globals — both the bundled-song path and the user-song
 * importer call this; previously each had its own inline copy.
 */
export function buildSectionsFromDefs<TDef extends BuildSectionsInputDef>(
  notes: ReadonlyArray<SectionBuildSourceNote>,
  totalSec: number,
  defs: ReadonlyArray<TDef>,
  measureStartSec?: MeasureStartSec
): BuiltSection<TDef>[] {
  const startSecs = defs.map((d) => {
    if (measureStartSec && d.startMeasure >= 0 && d.startMeasure < measureStartSec.length) {
      return measureStartSec[d.startMeasure];
    }
    const first = notes.find((n) => n.measureIdx >= d.startMeasure);
    return first ? first.timeSec : totalSec;
  });
  return defs.map((d, i) => ({
    id: d.id as TDef['id'],
    nameKey: d.nameKey,
    descKey: d.descKey,
    isBoss: !!d.isBoss,
    startSec: startSecs[i],
    endSec: i + 1 < defs.length ? startSecs[i + 1] : totalSec + 1,
  }));
}
