// Tests for packages/web/src/cloud-sync.ts. Each "device" has its own storage
// and live state; they share one in-memory cloud, so these run the same paths a
// real pair of devices would.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CLOUD_DOC_VERSION,
  CloudAuthError,
  SYNC_DEBOUNCE_MS,
  SYNC_META_KEY,
  assignSyncedPrefs,
  canonicalJson,
  createCloudSync,
  parseCloudDoc,
  pickSyncedPrefs,
  type CloudDoc,
  type CloudProvider,
  type SyncedPrefs,
} from '../src/cloud-sync';
import type { PrefsShape } from '../src/prefs-storage';
import { defaultPracticeProgress, defaultSongProgress, type PracticeProgress } from '@piano/core';

const DAY = '2026-03-01';

class FakeCloud {
  doc: unknown = null;
  reads = 0;
  writes = 0;
  failNext: Error | null = null;
  /** Holds a read open, to simulate a section starting mid-sync. */
  beforeRead: (() => void) | null = null;

  provider(): CloudProvider {
    const take = (): void => {
      if (this.failNext) {
        const e = this.failNext;
        this.failNext = null;
        throw e;
      }
    };
    return {
      id: 'google',
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      read: async () => {
        this.reads++;
        this.beforeRead?.();
        take();
        return this.doc === null ? null : JSON.parse(JSON.stringify(this.doc));
      },
      write: async (doc: CloudDoc) => {
        take();
        this.writes++;
        this.doc = JSON.parse(JSON.stringify(doc));
      },
      deleteRemote: async () => {
        take();
        this.doc = null;
      },
    };
  }
}

function makeDevice(cloud: FakeCloud, deviceId: string, progress?: PracticeProgress) {
  const disk = new Map<string, string>();
  const live = {
    progress: progress ?? defaultPracticeProgress(),
    prefs: {} as PrefsShape,
    busy: false,
    time: 1000,
  };
  const provider = cloud.provider();
  const saved: string[] = [];
  const store = {
    loadJSON<T>(key: string, fallback: T): T {
      const raw = disk.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    },
    saveJSON(key: string, val: unknown): boolean {
      disk.set(key, JSON.stringify(val));
      saved.push(key);
      sync?.noteSaved(key);
      return true;
    },
  };
  let sync: ReturnType<typeof createCloudSync> | null = null;
  const build = () =>
    createCloudSync({
      store,
      providers: { google: provider },
      getProgress: () => live.progress,
      applyProgress: (m) => {
        live.progress = m;
        store.saveJSON('pianoViz_practice_v1', m);
      },
      getPrefs: () => live.prefs,
      applyPrefs: (v: SyncedPrefs) => {
        assignSyncedPrefs(live.prefs, v);
        store.saveJSON('pianoViz_prefs', live.prefs);
      },
      isBusy: () => live.busy,
      now: () => live.time,
      randomId: () => deviceId,
    });
  sync = build();
  return { sync, live, provider, disk, saved, store, rebuild: () => (sync = build()) };
}

function songWith(stars: number, pct: number): PracticeProgress {
  const p = defaultPracticeProgress();
  p.songs.s = defaultSongProgress();
  p.songs.s.sections.A1 = { stars, bestPct: pct };
  return p;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('opt-in', () => {
  it('makes no provider calls at all until the player connects', async () => {
    const cloud = new FakeCloud();
    const d = makeDevice(cloud, 'a');
    d.sync.start();
    d.sync.onForeground();
    d.sync.onBackground();
    d.sync.noteSaved('pianoViz_practice_v1');
    await d.sync.syncNow();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 3);
    expect(cloud.reads).toBe(0);
    expect(cloud.writes).toBe(0);
    expect(d.provider.connect).not.toHaveBeenCalled();
    expect(d.sync.getStatus().state).toBe('off');
  });

  it('writes nothing to storage until connected', () => {
    const d = makeDevice(new FakeCloud(), 'a');
    d.sync.start();
    expect(d.disk.has(SYNC_META_KEY)).toBe(false);
  });
});

describe('two devices', () => {
  it('converges on the best of both', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 50));
    const b = makeDevice(cloud, 'b', songWith(1, 90));
    await a.sync.connect('google');
    await b.sync.connect('google');
    await a.sync.syncNow();
    for (const d of [a, b]) {
      expect(d.live.progress.songs.s.sections.A1).toMatchObject({ stars: 3, bestPct: 90 });
    }
  });

  it('reports whether connecting changed anything here', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 50));
    await a.sync.connect('google');
    const fresh = makeDevice(cloud, 'b');
    await expect(fresh.sync.connect('google')).resolves.toBe(true);
    expect(fresh.live.progress.songs.s.sections.A1.stars).toBe(3);
  });

  it('adds up minutes from both devices on the same day', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    const b = makeDevice(cloud, 'b');
    await a.sync.connect('google');
    await b.sync.connect('google');
    a.live.progress.minutesByDay[DAY] = 10;
    await a.sync.syncNow();
    b.live.progress.minutesByDay[DAY] = 5;
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.live.progress.minutesByDay[DAY]).toBe(15);
    expect(b.live.progress.minutesByDay[DAY]).toBe(15);
  });

  it('does not inflate minutes or write again when nothing changed', async () => {
    const cloud = new FakeCloud();
    const p = defaultPracticeProgress();
    p.minutesByDay[DAY] = 10;
    const a = makeDevice(cloud, 'a', p);
    const b = makeDevice(cloud, 'b');
    await a.sync.connect('google');
    await b.sync.connect('google');
    await a.sync.syncNow();
    const writes = cloud.writes;
    for (let i = 0; i < 5; i++) {
      await a.sync.syncNow();
      await b.sync.syncNow();
    }
    expect(a.live.progress.minutesByDay[DAY]).toBe(10);
    expect(b.live.progress.minutesByDay[DAY]).toBe(10);
    expect(cloud.writes).toBe(writes);
  });

  it('does not double-count when this device already matches the cloud at first sync', async () => {
    // A restored backup: the same minutes on a new device id.
    const cloud = new FakeCloud();
    const p = defaultPracticeProgress();
    p.minutesByDay[DAY] = 10;
    const a = makeDevice(cloud, 'a', p);
    await a.sync.connect('google');
    const restored = defaultPracticeProgress();
    restored.minutesByDay[DAY] = 10;
    const b = makeDevice(cloud, 'b', restored);
    await b.sync.connect('google');
    expect(b.live.progress.minutesByDay[DAY]).toBe(10);
  });

  it('keeps a deleted song deleted', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 90));
    const b = makeDevice(cloud, 'b');
    await a.sync.connect('google');
    await b.sync.connect('google');
    delete b.live.progress.songs.s;
    b.live.progress.deletedSongs = { s: 5000 };
    await b.sync.syncNow();
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(a.live.progress.songs.s).toBeUndefined();
    expect(b.live.progress.songs.s).toBeUndefined();
  });

  it('recovers from a lost write on the next sync', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 50));
    const b = makeDevice(cloud, 'b', songWith(1, 90));
    await a.sync.connect('google');
    await b.sync.connect('google');
    // Another device overwrites with an older copy, dropping B's contribution.
    cloud.doc = null;
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.live.progress.songs.s.sections.A1).toMatchObject({ stars: 3, bestPct: 90 });
  });
});

describe('practice sections', () => {
  it('does not start a sync during a section, and retries afterwards', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    const reads = cloud.reads;
    a.live.busy = true;
    await a.sync.syncNow();
    expect(cloud.reads).toBe(reads);
    a.live.busy = false;
    a.live.progress = songWith(2, 70);
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
    expect(cloud.reads).toBe(reads + 1);
  });

  it('does not apply when a section starts while the read is in flight', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 90));
    await a.sync.connect('google');
    const b = makeDevice(cloud, 'b');
    await b.sync.connect('google');
    const before = b.live.progress;
    a.live.progress.songs.s.sections.A1.bestPct = 100;
    await a.sync.syncNow();
    cloud.beforeRead = () => {
      b.live.busy = true;
    };
    await b.sync.syncNow();
    cloud.beforeRead = null;
    expect(b.live.progress).toBe(before);
    expect(b.live.progress.songs.s.sections.A1.bestPct).toBe(90);
  });
});

describe('failure handling', () => {
  it('never overwrites a document from a newer build', async () => {
    const cloud = new FakeCloud();
    const future = {
      app: 'piano-visualizer',
      kind: 'cloud-sync',
      version: CLOUD_DOC_VERSION + 1,
      newField: 'keep me',
    };
    cloud.doc = future;
    const a = makeDevice(cloud, 'a', songWith(3, 90));
    await a.sync.connect('google');
    expect(a.sync.getStatus().state).toBe('needs-update');
    expect(cloud.doc).toEqual(future);
    expect(cloud.writes).toBe(0);
  });

  it('never overwrites progress from a newer schema', async () => {
    const cloud = new FakeCloud();
    cloud.doc = {
      app: 'piano-visualizer',
      kind: 'cloud-sync',
      version: CLOUD_DOC_VERSION,
      progress: { schemaVersion: 999 },
    };
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    expect(a.sync.getStatus().state).toBe('needs-update');
    expect(cloud.writes).toBe(0);
  });

  it('does not overwrite an unreadable document', async () => {
    const cloud = new FakeCloud();
    cloud.doc = { something: 'else' };
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    expect(a.sync.getStatus().state).toBe('corrupt');
    expect(cloud.doc).toEqual({ something: 'else' });
  });

  it('asks for sign-in on an auth failure and recovers afterwards', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    cloud.failNext = new CloudAuthError('expired');
    await a.sync.syncNow();
    expect(a.sync.getStatus().state).toBe('needs-auth');
    await a.sync.syncNow();
    expect(a.sync.getStatus().state).toBe('idle');
  });

  it('keeps local progress and credits minutes after a failed upload', async () => {
    const cloud = new FakeCloud();
    const p = defaultPracticeProgress();
    p.minutesByDay[DAY] = 10;
    const a = makeDevice(cloud, 'a', p);
    await a.sync.connect('google');
    a.live.progress.minutesByDay[DAY] = 25;
    cloud.failNext = null;
    const realWrite = a.provider.write;
    a.provider.write = async () => {
      throw new Error('offline');
    };
    await a.sync.syncNow();
    expect(a.sync.getStatus().state).toBe('error');
    expect(a.live.progress.minutesByDay[DAY]).toBe(25);
    a.provider.write = realWrite;
    await a.sync.syncNow();
    expect(a.sync.getStatus().state).toBe('idle');
    expect((cloud.doc as CloudDoc).minutesLedger.a[DAY]).toBe(25);
  });

  it('never rejects from syncNow, so a failure cannot reach the practice flow', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    cloud.failNext = new Error('offline');
    await expect(a.sync.syncNow()).resolves.toBeUndefined();
  });

  it('stays disconnected when sign-in fails', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    a.provider.connect = async () => {
      throw new Error('cancelled');
    };
    await expect(a.sync.connect('google')).rejects.toThrow('cancelled');
    expect(a.sync.getStatus().state).toBe('off');
  });
});

describe('triggers', () => {
  it('syncs after the debounce when progress is saved', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    const reads = cloud.reads;
    a.store.saveJSON('pianoViz_practice_v1', {});
    a.store.saveJSON('pianoViz_practice_v1', {});
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 1);
    expect(cloud.reads).toBe(reads);
    await vi.advanceTimersByTimeAsync(1);
    expect(cloud.reads).toBe(reads + 1);
  });

  it('is not woken by unrelated keys or by its own writes', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(1, 10));
    const b = makeDevice(cloud, 'b', songWith(3, 90));
    await b.sync.connect('google');
    await a.sync.connect('google');
    const reads = cloud.reads;
    a.store.saveJSON('some_other_key', {});
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 3);
    expect(cloud.reads).toBe(reads);
  });

  it('flushes on background only when there is something to send', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    const reads = cloud.reads;
    a.sync.onBackground();
    await vi.advanceTimersByTimeAsync(0);
    expect(cloud.reads).toBe(reads);
    a.store.saveJSON('pianoViz_practice_v1', {});
    a.sync.onBackground();
    await vi.advanceTimersByTimeAsync(0);
    expect(cloud.reads).toBe(reads + 1);
  });

  it('resumes after a reload without asking to connect again', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    const again = a.rebuild();
    const reads = cloud.reads;
    again.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(cloud.reads).toBe(reads + 1);
    expect(a.provider.connect).toHaveBeenCalledTimes(1);
  });
});

describe('disconnect and delete', () => {
  it('disconnect stops all traffic and leaves local and cloud data alone', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 90));
    await a.sync.connect('google');
    await a.sync.disconnect();
    const reads = cloud.reads;
    a.sync.noteSaved('pianoViz_practice_v1');
    a.sync.onForeground();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS * 3);
    expect(cloud.reads).toBe(reads);
    expect(a.live.progress.songs.s.sections.A1.stars).toBe(3);
    expect(cloud.doc).not.toBeNull();
    expect(a.sync.getStatus()).toMatchObject({ state: 'off', providerId: null, lastSyncAt: null });
  });

  it('abandons a cycle in flight when disconnected during it', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 90));
    await a.sync.connect('google');
    a.live.progress.songs.s.sections.A1.bestPct = 100;
    const writes = cloud.writes;
    cloud.beforeRead = () => {
      void a.sync.disconnect();
    };
    await a.sync.syncNow();
    expect(cloud.writes).toBe(writes);
    expect(a.sync.getStatus().state).toBe('off');
  });

  it('does not apply downloaded data when disconnected during the read', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 90));
    await a.sync.connect('google');
    const b = makeDevice(cloud, 'b');
    await b.sync.connect('google');
    a.live.progress.songs.s.sections.A1.bestPct = 100;
    await a.sync.syncNow();
    const before = b.live.progress;
    cloud.beforeRead = () => {
      void b.sync.disconnect();
    };
    await b.sync.syncNow();
    cloud.beforeRead = null;
    expect(b.live.progress).toBe(before);
    expect(b.live.progress.songs.s.sections.A1.bestPct).toBe(90);
    const meta = b.store.loadJSON<{ minutesBaseline: unknown; providerId: unknown }>(
      SYNC_META_KEY,
      { minutesBaseline: 'missing', providerId: 'missing' }
    );
    expect(meta.minutesBaseline).toBeNull();
    expect(meta.providerId).toBeNull();
  });

  it('delete removes the cloud copy and keeps local progress', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a', songWith(3, 90));
    await a.sync.connect('google');
    await a.sync.deleteCloudData();
    expect(cloud.doc).toBeNull();
    expect(a.live.progress.songs.s.sections.A1.stars).toBe(3);
    expect(a.sync.getStatus().state).toBe('off');
  });

  it('stays connected and reports the failure when delete fails', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    await a.sync.connect('google');
    cloud.failNext = new Error('offline');
    await expect(a.sync.deleteCloudData()).rejects.toThrow('offline');
    expect(a.sync.getStatus().providerId).toBe('google');
  });

  it('reconnecting does not double-count minutes', async () => {
    const cloud = new FakeCloud();
    const p = defaultPracticeProgress();
    p.minutesByDay[DAY] = 10;
    const a = makeDevice(cloud, 'a', p);
    await a.sync.connect('google');
    await a.sync.disconnect();
    await a.sync.connect('google');
    expect(a.live.progress.minutesByDay[DAY]).toBe(10);
  });
});

describe('prefs', () => {
  it('a fresh device takes the cloud settings instead of overwriting them', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    a.live.prefs.pianistName = 'Sora';
    a.live.prefs.lang = 'jp';
    await a.sync.connect('google');
    const b = makeDevice(cloud, 'b');
    b.live.prefs.lang = 'en';
    b.live.time = 9999;
    await b.sync.connect('google');
    expect(b.live.prefs).toMatchObject({ pianistName: 'Sora', lang: 'jp' });
  });

  it('the later change wins afterwards', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    const b = makeDevice(cloud, 'b');
    await a.sync.connect('google');
    await b.sync.connect('google');
    a.live.time = 2000;
    a.live.prefs.theme = 1;
    await a.sync.syncNow();
    b.live.time = 3000;
    b.live.prefs.theme = 2;
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.live.prefs.theme).toBe(2);
    expect(b.live.prefs.theme).toBe(2);
  });

  it('never syncs device-specific settings', async () => {
    const cloud = new FakeCloud();
    const a = makeDevice(cloud, 'a');
    Object.assign(a.live.prefs, {
      audioOffsetMs: 240,
      audioOffsetRoute: 'GO:PIANO88',
      inputSource: 'mic',
      volGhost: 10,
      showScore: true,
      debug: true,
      theme: 1,
    });
    await a.sync.connect('google');
    expect((cloud.doc as CloudDoc).prefs.values).toEqual({ theme: 1 });
    const b = makeDevice(cloud, 'b');
    b.live.prefs.audioOffsetMs = 30;
    await b.sync.connect('google');
    expect(b.live.prefs.audioOffsetMs).toBe(30);
    expect(b.live.prefs.inputSource).toBeUndefined();
  });

  it('sanitizes values from the cloud', () => {
    expect(
      pickSyncedPrefs({ theme: 99, lang: 'xx', pianistAvatar: '<img>', noteSpeed: 'fast' })
    ).toEqual({
      noteSpeed: 'fast',
    });
  });

  it('assignSyncedPrefs clears a removed synced key but leaves device keys', () => {
    const target: PrefsShape = { pianistName: 'Sora', audioOffsetMs: 100 };
    assignSyncedPrefs(target, { theme: 2 });
    expect(target).toEqual({ theme: 2, audioOffsetMs: 100 });
  });
});

describe('parseCloudDoc', () => {
  it('rejects foreign and malformed files', () => {
    for (const bad of [[], 'x', 7, {}, { app: 'other', kind: 'cloud-sync', version: 1 }]) {
      expect(() => parseCloudDoc(bad)).toThrow();
    }
  });

  it('rejects an oversized document', () => {
    expect(() =>
      parseCloudDoc({
        app: 'piano-visualizer',
        kind: 'cloud-sync',
        version: 1,
        progress: { pad: 'x'.repeat(3 * 1024 * 1024) },
      })
    ).toThrow('too large');
  });

  it('fills in missing optional parts', () => {
    const doc = parseCloudDoc({ app: 'piano-visualizer', kind: 'cloud-sync', version: 1 });
    expect(doc.progress).toBeNull();
    expect(doc.minutesLedger).toEqual({});
    expect(doc.prefs).toEqual({ values: {}, updatedAt: 0 });
  });
});

describe('canonicalJson', () => {
  it('ignores key order at every depth', () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: [{ x: 1, y: 2 }] } })).toBe(
      canonicalJson({ b: { d: [{ y: 2, x: 1 }], c: 2 }, a: 1 })
    );
  });
});
