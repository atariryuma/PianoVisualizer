// Tests for packages/web/src/practice-scoring.ts.
//
// Covers:
//   • medianRecentPitch: empty → 0, sorted-median picked.
//   • practiceRealElapsedMs: Tone path uses ctx.currentTime - startAudioTime,
//     fallback uses performance.now, audioOffsetMs subtracted.
//   • practiceElapsedMs: guided pre-count-in → real time, guided post-
//     count-in → cur.timeMs (frozen), rhythm → real time always.
//   • matchNoteOnset: practice-disabled / listen-mode short-circuits;
//     guided mode "always in window" + always perfect; rhythm window edges;
//     wrong-note → miss + chip in guided only; chord-mate match within
//     tolerance; eager skip-past resolved notes; mutates hits / combo /
//     flow / pendingHolds + best-combo tracking.
//   • finalizeNoteHold: pendingHolds-cleanup, rhythm-only scoring,
//     duration tol math, too-short / too-long chip, score < 0.4 chip.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJudgeTally, createJudgeErrorRing, judgeHits } from '@piano/core';
import {
  createPracticeScoring,
  type PracticeScoringDeps,
  type PracticeScoringRef,
  type PracticeScoringStateRef,
  type PracticeScoringTuning,
  type PracticeNote,
} from '../src/practice-scoring';

// ─── fixtures ───────────────────────────────────────────────────────

function note(over: Partial<PracticeNote> = {}): PracticeNote {
  return {
    midi: 60,
    timeMs: 0,
    durMs: 500,
    hit: false,
    missed: false,
    ...over,
  };
}

/** Both paths share one profile by default so every existing expectation
 *  holds regardless of `isExact`; the MIDI/mic split has its own tests. */
const TEST_JUDGE = { perfectMs: 50, greatMs: 125, goodMs: 200 };

const TUNING: PracticeScoringTuning = {
  judgeMidi: TEST_JUDGE,
  judgeMic: TEST_JUDGE,
  chordMateToleranceMs: 30,
  durationMinTolMs: 100,
  durationTolFraction: 0.3,
  countInMs: 4000,
};

interface Mocks {
  showHitChip: ReturnType<typeof vi.fn>;
  spawnBurst: ReturnType<typeof vi.fn>;
  spawnRipple: ReturnType<typeof vi.fn>;
  spawnStream: ReturnType<typeof vi.fn>;
  remoteLog: ReturnType<typeof vi.fn>;
}

function makeFixture(
  over: {
    state?: Partial<PracticeScoringStateRef>;
    practice?: Partial<PracticeScoringRef>;
    tuning?: Partial<PracticeScoringTuning>;
    Tone?: PracticeScoringDeps['Tone'];
    notes?: PracticeNote[];
    /** Note-colour resolver (free-play palette). Absent by default so the
     *  grade-tint fallback paths stay covered. */
    noteColor?: (midi: number) => string;
  } = {}
) {
  const state: PracticeScoringStateRef = {
    recentPitches: [],
    flow: 0,
    combo: 0,
    bestCombo: 0,
    ...over.state,
  };
  const practice: PracticeScoringRef = {
    enabled: true,
    mode: 'guided',
    sectionNotes: over.notes ?? [],
    currentNoteIdx: 0,
    hits: 0,
    sectionCombo: 0,
    sectionBestCombo: 0,
    timingScoreSum: 0,
    durationScoreSum: 0,
    durationScoredCount: 0,
    pendingHolds: new Map(),
    startAudioTime: 0,
    audioOffsetMs: 0,
    // Always present, exactly as `createInitialPractice` builds them — the
    // scoring writes verdicts here unconditionally, so a fixture without them
    // would be testing a state the app can't be in.
    judge: createJudgeTally(),
    judgeErrors: createJudgeErrorRing(),
    ...over.practice,
  };
  const mocks: Mocks = {
    showHitChip: vi.fn(),
    spawnBurst: vi.fn(),
    spawnRipple: vi.fn(),
    spawnStream: vi.fn(),
    remoteLog: vi.fn(),
  };
  const deps: PracticeScoringDeps = {
    state,
    practice,
    tuning: { ...TUNING, ...over.tuning },
    Tone: 'Tone' in over ? over.Tone : undefined,
    showHitChip: mocks.showHitChip,
    spawnBurst: mocks.spawnBurst,
    spawnRipple: mocks.spawnRipple,
    spawnStream: mocks.spawnStream,
    noteColor: over.noteColor,
    noteScreenX: (midi: number) => midi * 10, // deterministic stand-in
    getScreen: () => ({ W: 800, H: 600 }),
    t: (key, vars) => (vars ? `T(${key},${vars.v})` : `T(${key})`),
    midiToName: (midi) => 'M' + midi,
    remoteLog: mocks.remoteLog,
  };
  return { scoring: createPracticeScoring(deps), state, practice, mocks };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ─── medianRecentPitch ─────────────────────────────────────────────

describe('medianRecentPitch', () => {
  // R2-3: median は直近 PITCH_MEDIAN_WINDOW_MS(150ms) のエントリのみ。
  // `t` は performance.now() と同一起点の tick 時刻なので、now を固定して
  // 年齢（ageMs）で相対指定する。
  const NOW = 100_000;
  function fresh(hz: number, ageMs = 0) {
    return { hz, t: NOW - ageMs };
  }

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(NOW);
  });

  it('empty array → 0', () => {
    const fx = makeFixture({ state: { recentPitches: [] } });
    expect(fx.scoring.medianRecentPitch()).toBe(0);
  });

  it('single value → that value', () => {
    const fx = makeFixture({ state: { recentPitches: [fresh(440)] } });
    expect(fx.scoring.medianRecentPitch()).toBe(440);
  });

  it('odd count → middle', () => {
    const fx = makeFixture({
      state: { recentPitches: [fresh(220, 40), fresh(440, 20), fresh(880, 0)] },
    });
    expect(fx.scoring.medianRecentPitch()).toBe(440);
  });

  it('even count → upper of two middles (Math.floor of len/2)', () => {
    const fx = makeFixture({
      state: {
        recentPitches: [fresh(200, 60), fresh(400, 40), fresh(600, 20), fresh(800, 0)],
      },
    });
    expect(fx.scoring.medianRecentPitch()).toBe(600);
  });

  it('does not mutate the source array', () => {
    const arr = [fresh(880, 20), fresh(220, 10), fresh(440, 0)];
    const fx = makeFixture({ state: { recentPitches: arr } });
    fx.scoring.medianRecentPitch();
    expect(arr).toEqual([fresh(880, 20), fresh(220, 10), fresh(440, 0)]);
  });

  it('R2-3: 150ms より古いエントリは median から除外される（直前の音を引きずらない）', () => {
    // 休符前の 880Hz が 2 件残っていても、新しい 440Hz だけで決まる。
    const fx = makeFixture({
      state: { recentPitches: [fresh(880, 400), fresh(880, 300), fresh(440, 10)] },
    });
    expect(fx.scoring.medianRecentPitch()).toBe(440);
  });

  it('R2-3: 全エントリ失効 → 0（呼び出し側の `|| pitchHz` フォールバックが効く）', () => {
    const fx = makeFixture({
      state: { recentPitches: [fresh(440, 200), fresh(880, 500)] },
    });
    expect(fx.scoring.medianRecentPitch()).toBe(0);
  });

  it('R2-3: ちょうど 150ms 前のエントリは含まれる（境界は inclusive）', () => {
    const fx = makeFixture({ state: { recentPitches: [fresh(440, 150)] } });
    expect(fx.scoring.medianRecentPitch()).toBe(440);
  });
});

// ─── practiceRealElapsedMs ─────────────────────────────────────────

describe('practiceRealElapsedMs', () => {
  it('Tone path uses (currentTime - startAudioTime) * 1000', () => {
    const fx = makeFixture({
      practice: { startAudioTime: 1.5 },
      Tone: { context: { currentTime: 3.0 } },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1500);
  });

  it('subtracts audioOffsetMs', () => {
    const fx = makeFixture({
      practice: { startAudioTime: 0, audioOffsetMs: 40 },
      Tone: { context: { currentTime: 1 } },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(960); // 1000 - 40
  });

  it('null audioOffsetMs treated as 0', () => {
    const fx = makeFixture({
      practice: { startAudioTime: 0, audioOffsetMs: null },
      Tone: { context: { currentTime: 1 } },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1000);
  });

  it('fallback when Tone undefined uses performance.now', () => {
    vi.spyOn(performance, 'now').mockReturnValue(2500);
    const fx = makeFixture({ practice: { startAudioTime: 1 } });
    // raw = 2500 - 1*1000 = 1500
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1500);
  });

  it('fallback when Tone present but ctx missing uses performance.now', () => {
    vi.spyOn(performance, 'now').mockReturnValue(3000);
    const fx = makeFixture({
      practice: { startAudioTime: 0 },
      Tone: { context: undefined },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(3000);
  });

  it('returns the frozen value while paused, ignoring the advancing Tone clock', () => {
    // 明示ポーズ/タブ非表示の凍結: _frozenRealElapsedMs が非 null の間は
    // ctx.currentTime が進んでも経過が固定される（レーン/カーソルが流れない
    // = 「設定で止まらない」「ノーツ消失」の根治点）。オフセットは差し引く。
    const fx = makeFixture({
      practice: { startAudioTime: 1.5, audioOffsetMs: 40, _frozenRealElapsedMs: 2000 },
      Tone: { context: { currentTime: 999 } }, // クロックは大きく進行
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1960); // 2000 - 40（凍結）
  });

  it('resumes the live clock once _frozenRealElapsedMs is cleared', () => {
    const fx = makeFixture({
      practice: { startAudioTime: 1.5, _frozenRealElapsedMs: null },
      Tone: { context: { currentTime: 3.0 } },
    });
    expect(fx.scoring.practiceRealElapsedMs()).toBe(1500); // 通常計算に復帰
  });
});

// ─── practiceElapsedMs ─────────────────────────────────────────────

describe('practiceElapsedMs', () => {
  it('guided + pre-count-in → real time', () => {
    const fx = makeFixture({
      practice: { mode: 'guided', startAudioTime: 0 },
      Tone: { context: { currentTime: 2 } }, // 2000 ms
    });
    // realElapsed = 2000 < 4000 → real
    expect(fx.scoring.practiceElapsedMs()).toBe(2000);
  });

  it('guided + post-count-in → frozen at cur.timeMs', () => {
    const fx = makeFixture({
      practice: {
        mode: 'guided',
        startAudioTime: 0,
        currentNoteIdx: 0,
        sectionNotes: [note({ timeMs: 5000 })],
      },
      Tone: { context: { currentTime: 6 } }, // 6000 ms > 4000
    });
    expect(fx.scoring.practiceElapsedMs()).toBe(5000);
  });

  it('guided + post-count-in + no current note → countInMs', () => {
    const fx = makeFixture({
      practice: { mode: 'guided', currentNoteIdx: 0, sectionNotes: [] },
      Tone: { context: { currentTime: 10 } },
    });
    expect(fx.scoring.practiceElapsedMs()).toBe(4000);
  });

  it('rhythm mode → real time always', () => {
    const fx = makeFixture({
      practice: { mode: 'rhythm', startAudioTime: 0 },
      Tone: { context: { currentTime: 8 } },
    });
    expect(fx.scoring.practiceElapsedMs()).toBe(8000);
  });

  it('reads countInMs live through a getter (P0-1 shell-wiring regression)', () => {
    // The shell passes tuning.countInMs as a getter over its COUNT_IN_MS
    // let so a mid-session tempo change is picked up. Mirror that here:
    // the guided count-in boundary must follow the current value, not a
    // snapshot taken at scoring-construction time.
    let liveCountIn = 4000;
    const state: PracticeScoringStateRef = { recentPitches: [], flow: 0, combo: 0, bestCombo: 0 };
    const practice: PracticeScoringRef = {
      enabled: true,
      mode: 'guided',
      sectionNotes: [],
      currentNoteIdx: 0,
      hits: 0,
      sectionCombo: 0,
      sectionBestCombo: 0,
      timingScoreSum: 0,
      durationScoreSum: 0,
      durationScoredCount: 0,
      pendingHolds: new Map(),
      startAudioTime: 0,
      audioOffsetMs: 0,
    };
    const scoring = createPracticeScoring({
      state,
      practice,
      tuning: {
        ...TUNING,
        get countInMs() {
          return liveCountIn;
        },
      },
      Tone: { context: { currentTime: 3 } }, // 3000 ms elapsed
      showHitChip: vi.fn(),
      spawnBurst: vi.fn(),
      getScreen: () => ({ W: 800, H: 600 }),
      t: (k) => k,
      midiToName: (m) => 'M' + m,
    });
    // 3000 < 4000 → still counting in → real time.
    expect(scoring.practiceElapsedMs()).toBe(3000);
    // Tempo speeds up: count-in shrinks to 2500. Now 3000 > 2500 → past
    // count-in → frozen at countInMs (no current note). The boundary
    // MUST have moved with the getter.
    liveCountIn = 2500;
    expect(scoring.practiceElapsedMs()).toBe(2500);
  });
});

// ─── matchNoteOnset ────────────────────────────────────────────────

describe('matchNoteOnset — short-circuits', () => {
  it('returns false when practice.enabled=false', () => {
    const fx = makeFixture({ practice: { enabled: false } });
    expect(fx.scoring.matchNoteOnset(60, true)).toBe(false);
  });

  it('returns false in listen mode', () => {
    const fx = makeFixture({ practice: { mode: 'listen' } });
    expect(fx.scoring.matchNoteOnset(60, true)).toBe(false);
  });

  it('returns false when no notes left', () => {
    const fx = makeFixture({ notes: [], practice: { currentNoteIdx: 0 } });
    expect(fx.scoring.matchNoteOnset(60, true)).toBe(false);
  });

  it('skips past already-hit notes (chord cluster played in same frame)', () => {
    const notes = [note({ midi: 60, timeMs: 1000, hit: true }), note({ midi: 64, timeMs: 1000 })];
    const fx = makeFixture({
      notes,
      practice: { currentNoteIdx: 0, mode: 'guided' },
      Tone: { context: { currentTime: 5 } }, // post-count-in
    });
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(true);
    expect(fx.practice.currentNoteIdx).toBe(1);
  });
});

describe('matchNoteOnset — guided mode', () => {
  function setup(over: { notes?: PracticeNote[] } = {}) {
    return makeFixture({
      notes: over.notes ?? [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'guided' },
      Tone: { context: { currentTime: 5 } }, // post-count-in, frozen at 5000
    });
  }

  it('correct note → hit + perfect chip + flow/combo/burst', () => {
    const fx = setup();
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(true);
    expect(fx.practice.hits).toBe(1);
    expect(fx.practice.sectionCombo).toBe(1);
    expect(fx.practice.timingScoreSum).toBe(1); // guided always 1
    expect(fx.state.flow).toBeCloseTo(10); // 0 + 6 + 1*4
    expect(fx.state.combo).toBe(1);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
    expect(fx.mocks.spawnBurst).toHaveBeenCalled();
  });

  it('stamps hitFxMs on a hit so the lane can bloom the tile', () => {
    const notes = [note({ midi: 60, timeMs: 5000 })];
    const fx = setup({ notes });
    const before = performance.now();
    fx.scoring.matchNoteOnset(60, true);
    expect(typeof notes[0].hitFxMs).toBe('number');
    expect(notes[0].hitFxMs!).toBeGreaterThanOrEqual(before);
  });

  it('wrong note → miss chip with played name, no hit', () => {
    const fx = setup();
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(false);
    expect(fx.practice.hits).toBe(0);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'miss',
      'T(youPlayedFmt,M64)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('correct note pressed EARLY (count-in) → no hit, but no shaming miss chip', () => {
    // note @5000, countInMs 4000. Press the RIGHT note at t=1000 (during the
    // count-in): too early to credit (guided blocks early), but it is not a
    // mistake — never flash "miss" for the note we're waiting for.
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'guided' },
      Tone: { context: { currentTime: 1 } }, // elapsed 1000 < countInMs 4000
    });
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(false);
    expect(fx.practice.hits).toBe(0);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
  });

  it('和音の弾き直し: 正解済みメンバーの再打鍵は「まちがい」にしない（後方）', () => {
    // ユーザー報告の核心: C(済)+E(済)+G(待ち) で和音をまるごと弾き直すと、
    // C と E が youPlayed チップで叱られていた。静かに無視する。
    const notes = [
      note({ midi: 60, timeMs: 5000, hit: true }),
      note({ midi: 64, timeMs: 5000, hit: true }),
      note({ midi: 67, timeMs: 5010 }),
    ];
    const fx = setup({ notes });
    const ok = fx.scoring.matchNoteOnset(60, true); // 正解済み C の再打鍵
    expect(ok).toBe(false);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
    expect(fx.practice.hits).toBe(0); // 二重加点も無し
    expect(notes[2].hit).toBeFalsy();
  });

  it('和音の弾き直し: 前方の解決済みメンバーの再打鍵も無視（先に G を弾いた場合）', () => {
    const notes = [
      note({ midi: 60, timeMs: 5000 }),
      note({ midi: 67, timeMs: 5010, hit: true }), // 先に弾いて解決済み
    ];
    const fx = setup({ notes });
    const ok = fx.scoring.matchNoteOnset(67, true);
    expect(ok).toBe(false);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
  });

  it('クラスタ外の解決済み音の再打鍵は従来どおり「まちがい」表示', () => {
    // 救済は現在の和音クラスタ内限定 — 前の小節の音を弾いたら情報は出す。
    const notes = [
      note({ midi: 48, timeMs: 3000, hit: true }), // 前のクラスタ
      note({ midi: 60, timeMs: 5000 }),
    ];
    const fx = setup({ notes });
    const ok = fx.scoring.matchNoteOnset(48, true);
    expect(ok).toBe(false);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'miss',
      'T(youPlayedFmt,M48)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('guided の和音: 途中メンバーはチップ無し、完成の瞬間に Perfect 1 回', () => {
    const notes = [
      note({ midi: 60, timeMs: 5000 }),
      note({ midi: 64, timeMs: 5000 }),
      note({ midi: 67, timeMs: 5010 }),
    ];
    const fx = setup({ notes });
    fx.scoring.matchNoteOnset(60, true); // 1/3 — チップ無し
    fx.scoring.matchNoteOnset(64, true); // 2/3 — チップ無し
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
    fx.scoring.matchNoteOnset(67, true); // 3/3 — 完成
    expect(fx.mocks.showHitChip).toHaveBeenCalledTimes(1);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
    // flow/combo/バーストは従来どおり毎メンバー発火（押下確認）
    expect(fx.mocks.spawnBurst).toHaveBeenCalledTimes(3);
    expect(fx.practice.hits).toBe(3);
  });

  it('guided の単音は従来どおり即 Perfect', () => {
    const fx = setup();
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('chord-mate match: out-of-order note within tolerance hits', () => {
    const notes = [
      note({ midi: 60, timeMs: 5000 }),
      note({ midi: 64, timeMs: 5010 }), // within 30ms tolerance
    ];
    const fx = setup({ notes });
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(true);
    // chord-mate hit: first note untouched
    expect(notes[0].hit).toBe(false);
    expect(notes[1].hit).toBe(true);
  });

  it('chord-mate beyond tolerance does NOT match', () => {
    const notes = [
      note({ midi: 60, timeMs: 5000 }),
      note({ midi: 64, timeMs: 5040 }), // beyond 30ms
    ];
    const fx = setup({ notes });
    const ok = fx.scoring.matchNoteOnset(64, true);
    expect(ok).toBe(false);
  });

  it('updates sectionBestCombo when sectionCombo grows', () => {
    const fx = setup();
    fx.practice.sectionBestCombo = 5;
    fx.practice.sectionCombo = 5;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.sectionCombo).toBe(6);
    expect(fx.practice.sectionBestCombo).toBe(6);
  });

  it('does NOT regress sectionBestCombo when sectionCombo is smaller', () => {
    const fx = setup();
    fx.practice.sectionBestCombo = 20;
    fx.practice.sectionCombo = 0;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.sectionBestCombo).toBe(20);
  });

  it('updates state.bestCombo on a new high', () => {
    const fx = setup();
    fx.state.bestCombo = 0;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.state.bestCombo).toBe(1);
  });

  it('flow caps at 100', () => {
    const fx = setup();
    fx.state.flow = 99;
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.state.flow).toBe(100);
  });

  it('hit registers pendingHolds entry with holdStartMs', () => {
    const fx = setup();
    fx.scoring.matchNoteOnset(60, true);
    const entry = fx.practice.pendingHolds.get(60);
    expect(entry).toBeDefined();
    expect(entry!.holdStartMs).toBeGreaterThan(0);
  });
});

describe('matchNoteOnset — rhythm mode windowing', () => {
  function setup(currentTime: number, override: Partial<PracticeNote> = {}) {
    return makeFixture({
      notes: [note({ midi: 60, timeMs: 5000, ...override })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      Tone: { context: { currentTime } },
    });
  }

  it('inside hit window → perfect chip when within perfectMs', () => {
    // currentTime=5.04 → 5040 ms, dt=40 < 50 perfect
    const fx = setup(5.04);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('past the GREAT band but inside the window → GOOD (quality tier, no direction)', () => {
    // greatMs 125, goodMs 200 → dt=160 is GOOD. The tier deliberately does not
    // name a direction; that is reported as a distribution (lane error bar +
    // result chart), which cannot be squeezed out by a band boundary the way
    // the old outermost directional tier could.
    const fx = setup(5.16);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'good',
      'T(gradeGood)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('grades an early press identically to the same distance late', () => {
    const early = setup(4.84); // dt = -160
    early.scoring.matchNoteOnset(60, true);
    const late = setup(5.16); // dt = +160
    late.scoring.matchNoteOnset(60, true);
    const kindOf = (fx: ReturnType<typeof setup>): unknown =>
      fx.mocks.showHitChip.mock.calls[0]?.[0];
    expect(kindOf(early)).toBe('good');
    expect(kindOf(late)).toBe('good');
    expect(early.practice.timingScoreSum).toBe(late.practice.timingScoreSum);
  });

  it('a perfect hit sparkles AT the key + ring (grade-tint fallback when no noteColor)', () => {
    const fx = setup(5.04); // dt=40 → perfect
    fx.scoring.matchNoteOnset(60, true);
    // Burst at the pressed key's x (noteScreenX(60)=600), gold tint, in the play band.
    expect(fx.mocks.spawnBurst).toHaveBeenCalledWith(600, 600 * 0.72, 20, 1.15, '#ffe26b');
    // Clean hits (perfect / great) add a soft ring; the burst colour matches.
    expect(fx.mocks.spawnRipple).toHaveBeenCalledWith(600, 600 * 0.72, '#ffe26b', 230);
  });

  it('uses the NOTE colour (free-play palette) for burst + ring + stream when wired', () => {
    // Note-colour resolution (synesthesia/theme) matches the lane tiles + free
    // play, so practice hits read as the same visual language.
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      Tone: { context: { currentTime: 5.04 } }, // dt=40 → perfect
      noteColor: () => '#12abcd',
    });
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.mocks.spawnBurst).toHaveBeenCalledWith(600, 600 * 0.72, 20, 1.15, '#12abcd');
    expect(fx.mocks.spawnRipple).toHaveBeenCalledWith(600, 600 * 0.72, '#12abcd', 230);
    // Clean hits also fire the rising light stream (free-play parity).
    expect(fx.mocks.spawnStream).toHaveBeenCalledWith(600, 600 * 0.72, 1.15, '#12abcd');
  });

  it('an off-timing hit (early/late) gets a smaller burst, NO ring, NO stream', () => {
    const fx = setup(5.16); // dt=160 → past the 125 ms late GREAT edge → late
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.mocks.spawnBurst).toHaveBeenCalledWith(600, 600 * 0.72, 8, 0.7, '#a9d4ff');
    expect(fx.mocks.spawnRipple).not.toHaveBeenCalled();
    expect(fx.mocks.spawnStream).not.toHaveBeenCalled();
  });

  it('past late window → no match', () => {
    // dt = +250 ms (past hitWindowMs=200)
    const fx = setup(5.25);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(false);
  });

  it('before the window → no match (rhythm only — guided is unbounded)', () => {
    // dt = -220 ms, past the profile's symmetric goodMs = 200
    const fx = setup(4.78);
    const ok = fx.scoring.matchNoteOnset(60, true);
    expect(ok).toBe(false);
  });

  it('mic onset is compensated for detection latency (P1-11)', () => {
    // Note at 5000 ms. A mic onset detected at 5045 ms — but with a 45 ms
    // detection lag the true attack was on the beat (dt≈0 → PERFECT),
    // whereas an uncompensated read would score it 45 ms late.
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      tuning: { micInputLatencyMs: 45 },
      Tone: { context: { currentTime: 5.045 } },
    });
    const ok = fx.scoring.matchNoteOnset(60, false); // isExact=false → mic
    expect(ok).toBe(true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('MIDI onset is NOT latency-compensated (exact input)', () => {
    // Same 45 ms offset but via MIDI (isExact=true) — no mic compensation,
    // so dt=45 which is still within perfectMs=50 → perfect, but the
    // compensation must NOT have shifted it (verify via a 70 ms offset).
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      tuning: { micInputLatencyMs: 45 },
      Tone: { context: { currentTime: 5.07 } }, // dt=70
    });
    const ok = fx.scoring.matchNoteOnset(60, true); // MIDI → no compensation
    expect(ok).toBe(true);
    // 70 > perfect(50) but ≤ great(100) → 'great' (very close, not perfect)
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'great',
      'T(gradeGreat)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('P1-11: MIDI の per-event inputLagMs（event.timeStamp 由来）は elapsed から減算される', () => {
    // 上のケースと同じ +70ms だが、その 70ms がハンドラ遅延（lag）だと
    // 分かっている場合 — 実打鍵は dt≈0 → PERFECT に戻る。mic 定数
    // （micInputLatencyMs=45）は isExact=true では加算されないことも同時に検証。
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      tuning: { micInputLatencyMs: 45 },
      Tone: { context: { currentTime: 5.07 } }, // elapsed=5070
    });
    const ok = fx.scoring.matchNoteOnset(60, true, 70);
    expect(ok).toBe(true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });

  it('wrong note inside the window → throttled fact-based chip (P2-17)', () => {
    // In the window (dt≈40) but wrong pitch — rhythm now shows a chip.
    const fx = setup(5.04);
    const ok = fx.scoring.matchNoteOnset(62, true); // expected 60, played 62
    expect(ok).toBe(false);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'miss',
      'T(youPlayedFmt,M62)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
    // A second wrong note within the throttle window is suppressed.
    fx.mocks.showHitChip.mockClear();
    fx.scoring.matchNoteOnset(63, true);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
  });

  it('credits the same |dt| identically early or late (no asymmetric penalty)', () => {
    // Regression guard for the split-decision defect: the chip came from an
    // absolute threshold while the credit came from `1 - |dt| / window` over
    // asymmetric windows, so an early press was shown as PERFECT and credited
    // a fraction of what the same offset earned on the late side.
    const early = setup(4.86); // dt = -140
    early.scoring.matchNoteOnset(60, true);
    const late = setup(5.14); // dt = +140
    late.scoring.matchNoteOnset(60, true);
    expect(early.practice.timingScoreSum).toBeCloseTo(late.practice.timingScoreSum, 6);
  });

  it('credits exactly the tier weight the chip showed', () => {
    // Credit is a function of the TIER, as the genre computes accuracy — so
    // the chip and the score cannot disagree by construction.
    const perfect = setup(5.04); // dt = +40 → PERFECT
    perfect.scoring.matchNoteOnset(60, true);
    expect(perfect.practice.timingScoreSum).toBe(1);

    const great = setup(5.1); // dt = +100 → GREAT
    great.scoring.matchNoteOnset(60, true);
    expect(great.practice.timingScoreSum).toBeCloseTo(0.7, 9);

    const good = setup(5.16); // dt = +160 → GOOD
    good.scoring.matchNoteOnset(60, true);
    expect(good.practice.timingScoreSum).toBeCloseTo(0.3, 9);
  });

  it('judges each press against the profile for ITS OWN input path', () => {
    // A MIDI press is exact; a mic onset carries detection jitter. Same
    // offset, different verdict, because the paths differ in precision.
    const tuning = {
      judgeMidi: { perfectMs: 67, greatMs: 133, goodMs: 200 },
      judgeMic: { perfectMs: 100, greatMs: 167, goodMs: 250 },
    };
    const midi = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      tuning,
      Tone: { context: { currentTime: 5.08 } }, // dt = +80
    });
    midi.scoring.matchNoteOnset(60, true);
    expect(midi.mocks.showHitChip).toHaveBeenCalledWith(
      'great',
      'T(gradeGreat)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );

    const mic = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0 },
      tuning: { ...tuning, micInputLatencyMs: 0 },
      Tone: { context: { currentTime: 5.08 } }, // same dt = +80
    });
    mic.scoring.matchNoteOnset(60, false);
    expect(mic.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
  });
});

// ─── matchNoteOnset — mash resistance（A4）──────────────────────────
// 誤打は減点しない（accuracy = hits/target）が、rhythm × MIDI では
// sectionCombo を切り + extraPresses を数える。これが無いと全鍵連打で
// ★が取れてしまい「クリア」の意味が壊れる。マイクは誤検出があるので対象外。

describe('matchNoteOnset — mash resistance (A4)', () => {
  it('a wrong MIDI key in rhythm breaks sectionCombo + counts an extra press', () => {
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0, sectionCombo: 7, sectionBestCombo: 7 },
      Tone: { context: { currentTime: 5.04 } },
    });
    const ok = fx.scoring.matchNoteOnset(62, true);
    expect(ok).toBe(false);
    expect(fx.practice.sectionCombo).toBe(0);
    expect(fx.practice.extraPresses).toBe(1);
    // ベストコンボは非減少（結果カードの表示はそのまま）。
    expect(fx.practice.sectionBestCombo).toBe(7);
  });

  it('a mic misdetection never breaks the combo (pitch detection is fallible)', () => {
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm', startAudioTime: 0, sectionCombo: 7 },
      Tone: { context: { currentTime: 5.04 } },
    });
    const ok = fx.scoring.matchNoteOnset(62, false); // isExact=false → mic
    expect(ok).toBe(false);
    expect(fx.practice.sectionCombo).toBe(7);
    expect(fx.practice.extraPresses ?? 0).toBe(0);
  });

  it('guided wrong key stays penalty-free (learning mode)', () => {
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'guided', startAudioTime: 0, sectionCombo: 3 },
      Tone: { context: { currentTime: 5.04 } },
    });
    fx.scoring.matchNoteOnset(62, true);
    expect(fx.practice.sectionCombo).toBe(3);
    expect(fx.practice.extraPresses ?? 0).toBe(0);
  });

  it('re-pressing a resolved chord mate is still forgiven (no combo break)', () => {
    // 和音の弾き直し救済（既存）とマッシュ耐性が両立していること。
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000, hit: true }), note({ midi: 64, timeMs: 5010 })],
      practice: { mode: 'rhythm', startAudioTime: 0, currentNoteIdx: 1, sectionCombo: 4 },
      Tone: { context: { currentTime: 5.04 } },
    });
    const ok = fx.scoring.matchNoteOnset(60, true); // 解決済みメンバーの弾き直し
    expect(ok).toBe(false);
    expect(fx.practice.sectionCombo).toBe(4);
    expect(fx.practice.extraPresses ?? 0).toBe(0);
  });
});

// ─── 判定カウンタ（JudgeTally）への記録 ─────────────────────────────
// チップに出した grade と、リザルトが読むカウンタが常に一致すること。
// ここが崩れると「見た判定」と「集計」がズレる（この機構を入れた理由そのもの）。

describe('judge tally recording', () => {
  /** rhythm 用フィクスチャ — Tone の currentTime で dt を作る。 */
  function rhythmFx(currentTimeSec: number) {
    const judge = createJudgeTally();
    return makeFixture({
      notes: [note({ midi: 60, timeMs: 5000, durMs: 500 })],
      practice: { mode: 'rhythm', judge },
      Tone: { context: { currentTime: currentTimeSec } },
    });
  }

  it('records the SAME tier the chip shows (perfect)', () => {
    const fx = rhythmFx(5.04); // dt=40 ≤ perfectMs 50
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'perfect',
      'T(perfect)',
      expect.any(Number),
      expect.any(Number),
      'press'
    );
    expect(fx.practice.judge?.perfect).toBe(1);
    expect(fx.practice.judge?.great).toBe(0);
  });

  it('records the SAME tier the chip shows (good) with its signed offset', () => {
    const fx = rhythmFx(5.16); // dt=+160 → past the 125 ms GREAT edge
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.judge?.good).toBe(1);
    expect(judgeHits(fx.practice.judge)).toBe(1);
    expect(fx.practice.judge?.dtSumMs).toBeCloseTo(160, 0);
    expect(fx.practice.judge?.dtAbsSumMs).toBeCloseTo(160, 0);
  });

  it('keeps the SIGNED offset so the distribution can show direction', () => {
    // Direction is no longer a tier — it lives in the aggregate statistics and
    // the error ring. Both must therefore see the sign.
    const fx = rhythmFx(4.86); // dt = -140 → GOOD, early side
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.judge?.good).toBe(1);
    expect(fx.practice.judge?.dtSumMs).toBeCloseTo(-140, 0);
    expect(fx.practice.judge?.dtAbsSumMs).toBeCloseTo(140, 0);
    expect(fx.practice.judge?.dtSqSumMs).toBeCloseTo(140 * 140, 0);
  });

  it('feeds the error ring the signed offset (rhythm only)', () => {
    const ring = createJudgeErrorRing(8);
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000, durMs: 500 })],
      practice: { mode: 'rhythm', judge: createJudgeTally(), judgeErrors: ring },
      Tone: { context: { currentTime: 5.09 } }, // dt = +90
    });
    fx.scoring.matchNoteOnset(60, true);
    expect(ring.len).toBe(1);
    expect(ring.buf[0]).toBeCloseTo(90, 0);
  });

  it('does NOT feed the error ring in guided mode (its clock waits)', () => {
    const ring = createJudgeErrorRing(8);
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'guided', judge: createJudgeTally(), judgeErrors: ring },
      Tone: { context: { currentTime: 9 } },
    });
    fx.scoring.matchNoteOnset(60, true);
    expect(ring.len).toBe(0);
  });

  it('guided counts the note but contributes no offset (its clock waits)', () => {
    const judge = createJudgeTally();
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'guided', judge },
      Tone: { context: { currentTime: 9 } }, // way "late" — guided has no ceiling
    });
    fx.scoring.matchNoteOnset(60, true);
    expect(fx.practice.judge?.perfect).toBe(1);
    expect(fx.practice.judge?.dtSumMs).toBe(0);
  });

  it('a wrong key is not a judgement (no tier moves)', () => {
    const fx = rhythmFx(5.04);
    fx.scoring.matchNoteOnset(64, true); // wrong note
    const j = fx.practice.judge!;
    expect(j.perfect + j.great + j.good + j.miss).toBe(0);
  });

  it('records hold verdicts on release', () => {
    const judge = createJudgeTally();
    const fx = makeFixture({ practice: { mode: 'rhythm', judge } });
    // held 450 vs expected 500, tol 150 → good
    fx.practice.pendingHolds.set(
      60,
      note({ midi: 60, durMs: 500, holdStartMs: performance.now() - 450 })
    );
    fx.scoring.finalizeNoteHold(60);
    // held 300 vs 500 → short
    fx.practice.pendingHolds.set(
      62,
      note({ midi: 62, durMs: 500, holdStartMs: performance.now() - 300 })
    );
    fx.scoring.finalizeNoteHold(62);
    expect(judge.holdGood).toBe(1);
    expect(judge.holdShort).toBe(1);
    expect(judge.holdLong).toBe(0);
  });

  it('works with no tally wired (older shell / partial test)', () => {
    const fx = makeFixture({
      notes: [note({ midi: 60, timeMs: 5000 })],
      practice: { mode: 'rhythm' },
      Tone: { context: { currentTime: 5.04 } },
    });
    expect(() => fx.scoring.matchNoteOnset(60, true)).not.toThrow();
  });
});

// ─── finalizeNoteHold ──────────────────────────────────────────────

describe('finalizeNoteHold', () => {
  it('clears pendingHolds entry even outside rhythm mode', () => {
    const matched = note({ midi: 60, durMs: 500, holdStartMs: performance.now() - 100 });
    const fx = makeFixture({ practice: { mode: 'guided' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.pendingHolds.has(60)).toBe(false);
    // No score change in guided.
    expect(fx.practice.durationScoreSum).toBe(0);
  });

  it('no-op when key not in pendingHolds', () => {
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.scoring.finalizeNoteHold(99);
    expect(fx.practice.durationScoredCount).toBe(0);
  });

  it('rhythm mode: held duration close to expected → high score', () => {
    const start = performance.now() - 500; // held 500ms
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.durationScoreSum).toBeGreaterThan(0.9);
    expect(fx.practice.durationScoredCount).toBe(1);
  });

  it('rhythm mode: held much shorter than written → "hold longer" chip at the key', () => {
    // expected 500, tol = max(100, 500*0.3) = 150. held 300 → diff -200 > tol/2 → short
    const start = performance.now() - 300;
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'short',
      'T(lengthShort)',
      expect.any(Number),
      expect.any(Number),
      'release'
    );
  });

  it('rhythm mode: held much longer than written → "a bit long" chip at the key', () => {
    const start = performance.now() - 1000; // held 1000ms vs expected 500
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.mocks.showHitChip).toHaveBeenCalledWith(
      'long',
      'T(lengthLong)',
      expect.any(Number),
      expect.any(Number),
      'release'
    );
  });

  it('good hold (within half the tolerance) → cyan pulse, no nudge chip', () => {
    // held 450, expected 500, tol 150 → diff -50 ≤ tol/2 (75) → good → soft
    // cyan pulse only, no corrective chip.
    const start = performance.now() - 450;
    const matched = note({ midi: 60, durMs: 500, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
    // A distinct cyan "held it right" pulse at the key marks the length dimension.
    expect(fx.mocks.spawnRipple).toHaveBeenCalledWith(600, 600 * 0.72, '#7fe9e0', 150);
  });

  it('skips scoring when matched has no holdStartMs / durMs', () => {
    const matched = note({ midi: 60, durMs: 0, holdStartMs: 0 });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.durationScoredCount).toBe(0);
  });

  it('honors durationMinTolMs floor for very short notes', () => {
    // expected 50, raw tol = 50*0.3 = 15. min 100 → tol = 100.
    // held 100, off by 50 → score = 1 - 50/100 = 0.5 (no chip).
    const start = performance.now() - 100;
    const matched = note({ midi: 60, durMs: 50, holdStartMs: start });
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    fx.practice.pendingHolds.set(60, matched);
    fx.scoring.finalizeNoteHold(60);
    expect(fx.practice.durationScoreSum).toBeCloseTo(0.5, 1);
    expect(fx.mocks.showHitChip).not.toHaveBeenCalled();
  });
});
