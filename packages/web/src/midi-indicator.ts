// MIDI indicator UI — Phase 0d batch 20.
//
// Three small, DOM-only concerns that all decide "what does the user
// see right now about the MIDI state":
//
//   1. The static MIDI badge (top-left card showing "🎹 device-name"
//      when a port is attached). `refreshMidiBadge()` syncs visibility
//      + label; `pulseMidiBadge()` flashes it briefly (note-on
//      heartbeat).
//
//   2. The practice-toolbar input pill (the small icon next to the
//      song title). Three states:
//        - 🎹     enabled    — port attached + active
//        - 🎹⏳   waiting    — auto-rescan poller running, no port yet
//        - 🎙️    mic-only   — fall-back path (or platform blocked)
//
//   3. Feature-detection helpers — `isAppleMobile()` (cached UA-check
//      for iOS / iPadOS), `isVirtualMidiPort(port)` (skip macOS IAC
//      Driver, Linux MIDI-through, rtpmidi, etc.).
//
// The factory pattern matches the rest of Phase 0d: a single
// `createMidiIndicator(deps)` call returns the four short methods the
// shell rebinds to its existing function names. The factory closes over
// the badge-pulse timer + the cached UA result so neither leaks to the
// outer scope.

import type { MidiHandlersMidiState as MidiInputRef } from './midi-handlers';

/** Subset of `midiInput` we read here. The shell's full MIDIInput
 *  shape adds `enabled`, `port?.name`, `platformBlocked` — declared
 *  here directly so the indicator module isn't coupled to whatever
 *  gnarlier MIDI-device adapter eventually replaces it. */
export interface MidiIndicatorMidiInput {
  enabled: boolean;
  platformBlocked?: boolean;
  port?: { name?: string | null } | null;
}

/** Subset of the shell's DOM bag the indicator UI touches. */
export interface MidiIndicatorDom {
  /** Top-left badge — `🎹 device-name` when a port is attached. */
  midiBadge: HTMLElement | null;
  /** Practice-toolbar input pill (mic / midi / midi-waiting). */
  ptbInput: HTMLElement | null;
}

/** Dependencies for the indicator factory. The shell hands in: the
 *  midiInput state ref, the DOM bag, the i18n translator, and a
 *  thunk for the auto-rescan poller's "currently running?" bit. */
export interface MidiIndicatorDeps {
  midiInput: MidiIndicatorMidiInput;
  dom: MidiIndicatorDom;
  /** Bilingual translator. Receives an i18n key + optional vars; we
   *  only ever call it with the indicator-specific keys below. */
  t: (key: string, vars?: Record<string, string>) => string;
  /** True when the auto-rescan poller is alive (a port hasn't shown
   *  up yet but Web MIDI is supported). Drives the ⏳ waiting state. */
  isRescanRunning: () => boolean;
  /** True when Web MIDI itself is implemented (i.e.
   *  `navigator.requestMIDIAccess` exists). Pulled in via a thunk so
   *  tests can override; the legacy shell just reads `navigator`. */
  hasRequestMIDIAccess: () => boolean;
  /** True while the user is actively practicing (count-in + section
   *  + post-section result). Suppresses the 🎹⏳ "waiting for MIDI"
   *  state during practice — once the user has committed to a session
   *  the waiting hint is just visual noise. The poller stays alive
   *  (ホットプラグで MIDI 接続を検出する) but doesn't get an indicator. */
  isPracticeActive?: () => boolean;
}

/** Public surface returned by the factory. */
export interface MidiIndicator {
  /** Briefly flash the MIDI badge — debounced via internal timer. */
  pulseBadge(): void;
  /** Sync the badge text + visibility to the current midiInput state. */
  refreshBadge(): void;
  /** Sync the practice-toolbar input pill to the current state.
   *  Internally calls `refreshBadge()` for completeness. */
  setInputIndicator(): void;
  /** Cached `isAppleMobile()` result. */
  isAppleMobile(): boolean;
  /** Skip-this-port helper for MIDI enumeration. */
  isVirtualMidiPort(port: { name?: string | null } | null): boolean;
}

const APPLE_MOBILE_UA = /iPad|iPhone|iPod/;
const APPLE_MAC_UA = /Macintosh/;

/** UA-cached check — iOS, iPadOS (which masquerades as Macintosh
 *  with touch points >1), and iPod. Pure: no DOM, no side effects. */
export function detectAppleMobile(
  ua: string = (typeof navigator !== 'undefined' && navigator.userAgent) || '',
  maxTouchPoints: number = (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0
): boolean {
  const isIOS = APPLE_MOBILE_UA.test(ua);
  const isIPadOS = APPLE_MAC_UA.test(ua) && maxTouchPoints > 1;
  return isIOS || isIPadOS;
}

/** Virtual / loopback ports we always skip during enumeration. macOS
 *  IAC Driver, Linux ALSA "Midi Through Port-0", rtpmidi, etc. — these
 *  enumerate but never fire events. */
export function isVirtualMidiPort(port: { name?: string | null } | null): boolean {
  const name = (port?.name || '').toLowerCase();
  return (
    !name ||
    name.includes('through') ||
    name.includes('loop') ||
    name.includes('iac driver') ||
    name.includes('rtpmidi') ||
    // Apple の RTP-MIDI セッション。表示名はロケール依存 — 日本語 iPad では
    // 「ネットワーク Session 1」。実機で本物の GO:PIANO88 より先に attach され
    // 全ノートが破棄される事故を起こした（2026-07-20 実機ログで確認）。
    // ネイティブ側は MIDINetworkSession の同一性判定で除外済み — ここは
    // Web MIDI Browser など web 経路のための第2の防壁。
    name.includes('network session') ||
    name.includes('ネットワーク session')
  );
}

/** Factory — wires the closures + returns the shell-friendly surface. */
export function createMidiIndicator(deps: MidiIndicatorDeps): MidiIndicator {
  let pulseTimer: ReturnType<typeof setTimeout> | 0 = 0;
  const isAppleMobileCached = detectAppleMobile();

  // Avoid the unused-import warning while keeping the type ref handy
  // for future deps tightening. Cheap.
  void (null as unknown as MidiInputRef);

  function pulseBadge(): void {
    const badge = deps.dom.midiBadge;
    if (!badge || !badge.classList.contains('visible')) return;
    badge.classList.add('pulse');
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => badge.classList.remove('pulse'), 140);
  }

  function refreshBadge(): void {
    const badge = deps.dom.midiBadge;
    if (!badge) return;
    if (deps.midiInput.enabled && deps.midiInput.port?.name) {
      badge.textContent = '🎹 ' + deps.midiInput.port.name;
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
      badge.classList.remove('pulse');
    }
  }

  function setInputIndicator(): void {
    // v13: Toggle a body class so CSS can reserve bottom space for
    // the virtual keyboard (lifts #stageLabel, #noteDisplay,
    // #debugOverlay).
    document.body.classList.toggle('midi-on', !!deps.midiInput.enabled);
    refreshBadge();
    const pill = deps.dom.ptbInput;
    if (!pill) return;

    // Pill is emoji-only on every layout — saves topbar width on the
    // narrow phone case + frees horizontal room for the centered
    // section name on iPad. Mode + device name stay accessible via
    // title (long-press / hover) and aria-label (screen readers).
    if (deps.midiInput.enabled) {
      pill.textContent = '🎹';
      pill.classList.add('midi');
      pill.classList.remove('midi-waiting');
      pill.title = deps.t('tipMidiKeyboardFmt', {
        v: deps.midiInput.port?.name || 'unknown',
      });
      pill.setAttribute('aria-label', pill.title);
    } else if (
      deps.isRescanRunning() &&
      deps.hasRequestMIDIAccess() &&
      !deps.isPracticeActive?.()
    ) {
      // Auto-rescan poller is running (= we know MIDI is supported
      // but no port has shown up yet) AND the user is still on the
      // title / pre-practice screen. Show a "waiting" hourglass so
      // they see the app is actively listening rather than silently
      // mic-only. Once practice starts the poller stays alive (still
      // hot-detects mid-session keyboard plugs), but the indicator
      // collapses to 🎙️ so it stops shouting "MIDI" at a kid who's
      // already committed to a mic session.
      pill.textContent = '🎹⏳';
      pill.classList.remove('midi');
      pill.classList.add('midi-waiting');
      pill.title = deps.t('tipMidiWaiting') || 'Waiting for MIDI keyboard… tap to rescan';
      pill.setAttribute('aria-label', pill.title);
    } else {
      pill.textContent = '🎙️';
      pill.classList.remove('midi');
      pill.classList.remove('midi-waiting');
      pill.title = deps.midiInput.platformBlocked
        ? deps.t('tipIosMidiBlocked')
        : deps.t('tipMicMode');
      pill.setAttribute('aria-label', pill.title);
    }
  }

  return {
    pulseBadge,
    refreshBadge,
    setInputIndicator,
    isAppleMobile: () => isAppleMobileCached,
    isVirtualMidiPort,
  };
}
