// フリープレイの「一期一会」演出 (2026-07-19)。
//
// フリープレイは「弾くと視覚的に気持ちいい」ための場だが、従来の 1 音 →
// バースト＋リップルの応答は数分で反復に感じられる。ここでは演奏の
// **音楽的な瞬間**を既存 state だけで検出し、その瞬間にしか出ない演出を
// 重ねる。すべて装飾的な祝福であり、進行・報酬・スコアには一切影響しない
// （banned-list: 変動比率強化を進行のゲートにしない、の decorative 側）。
//
//   • rangeHigh / rangeLow — セッション自己最高音・最低音の更新（更新幅
//     3 半音以上、開始 10 秒後から）。更新は単調なので同じ音では二度と
//     鳴らない = 数学的に一期一会。鍵盤の端への探索を祝う。
//   • silenceStar — 12 秒を超える静寂のあとの最初の 1 音。大きなリップル
//     に加えて、背景の星空へ「記憶の星」を 1 個だけ加える（少し大きく、
//     ゆっくり瞬く）。長く弾くほど自分の再開の星が空に並んでいく。
//   • leap — 1 オクターブ以上の跳躍（直前 2 秒以内に前の音があるとき
//     だけ = フレーズ内の跳躍。クールダウン 8 秒）。前の音の位置から
//     放物線のバースト・トレイルが飛ぶ。
//
// 検出はすべて決定論的（乱数はパーティクルの散り方だけ）。トリガー条件は
// 子どもが「見て・狙える」ものに限定している。

/** 演出プリミティブ — midi-handlers / mic-pipeline が使うものと同じ。 */
export interface FreeplayMomentsDeps {
  spawnBurst(x: number, y: number, count: number, energy: number, color?: string): void;
  spawnStream(x: number, y: number, energy: number, color?: string): void;
  ripples: { push(r: unknown): void };
  Ripple: new (x: number, y: number, color: string, maxRadius: number) => unknown;
  /** 背景星フィールド（BgState）。silenceStar が記憶の星を push する。
   *  未初期化（タイトル前）なら null。 */
  getBgStars(): { stars?: Array<Record<string, number>> } | null;
  getScreen(): { W: number; H: number };
}

export interface FreeplayMoments {
  /** フリープレイの 1 音ごとに呼ぶ。noteX/noteY/color は呼び出し元の
   *  通常演出と同じ値を渡す（同じ場所・同じ色で「上乗せ」される）。 */
  onNote(midi: number, noteX: number, noteY: number, color: string, timeMs: number): void;
  /** セッションリセット（タイトルへ戻る等）で呼ぶ。 */
  reset(): void;
}

/** 音域更新とみなす最小の更新幅（半音）。 */
const RANGE_MIN_DELTA_SEMITONES = 3;
/** セッション最初の探索（初期レンジ確定）を祝わないための助走時間。 */
const RANGE_WARMUP_MS = 10_000;
/** 跳躍とみなす音程（半音）。 */
const LEAP_SEMITONES = 12;
/** 跳躍演出のクールダウン — 跳躍の多い曲での乱発防止。 */
const LEAP_COOLDOWN_MS = 8_000;
/** フレーズ内の跳躍とみなす直前音との最大間隔。 */
const LEAP_MAX_GAP_MS = 2_000;
/** 「静寂」とみなす無音時間（SILENCE_HARD_DECAY_MS と同じ 12 秒）。 */
const SILENCE_STAR_MS = 12_000;
/** 記憶の星の上限 — 長時間セッションでも星空の描画コストを固定する。 */
const MAX_MEMORY_STARS = 24;

export function createFreeplayMoments(deps: FreeplayMomentsDeps): FreeplayMoments {
  let minMidi: number | null = null;
  let maxMidi: number | null = null;
  // 0 は正当な timeMs でありうる（テスト・クロック起点直後）ため、未発音
  // のセンチネルは null にする。
  let firstNoteMs: number | null = null;
  let lastNoteMs: number | null = null;
  let lastMidi: number | null = null;
  let lastNoteX = 0;
  let lastLeapFireMs = -Infinity;
  let memoryStars = 0;

  function reset(): void {
    minMidi = null;
    maxMidi = null;
    firstNoteMs = null;
    lastNoteMs = null;
    lastMidi = null;
    lastNoteX = 0;
    lastLeapFireMs = -Infinity;
    // 星フィールド自体は initBgStars がセッション境界で再生成する。
    memoryStars = 0;
  }

  /** 上昇の柱 — 高音側のレンジ更新。 */
  function spawnRangeHigh(noteX: number, noteY: number, color: string): void {
    deps.spawnBurst(noteX, noteY, 26, 1.4, color);
    deps.spawnStream(noteX, noteY, 1.2, color);
    deps.spawnStream(noteX - 24, noteY + 20, 0.9, color);
    deps.spawnStream(noteX + 24, noteY + 20, 0.9, color);
  }

  /** 深く広がる波 — 低音側のレンジ更新。 */
  function spawnRangeLow(noteX: number, noteY: number, color: string): void {
    deps.ripples.push(new deps.Ripple(noteX, noteY, color, 520));
    deps.spawnBurst(noteX, noteY, 30, 1.2, color);
  }

  /** 放物線トレイル — 前の音から今の音へ飛ぶ流れ星。 */
  function spawnLeap(fromX: number, noteX: number, noteY: number, color: string): void {
    const { H } = deps.getScreen();
    const arcH = H * 0.18;
    for (let i = 0; i <= 4; i++) {
      const f = i / 4;
      const x = fromX + (noteX - fromX) * f;
      const y = noteY - Math.sin(f * Math.PI) * arcH;
      deps.spawnBurst(x, y, i === 4 ? 18 : 6, 0.8 + f * 0.6, color);
    }
    deps.ripples.push(new deps.Ripple(noteX, noteY, color, 320));
  }

  /** 静寂明けの一番星 — 大リップル + 空に残る記憶の星。 */
  function spawnSilenceStar(noteX: number, noteY: number, color: string): void {
    const { W, H } = deps.getScreen();
    deps.ripples.push(new deps.Ripple(noteX, noteY, color, 480));
    deps.spawnBurst(noteX, Math.max(H * 0.2, noteY * 0.6), 16, 1.0, color);
    const bg = deps.getBgStars();
    if (bg && Array.isArray(bg.stars) && memoryStars < MAX_MEMORY_STARS) {
      memoryStars++;
      // 弾いた音の X 付近の「空」（上部 6〜24%）に、通常（size 0.5〜2.5 /
      // speed 0.01〜0.03）より大きくゆっくり瞬く星を 1 個。
      const jitter = (Math.random() - 0.5) * W * 0.06;
      bg.stars.push({
        x: Math.min(W * 0.97, Math.max(W * 0.03, noteX + jitter)),
        y: H * (0.06 + Math.random() * 0.18),
        size: 2.6 + Math.random() * 0.9,
        twinkle: Math.random() * Math.PI * 2,
        speed: 0.004 + Math.random() * 0.004,
      });
    }
  }

  function onNote(midi: number, noteX: number, noteY: number, color: string, timeMs: number): void {
    if (firstNoteMs === null) firstNoteMs = timeMs;
    const sinceLast = lastNoteMs !== null ? timeMs - lastNoteMs : Infinity;

    // 静寂の一番星 — 12 秒超の無音のあとの最初の 1 音。
    if (lastNoteMs !== null && sinceLast >= SILENCE_STAR_MS) {
      spawnSilenceStar(noteX, noteY, color);
    }

    // 音域のはじめて — 自己最高・最低の更新（3 半音以上 / 助走後）。
    // minMidi/maxMidi は「ランドマーク」: 助走中は無音で追従し、助走後は
    // **祝ったときだけ**前進する。祝わない +1/+2 更新でも前進させると、
    // 半音ずつ探索する子は閾値を永遠に跨げなくなる（累積で祝えるように
    // 基準は据え置く）。
    if (minMidi === null || maxMidi === null) {
      minMidi = midi;
      maxMidi = midi;
    } else if (timeMs - firstNoteMs < RANGE_WARMUP_MS) {
      if (midi > maxMidi) maxMidi = midi;
      if (midi < minMidi) minMidi = midi;
    } else if (midi >= maxMidi + RANGE_MIN_DELTA_SEMITONES) {
      maxMidi = midi;
      spawnRangeHigh(noteX, noteY, color);
    } else if (midi <= minMidi - RANGE_MIN_DELTA_SEMITONES) {
      minMidi = midi;
      spawnRangeLow(noteX, noteY, color);
    }

    // 流れ星の跳躍 — フレーズ内（≤2 秒）の 1 オクターブ超ジャンプ。
    if (
      lastMidi !== null &&
      sinceLast <= LEAP_MAX_GAP_MS &&
      Math.abs(midi - lastMidi) >= LEAP_SEMITONES &&
      timeMs - lastLeapFireMs >= LEAP_COOLDOWN_MS
    ) {
      lastLeapFireMs = timeMs;
      spawnLeap(lastNoteX, noteX, noteY, color);
    }

    lastMidi = midi;
    lastNoteMs = timeMs;
    lastNoteX = noteX;
  }

  return { onNote, reset };
}
