// Start-practice-section orchestrator — Phase 0d batch 39.
//
// The big-bang setup that runs when the kid hits "▶ Start practice"
// (or transitions to the next section after completing one). Walks
// the full state machine:
//
//   1. Hide intro hint, lazy-load the score if needed.
//   2. Recompute count-in / lookahead lengths for the section's
//      tempo (must run BEFORE buildSectionNotes — note timeMs bakes
//      in COUNT_IN_MS).
//   3. Build the per-section timeline (full-song listen takes a
//      different shape — anchors on the first note's timeSec).
//   4. Reset all per-section practice + state counters (hits,
//      misses, combos, pendingHolds, flow, etc.).
//   5. Paint the practice HUD (section name, tempo %, progress).
//   6. Sync layout + show input indicator + request wake lock.
//   7. Show the section banner ('Intro' 👑 etc.) — full-song listen
//      shows the song title instead.
//   8. Position OSMD's cursor at the section's first note;
//      reset-scroll-throttle so the new section's first scroll
//      isn't swallowed by the previous one's last frame.
//   9. Audio setup branches by mode:
//      - guided: cursor visible, schedule count-in, wait for input.
//      - rhythm / listen: schedule full timeline (ghost forced on
//        for listen; rhythm respects practice.ghostOn). Transport
//        starts at startAudioTime ABSOLUTE so beep 0 lines up with
//        Transport.position 0.
//   10. Probe AudioContext.outputLatency + baseLatency, write
//       practice.audioOffsetMs via PianoCore.pickAudioOffsetMs
//       (user override wins / clamp AirPods tail / default
//       fallback). On Tone-failure, retain the user override or
//       fall back to default.
//
// Side-effects fan out through deps; the function itself is async.
// The shell wraps this in the legacy `startPracticeSection(idx)`
// entry-point.

/** Generic OSMD-derived note shape — same as section-notes.ts. */
export interface OsmdLikeNote {
  hand?: string;
  midi: number;
  timeSec?: number;
  durSec?: number;
  timeMs?: number;
  durMs?: number;
  measureIdx?: number;
  inBarQuarters?: number;
  hit?: boolean;
  missed?: boolean;
  _filtered?: boolean;
}

export interface HandRanges {
  lhMin: number;
  lhMax: number;
  rhMin: number;
  rhMax: number;
}

export interface SongSection {
  id?: string;
  nameKey: string;
  startSec?: number;
  endSec?: number;
  isBoss?: boolean;
}

export interface CurrentSongRef {
  _loaded?: boolean;
  sections?: SongSection[];
  titleKey: string;
  /** Quarter-note beats per bar for the metronome accent (default 4). */
  beatsPerMeasure?: number;
}

export interface StatePartial {
  flow: number;
  combo: number;
  bestCombo: number;
}

export interface PracticePartial {
  enabled: boolean;
  /** Explicit-pause flag — reset at section start as belt-and-suspenders
   *  so a stray paused=true can't silence a whole fresh section. */
  paused?: boolean;
  sectionIdx: number;
  sectionNotes: OsmdLikeNote[];
  handRanges?: HandRanges;
  laneDrawFromIdx?: number;
  currentNoteIdx: number;
  hits: number;
  misses: number;
  timingScoreSum: number;
  durationScoreSum: number;
  durationScoredCount: number;
  pendingHolds: Map<number, OsmdLikeNote>;
  sectionCombo: number;
  sectionBestCombo: number;
  _completing?: boolean;
  /** 完了猶予タイマー — 再入時に回収する（practice-state-init 参照）。 */
  _completionTimer?: ReturnType<typeof setTimeout> | null;
  _lastProgUpdate?: number;
  _sectionTargetCount?: number;
  _cursorScanIdx?: number;
  _lastCursorNoteIdx?: number;
  /** 凍結クロック（practice-visibility）。セクション開始でクリアする保険。 */
  _frozenRealElapsedMs?: number | null;
  mode: 'guided' | 'rhythm' | 'listen';
  fullSongMode?: boolean;
  tempoPct: number;
  ghostOn?: boolean;
  metronomeOn?: boolean;
  startAudioTime: number;
  audioOffsetMs?: number | null;
}

export interface PrefsPartial {
  audioOffsetMs?: number | null;
}

/** Subset of OsmdAdapter we touch. */
export interface StartSectionOsmdAdapter {
  cursorTo: (measureIdx: number, inBarQuarters: number) => void;
  showCursor: () => void;
  /** Drop the iterator + scroll-tracker state so the section starts
   *  from a clean position. Without this, a song switch / section
   *  retry leaves the OSMD panel scrolled wherever the previous run
   *  ended. */
  resetCursor: () => void;
}

/** Subset of Tone surface we touch. */
export interface StartSectionToneRef {
  start(): Promise<unknown>;
  now(): number;
  context: {
    lookAhead: number;
    rawContext?: { outputLatency?: number; baseLatency?: number };
    outputLatency?: number;
    baseLatency?: number;
  };
  Transport: {
    cancel(): void;
    stop(): void;
    position: number | string;
    start(time?: number | string): void;
  };
}

/** おともパートの再生専用ノート（section-notes の BackingSchedulerNote）。 */
export interface BackingSchedulerNote {
  midi: number;
  timeMs: number;
  durMs: number;
}

/** Audio-scheduler surface for the rhythm/listen branch. */
export interface StartSectionAudioScheduler {
  scheduleSectionPlayback(
    instruments: { metronome: unknown; piano: unknown; melody?: unknown },
    opts: {
      notes: OsmdLikeNote[];
      backingNotes?: BackingSchedulerNote[];
      metronomeOn?: boolean;
      beatMs: number;
      countInMs: number;
      beatsPerMeasure?: number;
    }
  ): void;
}

export interface PickAudioOffsetOptions {
  userOverrideMs: number | null;
  reportedOutMs: number;
  reportedBaseMs: number;
  defaultMs: number;
}

/** DOM bag the practice HUD writes update. */
export interface StartSectionDom {
  ptbSection: { textContent: string };
  ptbTempo: { textContent: string };
  ptbProgress: { textContent: string };
  practiceHud: { classList: { add(c: string): void } };
  osmdContainer: { classList: { add(c: string): void } };
}

/** Subset of midiState we clear at section start so a previous
 *  session's keyboard residue (held keys, sustained-by-pedal keys,
 *  cached chord name) doesn't bleed into the new section's visuals. */
export interface StartSectionMidiState {
  activeNotes: { clear(): void };
  sustainedNotes: { clear(): void };
  lastChordName: string;
  lastChordTimeMs: number;
  recentOnsets: { length: number };
}

export interface StartPracticeSectionDeps {
  state: StatePartial;
  practice: PracticePartial;
  prefs: PrefsPartial;
  getCurrentSong: () => CurrentSongRef | null;
  /** Shared midiState — cleared at section start (parity with the
   *  ptbQuit handler in practice-flow.ts:204-205) so a song switch
   *  or section retry doesn't leave keys lit up from the prior run. */
  midiState: StartSectionMidiState;

  // Tunables
  countInMs: () => number;
  defaultAudioOffsetMs: number;
  remoteLogEnabled: boolean;

  // I/O hooks
  alert: (msg: string) => void;
  remoteLog: (line: string) => void;
  t: (key: string, vars?: Record<string, string>) => string;

  // UI / layout
  hideIntroHint: () => void;
  syncLayout: () => void;
  setInputIndicator: () => void;
  requestWakeLock: () => void;
  showSectionBanner: (sec: { nameKey: string; isBoss?: boolean }) => void;
  dom: StartSectionDom;

  // Score / notes
  loadCurrentScore: () => Promise<void>;
  /** sectionIdx: 開始するセクション。practice.sectionIdx はこの時点で
   *  まだ旧値のため、拍子・弱起アンカーの解決に明示引数で渡す（最小差分）。 */
  recomputePracticeTimings: (sectionIdx?: number) => void;
  buildSectionNotes: (idx: number) => OsmdLikeNote[];
  buildFullSongNotes: () => OsmdLikeNote[];
  /** おともパート（Voice 等）の再生タイムライン。null = 全曲。 */
  buildBackingNotes: (idx: number | null) => BackingSchedulerNote[];
  computeHandRanges: (notes: OsmdLikeNote[]) => HandRanges;

  // OSMD — `osmdAdapter.cursorTo()` advances the cursor; OSMD's own
  // `cursor.update()` (cursorOptions.follow: true) handles scroll.
  osmdAdapter: StartSectionOsmdAdapter;

  // Audio
  Tone: StartSectionToneRef | undefined;
  ensureToneInstruments: () => void;
  scheduleCountInBeeps: (startAudioTime: number) => void;
  audioScheduler: StartSectionAudioScheduler;
  /** Lazy access to the synth pair (created on demand by
   *  practice-tone-audio). Read at call time so the rhythm branch
   *  picks up the just-instantiated synths. */
  getInstruments: () => { piano: unknown; metronome: unknown; melody?: unknown };
  practiceBeatMs: () => number;
  pickAudioOffsetMs: (opts: PickAudioOffsetOptions) => number;
  /** 明示ポーズ（practice-visibility の explicitHold / frozen）の解除。
   *  完了猶予中ポーズ → 結果カード → 再開の経路でラッチが残ると、次の
   *  ポーズ解除が stale な凍結時刻で startAudioTime を破壊するため、
   *  セクション開始で必ず解除する（唯一の強制ポイント）。 */
  clearPracticePause?: () => void;
}

const AUDIO_START_LEAD_SEC = 0.05;

/** enabled=true 〜 audio セットアップ完了までのクロック先置きセンチネル
 *  （秒）。enabled を立てた直後から await Tone.start() 解決までの間も
 *  レンダーループは毎フレーム tick を呼ぶ。前セッションの startAudioTime
 *  が残っていると elapsed が巨大な正値になり、その 1 フレームで全ノーツが
 *  auto-miss / auto-advance されて「レーンが空 + 即完了」になる（iPad の
 *  AudioContext suspend→resume で await が 1 フレームを超えるときだけ
 *  発症 = 「たまにノーツが出ない」）。未来センチネルなら elapsed は大きな
 *  負値になり、tick・レーン・採点のすべてが「まだ始まっていない」として
 *  自然に無視する。実アンカーは audio セットアップ後に上書きされる。 */
const PRE_AUDIO_ANCHOR_SEC = Number.MAX_SAFE_INTEGER;

export function createStartPracticeSection(
  deps: StartPracticeSectionDeps
): (sectionIdx: number) => Promise<void> {
  return async function startPracticeSection(sectionIdx: number): Promise<void> {
    deps.hideIntroHint();
    const song = deps.getCurrentSong();
    if (!song) return;

    // [DIAG-FULLSONG] Entry snapshot — captures the state right before
    // the fullSongMode branch is read so we can correlate stale flags
    // with the wrong-timeline bug.
    if (deps.remoteLogEnabled) {
      console.log(
        '[DIAG-FULLSONG] startPracticeSection enter ' +
          JSON.stringify({
            songId: (song as { id?: string }).id,
            sectionIdx,
            mode: deps.practice.mode,
            fullSongMode: deps.practice.fullSongMode,
            enabled: deps.practice.enabled,
            loaded: !!song._loaded,
            xmlTextCached: !!(song as { _xmlText?: string })._xmlText,
            sectionsLen: song.sections?.length || 0,
          })
      );
    }

    if (!song._loaded) {
      try {
        await deps.loadCurrentScore();
      } catch (e) {
        deps.alert(deps.t('alertScoreLoadFailedFmt', { v: (e as Error).message }));
        return;
      }
    }

    // Lock in count-in / lookahead lengths BEFORE buildSectionNotes
    // — note timeMs bakes in COUNT_IN_MS. sectionIdx を渡すのは
    // 開始セクションの拍子/弱起（GO アンカー）を解決するため。
    deps.recomputePracticeTimings(sectionIdx);

    const sec = song.sections?.[sectionIdx];
    if (!sec) return;

    const isFullSong = deps.practice.mode === 'listen' && !!deps.practice.fullSongMode;

    // ── reset per-section state ──────────────────────────────────
    // 前セッションの明示ポーズラッチを必ず解除（deps コメント参照）。
    deps.clearPracticePause?.();
    // クロックを未来センチネルへ先置きしてから enabled を立てる
    // （PRE_AUDIO_ANCHOR_SEC のコメント参照 — 順序が本質）。
    deps.practice.startAudioTime = PRE_AUDIO_ANCHOR_SEC;
    deps.practice.enabled = true;
    // Belt-and-suspenders: a fresh section must never start paused. All
    // settings-panel exit paths already resume(), but a stray paused=true
    // would hard-gate the entire section (silent — no scoring / cursor).
    deps.practice.paused = false;
    // 凍結クロックも必ず解除（quit 経路が resume() を通らず _frozen が
    // 残った場合の保険 — 残ると新セクションの経過が固まって無音進行しない）。
    deps.practice._frozenRealElapsedMs = null;
    deps.practice.sectionIdx = isFullSong ? 0 : sectionIdx;
    deps.practice.sectionNotes = isFullSong
      ? deps.buildFullSongNotes()
      : deps.buildSectionNotes(sectionIdx);

    // Bug fix (2026-05-08): bail out instead of starting a 0-note
    // session that would re-fire completePracticeSection on the very
    // first tick (the practice loop's "all notes consumed" check
    // would pass immediately). Caller already showed the song panel /
    // result card, so disabling practice here just keeps the kid on
    // the song panel — better than the 1-second flash through the
    // result card we saw in server.log [DIAG-FULLSONG].
    if (!deps.practice.sectionNotes.length) {
      deps.practice.enabled = false;
      if (deps.remoteLogEnabled) {
        console.log(
          '[DIAG-FULLSONG] startPracticeSection ABORT — empty sectionNotes ' +
            JSON.stringify({
              songId: (song as { id?: string }).id,
              isFullSong,
              sectionIdx,
              loaded: !!song._loaded,
              songNotesLen: (song as unknown as { notes?: { length?: number } }).notes?.length || 0,
              sectionsLen: song.sections?.length || 0,
            })
        );
      }
      return;
    }

    if (deps.remoteLogEnabled && deps.practice.sectionNotes.length) {
      logSectionDiag(deps, sec, sectionIdx);
    }

    deps.practice.handRanges = deps.computeHandRanges(deps.practice.sectionNotes);
    deps.practice.laneDrawFromIdx = 0;
    deps.practice.currentNoteIdx = 0;
    deps.practice.hits = 0;
    deps.practice.misses = 0;
    deps.practice.timingScoreSum = 0;
    deps.practice.durationScoreSum = 0;
    deps.practice.durationScoredCount = 0;
    deps.practice.pendingHolds = new Map();
    deps.practice.sectionCombo = 0;
    // Clear midiState residue from the prior session. The ptbQuit
    // handler in practice-flow.ts:204-205 does this on quit, but a
    // direct section-to-section transition (Next button, Retry from
    // result card, song switch from song panel) used to skip the
    // clear — leaving the virtual keyboard showing keys lit from
    // the previous session until the kid touched them.
    deps.midiState.activeNotes.clear();
    deps.midiState.sustainedNotes.clear();
    deps.midiState.lastChordName = '';
    deps.midiState.lastChordTimeMs = 0;
    deps.midiState.recentOnsets.length = 0;
    deps.practice.sectionBestCombo = 0;
    // 前セッションの完了猶予タイマーを回収。quit 経路は practice-flow が
    // 回収するが、Retry / Next / ループ再開 / 曲切替の直接遷移では残った
    // タイマーが 600ms 後に新セッションを誤完了させうる。
    if (deps.practice._completionTimer) {
      clearTimeout(deps.practice._completionTimer);
      deps.practice._completionTimer = null;
    }
    deps.practice._completing = false;
    deps.practice._lastProgUpdate = 0;

    deps.state.flow = 30;
    deps.state.combo = 0;
    deps.state.bestCombo = 0;

    // ── HUD paint ────────────────────────────────────────────────
    deps.dom.ptbSection.textContent = isFullSong
      ? deps.t(song.titleKey)
      : deps.t(sec.nameKey) + (sec.isBoss ? ' 👑' : '');
    // Full-song listen plays at written tempo regardless of
    // practice.tempoPct (see buildFullSongNotes). Reflect that in
    // the HUD.
    deps.dom.ptbTempo.textContent = '🥁 ' + (isFullSong ? 100 : deps.practice.tempoPct) + '%';
    // Exclude _filtered notes from the progress count (auto-skipped).
    deps.practice._sectionTargetCount = deps.practice.sectionNotes.reduce(
      (c, n) => c + (n._filtered ? 0 : 1),
      0
    );
    deps.dom.ptbProgress.textContent = '0 / ' + deps.practice._sectionTargetCount;
    deps.dom.practiceHud.classList.add('visible');
    deps.dom.osmdContainer.classList.add('visible');
    deps.syncLayout();
    deps.setInputIndicator();
    deps.requestWakeLock();

    // ── section banner ───────────────────────────────────────────
    if (isFullSong) {
      deps.showSectionBanner({ nameKey: song.titleKey });
    } else {
      deps.showSectionBanner(sec);
    }

    // ── OSMD cursor (auto-scrolls via cursorOptions.follow:true) ──
    // Reset the iterator + scroll tracker FIRST so the cursor lands
    // on the section's first note from a clean state. Without this,
    // OSMD keeps `cursor.iterator` + the scroller's `scrollTop`
    // wherever the previous section / song ended — so a song switch
    // or "Try playing again" from mid-track would show the score
    // page from the previous run while the count-in is ticking down
    // for the new song's start. Reproduced in screenshot 2026-05-13
    // (La Campanella starting at count-in "2" but panel showing
    // measure 6+ with "ma sempre ben marcato il tema" dynamic).
    deps.osmdAdapter.resetCursor();
    const firstNote = deps.practice.sectionNotes[0];
    if (firstNote) {
      deps.osmdAdapter.cursorTo(firstNote.measureIdx ?? 0, firstNote.inBarQuarters ?? 0);
    }
    deps.osmdAdapter.showCursor();
    // Reset per-frame scan cursor for the lane drawer.
    deps.practice._cursorScanIdx = 0;
    deps.practice._lastCursorNoteIdx = -1;

    // ── audio setup ──────────────────────────────────────────────
    try {
      if (!deps.Tone) throw new Error('Tone.js not loaded');
      await deps.Tone.start();
      // `enabled` + the HUD are set BEFORE this await, so ⏸/quit/return-to-
      // title (or a loop-restart) can fire while Tone.start() is pending. If
      // the session was torn down mid-await, bail before re-arming the
      // Transport — otherwise the section "resurrects" and audio starts
      // playing on the song-panel/title screen. (Quit already ran
      // stopPracticeAudio; the completion-timer + sentinel are guarded too,
      // but `enabled` itself had no post-await recheck.)
      if (!deps.practice.enabled) return;
      deps.ensureToneInstruments();
      deps.Tone.Transport.cancel();
      deps.Tone.Transport.stop();
      deps.Tone.Transport.position = 0;

      if (deps.practice.mode === 'guided') {
        // Guided: cursor visible, lane parks current note at hit line.
        // No section timeline, but we DO run the Transport for the
        // count-in beeps — scheduling them on the Transport (rather than
        // absolute audio time) lets Transport.cancel() on quit kill any
        // still-pending beeps. The guided clock reads context.currentTime
        // directly, so a running Transport doesn't affect note timing.
        deps.osmdAdapter.showCursor();
        deps.practice.startAudioTime = deps.Tone.now();
        deps.scheduleCountInBeeps(deps.practice.startAudioTime);
        deps.Tone.Transport.start(deps.practice.startAudioTime);
      } else {
        // Rhythm / Listen: full timeline scheduling.
        const ghostActive = deps.practice.mode === 'listen' || !!deps.practice.ghostOn;
        const instruments = deps.getInstruments();
        // おともパート（Voice 等）はゴースト設定と独立に常に鳴らす —
        // 伴奏練習では「自分のパートは自分の楽器、歌のパートはアプリ」
        // が業界標準の分担（SmartMusic / Synthesia Background）。
        const backingNotes = deps.buildBackingNotes(isFullSong ? null : sectionIdx);
        deps.audioScheduler.scheduleSectionPlayback(
          {
            metronome: instruments.metronome,
            piano: ghostActive ? instruments.piano : null,
            melody: instruments.melody ?? null,
          },
          {
            notes: deps.practice.sectionNotes,
            backingNotes,
            metronomeOn: deps.practice.metronomeOn,
            beatMs: deps.practiceBeatMs(),
            countInMs: deps.countInMs(),
            beatsPerMeasure: song.beatsPerMeasure,
          }
        );
        // Cursor sync runs per-frame from drawPracticeLane. Pass
        // startAudioTime as an ABSOLUTE audio time so Transport.
        // position 0 lines up with beep 0 (relative '+0.05'
        // anchoring would leave a lookAhead-sized gap).
        deps.practice.startAudioTime = deps.Tone.now() + AUDIO_START_LEAD_SEC;
        deps.scheduleCountInBeeps(deps.practice.startAudioTime);
        deps.Tone.Transport.start(deps.practice.startAudioTime);
        deps.osmdAdapter.showCursor();
      }

      // 多重防御: await 窓の間に（センチネルをすり抜ける何かで）完了
      // タイマーが arm されていてもここで回収する。enabled は既に true
      // なので、発火時ガード（enabled && _completing）では防げない。
      if (deps.practice._completionTimer) {
        clearTimeout(deps.practice._completionTimer);
        deps.practice._completionTimer = null;
      }
      deps.practice._completing = false;

      // Audio-latency probe.
      try {
        const ctx = deps.Tone.context.rawContext || deps.Tone.context;
        const out = (ctx.outputLatency || 0) * 1000;
        const base = (ctx.baseLatency || 0) * 1000;
        deps.practice.audioOffsetMs = deps.pickAudioOffsetMs({
          userOverrideMs: deps.prefs.audioOffsetMs ?? null,
          reportedOutMs: out,
          reportedBaseMs: base,
          defaultMs: deps.defaultAudioOffsetMs,
        });
        deps.remoteLog(
          '[Practice] mode=' +
            deps.practice.mode +
            ' tempoPct=' +
            deps.practice.tempoPct +
            ' audioOutputLatency=' +
            out.toFixed(1) +
            'ms' +
            ' audioBaseLatency=' +
            base.toFixed(1) +
            'ms' +
            ' lookAhead=' +
            (deps.Tone.context.lookAhead * 1000).toFixed(1) +
            'ms' +
            ' compensation=' +
            (deps.practice.audioOffsetMs ?? 0).toFixed(1) +
            'ms' +
            (deps.prefs.audioOffsetMs != null ? ' (user)' : ' (auto)')
        );
      } catch {
        deps.practice.audioOffsetMs =
          deps.prefs.audioOffsetMs != null ? deps.prefs.audioOffsetMs : deps.defaultAudioOffsetMs;
      }
    } catch (e) {
      console.error('Tone start failed', e);
      // Pin startAudioTime in whichever clock practiceRealElapsedMs is
      // about to read. The formula uses `tone?.context` to pick:
      //   - Tone-clock seconds when tone.context exists
      //   - page-clock seconds otherwise
      // If Tone is loaded but Transport.start threw (most common
      // failure mode — AudioContext suspended or transport in a bad
      // state), `tone.context.currentTime` is still readable, so we
      // MUST use Tone-clock seconds here. Using page-clock seconds
      // mixes units and would leave practiceRealElapsedMs returning
      // huge negative values forever (lane never scrolls, cursor
      // never moves, scoring stuck). Only fall back to page clock
      // when Tone really is unreachable.
      const t = deps.Tone as { context?: { currentTime?: number }; now?: () => number } | undefined;
      if (t?.context?.currentTime != null) {
        // Prefer Tone.now() because it includes the configured
        // lookAhead — that's the same convention the happy path uses.
        const toneNowSec =
          typeof t.now === 'function' ? t.now() : (t.context.currentTime as number);
        deps.practice.startAudioTime = toneNowSec + AUDIO_START_LEAD_SEC;
      } else {
        deps.practice.startAudioTime = performance.now() / 1000 + AUDIO_START_LEAD_SEC;
      }
      // Tone-failure short-circuits the audio-latency probe — reset
      // audioOffsetMs so the lane uses sane compensation rather
      // than stale state.
      deps.practice.audioOffsetMs =
        deps.prefs.audioOffsetMs != null ? deps.prefs.audioOffsetMs : deps.defaultAudioOffsetMs;
    }
  };
}

/** Verbose load-time diag dump — only fires when remote logging is
 *  enabled. Verifies that the per-section playback timeline (timeMs
 *  values that drive lane + cursor sync) was built correctly. */
function logSectionDiag(
  deps: StartPracticeSectionDeps,
  sec: SongSection,
  sectionIdx: number
): void {
  void sectionIdx;
  const psn = deps.practice.sectionNotes;
  let rCnt = 0;
  let lCnt = 0;
  let filteredCnt = 0;
  for (const n of psn) {
    if (n._filtered) filteredCnt++;
    else if (n.hand === 'R') rCnt++;
    else if (n.hand === 'L') lCnt++;
  }
  const span = (psn[psn.length - 1].timeMs ?? 0) - (psn[0].timeMs ?? 0);
  deps.remoteLog(
    '[DIAG/play.section] sec=' +
      (sec.id ?? '?') +
      ' src=[' +
      (sec.startSec ?? 0).toFixed(3) +
      '..' +
      (sec.endSec ?? 0).toFixed(3) +
      ']s' +
      ' tempoPct=' +
      deps.practice.tempoPct +
      '%' +
      ' speedFactor=' +
      (100 / deps.practice.tempoPct).toFixed(3) +
      ' countIn=' +
      deps.countInMs() +
      'ms' +
      ' notes=' +
      psn.length +
      ' R=' +
      rCnt +
      ' L=' +
      lCnt +
      ' filtered=' +
      filteredCnt +
      ' span=' +
      span.toFixed(0) +
      'ms' +
      ' first.t=' +
      (psn[0].timeMs ?? 0).toFixed(0) +
      ' last.t=' +
      (psn[psn.length - 1].timeMs ?? 0).toFixed(0)
  );
  const fmtPsn = (n: OsmdLikeNote, i: number): string =>
    'i=' +
    i +
    ' t=' +
    (n.timeMs ?? 0).toFixed(0) +
    ' dur=' +
    (n.durMs ?? 0).toFixed(0) +
    ' midi=' +
    n.midi +
    ' ' +
    (n.hand ?? '?') +
    ' m=' +
    (n.measureIdx ?? 0) +
    ' q=' +
    (n.inBarQuarters ?? 0).toFixed(2) +
    (n._filtered ? ' (filtered)' : '');
  const head = Math.min(8, psn.length);
  for (let i = 0; i < head; i++) {
    deps.remoteLog('[DIAG/play.note] ' + fmtPsn(psn[i], i));
  }
  if (psn.length > head + 4) {
    deps.remoteLog('[DIAG/play.note] ... ' + (psn.length - head - 4) + ' notes elided ...');
  }
  for (let i = Math.max(head, psn.length - 4); i < psn.length; i++) {
    deps.remoteLog('[DIAG/play.note] ' + fmtPsn(psn[i], i));
  }
}
