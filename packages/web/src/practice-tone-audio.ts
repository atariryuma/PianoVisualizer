// Practice-mode Tone.js audio — Phase 0d batch 33.
//
// Three concerns wrapping the Tone.js Transport + the two synths
// the practice flow uses:
//
//   1. ensureInstruments() — lazy-instantiate the PolySynth (ghost
//      piano playback for listen/rhythm modes) and MembraneSynth
//      (count-in metronome). Idempotent: subsequent calls reuse the
//      cached instances. Tunings (oscillator type, envelope, volume)
//      mirror the legacy values; changing them needs an A/B against
//      a real iPad to stay kid-friendly.
//
//   2. scheduleCountInBeeps(startAudioTime) — delegates to
//      AudioScheduler.scheduleCountInBeeps, packing the lazy synths
//      into the deps bag. Used by startPracticeSection's count-in.
//
//   3. stopPracticeAudio() — Transport.stop + Transport.cancel +
//      cursor.hide + clearHighlights. Called from the section-stop
//      paths (quit, restart, completion) so a paused/ended section
//      doesn't leave a stale highlighted note glowing.
//
// The synth instances stay live across sections (creating a
// PolySynth + MembraneSynth has measurable startup cost on iPad) so
// the factory holds them in closure state. `getInstruments()` exposes
// them so other shell code (startPracticeSection's
// scheduleSectionPlayback call) can hand them to the audio-scheduler.

/** Subset of the Tone.js surface we touch. Pass `Tone` directly
 *  (the npm import / global) in production, or a mock in tests. */
export interface ToneLibRef {
  PolySynth: new (voice: ToneSynthCtor, opts?: ToneSynthOptions) => ToneInstrument;
  Synth: ToneSynthCtor;
  MembraneSynth: new (opts?: ToneMembraneOptions) => ToneInstrument;
  Transport: {
    stop(): void;
    cancel(): void;
  };
  /** 音量プレビューで suspended な AudioContext を user gesture 内で再開する
   *  任意フック（本番 Tone は持つ／テストは省略可）。 */
  start?: () => Promise<void> | void;
  context?: { state?: string };
}

export type ToneSynthCtor = any;

export type ToneSynthOptions = any;

export type ToneMembraneOptions = any;

/** Minimal instrument surface — covers the ctor methods we use here
 *  (`toDestination`, `volume`) plus `triggerAttackRelease` so the
 *  same instance can be handed to AudioScheduler.scheduleSectionPlayback
 *  without a wider `as any` cast. The AudioScheduler module declares
 *  its own ToneInstrument with the same shape; keeping them
 *  structurally compatible avoids the cross-module mismatch.
 *
 *  // eslint-disable-next-line @typescript-eslint/no-explicit-any */
export interface ToneInstrument {
  toDestination(): ToneInstrument;
  volume: { value: number };
  /** PolySynth voice cap (default 32 in Tone 14). Set higher so dense
   *  full-song listen playback doesn't drop notes. Absent on MembraneSynth. */
  maxPolyphony?: number;

  triggerAttackRelease(...args: any[]): unknown;
}

/** Practice-tone-audio's view of the AudioScheduler module. */
export interface AudioSchedulerRef {
  scheduleCountInBeeps(
    instruments: { metronome: ToneInstrument | null; piano: ToneInstrument | null },
    startAudioTime: number,
    opts: { countInMs: number; beats: number; clickMs?: number; goMs?: number }
  ): void;
}

/** Cursor surface stopPracticeAudio touches. Matches the
 *  hideCursor + clearHighlights subset of OsmdAdapter. */
export interface PracticeAudioCursor {
  hideCursor(): void;
  clearHighlights(): void;
}

export interface PracticeToneAudioDeps {
  /** Pass `Tone` (the npm package / global). Undefined when Tone
   *  isn't available (test envs / boot-before-load) — every method
   *  no-ops gracefully. */
  Tone: ToneLibRef | undefined;
  /** AudioScheduler module surface. Pulled in via deps so the shell
   *  can hand its existing import. */
  audioScheduler: AudioSchedulerRef;
  /** OSMD cursor adapter — only hideCursor + clearHighlights are
   *  used here (stop path). */
  cursor: PracticeAudioCursor;
  /** Read at call time so a tempo change between section starts
   *  uses the fresh count-in length. */
  getCountInMs: () => number;
  /** Read at call time — the tempo-derived count-in beat count from
   *  computePracticeTimings. When present, overrides `beats` so the
   *  clicks stay one real beat apart (a fast song counts in more beats,
   *  a slow one fewer). Falls back to `beats` for older call sites. */
  getCountInBeats?: () => number;
  /** クリック 1 個分の間隔 ms（複合拍子は付点四分）。省略時は
   *  countInMs / beats（従来互換）。 */
  getCountInClickMs?: () => number;
  /** GO（ダウンビート）の時刻 ms。弱起では countInMs より後ろ。
   *  省略時 countInMs（従来互換）。 */
  getCountInGoMs?: () => number;
  /** Fallback beats per count-in when getCountInBeats is absent.
   *  Default 4 ("4, 3, 2, 1, GO!"). */
  beats?: number;
  /** Kid/parent volume balance, percent 0-100 per layer (100 = the
   *  tuned default dB). Read fresh on ensureInstruments AND on
   *  applyVolumes() so a settings-panel change lands mid-session. */
  getVolumes?: () => { ghost: number; backing: number; metronome: number };
}

export interface PracticeToneAudio {
  /** Idempotently build the PolySynth + MembraneSynth pair. */
  ensureInstruments(): void;
  /** Re-apply deps.getVolumes() to the live instruments — the settings
   *  panel calls this so slider drags are audible immediately. No-op
   *  before ensureInstruments. */
  applyVolumes(): void;
  /** 音量スライダー調整時のプレビュー発音。該当層を1発だけ鳴らして
   *  新しい音量を即座に聴かせる。無音・非再生時（タイトル画面など）でも
   *  "効いた" と分かるよう、必要なら user gesture 内で AudioContext を再開
   *  してから鳴らす。ベストエフォート（suspended のまま等は無音で無害）。 */
  previewVolume(layer: 'ghost' | 'backing' | 'metronome'): void;
  /** SE（最小版）: スタンプ獲得の節目に結果画面で1回だけ鳴らす、控えめな
   *  上行アルペジオ（メロディ音色・低ベロシティ）。AudioContext が running の
   *  時だけ鳴らし、suspended なら黙ってスキップ（無理に resume しない）。 */
  playStampCelebration(): void;
  /** Schedule the audible "4, 3, 2, 1, GO!" preceding section start. */
  scheduleCountIn(startAudioTime: number): void;
  /** Tone.Transport stop + cancel, hide cursor + clear notehead
   *  highlights. */
  stopPracticeAudio(): void;
  /** Read-only access to the lazy-built instruments. The shell hands
   *  these to AudioScheduler.scheduleSectionPlayback. */
  getInstruments(): {
    piano: ToneInstrument | null;
    metronome: ToneInstrument | null;
    melody: ToneInstrument | null;
  };
}

const DEFAULT_BEATS = 4;

// Tuned base levels (dB) at 100% — the pre-0.15 fixed values. The
// settings-panel volume sliders scale from here: dB = base + 20·log10(pct/100),
// so 100% keeps the A/B'd balance, 50% ≈ -6dB per layer, 0% mutes.
const GHOST_BASE_DB = -14;
const BACKING_BASE_DB = -17;
const METRONOME_BASE_DB = -10;

function pctToDb(baseDb: number, pct: number): number {
  if (!(pct > 0)) return -Infinity; // slider at 0 = mute (also catches NaN)
  return baseDb + 20 * Math.log10(Math.min(100, pct) / 100);
}

export function createPracticeToneAudio(deps: PracticeToneAudioDeps): PracticeToneAudio {
  let piano: ToneInstrument | null = null;
  let metronome: ToneInstrument | null = null;
  let melody: ToneInstrument | null = null;
  const beats = deps.beats ?? DEFAULT_BEATS;

  function applyVolumes(): void {
    const v = deps.getVolumes?.() ?? { ghost: 100, backing: 100, metronome: 100 };
    if (piano) piano.volume.value = pctToDb(GHOST_BASE_DB, v.ghost);
    if (melody) melody.volume.value = pctToDb(BACKING_BASE_DB, v.backing);
    if (metronome) metronome.volume.value = pctToDb(METRONOME_BASE_DB, v.metronome);
  }

  function ensureInstruments(): void {
    if (piano || !deps.Tone) return;
    piano = new deps.Tone.PolySynth(deps.Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.25, release: 0.6 },
    }).toDestination();
    // Raise the voice cap above Tone's default 32 so a dense full-song
    // listen (chords + backing) doesn't steal/drop notes mid-playback.
    piano.maxPolyphony = 64;
    // おともパート（Voice 等）用。GM の合成ボイス音は品質が低く違和感
    // が勝つため、練習系アプリの標準（SmartMusic「My Part はピアノ音で
    // 再生」）に合わせてピアノ系音色で統一。ゴーストより気持ち柔らかい
    // sine + 長めのリリースでレガートな歌のラインに寄せ、音量はゴースト
    // 比 約70%（-3dB）— お手本再生でも自分のパートが主役に聞こえる比率。
    melody = new deps.Tone.PolySynth(deps.Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.25, sustain: 0.4, release: 0.8 },
    }).toDestination();
    melody.maxPolyphony = 48;
    metronome = new deps.Tone.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
    }).toDestination();
    // Volumes come from the prefs-driven balance (100% = the tuned
    // GHOST/BACKING/METRONOME_BASE_DB values above).
    applyVolumes();
  }

  function previewVolume(layer: 'ghost' | 'backing' | 'metronome'): void {
    if (!deps.Tone) return;
    const fire = (): void => {
      ensureInstruments();
      applyVolumes();
      try {
        // 秒指定でトリガ（Transport 未起動でも鳴る。'8n' 等は BPM 依存）。
        if (layer === 'ghost') piano?.triggerAttackRelease('C4', 0.3);
        else if (layer === 'backing') melody?.triggerAttackRelease('C4', 0.3);
        else metronome?.triggerAttackRelease('C2', 0.08);
      } catch {
        /* disposed instrument / suspended ctx — preview is best-effort */
      }
    };
    // suspended（未開始）なら user gesture 内で再開してから鳴らす。
    if (deps.Tone.context?.state === 'running') {
      fire();
      return;
    }
    const p = deps.Tone.start?.();
    if (p && typeof (p as Promise<void>).then === 'function') {
      (p as Promise<void>).then(fire, fire);
    } else {
      fire();
    }
  }

  function playStampCelebration(): void {
    if (!deps.Tone) return;
    // 結果画面（演奏後）でのみ呼ばれる想定。ctx が running の時だけ鳴らす。
    // suspended（タイトル等）なら黙ってスキップ — user gesture 外なので resume
    // しない（後から遅れて鳴るのを防ぐ）。
    if (deps.Tone.context?.state !== 'running') return;
    ensureInstruments();
    if (!melody) return;
    try {
      // 柔らかい上行アルペジオ C5→E5→G5 を低ベロシティで（ピアノ音色の控えめな
      // 祝福。ゲーム的な "ピロン" は使わない）。相対時間 '+X' は Tone.now() 基準
      // で Transport 非依存。
      melody.triggerAttackRelease('C5', 0.2, '+0', 0.26);
      melody.triggerAttackRelease('E5', 0.2, '+0.1', 0.26);
      melody.triggerAttackRelease('G5', 0.55, '+0.2', 0.3);
    } catch {
      /* disposed / suspended — best-effort */
    }
  }

  function scheduleCountIn(startAudioTime: number): void {
    if (!deps.Tone) return;
    deps.audioScheduler.scheduleCountInBeeps({ metronome, piano }, startAudioTime, {
      countInMs: deps.getCountInMs(),
      beats: deps.getCountInBeats?.() ?? beats,
      // 拍子・弱起対応のクリック列情報（practice-timings が算出）。
      // guided / rhythm / listen すべて同じ列で数える。
      clickMs: deps.getCountInClickMs?.(),
      goMs: deps.getCountInGoMs?.(),
    });
  }

  function stopPracticeAudio(): void {
    try {
      if (deps.Tone) {
        deps.Tone.Transport.stop();
        deps.Tone.Transport.cancel();
      }
    } catch {
      /* Transport.stop can throw on a never-started Transport */
    }
    // 発音済みの音は Transport と無関係にエンベロープが走るので、
    // quit 直後の鳴り残り（遅テンポの全音符・おともパートのレガート音）
    // を明示的に殺す。releaseAll は PolySynth のみ持つので optional 呼び。
    for (const inst of [piano, melody]) {
      try {
        (inst as { releaseAll?: () => void } | null)?.releaseAll?.();
      } catch {
        /* disposed instrument etc. — 鳴り残り解消はベストエフォート */
      }
    }
    deps.cursor.hideCursor();
    // Drop the active notehead pink so a paused/ended section
    // doesn't leave a stale highlighted note glowing in the score.
    deps.cursor.clearHighlights();
  }

  return {
    ensureInstruments,
    applyVolumes,
    previewVolume,
    playStampCelebration,
    scheduleCountIn,
    stopPracticeAudio,
    getInstruments: () => ({ piano, metronome, melody }),
  };
}
