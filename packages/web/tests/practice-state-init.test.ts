// Tests for packages/web/src/practice-state-init.ts.
//
// Pure factories — pins the cold-start shape so a future schema change
// can't silently drop a field that downstream readers depend on
// (practice-tick reads currentNoteIdx, result-card reads
// timingScoreSum + durationScoredCount, etc.).

import { describe, it, expect } from 'vitest';
import {
  createInitialPrefs,
  createInitialPractice,
  type InitialPrefs,
  type InitialPracticeState,
} from '../src/practice-state-init';

describe('createInitialPrefs', () => {
  it('cold-start prefs: theme=0, EN, no synesthesia, no debug, audioOffset auto', () => {
    const p = createInitialPrefs();
    expect(p.theme).toBe(0);
    expect(p.synesthesia).toBe(false);
    expect(p.audioOffsetMs).toBeNull();
    expect(p.debug).toBe(false);
    expect(p.lang).toBe('en');
  });

  it('returns a fresh object each call (callers may mutate)', () => {
    const a = createInitialPrefs();
    const b = createInitialPrefs();
    expect(a).not.toBe(b);
    a.theme = 3;
    expect(b.theme).toBe(0);
  });

  it('all required keys are present (defensive contract pin)', () => {
    const p = createInitialPrefs();
    const required: Array<keyof InitialPrefs> = [
      'theme',
      'synesthesia',
      'audioOffsetMs',
      'debug',
      'lang',
    ];
    for (const k of required) {
      expect(p).toHaveProperty(k);
    }
  });
});

describe('createInitialPractice', () => {
  it('starts disabled in guided mode at 60% tempo', () => {
    const p = createInitialPractice(40);
    expect(p.enabled).toBe(false);
    expect(p.mode).toBe('guided');
    expect(p.tempoPct).toBe(60);
  });

  it('all section-scoped counters start at 0', () => {
    const p = createInitialPractice(40);
    expect(p.hits).toBe(0);
    expect(p.misses).toBe(0);
    expect(p.timingScoreSum).toBe(0);
    expect(p.durationScoreSum).toBe(0);
    expect(p.durationScoredCount).toBe(0);
    expect(p.sectionCombo).toBe(0);
    expect(p.sectionBestCombo).toBe(0);
  });

  it('sectionNotes is an empty array (not null) — lane reads .length safely', () => {
    const p = createInitialPractice(40);
    expect(Array.isArray(p.sectionNotes)).toBe(true);
    expect(p.sectionNotes).toHaveLength(0);
  });

  it('pendingHolds is a fresh Map (not shared across instances)', () => {
    const a = createInitialPractice(40);
    const b = createInitialPractice(40);
    expect(a.pendingHolds).toBeInstanceOf(Map);
    expect(a.pendingHolds).not.toBe(b.pendingHolds);
    a.pendingHolds.set(60, { foo: 'bar' });
    expect(b.pendingHolds.size).toBe(0);
  });

  it('threads audioOffsetMs through (caller passes the resolved value)', () => {
    expect(createInitialPractice(0).audioOffsetMs).toBe(0);
    expect(createInitialPractice(50).audioOffsetMs).toBe(50);
    expect(createInitialPractice(-25).audioOffsetMs).toBe(-25); // negative offset = press *before* the audible beat
  });

  it('full-song / hand-filter / toggles start at safe defaults', () => {
    const p = createInitialPractice(40);
    expect(p.fullSongMode).toBe(false);
    expect(p.handFilter).toBeNull();
    expect(p.ghostOn).toBe(false);
    expect(p.metronomeOn).toBe(false);
  });

  it('completion + progress sentinels start at neutral values', () => {
    const p = createInitialPractice(40);
    expect(p._completing).toBe(false);
    expect(p._lastProgUpdate).toBe(0);
    expect(p.progress).toBeNull();
    expect(p.startAudioTime).toBe(0);
    expect(p.currentNoteIdx).toBe(0);
  });

  it('all required keys are present (defensive contract pin)', () => {
    const p = createInitialPractice(40);
    const required: Array<keyof InitialPracticeState> = [
      'enabled',
      'sectionIdx',
      'tempoPct',
      'mode',
      'ghostOn',
      'metronomeOn',
      'fullSongMode',
      'startAudioTime',
      'sectionNotes',
      'currentNoteIdx',
      'hits',
      'misses',
      'timingScoreSum',
      'durationScoreSum',
      'durationScoredCount',
      'pendingHolds',
      'sectionCombo',
      'sectionBestCombo',
      'handFilter',
      'audioOffsetMs',
      'progress',
      '_completing',
      '_completionTimer',
      '_lastProgUpdate',
    ];
    for (const k of required) {
      expect(p).toHaveProperty(k);
    }
  });

  it('returns a fresh object each call (no shared state across sections)', () => {
    const a = createInitialPractice(40);
    const b = createInitialPractice(40);
    expect(a).not.toBe(b);
    a.hits = 99;
    expect(b.hits).toBe(0);
  });
});
