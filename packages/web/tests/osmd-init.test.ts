// Tests for packages/web/src/osmd-init.ts.
//
// Covers:
//   • Throws when OSMD library is unavailable.
//   • Caches the in-flight Promise (concurrent calls collapse).
//   • Caches the final instance (subsequent calls return same).
//   • Reads currentSong at call time (rapid selectSong race).
//   • Sets EngravingRules.RenderPedals + CursorIgnoreRepetitions
//     even when the setters throw (try/catch swallows).
//   • Walks every measure to collect parentRepetition refs,
//     bumps UserNumberOfRepetitions for any with <2.
//   • render() retry — first throw + second success → renderOk.
//   • Both render() throws → continues without throwing (partial SVG).
//   • cursor.show + .reset wrapped individually (cursor.show throw
//     does NOT abort cursor.reset).
//   • reset() drops the cached instance.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOsmdInit, type OsmdInstance } from '../src/osmd-init';

// ─── fake OSMD lib ─────────────────────────────────────────────────

interface FakeInstanceOpts {
  loadShouldThrow?: boolean;
  renderThrows?: number; // how many leading renders should throw
  cursorShowThrows?: boolean;
  cursorResetThrows?: boolean;
  pedalSetThrows?: boolean;
  cursorIgnoreReptSetThrows?: boolean;
  repetitions?: Array<{ UserNumberOfRepetitions?: number; NumberOfRepetitions?: number }>;
  noCursor?: boolean;
  /** Force Sheet.SourceMeasures to be empty post-load — exercises
   *  the new sanity-check throw path (production bug 2026-05-09:
   *  some malformed user-imported songs produced empty Sheet after
   *  load). */
  forceEmptySheet?: boolean;
}

function makeFakeOsmdLib(instanceOpts: FakeInstanceOpts = {}) {
  const renderCalls: number[] = [];
  let renderThrows = instanceOpts.renderThrows ?? 0;
  const repetitions = instanceOpts.repetitions ?? [];

  const cursor = instanceOpts.noCursor
    ? null
    : {
        show: vi.fn(() => {
          if (instanceOpts.cursorShowThrows) throw new Error('show fail');
        }),
        reset: vi.fn(() => {
          if (instanceOpts.cursorResetThrows) throw new Error('reset fail');
        }),
      };

  // [Bug fix 2026-05-09] Default to at least one measure so the
  // factory's new sanity-check (throws when SourceMeasures.length===0)
  // doesn't fire on every smoke test. The "empty Sheet" path is
  // covered explicitly by the `forceEmptySheet` flag below — that's
  // the path that mimics the production-broken usr_mowwbzmy load.
  const repetitionMeasures = repetitions.map((parentRepetition) => ({
    FirstRepetitionInstructions: [{ parentRepetition }],
    LastRepetitionInstructions: null,
  }));
  const measures = instanceOpts.forceEmptySheet
    ? []
    : repetitionMeasures.length
      ? repetitionMeasures
      : [{ FirstRepetitionInstructions: null, LastRepetitionInstructions: null }];

  let pedalsValue: boolean | undefined;
  let cursorIgnoreReptValue: boolean | undefined;
  const engravingRules = {
    set RenderPedals(v: boolean) {
      if (instanceOpts.pedalSetThrows) throw new Error('pedal set fail');
      pedalsValue = v;
    },
    get RenderPedals() {
      return pedalsValue ?? true;
    },
    set CursorIgnoreRepetitions(v: boolean) {
      if (instanceOpts.cursorIgnoreReptSetThrows) throw new Error('rep set fail');
      cursorIgnoreReptValue = v;
    },
    get CursorIgnoreRepetitions() {
      return cursorIgnoreReptValue ?? false;
    },
  };

  const instance = {
    load: vi.fn(async (url: string) => {
      if (instanceOpts.loadShouldThrow) throw new Error('load fail');
      return url;
    }),
    render: vi.fn(() => {
      renderCalls.push(renderCalls.length);
      if (renderThrows > 0) {
        renderThrows--;
        throw new Error('render fail');
      }
    }),
    cursor,
    Sheet: {
      SourceMeasures: measures,
      Repetitions: repetitions,
    },
    EngravingRules: engravingRules,
  };

  const lib = {
    OpenSheetMusicDisplay: vi.fn().mockImplementation(() => instance),
  } as unknown as Parameters<typeof createOsmdInit>[0]['opensheetmusicdisplay'];

  return {
    lib,
    instance,
    cursor,
    renderCalls,
    getPedalsValue: () => pedalsValue,
    getCursorIgnoreReptValue: () => cursorIgnoreReptValue,
  };
}

// (makeDeps helper removed — every test inlines its own deps so the
// fake-OSMD `lib` reference is captured in the same closure as the
// `instance` / `cursor` assertions.)

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── construction guards ───────────────────────────────────────────

describe('createOsmdInit — construction guards', () => {
  it('throws "OSMD library not loaded" when opensheetmusicdisplay is undefined', async () => {
    const init = createOsmdInit({
      opensheetmusicdisplay: undefined,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await expect(init.initOsmd()).rejects.toThrow('OSMD library not loaded');
  });

  it('throws when no song URL is set', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => null,
    });
    await expect(init.initOsmd()).rejects.toThrow('No xmlUrl / mxlUrl');
  });
});

// ─── caching ───────────────────────────────────────────────────────

describe('createOsmdInit — caching', () => {
  it('caches the final instance (second call → same reference)', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    const a = await init.initOsmd();
    const b = await init.initOsmd();
    expect(a).toBe(b);
    // OSMD ctor was called exactly once.
    expect(fake.lib?.OpenSheetMusicDisplay).toHaveBeenCalledOnce();
    // load() also called exactly once when URL didn't change.
    expect(fake.instance.load).toHaveBeenCalledOnce();
  });

  it('reloads when the current song URL changes (alla_turca regression — switching songs must re-load Sheet)', async () => {
    const fake = makeFakeOsmdLib();
    let activeUrl = 'song-a.xml';
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ xmlUrl: activeUrl }),
    });
    await init.initOsmd();
    activeUrl = 'song-b.xml';
    await init.initOsmd();
    // Same OSMD instance reused...
    expect(fake.lib?.OpenSheetMusicDisplay).toHaveBeenCalledOnce();
    // ...but load() fired twice (once per URL).
    expect(fake.instance.load).toHaveBeenCalledTimes(2);
    expect(fake.instance.load).toHaveBeenNthCalledWith(1, 'song-a.xml');
    expect(fake.instance.load).toHaveBeenNthCalledWith(2, 'song-b.xml');
  });

  it('does NOT reload when the current song URL is unchanged (selectSong same-song path)', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ xmlUrl: 'same.xml' }),
    });
    await init.initOsmd();
    await init.initOsmd();
    await init.initOsmd();
    expect(fake.instance.load).toHaveBeenCalledOnce();
  });

  it('collapses concurrent calls onto a single in-flight Promise', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    const [a, b] = await Promise.all([init.initOsmd(), init.initOsmd()]);
    expect(a).toBe(b);
    expect(fake.lib?.OpenSheetMusicDisplay).toHaveBeenCalledOnce();
  });

  it('reset() drops the cache so the next call re-instantiates', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    init.reset();
    await init.initOsmd();
    expect(fake.lib?.OpenSheetMusicDisplay).toHaveBeenCalledTimes(2);
  });
});

// ─── URL resolution ────────────────────────────────────────────────

describe('createOsmdInit — URL resolution', () => {
  it('prefers xmlUrl over mxlUrl (alla_turca regression — xml-first avoids non-standard inner-XML names that break OSMD extraction)', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'song.mxl', xmlUrl: 'song.xml' }),
    });
    await init.initOsmd();
    expect(fake.instance.load).toHaveBeenCalledWith('song.xml');
  });

  it('falls back to mxlUrl when xmlUrl is null', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'song.mxl', xmlUrl: null }),
    });
    await init.initOsmd();
    expect(fake.instance.load).toHaveBeenCalledWith('song.mxl');
  });

  it('falls back to mxlUrl when xmlUrl is empty string (user-imported song with blob URL on xmlUrl, otherwise fresh — but we keep the legacy lookup honest)', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'fallback.mxl', xmlUrl: '' }),
    });
    await init.initOsmd();
    expect(fake.instance.load).toHaveBeenCalledWith('fallback.mxl');
  });
});

// ─── EngravingRules quirks ─────────────────────────────────────────

describe('createOsmdInit — EngravingRules quirks', () => {
  it('disables RenderPedals and sets CursorIgnoreRepetitions=false on success', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    expect(fake.getPedalsValue()).toBe(false);
    // CursorIgnoreRepetitions=false lets MusicPartManagerIterator's
    // constructor walk take back-jumps at repeat ends, so the
    // timestamp-driven cursor seeding in setCursorToNote lands at the
    // correct repeat iteration. See osmd-cursor.ts.
    expect(fake.getCursorIgnoreReptValue()).toBe(false);
  });

  it('continues when RenderPedals setter throws (logs warn)', async () => {
    const fake = makeFakeOsmdLib({ pedalSetThrows: true });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await expect(init.initOsmd()).resolves.toBeTruthy();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not disable pedal render')
    );
  });

  it('continues silently when CursorIgnoreRepetitions setter throws (older OSMD)', async () => {
    const fake = makeFakeOsmdLib({ cursorIgnoreReptSetThrows: true });
    const warnSpy = vi.spyOn(console, 'warn');
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await expect(init.initOsmd()).resolves.toBeTruthy();
    // Should NOT log a warning for this one (older-OSMD silent fallthrough).
    const cursorWarn = warnSpy.mock.calls.some((c) =>
      String(c[0]).includes('CursorIgnoreRepetitions')
    );
    expect(cursorWarn).toBe(false);
  });
});

// ─── Repetition activation ─────────────────────────────────────────

describe('createOsmdInit — Repetition activation', () => {
  it('bumps UserNumberOfRepetitions to 2 when below 2', async () => {
    const r1 = { UserNumberOfRepetitions: 1, NumberOfRepetitions: 0 };
    const r2 = { UserNumberOfRepetitions: 1, NumberOfRepetitions: 3 };
    const fake = makeFakeOsmdLib({ repetitions: [r1, r2] });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    expect(r1.UserNumberOfRepetitions).toBe(2);
    expect(r2.UserNumberOfRepetitions).toBe(3); // max(2, 3) = 3
  });

  it('leaves UserNumberOfRepetitions alone when already >=2', async () => {
    const r = { UserNumberOfRepetitions: 4, NumberOfRepetitions: 2 };
    const fake = makeFakeOsmdLib({ repetitions: [r] });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    expect(r.UserNumberOfRepetitions).toBe(4);
  });

  it('throws "Sheet.SourceMeasures is empty" when load resolves but Sheet is empty (2026-05-09 broken-load regression)', async () => {
    const fake = makeFakeOsmdLib({ forceEmptySheet: true });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await expect(init.initOsmd()).rejects.toThrow(/Sheet\.SourceMeasures is empty/);
  });

  it('after the empty-sheet throw, the next call retries from scratch (loadedUrl was cleared)', async () => {
    let emptyToggle = true;
    // First load returns empty sheet; flip the flag so the SECOND
    // load returns a populated one. The factory should NOT cache the
    // failed load — calling init() again must trigger a re-attempt.
    const fake = makeFakeOsmdLib();
    Object.defineProperty(fake.instance.Sheet, 'SourceMeasures', {
      get() {
        return emptyToggle
          ? []
          : [{ FirstRepetitionInstructions: null, LastRepetitionInstructions: null }];
      },
    });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await expect(init.initOsmd()).rejects.toThrow(/Sheet\.SourceMeasures is empty/);
    emptyToggle = false; // simulate retry-with-fresh-blob succeeding
    await expect(init.initOsmd()).resolves.toBeTruthy();
    expect(fake.instance.load).toHaveBeenCalledTimes(2);
  });
});

// ─── render() retry ────────────────────────────────────────────────

describe('createOsmdInit — render retry', () => {
  it('first throw + second success → continues normally', async () => {
    const fake = makeFakeOsmdLib({ renderThrows: 1 });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    expect(fake.instance.render).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('attempt 1 failed'));
  });

  it('both throws → swallows + logs combined warn (no rejection)', async () => {
    const fake = makeFakeOsmdLib({ renderThrows: 2 });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await expect(init.initOsmd()).resolves.toBeTruthy();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('both render attempts failed')
    );
  });

  it('first-pass success → only one render call', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    expect(fake.instance.render).toHaveBeenCalledTimes(1);
  });
});

// ─── cursor wrapping ───────────────────────────────────────────────

describe('createOsmdInit — cursor wrapping', () => {
  it('cursor.show + cursor.reset both fire on happy path', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    expect(fake.cursor!.show).toHaveBeenCalledOnce();
    expect(fake.cursor!.reset).toHaveBeenCalledOnce();
  });

  it('cursor.show throw does NOT abort cursor.reset', async () => {
    const fake = makeFakeOsmdLib({ cursorShowThrows: true });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    expect(fake.cursor!.reset).toHaveBeenCalledOnce();
  });

  it('null cursor → no throw', async () => {
    const fake = makeFakeOsmdLib({ noCursor: true });
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await expect(init.initOsmd()).resolves.toBeTruthy();
  });
});

// ─── containerId injection ─────────────────────────────────────────

describe('createOsmdInit — containerId', () => {
  it('defaults to "osmdContainer"', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
    });
    await init.initOsmd();
    // First positional arg of the OSMD ctor mock.
    const ctorArg = (fake.lib?.OpenSheetMusicDisplay as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0];
    expect(ctorArg).toBe('osmdContainer');
  });

  it('overrides via deps.containerId', async () => {
    const fake = makeFakeOsmdLib();
    const init = createOsmdInit({
      opensheetmusicdisplay: fake.lib,
      getCurrentSong: () => ({ mxlUrl: 'x.mxl' }),
      containerId: 'customDiv',
    });
    await init.initOsmd();
    const ctorArg = (fake.lib?.OpenSheetMusicDisplay as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0][0];
    expect(ctorArg).toBe('customDiv');
  });
});

// Type smoke — ensures the public types stay exported.
const _t: OsmdInstance = null as unknown as OsmdInstance;
void _t;
