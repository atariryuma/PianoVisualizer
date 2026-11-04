// Cloud-sync merge — combines two copies of a PracticeProgress without asking
// the player "which one do you want to keep?".
//
// That question never needs asking because nearly everything here only ever
// moves one way (stars, bests, unlocked speeds, stamps, practised days), so the
// merge can be a join: commutative, associative and idempotent. Any two devices
// that see each other's data converge, in any order, however many times the
// merge reruns. It also means a lost write heals itself: the losing device still
// holds its own data and contributes it on the next sync, so the sync engine
// does not depend on conditional writes from the storage provider.
//
// Deliberate exceptions to "join": `lastSongId` and `lastSettings` are this
// device's own convenience state, so the local value wins and the remote one
// only fills a gap (a fresh install).
//
// Pure. Inputs are never mutated.

import {
  getSongProgress,
  migrateAndDefaultProgress,
  type PracticeProgress,
  type SectionProgress,
  type SongProgress,
} from './practice-progress';
import { computeStreakCount, longestStreakRun } from './streak';

/** Same bound as the shell's streak options: only recent days are kept. */
export const MERGE_MAX_STREAK_DAYS = 60;
/** Same bound as the result card's rolling attempt buffer. */
export const MERGE_MAX_SECTION_HISTORY = 8;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

type PlainObject = Record<string, unknown>;

function isPlainObject(v: unknown): v is PlainObject {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Own-key lookup. Remote data is parsed JSON, so an id like "__proto__" or
 *  "constructor" must not resolve to something inherited. */
function own<T>(obj: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/** A null-prototype map: writing a remote-controlled key cannot touch
 *  Object.prototype, and JSON.stringify serializes it normally. */
function freshMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function sortedUnion(a: object, b: object): string[] {
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
}

function mergeSection(a: SectionProgress | undefined, b: SectionProgress | undefined) {
  const stars = (s: SectionProgress | undefined): number =>
    clamp(Math.round(finiteOr(s?.stars, 0)), 0, 3);
  const pct = (s: SectionProgress | undefined): number => clamp(finiteOr(s?.bestPct, 0), 0, 100);
  const combo = (s: SectionProgress | undefined): number => Math.max(0, finiteOr(s?.bestCombo, 0));

  const out: SectionProgress = {
    ...(isPlainObject(b) ? b : null),
    ...(isPlainObject(a) ? a : null),
    stars: Math.max(stars(a), stars(b)),
    bestPct: Math.max(pct(a), pct(b)),
  };
  // Stays absent when neither side has one, so a merge does not rewrite a save
  // it has nothing to add to.
  if (a?.bestCombo !== undefined || b?.bestCombo !== undefined) {
    out.bestCombo = Math.max(combo(a), combo(b));
  }
  const tempos = freshMap<boolean>();
  const ta = a?.unlockedTempos ?? {};
  const tb = b?.unlockedTempos ?? {};
  for (const tier of sortedUnion(ta, tb)) {
    tempos[tier] = own(ta, tier) === true || own(tb, tier) === true;
  }
  out.unlockedTempos = tempos;
  return out;
}

interface HistoryRow {
  d: number;
  [key: string]: unknown;
}

function isHistoryRow(v: unknown): v is HistoryRow {
  return isPlainObject(v) && typeof v.d === 'number' && Number.isFinite(v.d);
}

/** Union by timestamp, keep the newest N, oldest first (the order the growth
 *  chart reads). A timestamp collision resolves on content rather than on which
 *  side happened to be passed first, so the result is order-independent. */
function mergeHistoryRows(a: unknown[], b: unknown[]): HistoryRow[] {
  const byTime = new Map<number, HistoryRow>();
  for (const row of [...a, ...b]) {
    if (!isHistoryRow(row)) continue;
    const cur = byTime.get(row.d);
    if (!cur || JSON.stringify(row) > JSON.stringify(cur)) byTime.set(row.d, row);
  }
  return Array.from(byTime.values())
    .sort((x, y) => x.d - y.d)
    .slice(-MERGE_MAX_SECTION_HISTORY);
}

function mergeHistory(a: SongProgress['history'], b: SongProgress['history']) {
  const out = freshMap<SongProgress['history'][string]>();
  for (const key of sortedUnion(a, b)) {
    const ha = own(a, key);
    const hb = own(b, key);
    if (Array.isArray(ha) || Array.isArray(hb)) {
      out[key] = mergeHistoryRows(
        Array.isArray(ha) ? ha : [],
        Array.isArray(hb) ? hb : []
      ) as unknown as SongProgress['history'][string];
    } else if (ha !== undefined || hb !== undefined) {
      // The older flat per-attempt shape: nothing to union on, keep local.
      out[key] = (ha ?? hb) as SongProgress['history'][string];
    }
  }
  return out;
}

function mergeSong(a: SongProgress | undefined, b: SongProgress | undefined): SongProgress {
  const sa = a?.sections ?? {};
  const sb = b?.sections ?? {};
  const sections = freshMap<SectionProgress>();
  for (const id of sortedUnion(sa, sb)) {
    sections[id] = mergeSection(own(sa, id), own(sb, id));
  }
  const out: SongProgress = {
    sections,
    history: mergeHistory(a?.history ?? {}, b?.history ?? {}),
  };
  const lastSettings = a?.lastSettings ?? b?.lastSettings;
  if (lastSettings) out.lastSettings = lastSettings;
  return out;
}

function mergeStamps(a: Record<string, number>, b: Record<string, number>) {
  const out = freshMap<number>();
  for (const id of sortedUnion(a, b)) {
    const ta = finiteOr(own(a, id), Infinity);
    const tb = finiteOr(own(b, id), Infinity);
    const earliest = Math.min(ta, tb);
    if (Number.isFinite(earliest)) out[id] = earliest;
  }
  return out;
}

function mergeTombstones(a: unknown, b: unknown): Record<string, number> {
  const pa = isPlainObject(a) ? (a as Record<string, number>) : {};
  const pb = isPlainObject(b) ? (b as Record<string, number>) : {};
  const out = freshMap<number>();
  for (const id of sortedUnion(pa, pb)) {
    const latest = Math.max(finiteOr(own(pa, id), 0), finiteOr(own(pb, id), 0));
    if (latest > 0) out[id] = latest;
  }
  return out;
}

/** Well-formed private copy: JSON clone (getSongProgress mutates), migrate, and
 *  bring every song to the current shape so both sides compare like with like. */
function normalize(raw: unknown): PracticeProgress {
  const cloned: unknown = raw == null ? null : JSON.parse(JSON.stringify(raw));
  const progress = migrateAndDefaultProgress(cloned);
  for (const songId of Object.keys(progress.songs)) {
    if (!isPlainObject(progress.songs[songId])) {
      delete progress.songs[songId];
      continue;
    }
    getSongProgress(progress, songId);
  }
  return progress;
}

/**
 * Join two progress blobs. Either side may be raw parsed JSON from storage or
 * from the cloud; both go through the same validation.
 *
 * `minutesByDay` is NOT resolved here. Per-day minutes accumulate on each device
 * independently, so they need the per-device ledger below: `max` would lose one
 * device's practice on a shared day, and adding would double-count on every
 * sync. This keeps the per-day maximum as a floor; the sync engine overwrites it
 * with the ledger total.
 */
export function mergeProgress(localRaw: unknown, remoteRaw: unknown): PracticeProgress {
  const local = normalize(localRaw);
  const remote = normalize(remoteRaw);

  const deletedSongs = mergeTombstones(local.deletedSongs, remote.deletedSongs);
  const songs = freshMap<SongProgress>();
  for (const id of sortedUnion(local.songs, remote.songs)) {
    // Deletion is final and unconditional. Keeping a song "played again after the
    // deletion" looks kinder but breaks the join: the outcome would depend on
    // whether old attempts were dropped before or after the newer ones arrived.
    // A JSON library import that reuses a deleted id gets a fresh id instead.
    if (own(deletedSongs, id) !== undefined) continue;
    songs[id] = mergeSong(own(local.songs, id), own(remote.songs, id));
  }

  const allDays = new Set(
    [...local.streakDays, ...remote.streakDays].filter((d) => DAY_KEY_RE.test(d))
  );
  const sortedDays = Array.from(allDays).sort();
  // Over the FULL union, before trimming: days from two devices can join into a
  // run neither device saw on its own.
  const longest = longestStreakRun(sortedDays);
  const streakDays = sortedDays.slice(-MERGE_MAX_STREAK_DAYS);

  const minutesByDay = freshMap<number>();
  for (const day of sortedUnion(local.minutesByDay, remote.minutesByDay)) {
    minutesByDay[day] = Math.max(
      finiteOr(own(local.minutesByDay, day), 0),
      finiteOr(own(remote.minutesByDay, day), 0)
    );
  }

  const merged: PracticeProgress = {
    ...remote,
    ...local,
    songs,
    streakDays,
    streakCount: computeStreakCount({ streakDays, streakCount: 0 }),
    bestStreak: Math.max(local.bestStreak ?? 0, remote.bestStreak ?? 0, longest),
    earnedStamps: mergeStamps(local.earnedStamps, remote.earnedStamps),
    minutesByDay,
  };
  if (Object.keys(deletedSongs).length > 0) merged.deletedSongs = deletedSongs;
  else delete merged.deletedSongs;
  const lastSongId = local.lastSongId ?? remote.lastSongId;
  if (lastSongId !== undefined) merged.lastSongId = lastSongId;
  return merged;
}

// =====================================================================
// Practice minutes: a per-device grow-only counter
// =====================================================================

/** deviceId → dateKey → minutes that device contributed. Only ever grows. */
export type MinutesLedger = Record<string, Record<string, number>>;

/** Cell-wise max: each device owns its own row, so the larger value of a cell is
 *  simply the newer one. Safe to rerun in any order. */
export function mergeMinutesLedgers(a: unknown, b: unknown): MinutesLedger {
  const la = isPlainObject(a) ? (a as MinutesLedger) : {};
  const lb = isPlainObject(b) ? (b as MinutesLedger) : {};
  const out = freshMap<Record<string, number>>();
  for (const device of sortedUnion(la, lb)) {
    const ra = own(la, device);
    const rb = own(lb, device);
    const rowA = isPlainObject(ra) ? ra : {};
    const rowB = isPlainObject(rb) ? rb : {};
    const row = freshMap<number>();
    for (const day of sortedUnion(rowA, rowB)) {
      const v = Math.max(finiteOr(own(rowA, day), 0), finiteOr(own(rowB, day), 0));
      if (v > 0) row[day] = v;
    }
    out[device] = row;
  }
  return out;
}

/** Per-day total across every device. */
export function sumMinutesLedger(ledger: MinutesLedger): Record<string, number> {
  const out = freshMap<number>();
  for (const device of Object.keys(ledger)) {
    const row = ledger[device];
    for (const day of Object.keys(row)) {
      out[day] = (own(out, day) ?? 0) + row[day];
    }
  }
  return out;
}

/**
 * Credit this device with what it practised since `baseline` (the per-day totals
 * it last adopted). Only the increase counts, so a resync credits nothing new.
 */
export function creditMinutesToDevice(
  ledger: MinutesLedger,
  deviceId: string,
  localMinutes: Record<string, number>,
  baseline: Record<string, number>
): MinutesLedger {
  const out = mergeMinutesLedgers(ledger, null);
  const row = own(out, deviceId) ?? freshMap<number>();
  for (const day of Object.keys(localMinutes)) {
    const delta = finiteOr(localMinutes[day], 0) - finiteOr(own(baseline, day), 0);
    if (delta > 0) row[day] = (own(row, day) ?? 0) + delta;
  }
  out[deviceId] = row;
  return out;
}
