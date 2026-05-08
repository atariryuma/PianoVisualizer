// First-time Web MIDI initialization — Phase 0d batch 57.
//
// Wraps the boot-time MIDIAccess request + dual-pass port attach
// (spec-strict + Web MIDI Browser quirk-handling) into one factory.
// All side-effects (port attach, indicator paint, intro-diag,
// auto-rescan kickoff, console.log) flow through the deps bag — the
// module is callable with mocks so the test suite can exercise:
//
//   • Web MIDI unavailable → Apple-mobile path sets platformBlocked.
//   • Web MIDI unavailable → non-Apple path logs + bails.
//   • Spec-strict pass attaches the first connected port.
//   • Quirk pass attaches a non-connected port when strict fails
//     (Web MIDI Browser sometimes reports paired BLE-MIDI keyboards
//     with state='unknown' or 'pending' until activated).
//   • Zero ports → start auto-rescan + show waiting hint.
//   • requestMIDIAccess() throws → start auto-rescan + show hint.
//
// Idempotent: a second call while `_accessRequested` is already true
// is a no-op (multiple boot paths re-enter — initAudio() success +
// initAudio()'s re-entry on resumeMic both call it).
//
// State (`midiInput._accessRequested`, `midiInput.platformBlocked`)
// lives on the existing midiInput ref the shell shares with the
// dispatcher / indicator / port modules.

import type { MidiAccessRef, MidiPortRef } from './midi-ports';

/** Mutable ref to the shell's midiInput cluster — the few fields
 *  this module reads + writes. Everything else (port, lastEventTime,
 *  enabled) is owned by sibling modules. */
export interface MidiInitInputRef {
  _accessRequested: boolean;
  platformBlocked: boolean;
}

/** Subset of `navigator` we touch — same shape as midi-rescan.ts so
 *  the shell can reuse the production `navigator` object verbatim. */
export interface MidiInitNavigator {
  requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MidiAccessRef>;
}

export interface MidiInitDeps {
  midiInput: MidiInitInputRef;
  navigator: MidiInitNavigator;

  /** Read at call time so the platform check stays cheap. */
  isAppleMobile: () => boolean;

  /** Repaint the input indicator pill (hourglass / connected /
   *  blocked etc.). Called after the platform-blocked branch so the
   *  iPad-Safari user sees the correct state immediately. */
  setInputIndicator: () => void;

  /** Lazy MIDIAccess request — production wraps midi-rescan's
   *  ensureAccess(force?) and updates the shell-private `_midiAccess`
   *  ref so the rest of the file's MIDI helpers see the same handle. */
  ensureMidiAccess: () => Promise<MidiAccessRef>;

  /** Defensive iterator over access.inputs — production delegates to
   *  midi-ports.ts. Returns an empty array on access shape mismatch. */
  gatherMidiInputs: (access: MidiAccessRef) => MidiPortRef[];

  /** Attach a single port — production delegates to midi-ports.ts.
   *  Returns true on success (virtual/system ports are filtered out
   *  inside the implementation). */
  attachMidiPort: (port: MidiPortRef) => boolean;

  /** Show "waiting for MIDI" sticky hint (cleared by attachMidiPort
   *  via refreshIntroHint). Surfaces a friendly message to iPad / WMB
   *  users so they know the app is actively listening. */
  showMidiWaitingHint: () => void;

  /** Kick off the ramped auto-rescan poller. Called whenever the
   *  first-attempt attach didn't connect anything — the poller stops
   *  itself once anything connects. */
  startMidiAutoRescan: () => void;

  /** Optional logger override (defaults to console). Tests pass a
   *  spy; the shell uses console.log + console.warn directly. */
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

export interface MidiInit {
  /** Run the boot-time Web MIDI initialization once. Idempotent —
   *  re-entry while `_accessRequested` is already true is a no-op. */
  initWebMIDI: () => Promise<void>;
}

export function createMidiInit(deps: MidiInitDeps): MidiInit {
  const log = deps.log ?? ((m: string) => console.log(m));
  const warn = deps.warn ?? ((m: string) => console.warn(m));

  async function initWebMIDI(): Promise<void> {
    const { midiInput, navigator: nav } = deps;
    if (midiInput._accessRequested) return;
    midiInput._accessRequested = true;

    if (!nav.requestMIDIAccess) {
      if (deps.isAppleMobile()) {
        midiInput.platformBlocked = true;
        log(
          '[MIDI] iOS/iPadOS detected — Web MIDI is unavailable on Safari/WebKit. ' +
            'Use a desktop browser, Steam Deck, or the "Web MIDI Browser" iOS app for BLE-MIDI.'
        );
      } else {
        log('[MIDI] Web MIDI API not available in this browser');
      }
      deps.setInputIndicator();
      return;
    }

    try {
      const access = await deps.ensureMidiAccess();
      const allPorts = deps.gatherMidiInputs(access);
      log('[MIDI] available input ports: ' + allPorts.length);
      for (const p of allPorts) {
        log(
          '[MIDI]   - "' +
            p.name +
            '" mfg="' +
            (p.manufacturer || '') +
            '"' +
            ' state=' +
            p.state +
            ' connection=' +
            (p as { connection?: string }).connection
        );
      }

      // Strict pass — by-the-spec, attach only `state === 'connected'`.
      // This is the "normal" path that fires on desktop Chrome, Steam
      // Deck, Android Chrome, and the future Capacitor native build.
      let attached = false;
      for (const port of allPorts) {
        if (port.state === 'connected' && deps.attachMidiPort(port)) {
          attached = true;
          break;
        }
      }

      // @WMB-WORKAROUND (Phase 0d): second-pass attach ignoring state.
      // Web MIDI Browser sometimes reports a pre-paired BLE-MIDI
      // keyboard with state='unknown' or 'pending' until the page
      // actively opens it. attachMidiPort still rejects virtual/system
      // ports, so this doesn't loosen the safety filter.
      if (!attached) {
        for (const port of allPorts) {
          if (deps.attachMidiPort(port)) {
            log('[MIDI] attached non-connected port (WMB quirk): ' + port.name);
            attached = true;
            break;
          }
        }
      }
      // /@WMB-WORKAROUND

      // Bug-fix (2026-05-07): when the user opens the page BEFORE
      // connecting their keyboard in Web MIDI Browser, allPorts is []
      // and the legacy code did nothing — the user had to manually
      // tap 🔄 Rescan to reconnect. statechange events from WMB are
      // unreliable (polyfill quirks), so the only robust safety net
      // is to start the rescan poller immediately when no port
      // attached on first try. Stops itself once anything connects.
      if (!attached) {
        log('[MIDI] no port attached yet — starting auto-rescan poller');
        deps.showMidiWaitingHint();
        deps.startMidiAutoRescan();
      }
    } catch (e) {
      warn('[MIDI] requestMIDIAccess failed: ' + (e instanceof Error ? e.message : String(e)));
      // Even on access failure, keep polling — Web MIDI Browser
      // sometimes rejects the very first call (permission UI) but
      // accepts a retry.
      deps.showMidiWaitingHint();
      deps.startMidiAutoRescan();
    }
  }

  return { initWebMIDI };
}
