// Single contract for the OpenSheetMusicDisplay (OSMD) library. The web
// shell wires in a real implementation backed by the OSMD npm package;
// future targets (mobile native renderer, headless tests) can plug in
// alternative implementations against the same interface.
//
// Keeping the surface small is deliberate — the legacy shell touched
// `osmd.cursor.iterator.currentTimeStamp.realValue` and similar deep
// property paths in dozens of places, which made the eventual TypeScript
// migration of the rendering pipeline a moving target. This adapter
// exposes only what the practice / render layers actually need:
//
//   * load + render a score
//   * extract a flat note timeline (one-shot per song load)
//   * position a cursor by (measure index, in-bar quarters)
//   * show / hide the cursor and read its DOM geometry for scroll math
//   * color the currently-played notehead(s) for visual feedback
//
// Pure type module — no runtime, no DOM. The shell creates an instance
// when a song loads and passes it to the practice / render code.

/** A single note position inside the loaded score. The render layer uses
 *  these to draw the falling-note lane and feed the cursor walker. */
export interface OsmdNote {
  /** MIDI note number (0–127). */
  midi: number;
  /** 'L' or 'R' for left / right hand assignment from the MusicXML
   *  `<part>` (or staff index) — the practice-state engine routes scoring
   *  per hand. */
  hand: 'L' | 'R';
  /** Onset time relative to score start, in seconds at the score's
   *  authored tempo. The shell scales by the user's tempoPct. */
  timeSec: number;
  /** Sustained duration in seconds at the authored tempo. */
  durSec: number;
  /** Source measure index (0-based, MusicXML order). Matches
   *  `cursorTo`'s first argument. */
  measureIdx: number;
  /** Position within the measure expressed in quarter-note units. A note
   *  on beat 3 of a 4/4 bar is `inBarQuarters = 2.0`. */
  inBarQuarters: number;
  /** True for notes flagged `<tied type="start">` in MusicXML; consumers
   *  may merge tied chains into one sustained event. */
  tieStart?: boolean;
  /** True for notes flagged `<tied type="stop">`. */
  tieEnd?: boolean;
}

/** Per-measure timing produced during note extraction — used by the
 *  practice layer to place the count-in beep and to map `timeSec`
 *  forward when the user changes tempoPct mid-song. */
export interface OsmdMeasureTiming {
  /** Wall-clock seconds at which the measure starts (authored tempo). */
  startSec: number;
  /** Quarter-note BPM in effect at the measure's start. */
  bpm: number;
}

/** Result of a one-shot note-extraction pass. */
export interface OsmdExtractResult {
  /** All notes in playback order. Already sorted by `timeSec`. */
  notes: OsmdNote[];
  /** Per-measure timing, parallel to the score's measure list. */
  measureTiming: OsmdMeasureTiming[];
}

/** Optional XML-derived measure timing the shell can pass into extraction
 *  when it has a more accurate parse than OSMD's own `length.realValue`
 *  (e.g. for scores with `<metronome beat-unit>` or mid-bar tempo
 *  changes that OSMD's iterator handles inconsistently). */
export interface OsmdExtractOptions {
  xmlMeasureTiming?: ReadonlyArray<{
    tempoEvents: ReadonlyArray<{ inBarDiv: number; qBpm: number }>;
    timeSig: { num: number; den: number };
    divisions: number;
    actualDiv: number;
  }>;
}

/** Just enough geometry for the shell to scroll the score panel so the
 *  cursor stays visible. Returns null when the cursor isn't currently
 *  rendered (e.g. before first show, or after teardown). */
export interface OsmdCursorGeometry {
  /** `cursorElement.offsetTop` — distance from the score panel's
   *  scrollable origin to the cursor. */
  offsetTop: number;
  /** `cursorElement.offsetHeight` — how tall the highlight is, in CSS
   *  pixels. The shell uses this to keep the cursor inside the viewport. */
  offsetHeight: number;
}

export interface OsmdAdapter {
  /** Load + render a score from a URL. Accepts both `.mxl` (zipped) and
   *  plain `.musicxml` URLs. Resolves once the SVG is in the DOM and the
   *  cursor is positioned at the start. */
  load(url: string): Promise<void>;

  /** True after a successful `load`, false before / during / on failure. */
  isLoaded(): boolean;

  /** One-shot extraction of the playback timeline. Called once per song
   *  load by the practice-state engine. Subsequent calls are allowed but
   *  the shell typically caches the result. */
  extractNotes(opts?: OsmdExtractOptions): OsmdExtractResult;

  /** Position the cursor at `(measureIdx, inBarQuarters)`. Uses OSMD's
   *  iterator under the hood and resets if the target is behind the
   *  current position (OSMD's `cursor.previous()` leaves the iterator in
   *  a half-broken state on 1.9.x). */
  cursorTo(measureIdx: number, inBarQuarters: number): void;

  /** Reset the iterator to the start of the score and scroll the panel
   *  back to the top. Called when the user resets a section. */
  resetCursor(): void;

  /** Make the cursor highlight visible. */
  showCursor(): void;

  /** Hide the cursor highlight without resetting iterator state. Called
   *  on session pause / end. */
  hideCursor(): void;

  /** Read cursor geometry for the panel-scroll math. Returns null when
   *  the cursor isn't currently rendered. */
  getCursorGeometry(): OsmdCursorGeometry | null;

  /** Color the noteheads currently under the cursor. The shell uses this
   *  as a "which note is sounding right now" cue independent of the
   *  cursor's column highlight. Color is any CSS color string. */
  highlightCurrentNotes(color: string): void;

  /** Restore noteheads previously colored by `highlightCurrentNotes`. */
  clearHighlights(): void;
}
