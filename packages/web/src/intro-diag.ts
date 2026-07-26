// Intro-hint diagnostic system — Phase 0d batch 50.
//
// Four tightly related helpers, all touching the `introHint` element
// + `state.lastIntroDiag` cache:
//
//   - setIntroHintDiagnostic(line1, line2?) — write the two-line hint
//     (line2 styled as a subdued sub-line) and toggle visibility.
//
//   - showIntroDiag(thunk) — store the (string-producing) thunk on
//     state so a `langchange` event can re-run it with fresh
//     translations, then run it once now. Callers wrap their own
//     `setIntroHintDiagnostic(t('foo'), t('bar'))` invocations in this
//     so the diagnostic auto-relocalizes.
//
//   - clearIntroDiagCache() — drop the pending thunk (used on transitions
//     where the diag stops being relevant, e.g. an audio re-acquire that
//     succeeded).
//
//   - showMidiWaitingHint() — the iPad-WebMIDI / Web MIDI Browser hint.
//     Once-per-session guard via `state._midiWaitingShown`. Composes
//     showIntroDiag + setIntroHintDiagnostic with two i18n keys that
//     have plain-English fallbacks so the hint still renders if i18n
//     translates to undefined.

import { isPinnedTo, type InputSourcePref } from '@piano/core';

export interface IntroDiagStateRef {
  /** Last-applied diagnostic thunk, re-run on language change. `null`
   *  when no diag is showing. */
  lastIntroDiag: (() => void) | null;
  /** Once-per-session guard so showMidiWaitingHint only fires its
   *  one-time iPad/WMB pairing nudge. */
  _midiWaitingShown?: boolean;
}

export interface IntroDiagDeps {
  state: IntroDiagStateRef;
  /** introHint element. Optional null guard mirrors the legacy
   *  defensive check (DOM bag may be partially set up at boot). */
  introHintEl: HTMLElement | null;
  /** True iff the runtime is iOS WebKit (iPad/iPhone Safari & friends).
   *  Held by deps so the test can flip it. */
  isAppleMobile: () => boolean;
  /** Production: `'requestMIDIAccess' in navigator`. Held by deps so
   *  the test can simulate WebKit-without-Web-MIDI. */
  hasRequestMIDIAccess: () => boolean;
  /** ネイティブ iOS（Capacitor）の OS 標準 Bluetooth-MIDI ペアリングが
   *  使えるか。true のとき待機ヒントの2行目は WMB の説明ではなく
   *  「⚙ → 🔵 でつなぐ」の実手順を出す（WMB 文言はネイティブでは意味不明）。
   *  省略時 false（旧挙動）。 */
  hasNativePairing?: () => boolean;
  /**
   * Is `navigator.requestMIDIAccess` OUR OWN native polyfill (the Capacitor
   * build) rather than a third-party iOS wrapper's?
   *
   * The waiting hint exists for Web MIDI Browser, where the microphone is not
   * available at all — there, a keyboard really is the only way to play, so
   * "waiting for MIDI, go pair one" is the correct and helpful thing to say. Our
   * own app has a working mic, so the same message is simply wrong: it tells a
   * player whose microphone is live that nothing is listening.
   *
   * It was shown anyway because the gate is `isAppleMobile && requestMIDIAccess
   * exists`, and on the native build that function exists because WE installed
   * it. Same misclassification as the mic skip in mic-lifecycle.
   *
   * Optional; absent → treated as foreign, i.e. the previous behaviour.
   */
  isOwnWebMidiPolyfill?: () => boolean;
  /** The player's input-source setting. Pinned to `midi` means the hint IS right
   *  even on our own build — they asked for keyboard-only and none is attached,
   *  so nothing else is going to listen. */
  getInputSourcePref?: () => InputSourcePref;
  /** i18n. */
  t: (key: string) => string;
}

export interface IntroDiag {
  setDiagnostic(line1: string, line2?: string): void;
  showDiag(thunk: () => void): void;
  clearCache(): void;
  showMidiWaitingHint(): void;
}

export function createIntroDiag(deps: IntroDiagDeps): IntroDiag {
  const setDiagnostic = (line1: string, line2?: string): void => {
    if (!deps.introHintEl) return;
    // DOM 組み立てで描画（innerHTML 連結をやめる）。line1/line2 には
    // MIDI/BLE の**デバイス名やエラーメッセージ**が流れ込む — BLE の
    // アドバタイズ名は任意文字列を名乗れる外部入力なので、HTML として
    // 解釈させない（子ども向けアプリの defense-in-depth）。
    const el = deps.introHintEl;
    el.textContent = line1;
    if (line2) {
      el.appendChild(document.createElement('br'));
      const span = document.createElement('span');
      span.setAttribute(
        'style',
        'font-size:.78rem;color:rgba(255,255,255,.55);letter-spacing:.04em'
      );
      span.textContent = line2;
      el.appendChild(span);
    }
    el.classList.add('visible');
  };

  const showDiag = (thunk: () => void): void => {
    deps.state.lastIntroDiag = thunk;
    thunk();
  };

  const clearCache = (): void => {
    deps.state.lastIntroDiag = null;
  };

  const showMidiWaitingHint = (): void => {
    if (!deps.isAppleMobile() || !deps.hasRequestMIDIAccess()) return;
    // Our own native app has a microphone, so there is nothing to wait FOR —
    // unless the player pinned the keyboard, in which case nothing else is
    // listening and the nudge is exactly right. (See isOwnWebMidiPolyfill.)
    if (
      deps.isOwnWebMidiPolyfill?.() &&
      !isPinnedTo(deps.getInputSourcePref?.() ?? 'auto', 'midi')
    ) {
      return;
    }
    // Once per session — re-shows would noise up the lifecycle.
    // (attach は state._midiWaitingShown を false に戻すので、切断→ゼロ
    // ポートに戻ったときは再表示できる。)
    if (deps.state._midiWaitingShown) return;
    deps.state._midiWaitingShown = true;
    const native = !!deps.hasNativePairing?.();
    showDiag(() =>
      setDiagnostic(
        deps.t('diagMidiWaiting') || 'Waiting for MIDI…',
        native
          ? deps.t('diagNativeBleHint') || 'Tap ⚙ then 🔵 to connect a Bluetooth keyboard.'
          : deps.t('diagWmbHint') || 'Pair your keyboard in Web MIDI Browser, then return here.'
      )
    );
  };

  return { setDiagnostic, showDiag, clearCache, showMidiWaitingHint };
}
