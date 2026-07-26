// Input source — which device drives note detection.
//
// =====================================================================
// Why this is a separate concept from "a MIDI port is attached"
// =====================================================================
//
// It used to be the same boolean. `midiInput.enabled` means "a MIDI port is
// bound to the dispatcher" — a hardware fact — but roughly ten downstream
// sites read it as "MIDI is the input that drives scoring and visuals", which
// is a ROUTING DECISION. Because one flag answered both questions, the user's
// intent had nowhere to live: plugging a keyboard in silently took over, muted
// the mic, and the only way back to acoustic play was to physically unplug.
// There was no switch because the model had no room for one.
//
// Splitting them is what makes a choice representable at all:
//
//   pref (what the player asked for)  ×  attached (what the hardware offers)
//                                     ↓
//                            the ACTIVE source
//
// =====================================================================
// Why 'auto' is the default, and why the override persists
// =====================================================================
//
// This is the shape the genre converged on. Synthesia lists every MIDI input
// with a per-device on/off; flowkey, Skoove and Simply Piano all ask
// "keyboard or microphone?" during setup and let it be changed in settings
// afterwards; Yousician exposes an Input setting alongside the detected
// device; Rocksmith selects the input device explicitly. Two properties are
// common to all of them and both matter here:
//
//   1. Auto-detect is the DEFAULT, so the common case needs no configuration.
//   2. The override is EXPLICIT and STICKY, so the app cannot silently change
//      what it is listening to underneath the player.
//
// Property 2 is the one this app was missing, and it is not cosmetic: the
// judgement windows differ per input path (JudgeProfile — MIDI is
// sample-exact, the mic carries ±30-40 ms of detection jitter), so "what is
// the input" silently changing means the difficulty silently changing.

/** What the player asked for. `auto` = "use whatever is connected". */
export type InputSourcePref = 'auto' | 'midi' | 'mic';

/** What is actually driving detection right now. */
export type ActiveInputSource = 'midi' | 'mic';

export const INPUT_SOURCE_PREFS: readonly InputSourcePref[] = Object.freeze([
  'auto',
  'midi',
  'mic',
]);

export function isInputSourcePref(v: unknown): v is InputSourcePref {
  return v === 'auto' || v === 'midi' || v === 'mic';
}

/**
 * The active input source. Pure.
 *
 * `auto` follows the hardware — a bound port wins, because someone who
 * connected a keyboard means to play it, and MIDI is strictly the better
 * signal (polyphonic, velocity-aware, no detection jitter).
 *
 * An explicit `midi` with nothing attached resolves to `midi` and NOT to a mic
 * fallback. That is deliberate: "listen to my keyboard" has to keep meaning
 * that while the keyboard is booting, re-pairing, or momentarily dropped, or
 * the app would flip to the mic mid-session and start scoring room noise
 * against different judgement windows. The caller reads `midiAttached` to know
 * it is waiting rather than playing (see `describeInputSource`).
 */
export function resolveInputSource(
  pref: InputSourcePref,
  midiAttached: boolean
): ActiveInputSource {
  if (pref === 'midi') return 'midi';
  if (pref === 'mic') return 'mic';
  return midiAttached ? 'midi' : 'mic';
}

/**
 * Did the player PIN this source, as opposed to leaving it on `auto`?
 *
 * Exists here so the question has one name. It had three — `isMicPinned`
 * (midi-rescan), `isMicExplicitlyChosen` (mic-lifecycle) and `isMidiPinned`
 * (intro-diag) — two of which were the same predicate under different names,
 * each threaded as its own bespoke dep from the shell.
 */
export function isPinnedTo(pref: InputSourcePref, source: ActiveInputSource): boolean {
  return pref === source;
}

/** Everything a UI needs to state the input situation honestly. */
export interface InputSourceStatus {
  /** What is driving detection. */
  active: ActiveInputSource;
  /** The player's setting, echoed back. */
  pref: InputSourcePref;
  /** A port is bound. */
  midiAttached: boolean;
  /**
   * The active source cannot produce input yet: `midi` is selected (or auto,
   * which resolved to mic) but the hardware isn't there. Exactly two shapes:
   * forced-MIDI with no port, and forced-mic with no usable mic.
   */
  waiting: boolean;
  /**
   * A keyboard is connected but deliberately NOT being used, because the
   * player chose the mic. Worth surfacing: a connected-but-ignored device is
   * the one state a player is guaranteed to read as a bug otherwise.
   */
  midiIdle: boolean;
}

/**
 * Classify the input situation. Pure; drives the settings read-out and the
 * intro hint, so that both say the same thing about the same state.
 */
export function describeInputSource(
  pref: InputSourcePref,
  midiAttached: boolean,
  micUsable: boolean
): InputSourceStatus {
  const active = resolveInputSource(pref, midiAttached);
  return {
    active,
    pref,
    midiAttached,
    waiting: active === 'midi' ? !midiAttached : !micUsable,
    midiIdle: active === 'mic' && midiAttached,
  };
}
