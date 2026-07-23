// @vitest-environment happy-dom
//
// Tests for packages/web/src/prefs-storage.ts.
//
// Covers:
//   • createJSONStore — load/save round-trip with default localStorage.
//   • Quota-exceeded path (one-shot warning).
//   • Corrupt JSON returns the fallback (no throw).
//   • sanitizePrefs accept-list — clamps theme, drops unknown keys,
//     coerces booleans, validates lang ∈ {en,jp}, handles null
//     audioOffsetMs.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJSONStore, sanitizePrefs, type JSONStorage } from '../src/prefs-storage';

beforeEach(() => {
  localStorage.clear();
});

// ─── createJSONStore (against happy-dom localStorage) ──────────────

describe('createJSONStore — happy-dom localStorage', () => {
  it('round-trips an object', () => {
    const { loadJSON, saveJSON } = createJSONStore();
    saveJSON('k', { a: 1, b: 'x' });
    expect(loadJSON('k', {})).toEqual({ a: 1, b: 'x' });
  });

  it('returns the fallback when key is missing', () => {
    const { loadJSON } = createJSONStore();
    expect(loadJSON('missing', { default: true })).toEqual({ default: true });
  });

  it('returns the fallback when stored value is malformed JSON', () => {
    localStorage.setItem('bad', '{not-json}');
    const { loadJSON } = createJSONStore();
    expect(loadJSON('bad', null)).toBeNull();
  });

  it('handles nullable storage gracefully', () => {
    const { loadJSON, saveJSON } = createJSONStore(null as unknown as JSONStorage);
    expect(loadJSON('k', 'fallback')).toBe('fallback');
    expect(() => saveJSON('k', { a: 1 })).not.toThrow();
  });
});

// ─── createJSONStore — quota-exceeded path ─────────────────────────

describe('createJSONStore — quota guard', () => {
  function makeQuotaExceededStorage(): { storage: JSONStorage; setCalls: number } {
    let setCalls = 0;
    const storage: JSONStorage = {
      getItem: () => null,
      setItem: () => {
        setCalls++;
        const e = new Error('mock quota exceeded');
        e.name = 'QuotaExceededError';
        throw e;
      },
    };
    // Wrap the setCalls in a getter so the test can read the value
    // post-call. Simpler than a closure-capture array.
    return {
      storage,
      get setCalls() {
        return setCalls;
      },
    };
  }

  it('emits exactly one warn across many save attempts', () => {
    const warnSpy = vi.fn();
    const probe = makeQuotaExceededStorage();
    const { saveJSON } = createJSONStore(probe.storage, warnSpy);
    saveJSON('a', 1);
    saveJSON('b', 2);
    saveJSON('c', 3);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('QuotaExceededError');
    // All three setItem attempts still happened (best-effort).
    expect(probe.setCalls).toBe(3);
  });

  it('does NOT throw on save failure', () => {
    const probe = makeQuotaExceededStorage();
    const { saveJSON } = createJSONStore(probe.storage, () => {});
    expect(() => saveJSON('k', { a: 1 })).not.toThrow();
  });

  it('warning includes "[PREFS]" + the error name', () => {
    const warnSpy = vi.fn();
    const probe = makeQuotaExceededStorage();
    const { saveJSON } = createJSONStore(probe.storage, warnSpy);
    saveJSON('k', 1);
    expect(warnSpy.mock.calls[0][0]).toContain('[PREFS]');
    expect(warnSpy.mock.calls[0][0]).toContain('Settings will not persist');
  });

  it('separate stores have independent quota-warned flags', () => {
    const warn1 = vi.fn();
    const warn2 = vi.fn();
    const probe1 = makeQuotaExceededStorage();
    const probe2 = makeQuotaExceededStorage();
    const s1 = createJSONStore(probe1.storage, warn1);
    const s2 = createJSONStore(probe2.storage, warn2);
    s1.saveJSON('k', 1);
    s2.saveJSON('k', 1);
    expect(warn1).toHaveBeenCalledOnce();
    expect(warn2).toHaveBeenCalledOnce();
  });
});

// ─── sanitizePrefs ──────────────────────────────────────────────────

describe('sanitizePrefs', () => {
  it('returns empty object for non-object input', () => {
    expect(sanitizePrefs(null)).toEqual({});
    expect(sanitizePrefs(undefined)).toEqual({});
    expect(sanitizePrefs('string')).toEqual({});
    expect(sanitizePrefs(42)).toEqual({});
  });

  it('keeps theme when in 0..3', () => {
    expect(sanitizePrefs({ theme: 0 })).toEqual({ theme: 0 });
    expect(sanitizePrefs({ theme: 1 })).toEqual({ theme: 1 });
    expect(sanitizePrefs({ theme: 2 })).toEqual({ theme: 2 });
    expect(sanitizePrefs({ theme: 3 })).toEqual({ theme: 3 });
  });

  it('drops theme when out of range', () => {
    expect(sanitizePrefs({ theme: -1 })).toEqual({});
    expect(sanitizePrefs({ theme: 4 })).toEqual({});
    expect(sanitizePrefs({ theme: 99 })).toEqual({});
    expect(sanitizePrefs({ theme: NaN })).toEqual({});
  });

  it('drops theme when wrong type', () => {
    expect(sanitizePrefs({ theme: '1' })).toEqual({});
    expect(sanitizePrefs({ theme: true })).toEqual({});
  });

  it('coerces theme via |0 (truncates floats)', () => {
    expect(sanitizePrefs({ theme: 2.7 })).toEqual({ theme: 2 });
  });

  it('keeps boolean synesthesia + debug', () => {
    expect(sanitizePrefs({ synesthesia: true, debug: false })).toEqual({
      synesthesia: true,
      debug: false,
    });
  });

  it('keeps boolean showScore + welcomeDismissed (persisted across reloads)', () => {
    expect(sanitizePrefs({ showScore: true })).toEqual({ showScore: true });
    expect(sanitizePrefs({ showScore: false })).toEqual({ showScore: false });
    expect(sanitizePrefs({ welcomeDismissed: true })).toEqual({ welcomeDismissed: true });
  });

  it('keeps a valid noteSpeed and drops invalid values', () => {
    expect(sanitizePrefs({ noteSpeed: 'slow' })).toEqual({ noteSpeed: 'slow' });
    expect(sanitizePrefs({ noteSpeed: 'normal' })).toEqual({ noteSpeed: 'normal' });
    expect(sanitizePrefs({ noteSpeed: 'fast' })).toEqual({ noteSpeed: 'fast' });
    expect(sanitizePrefs({ noteSpeed: 'ludicrous' })).toEqual({});
    expect(sanitizePrefs({ noteSpeed: 2 })).toEqual({});
  });

  it('drops non-boolean showScore + welcomeDismissed', () => {
    expect(sanitizePrefs({ showScore: 'yes', welcomeDismissed: 1 })).toEqual({});
  });

  it('drops non-boolean synesthesia + debug', () => {
    expect(sanitizePrefs({ synesthesia: 'yes', debug: 1 })).toEqual({});
  });

  it('keeps audioOffsetMs when finite number or null', () => {
    expect(sanitizePrefs({ audioOffsetMs: 30 })).toEqual({ audioOffsetMs: 30 });
    expect(sanitizePrefs({ audioOffsetMs: 0 })).toEqual({ audioOffsetMs: 0 });
    expect(sanitizePrefs({ audioOffsetMs: -50 })).toEqual({ audioOffsetMs: -50 });
    expect(sanitizePrefs({ audioOffsetMs: null })).toEqual({ audioOffsetMs: null });
  });

  it('drops audioOffsetMs when not finite', () => {
    expect(sanitizePrefs({ audioOffsetMs: NaN })).toEqual({});
    expect(sanitizePrefs({ audioOffsetMs: Infinity })).toEqual({});
    expect(sanitizePrefs({ audioOffsetMs: -Infinity })).toEqual({});
    expect(sanitizePrefs({ audioOffsetMs: 'fast' })).toEqual({});
  });

  it('keeps lang when "en" or "jp"', () => {
    expect(sanitizePrefs({ lang: 'en' })).toEqual({ lang: 'en' });
    expect(sanitizePrefs({ lang: 'jp' })).toEqual({ lang: 'jp' });
  });

  it('drops lang for unknown values', () => {
    expect(sanitizePrefs({ lang: 'fr' })).toEqual({});
    expect(sanitizePrefs({ lang: 'EN' })).toEqual({}); // case-sensitive
    expect(sanitizePrefs({ lang: '' })).toEqual({});
  });

  it('drops keys not in the accept-list', () => {
    expect(
      sanitizePrefs({
        theme: 1,
        eviltracker: { secret: 'oops' },
        version: 99,
      })
    ).toEqual({ theme: 1 });
  });

  it('handles a full valid prefs payload', () => {
    expect(
      sanitizePrefs({
        theme: 2,
        synesthesia: true,
        audioOffsetMs: 40,
        debug: false,
        lang: 'jp',
      })
    ).toEqual({
      theme: 2,
      synesthesia: true,
      audioOffsetMs: 40,
      debug: false,
      lang: 'jp',
    });
  });

  it('accepts valid noteNaming and drops invalid', () => {
    expect(sanitizePrefs({ noteNaming: 'solfege' }).noteNaming).toBe('solfege');
    expect(sanitizePrefs({ noteNaming: 'abc' }).noteNaming).toBe('abc');
    expect(sanitizePrefs({ noteNaming: 'auto' }).noteNaming).toBe('auto');
    expect(sanitizePrefs({ noteNaming: 'katakana' }).noteNaming).toBeUndefined();
  });

  it('clamps volume prefs to 0-100 and rounds; drops non-numbers', () => {
    expect(sanitizePrefs({ volGhost: 50 }).volGhost).toBe(50);
    expect(sanitizePrefs({ volBacking: 150 }).volBacking).toBe(100);
    expect(sanitizePrefs({ volMetronome: -20 }).volMetronome).toBe(0);
    expect(sanitizePrefs({ volGhost: 33.7 }).volGhost).toBe(34);
    expect(sanitizePrefs({ volGhost: 'loud' }).volGhost).toBeUndefined();
    expect(sanitizePrefs({ volGhost: Infinity }).volGhost).toBeUndefined();
  });
});
