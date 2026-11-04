// Cloud sync engine: keeps progress + device-independent prefs in the player's
// OWN cloud (iCloud / Google Drive). We run no server and hold no account.
//
// Opt-in, and nothing here touches the network until the player connects a
// provider: with no provider stored, every entry point returns immediately.
//
// One cycle: read remote → validate → merge → apply locally → write. The merge
// (@piano/core progress-merge) is an order-independent join, so there is no
// "which copy do you keep?" prompt and no dependency on conditional writes: a
// write that loses a race is healed on the next sync, because the losing device
// still holds its data. `lastSongId` / `lastSettings` are the local-first
// exceptions, documented there.
//
// Three invariants the tests pin:
//   - Never applied during a practice section. `isBusy` is checked again after
//     the network read, since a section can start while the read is in flight.
//   - The merge + apply step is synchronous, so a save cannot land between
//     reading local state and replacing it.
//   - A remote document from a newer build is never overwritten.

import {
  CURRENT_SCHEMA_VERSION,
  creditMinutesToDevice,
  mergeMinutesLedgers,
  mergeProgress,
  sumMinutesLedger,
  type MinutesLedger,
  type PracticeProgress,
} from '@piano/core';
import { sanitizePrefs, type PrefsShape } from './prefs-storage';

export const CLOUD_DOC_VERSION = 1;
/** Far above any real save (the blob is bounded by song count × small buffers),
 *  and low enough that a corrupt or hostile file cannot exhaust memory. */
export const CLOUD_DOC_MAX_BYTES = 2 * 1024 * 1024;
export const SYNC_DEBOUNCE_MS = 30_000;
export const SYNC_META_KEY = 'pianoViz_cloudSync';

/** Keys whose writes mean there is something new to sync. */
const WATCHED_KEYS: ReadonlySet<string> = new Set(['pianoViz_practice_v1', 'pianoViz_prefs']);

/** Prefs that follow the player between devices. Deliberately an accept-list: the
 *  rest describe THIS device (audioOffset*, inputSource, vol*, showScore, debug),
 *  and a latency calibrated on Bluetooth output is simply wrong on another iPad. */
export const SYNCED_PREF_KEYS = [
  'theme',
  'synesthesia',
  'lang',
  'noteNaming',
  'pianistName',
  'pianistCommitYear',
  'pianistAvatar',
  'noteSpeed',
  'judgeStrictness',
  'welcomeDismissed',
] as const satisfies ReadonlyArray<keyof PrefsShape>;

export type SyncedPrefs = Partial<Pick<PrefsShape, (typeof SYNCED_PREF_KEYS)[number]>>;

export type CloudProviderId = 'google' | 'icloud';

export interface CloudDoc {
  app: 'piano-visualizer';
  kind: 'cloud-sync';
  version: number;
  updatedAt: number;
  progress: unknown;
  minutesLedger: MinutesLedger;
  prefs: { values: SyncedPrefs; updatedAt: number };
}

export interface CloudProvider {
  id: CloudProviderId;
  /** Interactive sign-in. Only ever called from a player action. */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** The stored document as parsed JSON, or null when there is none yet. */
  read(): Promise<unknown>;
  write(doc: CloudDoc): Promise<void>;
  deleteRemote(): Promise<void>;
}

/** Thrown by a provider when the player has to sign in again. */
export class CloudAuthError extends Error {
  override name = 'CloudAuthError';
}
class CloudDocTooNewError extends Error {
  override name = 'CloudDocTooNewError';
}
class CloudDocInvalidError extends Error {
  override name = 'CloudDocInvalidError';
}

export type SyncState =
  | 'off'
  | 'idle'
  | 'syncing'
  /** Network or provider failure; retried on the next trigger. */
  | 'error'
  /** Sign-in expired; needs the player. */
  | 'needs-auth'
  /** The cloud copy came from a newer build. Sync stops rather than overwrite. */
  | 'needs-update'
  /** The cloud copy is unreadable. Not overwritten; the player can delete it. */
  | 'corrupt';

export interface SyncStatus {
  state: SyncState;
  providerId: CloudProviderId | null;
  lastSyncAt: number | null;
}

interface SyncMeta {
  providerId: CloudProviderId | null;
  deviceId: string;
  /** Local copy of the ledger, so a failed upload loses nothing. */
  ledger: MinutesLedger;
  /** Per-day totals last adopted. null = this device has not synced yet. */
  minutesBaseline: Record<string, number> | null;
  prefsBaseline: SyncedPrefs | null;
  prefsUpdatedAt: number;
  lastSyncAt: number | null;
}

export interface CloudSyncDeps {
  store: {
    loadJSON<T>(key: string, fallback: T): T;
    saveJSON(key: string, val: unknown): boolean;
  };
  providers: Partial<Record<CloudProviderId, CloudProvider>>;
  /** Live progress; null until boot has loaded it. */
  getProgress: () => PracticeProgress | null;
  /** Replace the live progress IN PLACE (it is a long-lived object) and persist. */
  applyProgress: (merged: PracticeProgress) => void;
  getPrefs: () => PrefsShape;
  /** Update the live prefs AND persist. Both matter: writing only to disk would
   *  let the next savePrefs overwrite it with the stale in-memory object, which
   *  then reads as a local change and wins everywhere. */
  applyPrefs: (values: SyncedPrefs) => void;
  /** True during a practice section. */
  isBusy: () => boolean;
  onStatusChange?: (status: SyncStatus) => void;
  now?: () => number;
  randomId?: () => string;
}

export interface CloudSync {
  /** Boot entry. Does nothing, including no network, unless already connected. */
  start(): void;
  /** Resolves true when the sync changed prefs or progress on this device. */
  connect(id: CloudProviderId): Promise<boolean>;
  disconnect(): Promise<void>;
  /** Delete the cloud copy, then disconnect. Local data is untouched. */
  deleteCloudData(): Promise<void>;
  syncNow(): Promise<void>;
  /** Wire to the JSON store's onSaved. */
  noteSaved(key: string): void;
  /** Wire to visibilitychange. */
  onForeground(): void;
  onBackground(): void;
  getStatus(): SyncStatus;
}

/** JSON with sorted keys: equal data compares equal whatever order it was built in. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
    const src = val as Record<string, unknown>;
    const out = Object.create(null) as Record<string, unknown>;
    for (const k of Object.keys(src).sort()) out[k] = src[k];
    return out;
  });
}

/** Sanitized subset of prefs that syncs. */
export function pickSyncedPrefs(raw: unknown): SyncedPrefs {
  const clean = sanitizePrefs(raw) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_PREF_KEYS) {
    if (clean[k] !== undefined) out[k] = clean[k];
  }
  return out as SyncedPrefs;
}

/** Write synced values onto a prefs object; a synced key absent from `values` was
 *  cleared on the winning device, so it is cleared here too. Other keys stay. */
export function assignSyncedPrefs(target: PrefsShape, values: SyncedPrefs): void {
  const t = target as Record<string, unknown>;
  const v = values as Record<string, unknown>;
  for (const k of SYNCED_PREF_KEYS) {
    if (v[k] === undefined) delete t[k];
    else t[k] = v[k];
  }
}

/** Validate a downloaded document. Throws on one we must not merge or overwrite. */
export function parseCloudDoc(raw: unknown): CloudDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CloudDocInvalidError('not an object');
  }
  const d = raw as Partial<CloudDoc>;
  if (d.app !== 'piano-visualizer' || d.kind !== 'cloud-sync') {
    throw new CloudDocInvalidError('not a sync document');
  }
  const version = Number(d.version);
  if (!Number.isFinite(version)) throw new CloudDocInvalidError('bad version');
  if (version > CLOUD_DOC_VERSION) throw new CloudDocTooNewError('document v' + version);
  const schema = (d.progress as { schemaVersion?: unknown } | null | undefined)?.schemaVersion;
  if (typeof schema === 'number' && schema > CURRENT_SCHEMA_VERSION) {
    throw new CloudDocTooNewError('progress schema v' + schema);
  }
  if (JSON.stringify(raw).length > CLOUD_DOC_MAX_BYTES) {
    throw new CloudDocInvalidError('too large');
  }
  const prefs = d.prefs as { values?: unknown; updatedAt?: unknown } | undefined;
  return {
    app: 'piano-visualizer',
    kind: 'cloud-sync',
    version,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
    progress: d.progress ?? null,
    minutesLedger: mergeMinutesLedgers(d.minutesLedger, null),
    prefs: {
      values: pickSyncedPrefs(prefs?.values),
      updatedAt:
        typeof prefs?.updatedAt === 'number' && Number.isFinite(prefs.updatedAt)
          ? prefs.updatedAt
          : 0,
    },
  };
}

export function createCloudSync(deps: CloudSyncDeps): CloudSync {
  const now = deps.now ?? (() => Date.now());
  const randomId = deps.randomId ?? (() => globalThis.crypto.randomUUID());

  const meta = loadMeta();
  let state: SyncState = meta.providerId ? 'idle' : 'off';
  let inFlight: Promise<boolean> | null = null;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by disconnect/delete, so a cycle in flight abandons its work. */
  let generation = 0;
  /** Our own apply also goes through saveJSON; that is not a new local change. */
  let applying = false;

  function loadMeta(): SyncMeta {
    const raw = deps.store.loadJSON<Partial<SyncMeta> | null>(SYNC_META_KEY, null) ?? {};
    return {
      providerId: raw.providerId ?? null,
      deviceId: typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : randomId(),
      ledger: mergeMinutesLedgers(raw.ledger, null),
      minutesBaseline: raw.minutesBaseline ?? null,
      prefsBaseline: raw.prefsBaseline ?? null,
      prefsUpdatedAt: typeof raw.prefsUpdatedAt === 'number' ? raw.prefsUpdatedAt : 0,
      lastSyncAt: typeof raw.lastSyncAt === 'number' ? raw.lastSyncAt : null,
    };
  }

  const saveMeta = (): void => {
    deps.store.saveJSON(SYNC_META_KEY, meta);
  };

  const getStatus = (): SyncStatus => ({
    state,
    providerId: meta.providerId,
    lastSyncAt: meta.lastSyncAt,
  });

  function setState(next: SyncState): void {
    state = next;
    deps.onStatusChange?.(getStatus());
  }

  const provider = (): CloudProvider | null =>
    meta.providerId ? (deps.providers[meta.providerId] ?? null) : null;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    if (!provider() || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void syncNow();
    }, SYNC_DEBOUNCE_MS);
  }

  function resolvePrefs(remote: CloudDoc | null): { values: SyncedPrefs; updatedAt: number } {
    const local = pickSyncedPrefs(deps.getPrefs());
    if (meta.prefsBaseline === null) {
      // First sync: a fresh install's defaults must not outrank real settings, so
      // the cloud wins and this device only fills what the cloud lacks.
      if (remote)
        return { values: { ...local, ...remote.prefs.values }, updatedAt: remote.prefs.updatedAt };
      return { values: local, updatedAt: now() };
    }
    const changed = canonicalJson(local) !== canonicalJson(meta.prefsBaseline);
    const localAt = changed ? now() : meta.prefsUpdatedAt;
    if (remote && remote.prefs.updatedAt > localAt) return remote.prefs;
    return { values: local, updatedAt: localAt };
  }

  /** The synchronous step: merge, apply, record. Returns what to upload. */
  function mergeAndApply(
    local: PracticeProgress,
    remote: CloudDoc | null
  ): { doc: CloudDoc; changedLocally: boolean } {
    const known = mergeMinutesLedgers(meta.ledger, remote?.minutesLedger ?? null);
    // First sync: treat what the cloud already has as already counted. A restored
    // backup or a reconnect would otherwise credit the same minutes to this device
    // on top of the entry that earned them. The cost is under-crediting a same-day
    // session the first time a second device joins, which is the safer direction.
    const baseline = meta.minutesBaseline ?? sumMinutesLedger(known);
    const ledger = creditMinutesToDevice(known, meta.deviceId, local.minutesByDay ?? {}, baseline);

    const merged = mergeProgress(local, remote?.progress ?? null);
    const minutes: Record<string, number> = { ...sumMinutesLedger(ledger) };
    for (const [day, v] of Object.entries(local.minutesByDay ?? {})) {
      // Practice minutes never go down, whatever the cloud says.
      if (!(minutes[day] >= v)) minutes[day] = v;
    }
    merged.minutesByDay = minutes;
    // Plain objects from here on: the merge's null-prototype maps stay inside it.
    const plain = JSON.parse(JSON.stringify(merged)) as PracticeProgress;

    const prefs = resolvePrefs(remote);
    const localPrefs = pickSyncedPrefs(deps.getPrefs());
    const prefsChanged = canonicalJson(prefs.values) !== canonicalJson(localPrefs);
    const progressChanged = canonicalJson(plain) !== canonicalJson(local);

    applying = true;
    try {
      if (progressChanged) deps.applyProgress(plain);
      if (prefsChanged) deps.applyPrefs(prefs.values);
    } finally {
      applying = false;
    }

    meta.ledger = ledger;
    meta.minutesBaseline = plain.minutesByDay;
    meta.prefsBaseline = prefs.values;
    meta.prefsUpdatedAt = prefs.updatedAt;
    saveMeta();

    return {
      doc: {
        app: 'piano-visualizer',
        kind: 'cloud-sync',
        version: CLOUD_DOC_VERSION,
        updatedAt: now(),
        progress: plain,
        minutesLedger: ledger,
        prefs,
      },
      changedLocally: progressChanged || prefsChanged,
    };
  }

  /** Same content, ignoring the upload timestamp. A write that would change
   *  nothing is skipped, so an idle device is not generating traffic. */
  function sameContent(a: CloudDoc, b: CloudDoc | null): boolean {
    if (!b) return false;
    return canonicalJson({ ...a, updatedAt: 0 }) === canonicalJson({ ...b, updatedAt: 0 });
  }

  async function runCycle(p: CloudProvider, gen: number): Promise<boolean> {
    const stale = (): boolean => gen !== generation;
    setState('syncing');
    let changedLocally = false;
    try {
      const raw = await p.read();
      if (stale()) return false;
      const remote = raw == null ? null : parseCloudDoc(raw);
      const local = deps.getProgress();
      // A section may have started during the read. Nothing has been applied yet.
      if (deps.isBusy() || !local) {
        dirty = true;
        schedule();
        setState('idle');
        return false;
      }
      dirty = false;
      const result = mergeAndApply(local, remote);
      changedLocally = result.changedLocally;
      if (!sameContent(result.doc, remote)) {
        if (stale()) return false;
        await p.write(result.doc);
        if (stale()) return false;
      }
      meta.lastSyncAt = now();
      saveMeta();
      setState('idle');
      // A save that landed during the upload is covered by the next cycle.
      if (dirty) schedule();
      return changedLocally;
    } catch (e) {
      if (stale()) return false;
      dirty = true;
      if (e instanceof CloudAuthError) setState('needs-auth');
      else if (e instanceof CloudDocTooNewError) setState('needs-update');
      else if (e instanceof CloudDocInvalidError) setState('corrupt');
      else setState('error');
      console.warn('[CloudSync] sync failed:', (e as Error)?.name, (e as Error)?.message);
      return changedLocally;
    }
  }

  function runSync(): Promise<boolean> {
    if (inFlight) {
      // One at a time. Whatever triggered this is picked up by the next cycle.
      dirty = true;
      return inFlight;
    }
    const p = provider();
    if (!p) return Promise.resolve(false);
    if (deps.isBusy()) {
      dirty = true;
      schedule();
      return Promise.resolve(false);
    }
    clearTimer();
    const cycle = runCycle(p, generation).finally(() => {
      if (inFlight === cycle) inFlight = null;
    });
    inFlight = cycle;
    return cycle;
  }

  async function syncNow(): Promise<void> {
    await runSync();
  }

  /** Back to "never synced" so a later connect starts clean. `deviceId` stays:
   *  the ledger row it names may still be in the cloud. */
  function forget(): void {
    generation++;
    inFlight = null;
    clearTimer();
    dirty = false;
    meta.providerId = null;
    meta.ledger = {};
    meta.minutesBaseline = null;
    meta.prefsBaseline = null;
    meta.prefsUpdatedAt = 0;
    meta.lastSyncAt = null;
    saveMeta();
    setState('off');
  }

  return {
    start() {
      if (provider()) void syncNow();
    },
    async connect(id) {
      const next = deps.providers[id];
      if (!next) throw new Error('Unknown cloud provider: ' + id);
      await next.connect();
      if (meta.providerId && meta.providerId !== id) {
        await provider()
          ?.disconnect()
          .catch(() => undefined);
      }
      forget();
      meta.providerId = id;
      saveMeta();
      setState('idle');
      return runSync();
    },
    async disconnect() {
      const p = provider();
      forget();
      await p?.disconnect().catch((e: unknown) => {
        // The player asked to stop syncing, and it has stopped. A failed token
        // revocation must not leave them looking connected.
        console.warn('[CloudSync] disconnect cleanup failed:', (e as Error)?.message);
      });
    },
    async deleteCloudData() {
      const p = provider();
      if (!p) return;
      // Delete first: on failure the player stays connected and sees the error,
      // rather than believing the data is gone.
      await p.deleteRemote();
      forget();
      await p.disconnect().catch(() => undefined);
    },
    syncNow,
    noteSaved(key) {
      if (applying || !WATCHED_KEYS.has(key) || !provider()) return;
      dirty = true;
      schedule();
    },
    onForeground() {
      if (provider()) void syncNow();
    },
    onBackground() {
      if (provider() && dirty) void syncNow();
    },
    getStatus,
  };
}
