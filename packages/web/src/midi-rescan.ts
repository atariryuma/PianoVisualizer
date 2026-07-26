// MIDI auto-rescan poller + MIDIAccess cache + manual rescan —
// Phase 0d batch 26.
//
// Three coupled concerns wrapped in one factory:
//
//   1. ensureAccess(force?) — lazy MIDIAccess request with cache.
//      sysex ポリシーはプラットフォーム分岐（実装は ensureAccess 内）:
//      Apple mobile（iPad/iPhone の Web MIDI Browser）のみ `sysex:true`
//      を先に試し（WMB は sysex 許可時しか BLE-MIDI を公開しない）、
//      拒否されたら `sysex:false` へフォールバック。デスクトップ /
//      Android Chrome は常に `sysex:false` のみ — ノート+CC に SysEx は
//      不要で、sysex:true を要求するとページ読込ごとに無関係な権限
//      プロンプトが出るため。Force=true drops the cached access (used
//      by the explicit user-rescan path). Wires the cached access's
//      `onstatechange` so a desktop-Chrome hot-replug attaches the
//      fresh port without going through the poller.
//
//   2. rescan(silent?) — manual one-shot enumeration. Iterates
//      access.inputs in two passes: spec-strict (state==='connected')
//      and a WMB workaround (any non-virtual port). On silent=false
//      surfaces a diagnostic on introHint when nothing connects.
//
//   3. start/stop autoRescan — ramped poller. 1 s for the first 30 s
//      (catches "open page, then pair keyboard" within 1 s),
//      2.5 s out to 5 min (network-friendly background listening),
//      10 s long-tail. Periodically forces a fresh MIDIAccess to work
//      around WMB's stale-enumeration quirk: re-pairing in WMB
//      sometimes doesn't propagate via statechange to a cached
//      MIDIAccess. The force cadence is fast (every 2 ticks) on
//      Apple-mobile during the first 30 s, slow (every 5) elsewhere.
//
// All side-effects (attach/detach, indicator paint, intro-hint diag,
// performance.now reading) flow through the deps bag — zero shell
// global reads inside the module. State (cached access, timer, tick
// counter) lives in the factory closure.

import { isPinnedTo, type InputSourcePref } from '@piano/core';
import type { MidiAccessRef, MidiPortRef, MidiPortsInputRef } from './midi-ports';
import { gatherMidiInputs } from './midi-ports';

export interface MidiRescanDiagnostic {
  /** Primary translated message — what's wrong / status. */
  line1: string;
  /** Optional helper sub-line (e.g. "make sure your keyboard is paired"). */
  line2?: string;
}

/** Subset of `navigator` we touch — kept tight so the module is
 *  testable without a happy-dom navigator polyfill. */
export interface MidiRescanNavigator {
  requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MidiAccessRef>;
}

/** Things the rescan logic needs to flip on the rest of the app. */
export interface MidiRescanDeps {
  midiInput: MidiPortsInputRef;
  attachMidiPort: (port: MidiPortRef | null) => boolean;
  detachMidiPort: (port: MidiPortRef | null) => void;

  /** Read at call time so the platform check stays cheap. */
  isAppleMobile: () => boolean;

  /** ネイティブ iOS の OS ペアリング画面が使えるか — no-port 診断の2行目を
   *  「⚙ → 🔵 でつなぐ」に切り替える（WMB 文言はネイティブで意味不明）。
   *  省略時 false（旧挙動）。 */
  hasNativePairing?: () => boolean;

  /** "Render this localized diagnostic on the introHint sticky bar."
   *  The thunk shape is so a language change can re-run the same
   *  closure with fresh translations. The shell wraps showIntroDiag
   *  + setIntroHintDiagnostic in a one-liner. */
  showDiagnostic: (makeLines: () => MidiRescanDiagnostic) => void;

  /** Bilingual translator. Used for the diag messages + nothing else. */
  t: (key: string, vars?: Record<string, string>) => string;

  /** Refresh the input pill — called when start/stop transitions
   *  happen so the hourglass shows/clears immediately. */
  setInputIndicator: () => void;

  /** The navigator surface — pass `navigator` directly in production,
   *  or a mock in tests. */
  navigator: MidiRescanNavigator;

  /** Time source — pulled out so tests can drive the ramped cadence
   *  deterministically. Defaults to performance.now in the shell. */
  now?: () => number;

  /** Timer hooks — lets tests inject vi.useFakeTimers() shims. The
   *  shell passes `setTimeout` / `clearTimeout` directly. */
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;

  /** [Bug fix 2026-05-09 → revised 2026-05-12]
   *  When this returns true the auto-rescan tick STILL enumerates
   *  ports (so a mid-practice hot-plug is recoverable) but skips the
   *  periodic `ensureAccess(force=true)` call. The forced re-request
   *  is the heavy step — it's synchronous-ish in Chrome and caused
   *  dt=50 ms frame spikes during playback (server.log 03:52
   *  window). The cheaper enumeration alone is enough for the
   *  typical hot-plug case; we only lose the WMB
   *  stale-enumeration-cache workaround during practice, which is
   *  acceptable since the kid is unlikely to be re-pairing in WMB
   *  mid-song. */
  isPaused?: () => boolean;
  /** The player's input-source setting. `mic` suppresses the force-fresh
   *  MIDIAccess re-request (see the call site); plain enumeration is unaffected.
   *  The whole pref rather than a bespoke boolean, so the three modules that ask
   *  about it stop inventing three names for `pref === 'mic' | 'midi'`. */
  getInputSourcePref?: () => InputSourcePref;
  /** Is `navigator.requestMIDIAccess` OUR native polyfill? It re-enumerates on
   *  every plain poll, so the stale-cache force-refresh is dead weight there. */
  isOwnWebMidiPolyfill?: () => boolean;
}

export interface MidiRescan {
  /** Lazy MIDIAccess + onstatechange handler install. Force=true
   *  drops the cache (manual user rescan path). */
  ensureAccess(force?: boolean): Promise<MidiAccessRef>;
  /** One-shot enumeration + attempted attach. Returns true on
   *  success. silent=false surfaces a diag on no-port / failure. */
  rescan(silent?: boolean): Promise<boolean>;
  /** Begin the ramped poller (idempotent). */
  startAutoRescan(): void;
  /** Stop the ramped poller (idempotent). */
  stopAutoRescan(): void;
  /** Currently cached MIDIAccess (or null) — the single source of truth
   *  for visibility-resume health checks (verifyAlive). */
  getAccess(): MidiAccessRef | null;
  /** Drop the cached MIDIAccess safely (unhooks onstatechange first).
   *  Used by the devicechange force-fresh path. */
  dropAccessCache(): void;
  /** True when the auto-rescan poller is alive — drives the
   *  midi-indicator's hourglass "waiting" state. */
  isRescanRunning(): boolean;
}

export function createMidiRescan(deps: MidiRescanDeps): MidiRescan {
  const now = deps.now ?? (() => performance.now());
  const setT = deps.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
  const clearT = deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let cachedAccess: MidiAccessRef | null = null;
  /** requestMIDIAccess の in-flight promise。force tick が「投げっぱなし
   *  force + 直後の rescan」で二重リクエストし、敗者の MIDIAccess が
   *  onstatechange 付きでリークしていたのを、同一 promise の共有で排除。 */
  let inflightAccess: Promise<MidiAccessRef> | null = null;
  let timer: unknown = 0;
  let tickCount = 0;
  let startedAt = 0;
  /** stopAutoRescan 後に in-flight tick が resolve して poller が
   *  ゾンビ復活するのを防ぐラッチ。 */
  let pollerActive = false;

  /** キャッシュ済み MIDIAccess を安全に破棄する（onstatechange を外して
   *  から参照を失う）。ensureAccess(force) と手動 rescan の両方で使う。 */
  function dropAccessCache(): void {
    if (cachedAccess) {
      try {
        (cachedAccess as { onstatechange?: unknown }).onstatechange = null;
      } catch {
        /* ignore — best-effort */
      }
      cachedAccess = null;
    }
  }

  // ─── ensureAccess ────────────────────────────────────────────────
  async function ensureAccess(force?: boolean): Promise<MidiAccessRef> {
    if (force) dropAccessCache();
    if (cachedAccess) return cachedAccess;
    // 二重リクエスト排除: force → 即 rescan の並走は同じ promise を共有
    // （force 直後の in-flight は「今まさに取得中の新鮮な access」）。
    if (inflightAccess) return inflightAccess;
    const requestAccess = deps.navigator.requestMIDIAccess;
    if (!requestAccess) {
      throw new Error('Web MIDI API not available');
    }
    const req = requestAccess.bind(deps.navigator);
    inflightAccess = (async () => {
      // sysex policy:
      //   - Apple mobile (iPad / iPhone Web MIDI Browser): try sysex:true
      //     first because WMB only exposes BLE-MIDI when sysex is granted.
      //     Fall back to sysex:false on rejection so a sysex-denied WMB
      //     session can still see USB-class devices.
      //   - Desktop Chrome / Android Chrome: sysex:false only. We don't
      //     need SysEx for note + CC events, and asking sysex:true here
      //     would surface an unrelated permission prompt (the "Allow MIDI
      //     devices with SysEx?" dialog) on every page load.
      let access: MidiAccessRef;
      if (deps.isAppleMobile()) {
        let sysexErr: Error | null = null;
        try {
          access = await req({ sysex: true });
        } catch (e) {
          sysexErr = e as Error;
          try {
            access = await req({ sysex: false });
          } catch (e2) {
            const err2 = e2 as Error;
            const reason =
              '[sysex:true] ' +
              (sysexErr.name || 'Err') +
              ': ' +
              sysexErr.message +
              ' / [sysex:false] ' +
              (err2.name || 'Err') +
              ': ' +
              err2.message;
            throw new Error(reason);
          }
        }
      } else {
        access = await req({ sysex: false });
      }

      // Wire the statechange handler — desktop-Chrome path that
      // handles hot-replug without the poller.
      (access as { onstatechange?: (e: { port?: MidiPortRef | null }) => void }).onstatechange = (
        e
      ) => {
        const port = e.port;
        if (!port || port.type !== 'input') return;
        console.log('[MIDI] state change: "' + port.name + '" → ' + port.state);
        // M2: attach even when MIDI is already enabled — a second
        // keyboard / a dual-port device's other port joins the bound
        // set (attach dedupes already-bound ports + refuses under BLE).
        if (port.state === 'connected') deps.attachMidiPort(port);
        else if (port.state === 'disconnected') deps.detachMidiPort(port);
      };

      cachedAccess = access;
      return access;
    })();
    try {
      return await inflightAccess;
    } finally {
      inflightAccess = null;
    }
  }

  // ─── rescan ──────────────────────────────────────────────────────
  async function rescan(silent?: boolean): Promise<boolean> {
    if (!deps.navigator.requestMIDIAccess) {
      if (!silent) {
        deps.showDiagnostic(() => ({ line1: deps.t('diagWebMidiUnsupported') }));
      }
      return false;
    }
    // A user-initiated rescan (silent=false) drops the cached
    // MIDIAccess so a stale enumeration (e.g. WMB or post-sleep) can
    // be refreshed.
    if (!silent) dropAccessCache();

    try {
      const access = await ensureAccess();
      const ports = gatherMidiInputs(access);
      const portInfo = ports.map((p) => (p.name || 'unnamed') + '/' + p.state).join(', ');
      console.log('[MIDI] rescan ports: [' + portInfo + ']');

      if (ports.length === 0) {
        if (!silent) {
          // Web MIDI Browser quirk: devices already paired at startup
          // are often invisible — re-pairing usually surfaces them.
          // Native iOS gets the actual in-app procedure (⚙ → 🔵) instead.
          deps.showDiagnostic(() => ({
            line1: deps.t('diagNoMidiPort'),
            line2: deps.t(
              deps.hasNativePairing?.()
                ? 'diagNativeBleHint'
                : deps.isAppleMobile()
                  ? 'diagWmbHint'
                  : 'diagConnectHint'
            ),
          }));
        }
        return false;
      }

      // Strict pass — by-the-spec. M2: bind EVERY connected port
      // (industry-standard "listen on all inputs"); success if any bound.
      let attachedAny = false;
      for (const port of ports) {
        if (port.state === 'connected' && deps.attachMidiPort(port)) {
          attachedAny = true;
        }
      }
      if (attachedAny) return true;
      // @WMB-WORKAROUND: WMB pre-paired BLE keyboards on iPad can show
      // up with state='unknown' until first open(). Gated to Apple
      // mobile so desktop / Android don't accidentally attach a
      // transient pre-init port (IAC Driver mid-bringup, a USB device
      // still negotiating descriptors, etc.) and steal focus from the
      // real keyboard that's about to flip to 'connected'.
      if (deps.isAppleMobile()) {
        for (const port of ports) {
          if (!deps.midiInput.enabled && deps.attachMidiPort(port)) {
            console.log('[MIDI] rescan attached non-connected port (WMB quirk): ' + port.name);
            return true;
          }
        }
      }
      // /@WMB-WORKAROUND

      if (!silent) {
        deps.showDiagnostic(() => ({
          line1: deps.t('diagDetectedFmt', { v: portInfo }),
          line2: deps.t('diagCouldNotConnect'),
        }));
      }
      return false;
    } catch (e) {
      const err = e as Error;
      console.warn('[MIDI] rescan failed:', err.message);
      if (!silent) {
        deps.showDiagnostic(() => ({ line1: deps.t('diagMidiError'), line2: err.message }));
      }
      return false;
    }
  }

  // ─── auto-rescan poller (ramped cadence) ────────────────────────
  function startAutoRescan(): void {
    if (timer) return;
    pollerActive = true;
    tickCount = 0;
    startedAt = now();
    scheduleNext();
    deps.setInputIndicator();
  }

  function scheduleNext(): void {
    if (!pollerActive) return;
    const elapsed = now() - startedAt;
    let delay: number;
    if (elapsed < 30_000) delay = 1_000;
    else if (elapsed < 5 * 60_000) delay = 2_500;
    else delay = 10_000;

    timer = setT(() => {
      if (deps.midiInput.enabled || !deps.navigator.requestMIDIAccess) {
        stopAutoRescan();
        return;
      }
      tickCount++;
      // Periodically force a fresh MIDIAccess. WMB caches port
      // enumeration and re-pairing doesn't always re-fire statechange.
      // @WMB-WORKAROUND: the fast-window 2-tick force is tuned for
      // WMB's stale-cache; on desktop browsers a 5-tick force is
      // plenty. Skipped entirely during practice playback because the
      // synchronous-ish requestMIDIAccess re-request triggered
      // dt=50 ms frame spikes (see isPaused JSDoc).
      const elapsedNow = now() - startedAt;
      const forceEvery = deps.isAppleMobile() && elapsedNow < 30_000 ? 2 : 5;
      // /@WMB-WORKAROUND
      //
      // The force exists ONLY to beat Web MIDI Browser's stale enumeration
      // cache. Skip it when it cannot help or is not wanted:
      //   • our own native polyfill re-enumerates CoreMIDI on every plain poll,
      //     so forcing there buys nothing and costs a bridge round-trip;
      //   • a player who pinned 🎙️ is not waiting for a keyboard at all.
      // It is the exact call CLAUDE.md records as the dt=50 ms frame-spike
      // source, and the poller never self-stops without a port — so on the
      // shipped default (auto, no keyboard, live mic) it was firing forever.
      // Plain enumeration still runs, so a keyboard is still found and bound.
      const forceHelps =
        !deps.isOwnWebMidiPolyfill?.() && !isPinnedTo(deps.getInputSourcePref?.() ?? 'auto', 'mic');
      const force = !deps.isPaused?.() && forceHelps && tickCount % forceEvery === 0;
      if (force) {
        console.log('[MIDI] auto-rescan: forcing fresh MIDIAccess (tick=' + tickCount + ')');
        ensureAccess(true).catch(() => {});
      }
      rescan(true).then((ok) => {
        if (ok) {
          stopAutoRescan();
        } else if (pollerActive && !deps.midiInput.enabled) {
          // pollerActive 再確認 — tick 走行中に外部から stopAutoRescan
          // されたら再スケジュールしない（ゾンビ復活防止）。
          scheduleNext();
        }
      });
    }, delay);
  }

  function stopAutoRescan(): void {
    pollerActive = false;
    if (timer) {
      clearT(timer);
      timer = 0;
      // Clear the "waiting" hourglass on the badge when the poller
      // stops (either we connected, or we gave up).
      deps.setInputIndicator();
    }
    tickCount = 0;
  }

  function isRescanRunning(): boolean {
    return !!timer;
  }

  return {
    ensureAccess,
    rescan,
    startAutoRescan,
    stopAutoRescan,
    isRescanRunning,
    /** 現在キャッシュ中の MIDIAccess（visibility 復帰の verifyAlive 用）。
     *  shell 側ミラーの分裂バグを解消するため、実キャッシュを一元公開。 */
    getAccess: () => cachedAccess,
    dropAccessCache,
  };
}
