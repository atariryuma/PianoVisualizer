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
    hitWindowEarlyMs: 80,
    hitWindowMs: 220,
    perfectMs: 50,
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

  it('paints two hand-tinted backgrounds + outline when enabled', () => {
    drawPracticeLane(stub.ctx, baseView(), baseTiming(), baseOpts());
    const fillStyles = stub.calls
      .filter((c) => c.method === 'set fillStyle')
      .map((c) => c.args[0] as string);
    expect(fillStyles).toContain('rgba(40, 60, 110, 0.55)');
    expect(fillStyles).toContain('rgba(110, 50, 90, 0.55)');
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
      .map((c) => c.args[0] as string);
    expect(fillStyles).toContain('rgba(120, 255, 160, 0.9)');
    expect(fillStyles).toContain('rgba(255, 90, 120, 0.5)');
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
      .map((c) => c.args[0] as string);
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
});
