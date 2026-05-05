// Public surface of @piano/core. Imported by web and mobile shells.
//
// Migration status (2026-05-05): Phase 0b extraction in progress.
// - Audio: chord, YIN, spectral features, harmonicity, audio-context — DONE
// - Library: musicxml-meta, auto-section — DONE
// - Render perf-tier — DONE
// - Input contracts — DONE
// - State / render / i18n / config — pending (still in legacy app.js)

// === Input contracts ===
export type {
  MidiInputAdapter,
  MidiMessage,
  MidiPort,
  MidiPortListener,
  MidiMessageListener,
} from './input/types';

// === Render ===
export { detectPerfTier, PERF_PROFILES } from './render/perf-tier';
export type { PerfTier, PerfProfile } from './render/perf-tier';

// === Audio: chord recognition ===
export { detectChord } from './audio/chord';

// === Audio: YIN pitch detection ===
export { detectPitchYIN, freqToNote } from './audio/yin';
export type { YinOptions, YinResult } from './audio/yin';

// === Audio: spectral features ===
export {
  computeSpectralFlatness,
  computeSpectralCrest,
  computeSpectralCentroid,
  coefficientOfVariation,
} from './audio/spectral';

// === Audio: harmonicity ===
export { computeHarmonicity } from './audio/harmonicity';
export type { HarmonicityOptions } from './audio/harmonicity';

// === Audio: software AGC ===
export { initAgcState, stepAgc, suppressVoice } from './audio/agc';
export type { AgcOptions, AgcState, AgcStepResult } from './audio/agc';

// === Audio: multi-feature onset gate ===
export { initOnsetState, stepOnset } from './audio/onset';
export type { OnsetOptions, OnsetState, OnsetFrameInput, OnsetResult } from './audio/onset';

// === Audio: AudioContext lifecycle ===
export {
  AUDIO_SAMPLE_RATE,
  createAudioContext,
  buildAudioGraph,
  recoverAudioContext,
} from './audio/audio-context';
export type {
  AudioContextLike,
  AudioGraph,
  AudioGraphOptions,
  AudioNodeLike,
  AnalyserNodeLike,
  GainNodeLike,
  MediaStreamAudioSourceNodeLike,
  AudioParamLike,
} from './audio/audio-context';

// === Library: MusicXML metadata + auto-sectioning ===
export { parseMusicXmlMetadata } from './library/musicxml-meta';
export type { MusicXmlMetadata, MetaParseOptions } from './library/musicxml-meta';

export { autoSectionDefs, collectSectionCandidates } from './library/auto-section';
export type { SectionDef, SectionCandidates, AutoSectionOptions } from './library/auto-section';

// === Library: user-song storage + parsing ===
export {
  USER_DB_NAME,
  USER_DB_STORE,
  openUserDb,
  userDbAll,
  userDbPut,
  userDbDelete,
  parseUserSongFromBlob,
  makeUserSong,
} from './library/user-songs';
export type {
  UserSongRecord,
  UserSong,
  OpenDbOptions,
  ParseBlobOptions,
  MakeSongOptions,
} from './library/user-songs';
