import { describe, it, expect, beforeEach } from 'vitest';
import {
  drawPracticeLane,
  type LaneViewState,
  type LaneTimings,
  type LaneDrawOptions,
  type LaneNoteView,
} from '../src/render/lane';
import { makeCanvasStub } from './_fixtures/canvas-stub';

function makeNote(over: Partial<LaneNoteView>): LaneNoteView {
  return {
    timeMs: 0,
    durMs: 200,
    midi: 60,
    hand: 'R',
    hit: false,
    missed: false,
    ...over,
  };
}

function baseOpts(over: Partial<LaneDrawOptions> = {}): LaneDrawOptions {
  return {
    screenW: 800,
    screenH: 600,
    osmdVisible: false,
    kbReserve: 80,
    laneLookaheadMs: 4000,
    countInMs: 4000,
    judgeProfile: { perfectMs: 50, greatMs: 120, goodMs: 220 },
    laneLabelL: 'L hand',
    laneLabelR: 'R hand',
    countInGoLabel: 'GO!',
    midiToPitchName: (m) => 'N' + m,
    noteRestingColor: () => '#abcdef',
    ...over,
  };
}

function baseTiming(over: Partial<LaneTimings> = {}): LaneTimings {
  return {
    elapsedMs: 5000, // past count-in by default
    realElapsedMs: 5000,
    nowMs: 1000,
    ...over,
  };
}

function baseView(over: Partial<LaneViewState> = {}): LaneViewState {
  return {
    enabled: true,
    sectionNotes: [],
    handRanges: { lhMin: 36, lhMax: 60, rhMin: 60, rhMax: 84 },
    laneDrawFromIdx: 0,
    currentNoteIdx: 0,
    isBoss: false,
    ...over,
  };
}

describe('drawPracticeLane', () => {
  let stub: ReturnType<typeof makeCanvasStub>;

  beforeEach(() => {
    stub = makeCanvasStub();
  });

  it('no-ops when practice is disabled', () => {
    drawPracticeLane(stub.ctx, baseView({ enabled: false }), baseTiming(), baseOpts());
    expect(stub.calls).toHaveLength(0);
  });

  it('paints two hand-tinted lane backgrounds + window bands + outline', () => {
    drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts());
    // The lane backgrounds are now vertical gradients (one per hand) so
    // the LH/RH areas read as a soft gradient rather than a flat block.
    // Verify both gradients were created with the expected stop colors.
    expect(stub.countCalls('createLinearGradient')).toBeGreaterThanOrEqual(2);
    const stopArgs = stub.calls
      .filter((c) => c.method === 'gradient.addColorStop')
      .map((c) => c.args[1] as string);
    expect(stopArgs.some((s) => s.includes('40, 60, 130'))).toBe(true); // LH
    expect(stopArgs.some((s) => s.includes('110, 50, 110'))).toBe(true); // RH
    // 2 background fills + early-window + perfect-zone = at least 4 fillRect
    expect(stub.countCalls('fillRect')).toBeGreaterThanOrEqual(4);
  });

  it('renders both localized hand labels', () => {
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming(),
      baseOpts({ laneLabelL: '左手', laneLabelR: '右手' })
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('左手');
    expect(texts).toContain('右手');
  });

  it('positions lane top at 50 when osmdVisible is false, 332 when true', () => {
    // osmdVisible: false → first fillRect (left bg) sits at y=50
    drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ osmdVisible: false }));
    const firstFill = stub.calls.find((c) => c.method === 'fillRect')!;
    expect((firstFill.args as number[])[1]).toBe(50);

    stub.reset();
    drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ osmdVisible: true }));
    const firstFill2 = stub.calls.find((c) => c.method === 'fillRect')!;
    expect((firstFill2.args as number[])[1]).toBe(332);
  });

  it('paints a normal note with the injected resting color', () => {
    const note = makeNote({ midi: 64, timeMs: 5500, durMs: 400 }); // 500ms ahead
    drawPracticeLane(
      stub.ctx,
      baseView({ sectionNotes: [note] }),
      baseTiming(),
      baseOpts({ noteRestingColor: () => '#feedf00d' })
    );
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0] as string);
    expect(fillStyles).toContain('#feedf00d');
  });

  it('paints a hit note green and a missed note pink', () => {
    const notes = [
      makeNote({ midi: 60, timeMs: 5500, hit: true }),
      makeNote({ midi: 62, timeMs: 5800, missed: true }),
    ];
    drawPracticeLane(stub.ctx, baseView({ sectionNotes: notes }), baseTiming(), baseOpts());
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0])
      .filter((s): s is string => typeof s === 'string');
    expect(fillStyles.some((s) => s.startsWith('rgba(120, 255, 160,'))).toBe(true);
    expect(fillStyles.some((s) => s.startsWith('rgba(255, 90, 120,'))).toBe(true);
  });

  it('blooms a just-hit tile (recent hitFxMs) with a soft additive light ring', () => {
    // nowMs=1000, hitFxMs=900 → age 100 ms < HIT_BLOOM_MS (380) → flourish plays.
    const notes = [makeNote({ midi: 60, timeMs: 5500, hit: true, hitFxMs: 900 })];
    drawPracticeLane(stub.ctx, baseView({ sectionNotes: notes }), baseTiming(), baseOpts());
    const strokes = stub.calls
      .filter((c) => c.method === 'set strokeStyle')
      .map((c) => c.args[0])
      .filter((s): s is string => typeof s === 'string');
    expect(strokes.some((s) => s.startsWith('rgba(185, 255, 216,'))).toBe(true);
    // Additive blend = the "light, not paint" glow.
    const comp = stub.calls
      .filter((c) => c.method === 'set globalCompositeOperation')
      .map((c) => c.args[0]);
    expect(comp).toContain('lighter');
  });

  it('does NOT bloom once the flash has decayed (stale hitFxMs)', () => {
    // nowMs=1000, hitFxMs=500 → age 500 ms > HIT_BLOOM_MS → no flourish.
    const notes = [makeNote({ midi: 60, timeMs: 5500, hit: true, hitFxMs: 500 })];
    drawPracticeLane(stub.ctx, baseView({ sectionNotes: notes }), baseTiming(), baseOpts());
    const strokes = stub.calls
      .filter((c) => c.method === 'set strokeStyle')
      .map((c) => c.args[0])
      .filter((s): s is string => typeof s === 'string');
    expect(strokes.some((s) => s.startsWith('rgba(185, 255, 216,'))).toBe(false);
  });

  it('a hit note without hitFxMs never blooms (back-compat)', () => {
    const notes = [makeNote({ midi: 60, timeMs: 5500, hit: true })];
    drawPracticeLane(stub.ctx, baseView({ sectionNotes: notes }), baseTiming(), baseOpts());
    const strokes = stub.calls
      .filter((c) => c.method === 'set strokeStyle')
      .map((c) => c.args[0])
      .filter((s): s is string => typeof s === 'string');
    expect(strokes.some((s) => s.startsWith('rgba(185, 255, 216,'))).toBe(false);
  });

  it('skips notes flagged _filtered (hidden hand)', () => {
    const notes = [
      makeNote({ midi: 60, timeMs: 5500, _filtered: true }),
      makeNote({ midi: 64, timeMs: 5800 }),
    ];
    const view = baseView({ sectionNotes: notes });
    drawPracticeLane(stub.ctx, view, baseTiming(), baseOpts());
    // Only one note had its hand label drawn → exactly one 'R' fillText
    const handTexts = stub.calls
      .filter((c) => c.method === 'fillText' && c.args[0] === 'R')
      .map((c) => c.args[0]);
    expect(handTexts).toHaveLength(1);
  });

  it('caps notes drawn per frame at 25', () => {
    const notes: LaneNoteView[] = [];
    for (let i = 0; i < 60; i++) {
      // Within visible window: timeMs 5050..7950 step 50
      notes.push(makeNote({ midi: 60 + (i % 12), timeMs: 5050 + i * 50 }));
    }
    drawPracticeLane(stub.ctx, baseView({ sectionNotes: notes }), baseTiming(), baseOpts());
    const handLabelCalls = stub.calls.filter(
      (c) => c.method === 'fillText' && (c.args[0] === 'L' || c.args[0] === 'R')
    );
    expect(handLabelCalls).toHaveLength(25);
  });

  it('advances laneDrawFromIdx past notes that have scrolled off the bottom', () => {
    const notes = [
      makeNote({ timeMs: 1000 }), // way before elapsed=5000
      makeNote({ timeMs: 2000 }),
      makeNote({ timeMs: 5500 }), // visible
    ];
    const view = baseView({ sectionNotes: notes });
    drawPracticeLane(stub.ctx, view, baseTiming(), baseOpts());
    expect(view.laneDrawFromIdx).toBe(2);
  });

  it('shows ▼ indicator when there is a current expected note', () => {
    const notes = [makeNote({ midi: 60, timeMs: 5500 })];
    drawPracticeLane(
      stub.ctx,
      baseView({ sectionNotes: notes, currentNoteIdx: 0 }),
      baseTiming(),
      baseOpts()
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('▼');
    expect(texts.some((t) => t.includes('R · N60'))).toBe(true);
  });

  it('does NOT show ▼ when current note has been hit or missed', () => {
    const notes = [makeNote({ midi: 60, timeMs: 5500, hit: true })];
    drawPracticeLane(
      stub.ctx,
      baseView({ sectionNotes: notes, currentNoteIdx: 0 }),
      baseTiming(),
      baseOpts()
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).not.toContain('▼');
  });

  it('paints boss flair when isBoss is true', () => {
    drawPracticeLane(stub.ctx, baseView({ isBoss: true }), baseTiming(), baseOpts());
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0])
      .filter((s): s is string => typeof s === 'string');
    expect(fillStyles.some((s) => s.startsWith('rgba(255, 100, 150,'))).toBe(true);
  });

  it('renders count-in number "4" at the start of the count-in', () => {
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming({ realElapsedMs: 0, elapsedMs: 0 }),
      baseOpts()
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('4');
  });

  it('counts 4 → 3 → 2 → 1 across the count-in', () => {
    const seen: string[] = [];
    for (const t of [0, 1100, 2100, 3100]) {
      stub.reset();
      drawPracticeLane(
        stub.ctx,
        baseView(),
        baseTiming({ realElapsedMs: t, elapsedMs: 0 }),
        baseOpts()
      );
      const texts = stub.calls
        .filter((c) => c.method === 'fillText')
        .map((c) => c.args[0] as string);
      const num = texts.find((s) => /^[1-4]$/.test(s));
      if (num) seen.push(num);
    }
    expect(seen).toEqual(['4', '3', '2', '1']);
  });

  it('renders the localized GO label after the count-in completes', () => {
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming({ realElapsedMs: 4100, elapsedMs: 100 }),
      baseOpts({ countInGoLabel: 'スタート！' })
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('スタート！');
  });

  it('does NOT render the count-in once realElapsed > countInMs + 400', () => {
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming({ realElapsedMs: 4500, elapsedMs: 500 }),
      baseOpts()
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).not.toContain('GO!');
    expect(texts.some((s) => /^[1-4]$/.test(s))).toBe(false);
  });

  // ── クリック列アンカー（拍子・弱起）対応のカウントダウン ──────────
  // 数字は可聴クリック（GO から逆向きに beats × clickMs）と同時に
  // 切り替わる。弱起では GO = countInMs + ピックアップ長。

  it('counts down from countInBeats (not hardcoded 4) when provided', () => {
    // 2 小節の 4/4（8 クリック × 500ms、GO=4000）
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming({ realElapsedMs: 0, elapsedMs: 0 }),
      baseOpts({ countInMs: 4000, countInBeats: 8, countInClickMs: 500, countInGoMs: 4000 })
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('8');
  });

  it('弱起: hides the countdown during the pre-click pickup silence', () => {
    // GO=4500, 4 クリック × 1000ms → 最初のクリックは 500ms。
    // それ以前（頭の無音区間）は数字を出さない — 数字はクリックと同期。
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming({ realElapsedMs: 200, elapsedMs: 0 }),
      baseOpts({ countInMs: 4000, countInBeats: 4, countInClickMs: 1000, countInGoMs: 4500 })
    );
    const texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts.some((s) => /^[1-4]$/.test(s))).toBe(false);
  });

  it('弱起: numbers track the shifted click grid and GO lands at countInGoMs', () => {
    const opts = {
      countInMs: 4000,
      countInBeats: 4,
      countInClickMs: 1000,
      countInGoMs: 4500,
    };
    const seen: string[] = [];
    // クリックは 500/1500/2500/3500、GO は 4500。
    for (const t of [600, 1600, 2600, 3600]) {
      stub.reset();
      drawPracticeLane(
        stub.ctx,
        baseView(),
        baseTiming({ realElapsedMs: t, elapsedMs: 0 }),
        baseOpts(opts)
      );
      const texts = stub.calls
        .filter((c) => c.method === 'fillText')
        .map((c) => c.args[0] as string);
      const num = texts.find((s) => /^[1-4]$/.test(s));
      if (num) seen.push(num);
    }
    expect(seen).toEqual(['4', '3', '2', '1']);
    // 旧 GO 位置（countInMs=4000〜4500 の間）はまだ "1" のまま。
    stub.reset();
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming({ realElapsedMs: 4200, elapsedMs: 200 }),
      baseOpts(opts)
    );
    let texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('1');
    expect(texts).not.toContain('GO!');
    // GO はダウンビート（4500）以降に出る。
    stub.reset();
    drawPracticeLane(
      stub.ctx,
      baseView(),
      baseTiming({ realElapsedMs: 4600, elapsedMs: 600 }),
      baseOpts(opts)
    );
    texts = stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
    expect(texts).toContain('GO!');
  });

  it('clamps note width to halfW / 6 when canvas is narrow', () => {
    // Narrow screen: halfW = (320-48)/2 = 136; halfW/6 ≈ 22.67 (less than 70)
    const note = makeNote({ midi: 60, timeMs: 5500, durMs: 200 });
    drawPracticeLane(
      stub.ctx,
      baseView({ sectionNotes: [note] }),
      baseTiming(),
      baseOpts({ screenW: 320 })
    );
    // Verify it ran without error and produced fills
    expect(stub.countCalls('fillRect')).toBeGreaterThan(0);
  });

  it('balances every save with a restore (transform-stack hygiene)', () => {
    drawPracticeLane(
      stub.ctx,
      baseView({ isBoss: true }),
      baseTiming({ realElapsedMs: 0 }),
      baseOpts()
    );
    expect(stub.countCalls('save')).toBe(stub.countCalls('restore'));
  });

  // ─── グロスグラデーションの正規化1本キャッシュ（R2-5） ────────────

  describe('gloss gradient cache', () => {
    // グロス対象ノート（未ヒット・noteH > 14）を1個含むフレームを描く。
    function drawGlossFrame(s: ReturnType<typeof makeCanvasStub>): void {
      const note = makeNote({ midi: 64, timeMs: 5500, durMs: 400 });
      drawPracticeLane(s.ctx, baseView({ sectionNotes: [note] }), baseTiming(), baseOpts());
    }
    const isGlossCreate = (c: { method: string; args: unknown[] }): boolean =>
      c.method === 'createLinearGradient' &&
      (c.args as number[])[0] === 0 &&
      (c.args as number[])[1] === 0 &&
      (c.args as number[])[2] === 0 &&
      (c.args as number[])[3] === 1;

    it('正規化 (0,0)→(0,1) の1本だけを生成し、2フレーム目以降は再生成しない', () => {
      drawGlossFrame(stub);
      expect(stub.calls.filter(isGlossCreate)).toHaveLength(1);
      drawGlossFrame(stub);
      drawGlossFrame(stub);
      // 同一 ctx ではキャッシュヒット — 生成は1本のまま
      expect(stub.calls.filter(isGlossCreate)).toHaveLength(1);
    });

    it('色ストップは従来と同一（白 0.35 → 白 0）', () => {
      drawGlossFrame(stub);
      const stops = stub.calls
        .filter((c) => c.method === 'gradient.addColorStop')
        .map((c) => c.args[1] as string);
      expect(stops).toContain('rgba(255, 255, 255, 0.35)');
      expect(stops).toContain('rgba(255, 255, 255, 0)');
    });

    it('fill 時に translate + scale で実寸へ引き伸ばす（パス記録後なので形状は不変）', () => {
      drawGlossFrame(stub);
      expect(stub.countCalls('translate')).toBeGreaterThanOrEqual(1);
      expect(stub.countCalls('scale')).toBeGreaterThanOrEqual(1);
      expect(stub.countCalls('save')).toBe(stub.countCalls('restore'));
    });

    it('ctx が変わる（コンテキスト再生成）と作り直す', () => {
      drawGlossFrame(stub);
      const stub2 = makeCanvasStub();
      drawGlossFrame(stub2);
      expect(stub2.calls.filter(isGlossCreate)).toHaveLength(1);
    });
  });

  // ── 拍グリッド（小節線 + 拍線 — S1、音ゲー業界標準） ────────────────

  describe('beat grid', () => {
    it('draws barlines (accent) brighter than beat lines within the visible window', () => {
      // elapsed 5000, lookahead 4000 → 可視域はざっくり [5000-α, 9000+α]。
      const beatGrid = [
        { timeMs: 6000, accent: true }, // 小節線
        { timeMs: 7000, accent: false }, // 拍線
        { timeMs: 20000, accent: true }, // 画面外（早期 break）
      ];
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ beatGrid }));
      const strokes = stub.calls
        .filter((c) => c.method === 'set strokeStyle')
        .map((c) => c.args[0])
        .filter((s): s is string => typeof s === 'string');
      expect(strokes.some((s) => s.includes('0.13'))).toBe(true); // 小節線
      expect(strokes.some((s) => s.includes('0.05'))).toBe(true); // 拍線
    });

    it('no grid → no grid strokes (opt-in rendering)', () => {
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ beatGrid: null }));
      const strokes = stub.calls
        .filter((c) => c.method === 'set strokeStyle')
        .map((c) => c.args[0])
        .filter((s): s is string => typeof s === 'string');
      expect(strokes.some((s) => s.includes('0.13'))).toBe(false);
    });

    it('skips beat lines that would bunch tighter than 18px (fast tempo)', () => {
      // lookahead 4000ms over ~460px lane → 1 beat @ 100ms ≈ 11.5px < 18px。
      const beatGrid = [
        { timeMs: 5600, accent: false },
        { timeMs: 5700, accent: false }, // 間隔 100ms → 潰れるのでスキップ
      ];
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ beatGrid }));
      const faint = stub.calls
        .filter((c) => c.method === 'set strokeStyle')
        .map((c) => c.args[0])
        .filter((s): s is string => typeof s === 'string')
        .filter((s) => s.includes('0.05'));
      expect(faint.length).toBe(1);
    });
  });

  // ── ライブコンボ（中央の COMBO 表示、rhythm のみ） ────────────────

  /** fillText で描かれた文字列だけを取り出す。 */
  function drawnTexts(): string[] {
    return stub.calls.filter((c) => c.method === 'fillText').map((c) => c.args[0] as string);
  }

  describe('live combo counter', () => {
    it('shows the count + COMBO caption from a streak of 5', () => {
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ sectionCombo: 12 }));
      const texts = drawnTexts();
      expect(texts).toContain('12');
      expect(texts).toContain('COMBO');
    });

    it('centers the readout on the lane divider (genre-standard placement)', () => {
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ sectionCombo: 12 }));
      const comboCall = stub.calls.find((c) => c.method === 'fillText' && c.args[0] === 'COMBO');
      // padX 24 + halfW → screenW 800 なら midX = 400。
      expect(comboCall?.args[1]).toBe(400);
      expect(stub.calls.some((c) => c.method === 'set textAlign' && c.args[0] === 'center')).toBe(
        true
      );
    });

    it('stays hidden below the threshold and at 0', () => {
      for (const combo of [0, 4]) {
        stub.reset();
        drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ sectionCombo: combo }));
        expect(drawnTexts()).not.toContain('COMBO');
      }
    });
  });

  // ── 判定帯（3段・左右対称） ────────────────────────────────────────

  describe('judgement bands', () => {
    /** The three judgement bands are the only full-lane-width fills here
     *  (screenW 800 − padX 24 × 2 = 752); the lane halves are 376 wide. */
    const bandRects = (): number[][] =>
      stub.calls
        .filter((c) => c.method === 'fillRect')
        .map((c) => c.args as number[])
        .filter((a) => a[2] === 752);

    it('paints all three tiers nested and symmetric about the hit line', () => {
      drawPracticeLane(
        stub.ctx,
        baseView(),
        baseTiming(),
        baseOpts({ judgeProfile: { perfectMs: 50, greatMs: 120, goodMs: 220 } })
      );
      const bands = bandRects();
      expect(bands.length).toBe(3);
      // One shared centre — symmetric windows, as every published tap-note
      // window in the genre is.
      const centres = bands.map((a) => a[1] + a[3] / 2);
      for (const cy of centres) expect(cy).toBeCloseTo(centres[0], 6);
      // Nested outer → inner in draw order (good, great, perfect).
      expect(bands[0][3]).toBeGreaterThan(bands[1][3]);
      expect(bands[1][3]).toBeGreaterThan(bands[2][3]);
      // Heights are the ms boundaries doubled, in the lane's px-per-ms scale.
      expect(bands[0][3] / bands[2][3]).toBeCloseTo(220 / 50, 6);
    });

    it('scales the drawn bands with the profile (strictness / input path)', () => {
      const outerHeight = (goodMs: number): number => {
        stub.reset();
        drawPracticeLane(
          stub.ctx,
          baseView(),
          baseTiming(),
          baseOpts({ judgeProfile: { perfectMs: goodMs / 4, greatMs: goodMs / 2, goodMs } })
        );
        return bandRects()[0][3];
      };
      // The bands ARE the game's promise about when a press counts, so a wider
      // window must draw a taller band — they can never be stale relative to
      // the scoring.
      expect(outerHeight(300)).toBeGreaterThan(outerHeight(150));
    });
  });

  // ── ヒット誤差バー（方向・ばらつきの可視化） ──────────────────────

  describe('hit-error bar', () => {
    const ring = (values: number[]) => {
      const buf = new Float32Array(32);
      values.forEach((v, i) => (buf[i] = v));
      return { buf, idx: values.length, len: values.length };
    };

    it('is drawn once presses exist', () => {
      const before = stub.countCalls('fillRect');
      drawPracticeLane(
        stub.ctx,
        baseView(),
        baseTiming(),
        baseOpts({ errorRing: ring([10, -20, 35]) })
      );
      expect(stub.countCalls('fillRect')).toBeGreaterThan(before);
    });

    it('places a tick left of centre for an early press and right for a late one', () => {
      // The bar is centred on the lane divider (midX = 400 at screenW 800).
      const tickX = (dt: number): number => {
        stub.reset();
        drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ errorRing: ring([dt]) }));
        // The tick is the last 2px-wide fillRect drawn.
        const ticks = stub.calls
          .filter((c) => c.method === 'fillRect')
          .map((c) => c.args as number[])
          .filter((a) => a[2] === 2);
        // rect is drawn at x-1 with width 2 → centre is left + 1.
        return ticks[ticks.length - 1][0] + 1;
      };
      expect(tickX(-100)).toBeLessThan(400);
      expect(tickX(100)).toBeGreaterThan(400);
      // Symmetric offsets land symmetrically about the centre.
      expect(400 - tickX(-100)).toBeCloseTo(tickX(100) - 400, 5);
    });

    it('is not drawn when there are no presses yet, or no ring at all', () => {
      const baseline = (() => {
        stub.reset();
        drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({}));
        return stub.countCalls('fillRect');
      })();
      stub.reset();
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ errorRing: ring([]) }));
      expect(stub.countCalls('fillRect')).toBe(baseline);
    });
  });

  // ── ライブ判定パネル（accuracy + 判定内訳、rhythm のみ） ──────────

  describe('live judgement panel', () => {
    const judge = { perfect: 6, great: 3, good: 1, miss: 2 };

    it('draws every tier label with its count', () => {
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ judge }));
      const texts = drawnTexts();
      // Tiers carry QUALITY only — there is deliberately no EARLY / LATE tier.
      for (const label of ['PERFECT', 'GREAT', 'GOOD', 'MISS']) {
        expect(texts).toContain(label);
      }
      expect(texts).not.toContain('EARLY');
      expect(texts).not.toContain('LATE');
      expect(texts).toContain('6');
      expect(texts).toContain('3');
      expect(texts).toContain('2');
    });

    it('shows running accuracy as hits / judged', () => {
      // 10 hits (6+3+1) of 12 judged → 83%.
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({ judge }));
      expect(drawnTexts()).toContain('83%');
    });

    it('shows -- rather than 0% before the first verdict', () => {
      drawPracticeLane(
        stub.ctx,
        baseView(),
        baseTiming(),
        baseOpts({ judge: { perfect: 0, great: 0, good: 0, miss: 0 } })
      );
      const texts = drawnTexts();
      expect(texts).toContain('--');
      expect(texts).not.toContain('0%');
    });

    it('draws nothing when no tally is passed (guided / listen)', () => {
      drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts({}));
      expect(drawnTexts()).not.toContain('PERFECT');
    });
  });
});
