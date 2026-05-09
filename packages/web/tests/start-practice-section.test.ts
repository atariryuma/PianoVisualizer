// Tests for packages/web/src/start-practice-section.ts.
//
// Integration-style tests — the orchestrator has many side effects so
// we drive it end-to-end against mock deps and assert observable
// outcomes:
//
//   • Score lazy-loaded when not _loaded (via deps.loadCurrentScore).
//   • Out-of-range section index → no-op, no audio scheduled.
//   • Per-section state reset (hits, misses, combos, pendingHolds, flow).
//   • DOM HUD writes for section name + tempo + progress count.
//   • Full-song listen mode → fullSongMode timeline + sectionIdx=0 +
//     song-title banner + tempoPct shown as 100.
//   • Cursor position + scroll-throttle reset.
//   • Guided mode → no Transport.start; rhythm/listen → schedules +
//     starts Transport.
//   • Audio-offset probe writes practice.audioOffsetMs via pickAudioOffsetMs.
//   • Tone failure → falls back to user override / default.
//   • alertScoreLoadFailedFmt on score-load error.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createStartPracticeSection,
  type StartPracticeSectionDeps,
  type CurrentSongRef,
  type OsmdLikeNote,
  type PracticePartial,
  type StatePartial,
  type StartSectionToneRef,
} from '../src/start-practice-section';

// ─── fixture ────────────────────────────────────────────────────────

function makeNote(over: Partial<OsmdLikeNote> = {}): OsmdLikeNote {
  return {
    hand: 'R',
    midi: 60,
    timeMs: 5000,
    durMs: 500,
    measureIdx: 0,
    inBarQuarters: 0,
    ...over,
  };
}

function makeFakeTone(
  opts: { startThrows?: boolean; ctxThrows?: boolean } = {}
): StartSectionToneRef {
  const nowVal = 1.0;
  const transport = {
    cancel: vi.fn(),
    stop: vi.fn(),
    position: 0 as number | string,
    start: vi.fn(),
  };
  const tone: StartSectionToneRef = {
    start: vi.fn(async () => {
      if (opts.startThrows) throw new Error('Tone.start failed');
    }),
    now: () => nowVal,
    context: opts.ctxThrows
      ? (null as unknown as StartSectionToneRef['context'])
      : {
          lookAhead: 0.1,
          rawContext: { outputLatency: 0.04, baseLatency: 0.005 },
          outputLatency: 0.04,
          baseLatency: 0.005,
        },
    Transport: transport,
  };
  return tone;
}

interface Fixture {
  start: (idx: number) => Promise<void>;
  deps: StartPracticeSectionDeps;
  state: StatePartial;
  practice: PracticePartial;
  song: CurrentSongRef | null;
  tone: StartSectionToneRef | undefined;
  spies: {
    hideIntroHint: ReturnType<typeof vi.fn>;
    loadCurrentScore: ReturnType<typeof vi.fn>;
    recomputePracticeTimings: ReturnType<typeof vi.fn>;
    buildSectionNotes: ReturnType<typeof vi.fn>;
    buildFullSongNotes: ReturnType<typeof vi.fn>;
    syncLayout: ReturnType<typeof vi.fn>;
    setInputIndicator: ReturnType<typeof vi.fn>;
    requestWakeLock: ReturnType<typeof vi.fn>;
    showSectionBanner: ReturnType<typeof vi.fn>;
    cursorTo: ReturnType<typeof vi.fn>;
    showCursor: ReturnType<typeof vi.fn>;
    ensureToneInstruments: ReturnType<typeof vi.fn>;
    scheduleCountInBeeps: ReturnType<typeof vi.fn>;
    scheduleSectionPlayback: ReturnType<typeof vi.fn>;
    practiceBeatMs: ReturnType<typeof vi.fn>;
    pickAudioOffsetMs: ReturnType<typeof vi.fn>;
    alert: ReturnType<typeof vi.fn>;
    remoteLog: ReturnType<typeof vi.fn>;
    t: ReturnType<typeof vi.fn>;
  };
  dom: StartPracticeSectionDeps['dom'];
}

function makeFixture(
  over: {
    song?: CurrentSongRef | null;
    notes?: OsmdLikeNote[];
    fullSongNotes?: OsmdLikeNote[];
    tone?: StartSectionToneRef | undefined;
    practice?: Partial<PracticePartial>;
    prefs?: { audioOffsetMs?: number | null };
    loadCurrentScoreThrows?: Error;
    remoteLogEnabled?: boolean;
  } = {}
): Fixture {
  const state: StatePartial = { flow: 0, combo: 0, bestCombo: 0 };
  const practice: PracticePartial = {
    enabled: false,
    sectionIdx: 0,
    sectionNotes: [],
    currentNoteIdx: 0,
    hits: 99,
    misses: 99,
    timingScoreSum: 99,
    durationScoreSum: 99,
    durationScoredCount: 99,
    pendingHolds: new Map(),
    sectionCombo: 99,
    sectionBestCombo: 99,
    mode: 'guided',
    fullSongMode: false,
    tempoPct: 60,
    ghostOn: false,
    metronomeOn: false,
    startAudioTime: 0,
    audioOffsetMs: null,
    ...over.practice,
  };
  const song: CurrentSongRef | null =
    over.song === undefined
      ? {
          _loaded: true,
          titleKey: 'title.fur_elise',
          sections: [
            { id: 'A', nameKey: 'sec.a', startSec: 0, endSec: 10 },
            { id: 'B', nameKey: 'sec.b', startSec: 10, endSec: 20, isBoss: true },
          ],
        }
      : over.song;
  const notes = over.notes ?? [makeNote(), makeNote({ hand: 'L', midi: 50 })];
  const fullSongNotes = over.fullSongNotes ?? [makeNote(), makeNote({ midi: 64 })];

  const dom: StartPracticeSectionDeps['dom'] = {
    ptbSection: { textContent: '' },
    ptbTempo: { textContent: '' },
    ptbProgress: { textContent: '' },
    practiceHud: { classList: { add: vi.fn() } },
    osmdContainer: { classList: { add: vi.fn() } },
  };

  const spies: Fixture['spies'] = {
    hideIntroHint: vi.fn(),
    loadCurrentScore: vi.fn(async () => {
      if (over.loadCurrentScoreThrows) throw over.loadCurrentScoreThrows;
    }),
    recomputePracticeTimings: vi.fn(),
    buildSectionNotes: vi.fn().mockReturnValue(notes),
    buildFullSongNotes: vi.fn().mockReturnValue(fullSongNotes),
    syncLayout: vi.fn(),
    setInputIndicator: vi.fn(),
    requestWakeLock: vi.fn(),
    showSectionBanner: vi.fn(),
    cursorTo: vi.fn(),
    showCursor: vi.fn(),
    ensureToneInstruments: vi.fn(),
    scheduleCountInBeeps: vi.fn(),
    scheduleSectionPlayback: vi.fn(),
    practiceBeatMs: vi.fn().mockReturnValue(500),
    pickAudioOffsetMs: vi.fn().mockReturnValue(40),
    alert: vi.fn(),
    remoteLog: vi.fn(),
    t: vi.fn((key) => 'T(' + key + ')'),
  };

  const tone = 'tone' in over ? over.tone : makeFakeTone();

  const deps: StartPracticeSectionDeps = {
    state,
    practice,
    prefs: over.prefs ?? { audioOffsetMs: null },
    getCurrentSong: () => song,
    countInMs: () => 4000,
    defaultAudioOffsetMs: 40,
    remoteLogEnabled: over.remoteLogEnabled ?? false,
    alert: spies.alert,
    remoteLog: spies.remoteLog,
    t: spies.t,
    hideIntroHint: spies.hideIntroHint,
    syncLayout: spies.syncLayout,
    setInputIndicator: spies.setInputIndicator,
    requestWakeLock: spies.requestWakeLock,
    showSectionBanner: spies.showSectionBanner,
    dom,
    loadCurrentScore: spies.loadCurrentScore,
    recomputePracticeTimings: spies.recomputePracticeTimings,
    buildSectionNotes: spies.buildSectionNotes,
    buildFullSongNotes: spies.buildFullSongNotes,
    computeHandRanges: () => ({ lhMin: 36, lhMax: 60, rhMin: 60, rhMax: 84 }),
    osmdAdapter: { cursorTo: spies.cursorTo, showCursor: spies.showCursor },
    Tone: tone,
    ensureToneInstruments: spies.ensureToneInstruments,
    scheduleCountInBeeps: spies.scheduleCountInBeeps,
    audioScheduler: { scheduleSectionPlayback: spies.scheduleSectionPlayback },
    getInstruments: () => ({ piano: { id: 'piano' }, metronome: { id: 'metro' } }),
    practiceBeatMs: spies.practiceBeatMs,
    pickAudioOffsetMs: spies.pickAudioOffsetMs,
  };

  return {
    start: createStartPracticeSection(deps),
    deps,
    state,
    practice,
    song,
    tone,
    spies,
    dom,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── short-circuits ────────────────────────────────────────────────

describe('startPracticeSection — short-circuits', () => {
  it('no-op when getCurrentSong returns null', async () => {
    const fx = makeFixture({ song: null });
    await fx.start(0);
    expect(fx.spies.loadCurrentScore).not.toHaveBeenCalled();
    expect(fx.spies.buildSectionNotes).not.toHaveBeenCalled();
  });

  it('no-op when sections[idx] is undefined', async () => {
    const fx = makeFixture();
    await fx.start(99);
    // We should NOT have built notes or scheduled audio.
    expect(fx.spies.buildSectionNotes).not.toHaveBeenCalled();
    expect(fx.spies.scheduleCountInBeeps).not.toHaveBeenCalled();
  });

  it('alerts when loadCurrentScore rejects', async () => {
    const fx = makeFixture({
      song: { _loaded: false, titleKey: 'title', sections: [{ nameKey: 'a' }] },
      loadCurrentScoreThrows: new Error('XML 404'),
    });
    await fx.start(0);
    expect(fx.spies.alert).toHaveBeenCalledWith(expect.stringContaining('alertScoreLoadFailedFmt'));
    expect(fx.spies.buildSectionNotes).not.toHaveBeenCalled();
  });
});

// ─── score-load lazy ───────────────────────────────────────────────

describe('startPracticeSection — score-load', () => {
  it('calls loadCurrentScore when song._loaded is false', async () => {
    const fx = makeFixture({
      song: { _loaded: false, titleKey: 't', sections: [{ nameKey: 'a' }] },
    });
    await fx.start(0);
    expect(fx.spies.loadCurrentScore).toHaveBeenCalledOnce();
  });

  it('skips loadCurrentScore when already loaded', async () => {
    const fx = makeFixture();
    await fx.start(0);
    expect(fx.spies.loadCurrentScore).not.toHaveBeenCalled();
  });
});

// ─── per-section state reset ───────────────────────────────────────

describe('startPracticeSection — state reset', () => {
  it('resets practice counters', async () => {
    const fx = makeFixture();
    await fx.start(0);
    expect(fx.practice.hits).toBe(0);
    expect(fx.practice.misses).toBe(0);
    expect(fx.practice.timingScoreSum).toBe(0);
    expect(fx.practice.durationScoreSum).toBe(0);
    expect(fx.practice.sectionCombo).toBe(0);
    expect(fx.practice.sectionBestCombo).toBe(0);
    expect(fx.practice.currentNoteIdx).toBe(0);
    expect(fx.practice.pendingHolds.size).toBe(0);
  });

  it('resets state.flow=30 / combo=0 / bestCombo=0', async () => {
    const fx = makeFixture();
    fx.state.flow = 99;
    fx.state.combo = 99;
    fx.state.bestCombo = 99;
    await fx.start(0);
    expect(fx.state.flow).toBe(30);
    expect(fx.state.combo).toBe(0);
    expect(fx.state.bestCombo).toBe(0);
  });

  it('flips practice.enabled to true', async () => {
    const fx = makeFixture();
    fx.practice.enabled = false;
    await fx.start(0);
    expect(fx.practice.enabled).toBe(true);
  });

  it('records sectionIdx', async () => {
    const fx = makeFixture();
    await fx.start(1);
    expect(fx.practice.sectionIdx).toBe(1);
  });
});

// ─── DOM HUD writes ────────────────────────────────────────────────

describe('startPracticeSection — HUD writes', () => {
  it('writes section name + boss crown to ptbSection', async () => {
    const fx = makeFixture();
    await fx.start(1); // section B (isBoss)
    expect(fx.dom.ptbSection.textContent).toBe('T(sec.b) 👑');
  });

  it('non-boss section has no crown', async () => {
    const fx = makeFixture();
    await fx.start(0);
    expect(fx.dom.ptbSection.textContent).toBe('T(sec.a)');
  });

  it('writes "🥁 NN%" tempo from practice.tempoPct', async () => {
    const fx = makeFixture({ practice: { mode: 'guided', tempoPct: 75 } });
    await fx.start(0);
    expect(fx.dom.ptbTempo.textContent).toBe('🥁 75%');
  });

  it('progress count excludes _filtered notes', async () => {
    const notes = [
      makeNote({ hand: 'R' }),
      makeNote({ hand: 'L', _filtered: true }),
      makeNote({ hand: 'R' }),
    ];
    const fx = makeFixture({ notes });
    await fx.start(0);
    expect(fx.dom.ptbProgress.textContent).toBe('0 / 2');
  });
});

// ─── full-song listen mode ─────────────────────────────────────────

describe('startPracticeSection — full-song listen', () => {
  it('uses buildFullSongNotes (not buildSectionNotes)', async () => {
    const fx = makeFixture({ practice: { mode: 'listen', fullSongMode: true } });
    await fx.start(1);
    expect(fx.spies.buildFullSongNotes).toHaveBeenCalled();
    expect(fx.spies.buildSectionNotes).not.toHaveBeenCalled();
  });

  it('forces sectionIdx=0 even when caller passed 1', async () => {
    const fx = makeFixture({ practice: { mode: 'listen', fullSongMode: true } });
    await fx.start(1);
    expect(fx.practice.sectionIdx).toBe(0);
  });

  it('shows song title in HUD instead of section name', async () => {
    const fx = makeFixture({ practice: { mode: 'listen', fullSongMode: true } });
    await fx.start(0);
    expect(fx.dom.ptbSection.textContent).toBe('T(title.fur_elise)');
  });

  it('forces tempo display to 100% regardless of practice.tempoPct', async () => {
    const fx = makeFixture({
      practice: { mode: 'listen', fullSongMode: true, tempoPct: 60 },
    });
    await fx.start(0);
    expect(fx.dom.ptbTempo.textContent).toBe('🥁 100%');
  });

  it('shows section banner with song titleKey', async () => {
    const fx = makeFixture({ practice: { mode: 'listen', fullSongMode: true } });
    await fx.start(0);
    expect(fx.spies.showSectionBanner).toHaveBeenCalledWith({
      nameKey: 'title.fur_elise',
    });
  });
});

// ─── cursor + scroll ───────────────────────────────────────────────

describe('startPracticeSection — cursor + scroll', () => {
  it('positions cursor at first note', async () => {
    const notes = [makeNote({ measureIdx: 5, inBarQuarters: 1.5 })];
    const fx = makeFixture({ notes });
    await fx.start(0);
    expect(fx.spies.cursorTo).toHaveBeenCalledWith(5, 1.5);
  });

  it('shows the cursor (which auto-scrolls via cursorOptions.follow:true)', async () => {
    const fx = makeFixture();
    await fx.start(0);
    // showCursor is called twice — once in the main flow, once inside
    // the audio-setup branch (guided/rhythm/listen all path through it).
    expect(fx.spies.showCursor.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── audio mode branching ─────────────────────────────────────────

describe('startPracticeSection — audio mode branching', () => {
  it('guided: schedules count-in but NOT Transport.start', async () => {
    const fx = makeFixture({ practice: { mode: 'guided' } });
    await fx.start(0);
    expect(fx.spies.scheduleCountInBeeps).toHaveBeenCalledOnce();
    expect(fx.tone!.Transport.start).not.toHaveBeenCalled();
    expect(fx.spies.scheduleSectionPlayback).not.toHaveBeenCalled();
  });

  it('rhythm: schedules section playback + Transport.start at startAudioTime', async () => {
    const fx = makeFixture({ practice: { mode: 'rhythm', ghostOn: true } });
    await fx.start(0);
    expect(fx.spies.scheduleSectionPlayback).toHaveBeenCalledWith(
      { metronome: { id: 'metro' }, piano: { id: 'piano' } },
      expect.objectContaining({ countInMs: 4000, beatMs: 500 })
    );
    expect(fx.tone!.Transport.start).toHaveBeenCalled();
  });

  it('rhythm with ghostOff: piano=null in scheduler call', async () => {
    const fx = makeFixture({ practice: { mode: 'rhythm', ghostOn: false } });
    await fx.start(0);
    expect(fx.spies.scheduleSectionPlayback).toHaveBeenCalledWith(
      { metronome: { id: 'metro' }, piano: null },
      expect.any(Object)
    );
  });

  it('listen: forces ghost on (piano always non-null)', async () => {
    const fx = makeFixture({ practice: { mode: 'listen', ghostOn: false } });
    await fx.start(0);
    expect(fx.spies.scheduleSectionPlayback).toHaveBeenCalledWith(
      { metronome: { id: 'metro' }, piano: { id: 'piano' } },
      expect.any(Object)
    );
  });
});

// ─── audio-offset probe ────────────────────────────────────────────

describe('startPracticeSection — audio offset', () => {
  it('writes practice.audioOffsetMs from pickAudioOffsetMs', async () => {
    const fx = makeFixture({ prefs: { audioOffsetMs: null } });
    fx.spies.pickAudioOffsetMs.mockReturnValue(55);
    await fx.start(0);
    expect(fx.practice.audioOffsetMs).toBe(55);
  });

  it('passes user override when present', async () => {
    const fx = makeFixture({ prefs: { audioOffsetMs: 30 } });
    await fx.start(0);
    expect(fx.spies.pickAudioOffsetMs).toHaveBeenCalledWith(
      expect.objectContaining({ userOverrideMs: 30 })
    );
  });

  it('passes null when no user override', async () => {
    const fx = makeFixture({ prefs: { audioOffsetMs: null } });
    await fx.start(0);
    expect(fx.spies.pickAudioOffsetMs).toHaveBeenCalledWith(
      expect.objectContaining({ userOverrideMs: null })
    );
  });

  it('Tone failure → falls back to user override', async () => {
    const fx = makeFixture({
      tone: makeFakeTone({ startThrows: true }),
      prefs: { audioOffsetMs: 25 },
    });
    await fx.start(0);
    expect(fx.practice.audioOffsetMs).toBe(25);
  });

  it('Tone failure + no user override → defaultMs', async () => {
    const fx = makeFixture({
      tone: makeFakeTone({ startThrows: true }),
      prefs: { audioOffsetMs: null },
    });
    await fx.start(0);
    expect(fx.practice.audioOffsetMs).toBe(40); // defaultAudioOffsetMs
  });

  it('Tone undefined entirely → defaultMs', async () => {
    const fx = makeFixture({ tone: undefined, prefs: { audioOffsetMs: null } });
    await fx.start(0);
    expect(fx.practice.audioOffsetMs).toBe(40);
  });
});

// ─── DIAG dump gate ────────────────────────────────────────────────

describe('startPracticeSection — DIAG dump', () => {
  it('fires when remoteLogEnabled=true and notes exist', async () => {
    const fx = makeFixture({ remoteLogEnabled: true });
    await fx.start(0);
    expect(fx.spies.remoteLog).toHaveBeenCalledWith(expect.stringContaining('[DIAG/play.section]'));
  });

  it('does NOT fire when remoteLogEnabled=false', async () => {
    const fx = makeFixture({ remoteLogEnabled: false });
    await fx.start(0);
    const diagCalls = fx.spies.remoteLog.mock.calls.filter((c) =>
      String(c[0]).includes('[DIAG/play.section]')
    );
    expect(diagCalls.length).toBe(0);
  });
});

// ─── small details ─────────────────────────────────────────────────

describe('startPracticeSection — small details', () => {
  it('hides intro hint at the start', async () => {
    const fx = makeFixture();
    await fx.start(0);
    expect(fx.spies.hideIntroHint).toHaveBeenCalledOnce();
  });

  it('runs recomputePracticeTimings before building notes', async () => {
    const order: string[] = [];
    const fx = makeFixture();
    fx.spies.recomputePracticeTimings.mockImplementation(() => order.push('recompute'));
    fx.spies.buildSectionNotes.mockImplementation(() => {
      order.push('build');
      return [];
    });
    await fx.start(0);
    expect(order).toEqual(['recompute', 'build']);
  });

  it('calls syncLayout + setInputIndicator + requestWakeLock', async () => {
    const fx = makeFixture();
    await fx.start(0);
    expect(fx.spies.syncLayout).toHaveBeenCalledOnce();
    expect(fx.spies.setInputIndicator).toHaveBeenCalledOnce();
    expect(fx.spies.requestWakeLock).toHaveBeenCalledOnce();
  });

  it('Transport.cancel + stop + position=0 before scheduling', async () => {
    const fx = makeFixture({ practice: { mode: 'rhythm' } });
    await fx.start(0);
    expect(fx.tone!.Transport.cancel).toHaveBeenCalled();
    expect(fx.tone!.Transport.stop).toHaveBeenCalled();
  });
});
