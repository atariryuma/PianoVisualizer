import { describe, it, expect } from 'vitest';
import { serializeBackup, parseBackup, BACKUP_VERSION } from '../src/progress-backup';

describe('progress-backup', () => {
  it('round-trips progress + prefs', () => {
    const progress = { stars: { fur_elise: 3 }, streakCount: 5 };
    const prefs = { theme: 2, lang: 'jp', volGhost: 80 };
    const text = serializeBackup(progress, prefs, '2026-07-20T00:00:00.000Z');
    const parsed = parseBackup(text);
    expect(parsed.progress).toEqual(progress);
    expect(parsed.prefs).toEqual(prefs);
  });

  it('stamps the envelope with app/kind/version', () => {
    const env = JSON.parse(serializeBackup({}, {}, 'X'));
    expect(env.app).toBe('piano-visualizer');
    expect(env.kind).toBe('progress-backup');
    expect(env.version).toBe(BACKUP_VERSION);
    expect(env.exportedAt).toBe('X');
  });

  it('tolerates a missing half (progress-only or prefs-only)', () => {
    expect(parseBackup(serializeBackup({ a: 1 }, null, 'X')).prefs).toBeNull();
    expect(parseBackup(serializeBackup(null, { b: 2 }, 'X')).progress).toBeNull();
  });

  it('rejects non-JSON', () => {
    expect(() => parseBackup('not json{')).toThrow(/Invalid JSON/);
  });

  it('rejects a foreign JSON file (wrong app/kind)', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', kind: 'x' }))).toThrow(/Not a Piano/);
    expect(() => parseBackup(JSON.stringify({ songs: [] }))).toThrow(/Not a Piano/);
  });

  it('rejects a newer backup version', () => {
    const future = JSON.stringify({
      app: 'piano-visualizer',
      kind: 'progress-backup',
      version: BACKUP_VERSION + 1,
      progress: {},
      prefs: {},
    });
    expect(() => parseBackup(future)).toThrow(/newer than this app supports/);
  });

  it('rejects an empty backup (no progress and no prefs)', () => {
    const empty = JSON.stringify({
      app: 'piano-visualizer',
      kind: 'progress-backup',
      version: 1,
      progress: null,
      prefs: null,
    });
    expect(() => parseBackup(empty)).toThrow(/no progress or settings/);
  });
});
