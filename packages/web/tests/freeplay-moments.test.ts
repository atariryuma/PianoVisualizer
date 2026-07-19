// フリープレイ一期一会演出 (freeplay-moments.ts) のテスト。
//
// 検出ロジックの決定論性を固定する:
//   • 音域更新 — 3 半音以上 + 10 秒助走 + 単調更新（同じ音では再発火しない）
//   • 静寂の一番星 — 12 秒超の無音明けの 1 音のみ + 記憶星の上限
//   • 跳躍 — フレーズ内 (≤2s) の 12 半音以上 + 8 秒クールダウン
//   • reset() で全状態が白紙に戻る
// 演出は spawn 系スパイの呼び出し有無でのみ検証（座標の芸術性は実機確認）。

import { describe, it, expect, vi } from 'vitest';
import { createFreeplayMoments, type FreeplayMomentsDeps } from '../src/freeplay-moments';

function makeFixture(over: Partial<FreeplayMomentsDeps> = {}) {
  const stars: Array<Record<string, number>> = [];
  const deps: FreeplayMomentsDeps = {
    spawnBurst: vi.fn(),
    spawnStream: vi.fn(),
    ripples: { push: vi.fn() },
    Ripple: class {
      constructor(
        public x: number,
        public y: number,
        public color: string,
        public maxRadius: number
      ) {}
    } as never,
    getBgStars: () => ({ stars }),
    getScreen: () => ({ W: 1000, H: 600 }),
    ...over,
  };
  const fm = createFreeplayMoments(deps);
  return { fm, deps, stars };
}

/** 助走を終えた基準状態を作る: t=0 に C4(60) → 10 秒経過。 */
function warmUp(fm: ReturnType<typeof makeFixture>['fm']): void {
  fm.onNote(60, 500, 300, '#fff', 0);
  fm.onNote(60, 500, 300, '#fff', 10_500);
}

describe('createFreeplayMoments — 音域のはじめて', () => {
  it('助走後に自己最高音を 3 半音以上更新すると上昇演出が出る', () => {
    const { fm, deps } = makeFixture();
    warmUp(fm);
    vi.mocked(deps.spawnStream).mockClear();
    fm.onNote(64, 700, 300, '#fff', 11_000); // 60 → 64 (+4)
    expect(deps.spawnStream).toHaveBeenCalledTimes(3); // 柱 3 本
  });

  it('低音側の更新は特大リップル', () => {
    const { fm, deps } = makeFixture();
    warmUp(fm);
    vi.mocked(deps.ripples.push).mockClear();
    fm.onNote(55, 300, 300, '#fff', 11_000); // 60 → 55 (−5)
    expect(deps.ripples.push).toHaveBeenCalledOnce();
    const r = vi.mocked(deps.ripples.push).mock.calls[0][0] as { maxRadius: number };
    expect(r.maxRadius).toBe(520);
  });

  it('更新幅 2 半音では出ない', () => {
    const { fm, deps } = makeFixture();
    warmUp(fm);
    vi.mocked(deps.spawnStream).mockClear();
    fm.onNote(62, 600, 300, '#fff', 11_000);
    expect(deps.spawnStream).not.toHaveBeenCalled();
  });

  it('助走 10 秒以内の探索では出ない（レンジは静かに広がる）', () => {
    const { fm, deps } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 0);
    fm.onNote(72, 800, 300, '#fff', 3000);
    expect(deps.spawnStream).not.toHaveBeenCalled();
  });

  it('一期一会: 同じ高さでは二度と出ない（祝った音がランドマークに）', () => {
    const { fm, deps } = makeFixture();
    warmUp(fm);
    fm.onNote(64, 700, 300, '#fff', 11_000); // 祝 → ランドマーク 64
    vi.mocked(deps.spawnStream).mockClear();
    fm.onNote(64, 700, 300, '#fff', 12_000); // 同じ音をもう一度
    expect(deps.spawnStream).not.toHaveBeenCalled();
    fm.onNote(66, 720, 300, '#fff', 13_000); // +2 — 閾値未満（基準は据え置き）
    expect(deps.spawnStream).not.toHaveBeenCalled();
    fm.onNote(67, 740, 300, '#fff', 14_000); // 64+3 — 出る
    expect(deps.spawnStream).toHaveBeenCalled();
  });

  it('半音ずつの探索でも累積 3 半音でいつかは祝われる', () => {
    const { fm, deps } = makeFixture();
    warmUp(fm);
    fm.onNote(61, 520, 300, '#fff', 11_000);
    fm.onNote(62, 540, 300, '#fff', 12_000);
    expect(deps.spawnStream).not.toHaveBeenCalled();
    fm.onNote(63, 560, 300, '#fff', 13_000); // 60+3 到達
    expect(deps.spawnStream).toHaveBeenCalled();
  });
});

describe('createFreeplayMoments — 静寂の一番星', () => {
  it('12 秒超の無音明けの 1 音で記憶星が空に追加される', () => {
    const { fm, stars } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 0);
    fm.onNote(60, 500, 300, '#abc', 13_000);
    expect(stars).toHaveLength(1);
    expect(stars[0].size).toBeGreaterThan(2.5); // 通常星より大きい
    expect(stars[0].speed).toBeLessThan(0.01); // 通常星よりゆっくり
    expect(stars[0].y).toBeLessThan(600 * 0.25); // 空の上部
  });

  it('セッション最初の 1 音では出ない（戻ってきた音だけを祝う）', () => {
    const { fm, stars } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 50_000);
    expect(stars).toHaveLength(0);
  });

  it('無音 12 秒未満では出ない', () => {
    const { fm, stars } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 0);
    fm.onNote(60, 500, 300, '#fff', 11_000);
    expect(stars).toHaveLength(0);
  });

  it('記憶星は上限 24 個で頭打ち（描画コスト固定）', () => {
    const { fm, stars } = makeFixture();
    let t = 0;
    fm.onNote(60, 500, 300, '#fff', t);
    for (let i = 0; i < 30; i++) {
      t += 13_000;
      fm.onNote(60, 500, 300, '#fff', t);
    }
    expect(stars).toHaveLength(24);
  });

  it('bgStars 未初期化でも落ちない', () => {
    const { fm } = makeFixture({ getBgStars: () => null });
    fm.onNote(60, 500, 300, '#fff', 0);
    expect(() => fm.onNote(60, 500, 300, '#fff', 13_000)).not.toThrow();
  });
});

describe('createFreeplayMoments — 流れ星の跳躍', () => {
  it('フレーズ内の 12 半音跳躍でトレイル + リップルが出る', () => {
    const { fm, deps } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 0);
    vi.mocked(deps.spawnBurst).mockClear();
    vi.mocked(deps.ripples.push).mockClear();
    fm.onNote(72, 800, 300, '#fff', 500);
    expect(deps.spawnBurst).toHaveBeenCalledTimes(5); // 放物線トレイル 5 点
    expect(deps.ripples.push).toHaveBeenCalledOnce();
  });

  it('11 半音では出ない', () => {
    const { fm, deps } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 0);
    vi.mocked(deps.spawnBurst).mockClear();
    fm.onNote(71, 780, 300, '#fff', 500);
    expect(deps.spawnBurst).not.toHaveBeenCalled();
  });

  it('直前の音から 2 秒超あいていたら跳躍ではない（フレーズ外）', () => {
    const { fm, deps } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 0);
    vi.mocked(deps.spawnBurst).mockClear();
    fm.onNote(72, 800, 300, '#fff', 3000);
    expect(deps.spawnBurst).not.toHaveBeenCalled();
  });

  it('クールダウン 8 秒内の連続跳躍は 1 回だけ', () => {
    const { fm, deps } = makeFixture();
    fm.onNote(60, 500, 300, '#fff', 0);
    fm.onNote(72, 800, 300, '#fff', 500); // 発火
    vi.mocked(deps.spawnBurst).mockClear();
    fm.onNote(60, 500, 300, '#fff', 1000); // −12 だがクールダウン中
    expect(deps.spawnBurst).not.toHaveBeenCalled();
    // フレーズを保ったまま（音間 ≤2s）クールダウンを明けさせる
    for (let t = 2500; t <= 8500; t += 1500) fm.onNote(60, 500, 300, '#fff', t);
    expect(deps.spawnBurst).not.toHaveBeenCalled();
    fm.onNote(72, 800, 300, '#fff', 9200); // 8.7 秒後・フレーズ内 — 再発火
    expect(deps.spawnBurst).toHaveBeenCalled();
  });
});

describe('createFreeplayMoments — reset', () => {
  it('reset() で音域・無音・跳躍の全状態が白紙に戻る', () => {
    const { fm, deps, stars } = makeFixture();
    warmUp(fm);
    fm.onNote(72, 800, 300, '#fff', 11_000);
    fm.reset();
    vi.mocked(deps.spawnStream).mockClear();
    vi.mocked(deps.spawnBurst).mockClear();
    // リセット後の最初の 2 音 — 静寂星もレンジ演出も跳躍も出ない
    fm.onNote(90, 950, 300, '#fff', 60_000);
    fm.onNote(30, 100, 300, '#fff', 60_200); // 大跳躍だがレンジ初期化中 + 助走中
    expect(stars).toHaveLength(0);
    expect(deps.spawnStream).not.toHaveBeenCalled();
    // 跳躍はクールダウンもリセットされているので発火する（フレーズ内 + ≥12 半音）
    expect(deps.spawnBurst).toHaveBeenCalledTimes(5);
  });
});
