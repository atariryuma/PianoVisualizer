// Audio scheduler — Tone.js timeline + count-in scheduling, lifted out
// of legacy-app.js as a typed shell module (Phase 0c).
//
// Lives under packages/web/src/ rather than @piano/core because it
// directly touches the Tone.js Transport — that's a web-only dep
// (the future Capacitor build will also use it via the Vite bundle,
// but it's not platform-agnostic in the way @piano/core is).
//
// The scheduler doesn't own any Tone state itself; the caller passes
// in the synth/sampler instances it has already created. This keeps
// the module purely about "given these instruments and these notes,
// fire Tone.Transport.schedule the right way" — which is what the
// type-checker can guard.

import * as Tone from 'tone';

/** Minimal Tone instrument shape — abstract enough that a Synth, a
 *  Sampler, or a test stub all satisfy it. The actual Tone classes
 *  have wider surfaces; we only depend on triggerAttackRelease. */
export interface ToneInstrument {
  triggerAttackRelease(noteOrFreq: number | string, duration: number | string, time: number): void;
}

/** Instrument handles the scheduler relies on. Either may be null when
 *  the audio context didn't initialize (mic-only mode, headless test,
 *  embedded WebView without Web Audio) — the scheduler no-ops gracefully
 *  in those cases. */
export interface AudioSchedulerDeps {
  /** Click synth used for count-in beeps + practice metronome. */
  metronome: ToneInstrument | null;
  /** Sampler used for ghost-piano playback in Listen / rhythm-with-ghost. */
  piano: ToneInstrument | null;
  /** おともパート（Voice 等の練習対象外パート）用の音源。null なら
   *  backing はスケジュールされない（単一パート譜・テスト環境）。 */
  melody?: ToneInstrument | null;
}

export interface CountInOptions {
  /** Total count-in duration (ms). The "GO!" beep lands at this offset
   *  unless `goMs` shifts it (弱起). */
  countInMs: number;
  /** Number of click beats inside the count-in. Legacy default: 4. */
  beats: number;
  /** クリック 1 個分の間隔 ms。省略時 countInMs / beats（従来互換）。
   *  複合拍子では付点四分になる（computePracticeTimings.clickMs）。 */
  clickMs?: number;
  /** GO（ダウンビート = 最初の完全小節頭）の時刻 ms。弱起では
   *  countInMs + ピックアップ長 × speedFactor。省略時 countInMs
   *  （従来互換）。クリック列はここから逆向きに配置されるので、
   *  ピックアップ音（timeMs=countInMs〜）はカウントインのクリックの
   *  間の正しい拍位置に落ち、GO がダウンビートに一致する。 */
  goMs?: number;
}

/**
 * Schedule the count-in: `beats` low-pitched clicks (660 Hz) one real
 * beat apart, plus a single high-pitched (990 Hz) "GO!" beep at the
 * downbeat (`goMs`, 省略時 `countInMs`). Clicks are end-anchored (the
 * last click lands one beat before GO) so the interval always equals
 * the song's beat even when the count-in length was clamped.
 *
 * Scheduled on `Tone.Transport` (relative to Transport position 0), NOT
 * at absolute context time — so `Transport.cancel()` on quit / section
 * change kills any still-pending beeps instead of letting them ring out
 * over the song panel. The CALLER must `Tone.Transport.start(startAudioTime)`
 * after this returns (both the rhythm/listen and guided branches do).
 *
 * No-op when `deps.metronome` is null. Wraps the schedule calls in a
 * try/catch — Tone occasionally throws when the AudioContext is
 * suspended at the moment of scheduling and a robust no-op is more
 * useful than a crashed practice mode.
 */
export function scheduleCountInBeeps(
  deps: AudioSchedulerDeps,
  _startAudioTime: number,
  opts: CountInOptions
): void {
  if (!deps.metronome) return;
  const metronome = deps.metronome;
  const beatSec =
    (opts.clickMs && opts.clickMs > 0 ? opts.clickMs : opts.countInMs / opts.beats) / 1000;
  const goSec = (opts.goMs != null && opts.goMs >= 0 ? opts.goMs : opts.countInMs) / 1000;
  // The callback fires later (from Transport's tick), outside the
  // schedule-time try/catch, so guard the synth call there too — a
  // suspended AudioContext at fire time shouldn't crash the tick.
  const beep = (freq: number, dur: number) => (time: number) => {
    try {
      metronome.triggerAttackRelease(freq, dur, time);
    } catch {
      /* suspended context / disposed instrument — lose the click, not the run */
    }
  };
  try {
    // ダウンビート（GO）から逆向きに配置 — goMs=countInMs（弱起なし）の
    // ときは従来の 0, beat, 2*beat, … と同一。弱起では列全体が
    // ピックアップ長ぶん後ろへずれ、ピックアップ音がクリックの間の
    // 正しい拍位置で鳴る。
    for (let i = 0; i < opts.beats; i++) {
      const t = Math.max(0, goSec - (opts.beats - i) * beatSec);
      Tone.Transport.schedule(beep(660, 0.05), t);
    }
    Tone.Transport.schedule(beep(990, 0.08), goSec);
  } catch {
    // Transport.schedule itself threw (Transport in a bad state).
    // Practice still works — the kid loses the count-in click but the
    // section starts on time.
  }
}

/** A note for ghost-piano playback — only the timing-relevant fields. */
export interface SchedulerNote {
  midi: number;
  /** Onset relative to Transport=0, in ms. */
  timeMs: number;
  /** Sustained duration in ms. */
  durMs: number;
}

/** 小節グリッド由来のメトロノームクリック（section-notes.buildMetronomeEvents）。 */
export interface MetronomeSchedulerEvent {
  /** Transport=0 起点の発火時刻 ms。 */
  timeMs: number;
  /** true = 小節頭（880 Hz アクセント）、false = 拍クリック（660 Hz）。 */
  accent: boolean;
}

export interface SectionPlaybackOptions {
  /** The section's notes. Pass an empty array to skip ghost scheduling
   *  entirely (e.g. rhythm mode with ghost OFF). */
  notes: ReadonlyArray<SchedulerNote>;
  /** おともパート（Voice 等）の再生専用タイムライン。ゴースト ON/OFF
   *  とは独立に、`deps.melody` があれば常にスケジュールされる —
   *  伴奏練習では「自分のパートは鳴らさず、歌のパートだけ流れる」が
   *  業界標準（SmartMusic の Accompaniment / Synthesia の Background）。 */
  backingNotes?: ReadonlyArray<SchedulerNote>;
  /** When true, schedule the practice metronome (strong-beat accent on
   *  the downbeat, weak clicks elsewhere) starting after the count-in. */
  metronomeOn: boolean;
  /** Beat duration in ms at the user's chosen tempoPct. */
  beatMs: number;
  /** Count-in duration in ms — the practice metronome starts after this
   *  offset so it doesn't double up with the count-in clicks. */
  countInMs: number;
  /** Quarter-note beats per bar for the accent pattern (4/4 → 4, 3/4 → 3,
   *  6/8 → 3). Default 4. Previously hardcoded to 3, so every 4/4 song
   *  got a waltz accent. `metronomeEvents` があるときは未使用。 */
  beatsPerMeasure?: number;
  /** 小節グリッド由来のクリック列（弱起・複合拍子・途中の拍子変更を
   *  小節線に構造的に整列済み）。null / undefined のときは従来の一様
   *  ループ（beatMs 間隔 + beatsPerMeasure アクセント）へフォールバック。
   *  空配列は「クリック無し」として尊重される。 */
  metronomeEvents?: ReadonlyArray<MetronomeSchedulerEvent> | null;
}

/**
 * Schedule the rhythm- / listen-mode timeline on Tone.Transport. The
 * caller is responsible for `Tone.Transport.start(startAudioTime)`
 * afterward — this function only enqueues; it doesn't transport-start
 * (decoupling lets the caller choose between absolute and relative
 * start times).
 *
 * Ghost playback is gated by `deps.piano` non-null AND `notes.length`
 * > 0. The metronome side is gated by `opts.metronomeOn` AND
 * `deps.metronome` non-null.
 */
export function scheduleSectionPlayback(
  deps: AudioSchedulerDeps,
  opts: SectionPlaybackOptions
): void {
  if (deps.piano && opts.notes.length > 0) {
    const piano = deps.piano;
    for (const n of opts.notes) {
      const dur = Math.max(0.1, (n.durMs / 1000) * 0.85);
      Tone.Transport.schedule((time) => {
        piano.triggerAttackRelease(midiToFreq(n.midi), dur, time);
      }, n.timeMs / 1000);
    }
  }
  const backing = opts.backingNotes ?? [];
  if (deps.melody && backing.length > 0) {
    const melody = deps.melody;
    for (const n of backing) {
      // 歌のラインはレガート寄りに（0.95）— ピアノのゴーストより
      // 減衰させない方がメロディとして聞き取りやすい。
      const dur = Math.max(0.1, (n.durMs / 1000) * 0.95);
      Tone.Transport.schedule((time) => {
        melody.triggerAttackRelease(midiToFreq(n.midi), dur, time);
      }, n.timeMs / 1000);
    }
  }
  if (opts.metronomeOn && deps.metronome && opts.notes.length > 0) {
    const metronome = deps.metronome;
    const events = opts.metronomeEvents;
    if (events != null) {
      // 小節グリッド由来のクリック列 — 小節頭アクセント（880 Hz）が
      // 常に小節線に一致する（弱起・複合拍子・途中の拍子変更込み）。
      // カウントイン区間は builder 側で除外済み（GO がダウンビート）。
      for (const ev of events) {
        const freq = ev.accent ? 880 : 660;
        Tone.Transport.schedule((time) => {
          metronome.triggerAttackRelease(freq, 0.04, time);
        }, ev.timeMs / 1000);
      }
    } else {
      // フォールバック（グリッドの無い曲）: 従来の一様ループ。
      const last = opts.notes[opts.notes.length - 1];
      const totalMs = last.timeMs + last.durMs + 1000;
      const beatsPerBar =
        opts.beatsPerMeasure && opts.beatsPerMeasure > 0 ? opts.beatsPerMeasure : 4;
      // The count-in's "GO!" beep already lands on the downbeat at countInMs,
      // so start the metronome one beat later (beat index 1) to avoid a
      // triple-stacked hit at the section start. Accent (880 Hz) lands on
      // each bar's downbeat; other beats click at 660 Hz.
      for (let t = opts.countInMs + opts.beatMs, beat = 1; t < totalMs; t += opts.beatMs, beat++) {
        const freq = beat % beatsPerBar === 0 ? 880 : 660;
        Tone.Transport.schedule((time) => {
          metronome.triggerAttackRelease(freq, 0.04, time);
        }, t / 1000);
      }
    }
  }
}

/** A4 = 440 Hz = MIDI 69. Inlined here so the scheduler doesn't have
 *  to reach back into legacy-app.js for the helper. */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
