// 小節グリッド（展開後時計）— カウントイン / メトロノームの唯一の真実。
//
// score-loader が XML 直解析の ScoreTiming（per-measure 拍子・implicit・
// divisions 長）と再生順（リピート展開）から構築し、song.measureGrid に
// 載せる。expandNotesByPlaybackOrder と同じ累積時計
// （cumTime += durSec[mIdx]、欠損は 0.5s フォールバック）を共有するので
// ノート・セクション境界とグリッドが決してずれない。
//
// これを唯一のソースにすることで:
//   * 弱起（anacrusis）: ピックアップ小節の長さ = 最初の完全小節頭
//     （= GO のダウンビート）までのオフセットが構造的に求まる。
//   * 複合拍子（6/8, 3/8 …）: クリック単位が付点四分になる。
//   * 途中の拍子変更: 小節ごとの beats/beatType が追従する。
//
// グリッドが無い曲（ユーザー曲 JSON・XML 解析失敗）は呼び出し側が従来の
// 一様グリッド（四分音符クリック × 先頭拍子）へ完全フォールバックする。
//
// Pure module — DOM / OSMD 依存なし。

/** 展開後時計の 1 小節分。 */
export interface MeasureGridEntry {
  /** 展開後（リピート展開済み）タイムラインでの小節開始秒。 */
  startSec: number;
  /** 実長（秒）。弱起・部分小節は完全小節より短い。 */
  durSec: number;
  /** 拍子分子。 */
  beats: number;
  /** 拍子分母（beat-type）。 */
  beatType: number;
  /** MusicXML の implicit="yes"（弱起 / ピックアップ小節）。 */
  implicit?: boolean;
  /** actualDiv / durationDiv（< 1 は内容が公称小節長より短い部分小節）。
   *  1（完全小節）のときは省略。テンポ変化と独立に「小節の何割まで
   *  音符があるか」を保持し、拍クリックの打ち切り判定に使う。 */
  barFrac?: number;
}

/** buildMeasureGrid が読む ScoreTiming.measures のサブセット。 */
export interface MeasureGridSourceMeasure {
  timeSig: { beats: number; beatType: number };
  implicit: boolean;
  durationDiv: number;
  actualDiv: number;
}

/** 完全小節との比較トレランス。丸め誤差で 0.999… になった完全小節を
 *  部分小節と誤判定しないための下限。 */
const FULL_BAR_FRAC = 0.999;

/** 展開後時計の per-measure テーブルを構築する。
 *
 *  @param order 再生順（source measure index の列、リピート展開済み）
 *  @param measures XML 直解析の per-measure 情報（source 順）
 *  @param durSec source measure ごとの実長秒（buildMeasureTimingFromXml）
 *
 *  時計は expandNotesByPlaybackOrder と同一（cumTime += durSec[mIdx] ?? 0.5）。 */
export function buildMeasureGrid(
  order: ReadonlyArray<number>,
  measures: ReadonlyArray<MeasureGridSourceMeasure>,
  durSec: ReadonlyArray<number>
): MeasureGridEntry[] {
  const out: MeasureGridEntry[] = [];
  let cum = 0;
  for (const mIdx of order) {
    const m = measures[mIdx];
    const d = durSec[mIdx] ?? 0.5;
    if (m && m.timeSig.beats > 0 && m.timeSig.beatType > 0) {
      const frac =
        m.durationDiv > 0 && m.actualDiv > 0 ? Math.min(1, m.actualDiv / m.durationDiv) : 1;
      const entry: MeasureGridEntry = {
        startSec: cum,
        durSec: d,
        beats: m.timeSig.beats,
        beatType: m.timeSig.beatType,
      };
      if (m.implicit) entry.implicit = true;
      if (frac < FULL_BAR_FRAC) entry.barFrac = frac;
      out.push(entry);
    } else {
      // 情報欠損小節は 4/4 完全小節として扱う（クリックは均等 4 分割）。
      out.push({ startSec: cum, durSec: d, beats: 4, beatType: 4 });
    }
    cum += d;
  }
  return out;
}

/** 拍子 → クリック（拍）単位。複合拍子（分母 8・分子 3 の倍数）は
 *  付点四分 = 1.5 四分音符を 1 拍として数える（6/8 は 2 拍、3/8 は
 *  1 拍/小節）。それ以外は分母そのままの音価が 1 拍。 */
export interface MeterBeatInfo {
  /** 1 小節あたりのクリック数。 */
  clicksPerBar: number;
  /** クリック 1 個分の長さ（四分音符 = 1 とした倍率）。 */
  clickQuarters: number;
}

export function meterBeatInfo(beats: number, beatType: number): MeterBeatInfo {
  const b = beats > 0 ? beats : 4;
  const bt = beatType > 0 ? beatType : 4;
  if (bt === 8 && b % 3 === 0) {
    return { clicksPerBar: b / 3, clickQuarters: 1.5 };
  }
  return { clicksPerBar: b, clickQuarters: 4 / bt };
}

/** 秒位置 → その時刻を含む（または直前の）小節 index。全小節より前は 0。 */
export function gridIndexAtSec(grid: ReadonlyArray<MeasureGridEntry>, sec: number): number {
  let idx = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i].startSec <= sec + 1e-6) idx = i;
    else break;
  }
  return idx;
}

/** 部分小節（弱起 implicit、または内容が公称小節長より短い）か。 */
export function isPartialMeasure(m: MeasureGridEntry): boolean {
  return !!m.implicit || (m.barFrac != null && m.barFrac < FULL_BAR_FRAC);
}

/** アンカー（セクション開始秒 / 全曲アンカー秒）から「最初の完全小節頭
 *  （= GO のダウンビート）」までの秒数。アンカー小節が完全小節なら 0
 *  （従来挙動 — GO とセクション頭が一致）。弱起ならピックアップ残り長。 */
export function countInPickupSec(grid: ReadonlyArray<MeasureGridEntry>, anchorSec: number): number {
  if (!grid.length) return 0;
  const m = grid[gridIndexAtSec(grid, anchorSec)];
  if (!isPartialMeasure(m)) return 0;
  const downbeatSec = m.startSec + m.durSec;
  return Math.max(0, downbeatSec - Math.max(anchorSec, m.startSec));
}

/** カウントインを数えるべき拍子 — ダウンビートが属する「最初の完全小節」
 *  の拍子（アンカー小節が弱起なら次の小節）。グリッド空なら null。 */
export function countInMeterAtAnchor(
  grid: ReadonlyArray<MeasureGridEntry>,
  anchorSec: number
): { beats: number; beatType: number } | null {
  if (!grid.length) return null;
  let i = gridIndexAtSec(grid, anchorSec);
  if (isPartialMeasure(grid[i]) && i + 1 < grid.length) i += 1;
  const g = grid[i];
  return g.beats > 0 && g.beatType > 0 ? { beats: g.beats, beatType: g.beatType } : null;
}
