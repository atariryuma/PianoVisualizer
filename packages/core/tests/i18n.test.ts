import { describe, it, expect } from 'vitest';
import {
  T_STRINGS,
  translate,
  createT,
  noteNamesFor,
  NOTE_NAMES_EN,
  NOTE_NAMES_JP,
  type TranslationTable,
} from '../src/i18n';

const TINY: TranslationTable = {
  hello: { en: 'Hello', jp: 'こんにちは' },
  greetFmt: { en: 'Hi {name}!', jp: '{name}さん、こんにちは！' },
  twiceFmt: { en: '{x} and {x}', jp: '{x}と{x}' },
  countFmt: { en: '{n}/{total} done', jp: '{n}/{total} 完了' },
};

describe('translate — basic lookup', () => {
  it('returns en string for lang=en', () => {
    expect(translate(TINY, 'en', 'hello')).toBe('Hello');
  });
  it('returns jp string for lang=jp', () => {
    expect(translate(TINY, 'jp', 'hello')).toBe('こんにちは');
  });
  it('returns the key itself when missing', () => {
    expect(translate(TINY, 'en', 'unknownKey')).toBe('unknownKey');
  });
  it('falls back to en when jp is missing', () => {
    const T: TranslationTable = { onlyEn: { en: 'EN only', jp: '' } };
    expect(translate(T, 'jp', 'onlyEn', undefined, { fallbackLang: 'en' })).toBe('EN only');
  });
});

describe('translate — variable interpolation', () => {
  it('substitutes a single {var}', () => {
    expect(translate(TINY, 'en', 'greetFmt', { name: 'Alice' })).toBe('Hi Alice!');
  });
  it('substitutes a number', () => {
    expect(translate(TINY, 'jp', 'countFmt', { n: 3, total: 10 })).toBe('3/10 完了');
  });
  it('replaces ALL occurrences of {var}', () => {
    expect(translate(TINY, 'en', 'twiceFmt', { x: 'foo' })).toBe('foo and foo');
  });
  it('leaves placeholder intact when var missing', () => {
    expect(translate(TINY, 'en', 'greetFmt')).toBe('Hi {name}!');
  });
});

describe('translate — synthetic user-song keys', () => {
  const resolver = (id: string, which: 'userTitle' | 'userComposer') => {
    if (id === 'usr_abc') {
      return which === 'userTitle' ? 'My Sonata' : 'A. Composer';
    }
    return null;
  };

  it('resolves __userTitle:<id> via userResolver', () => {
    expect(
      translate(TINY, 'en', '__userTitle:usr_abc', undefined, { userResolver: resolver })
    ).toBe('My Sonata');
  });

  it('resolves __userComposer:<id>', () => {
    expect(
      translate(TINY, 'en', '__userComposer:usr_abc', undefined, { userResolver: resolver })
    ).toBe('A. Composer');
  });

  it('returns empty string when resolver returns null', () => {
    expect(
      translate(TINY, 'en', '__userTitle:unknownId', undefined, { userResolver: resolver })
    ).toBe('');
  });

  it('returns empty when no resolver provided', () => {
    expect(translate(TINY, 'en', '__userTitle:any')).toBe('');
  });

  it('returns empty for malformed __user keys', () => {
    expect(translate(TINY, 'en', '__userBogus')).toBe(''); // no colon
    expect(translate(TINY, 'en', '__userOther:abc')).toBe(''); // unknown 'which'
  });

  it('does not treat __user-prefix accidentally as a key in the table', () => {
    const T: TranslationTable = { __userFake: { en: 'should never resolve', jp: '' } };
    expect(translate(T, 'en', '__userFake', undefined, { userResolver: resolver })).toBe('');
  });
});

describe('createT — closure with reactive lang', () => {
  it('reads getLang() lazily on each call', () => {
    let lang: 'en' | 'jp' = 'en';
    const t = createT(TINY, { getLang: () => lang });
    expect(t('hello')).toBe('Hello');
    lang = 'jp';
    expect(t('hello')).toBe('こんにちは');
  });

  it('passes vars through to translate', () => {
    const t = createT(TINY, { getLang: () => 'en' });
    expect(t('countFmt', { n: 5, total: 8 })).toBe('5/8 done');
  });

  it('uses injected userResolver for synthetic keys', () => {
    const t = createT(TINY, {
      getLang: () => 'en',
      userResolver: (id, which) => (which === 'userTitle' ? 'TITLE:' + id : null),
    });
    expect(t('__userTitle:abc')).toBe('TITLE:abc');
    expect(t('__userComposer:abc')).toBe('');
  });
});

describe('NOTE_NAMES_EN / JP / noteNamesFor', () => {
  it('EN has 12 standard names', () => {
    expect(NOTE_NAMES_EN).toHaveLength(12);
    expect(NOTE_NAMES_EN[0]).toBe('C');
    expect(NOTE_NAMES_EN[9]).toBe('A');
  });
  it('JP has matching katakana ド-シ', () => {
    expect(NOTE_NAMES_JP).toHaveLength(12);
    expect(NOTE_NAMES_JP[0]).toBe('ド');
    expect(NOTE_NAMES_JP[9]).toBe('ラ');
  });
  it('noteNamesFor switches by lang', () => {
    expect(noteNamesFor('en')).toBe(NOTE_NAMES_EN);
    expect(noteNamesFor('jp')).toBe(NOTE_NAMES_JP);
  });
});

describe('T_STRINGS — schema sanity', () => {
  it('every entry has both en and jp', () => {
    for (const [key, entry] of Object.entries(T_STRINGS)) {
      expect(entry, `key ${key}`).toHaveProperty('en');
      expect(entry, `key ${key}`).toHaveProperty('jp');
      expect(typeof entry.en, `key ${key}.en`).toBe('string');
      expect(typeof entry.jp, `key ${key}.jp`).toBe('string');
      expect(entry.en.length, `key ${key}.en`).toBeGreaterThan(0);
      expect(entry.jp.length, `key ${key}.jp`).toBeGreaterThan(0);
    }
  });

  it('contains a known stable key', () => {
    expect(T_STRINGS.settings.en).toBe('Settings');
    expect(T_STRINGS.settings.jp).toBe('設定');
  });

  it('Fmt-suffixed keys actually contain at least one placeholder', () => {
    for (const [key, entry] of Object.entries(T_STRINGS)) {
      if (!key.endsWith('Fmt')) continue;
      expect(entry.en, `${key}.en should have {placeholder}`).toMatch(/\{[a-zA-Z]+\}/);
      expect(entry.jp, `${key}.jp should have {placeholder}`).toMatch(/\{[a-zA-Z]+\}/);
    }
  });
});
