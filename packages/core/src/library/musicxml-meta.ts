// MusicXML metadata extractor — title, composer, measure count.
//
// Operates on raw MusicXML text (`.xml` or the inner `.xml` of an `.mxl` zip).
// Caller handles the unzipping (JSZip). This module is deliberately
// DOMParser-only so it can run in node tests by injecting a parser.

export interface MusicXmlMetadata {
  title: string;
  composer: string;
  /** Number of measures in the FIRST part. Multi-part scores typically share
   *  this count; we don't validate cross-part consistency. */
  measureCount: number;
}

export interface MetaParseOptions {
  /** Inject a DOMParser implementation (e.g. linkedom in node tests).
   *  Defaults to globalThis.DOMParser. */
  parser?: { parseFromString(text: string, type: string): Document };
}

/**
 * Extract minimal piece metadata from MusicXML text.
 *
 * Throws on parse error (returns from <parsererror> element). Returns empty
 * strings + 0 count if the XML is well-formed but doesn't contain the fields.
 */
export function parseMusicXmlMetadata(
  xmlText: string,
  opts: MetaParseOptions = {}
): MusicXmlMetadata {
  const ParserCtor = opts.parser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : null);
  if (!ParserCtor) {
    throw new Error('DOMParser not available; pass opts.parser');
  }
  const parser = 'parseFromString' in ParserCtor ? ParserCtor : new (ParserCtor as any)();
  const dom = parser.parseFromString(xmlText, 'text/xml');
  if (dom.querySelector('parsererror')) {
    throw new Error('MusicXML parse error');
  }

  const titleEl = dom.querySelector('work > work-title') ?? dom.querySelector('movement-title');
  const composerEl =
    dom.querySelector('identification > creator[type="composer"]') ??
    dom.querySelector('identification > creator');

  const parts = dom.querySelectorAll('part');
  const measureCount = parts.length > 0 ? parts[0].querySelectorAll('measure').length : 0;

  return {
    title: (titleEl?.textContent ?? '').trim(),
    composer: (composerEl?.textContent ?? '').trim(),
    measureCount,
  };
}
