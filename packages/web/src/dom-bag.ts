// DOM bag — Phase 0d batch 66.
//
// The shell-wide registry of every DOM element id used by
// legacy-app.js + the extracted modules' deps. Building this once at
// boot lets every other file just deref `DOM.fooBar` instead of
// scattering `getElementById('fooBar')` across 60 modules.
//
// All ids are typed non-null because every entry is guaranteed to
// exist in `index.html` — the shell crashes immediately on first DOM
// access if any are missing, so the cast-to-non-null view is correct
// in practice.
//
// Pure helper — `document` is held by deps so vitest can drive the
// builder against a happy-dom DocumentFragment without binding to a
// global at module-init.

/** Every DOM element id the shell expects to exist in `index.html`.
 *  Add new entries to this list rather than calling `getElementById`
 *  again ad-hoc — the type narrows nicely once the field is added. */
export interface DomBag {
  // Canvas / boot
  canvas: HTMLElement;
  startScreen: HTMLElement;
  startBtn: HTMLElement;
  themeBar: HTMLElement;
  hud: HTMLElement;

  // HUD overlays
  encouragement: HTMLElement;
  flowFill: HTMLElement;
  stageLabel: HTMLElement;
  noteDisplay: HTMLElement;
  sessionStatus: HTMLElement;
  qualityScore: HTMLElement;
  debugOverlay: HTMLElement;

  // v10 quest UI
  questDisplay: HTMLElement;
  questDots: HTMLElement;
  questLabel: HTMLElement;
  questToast: HTMLElement;
  toastTitle: HTMLElement;
  toastSub: HTMLElement;

  homeBtn: HTMLElement;

  // Session summary modal
  sessionSummary: HTMLElement;
  sumCombo: HTMLElement;
  sumQuestList: HTMLElement;
  sumStage: HTMLElement;
  sumTime: HTMLElement;
  radarChart: HTMLElement;
  sumBest: HTMLElement;
  sumClose: HTMLElement;
  sumHome: HTMLElement;
  playTime: HTMLElement;

  // Practice mode (song panel + lane)
  songTitle: HTMLElement;
  songComposer: HTMLElement;
  songPanel: HTMLElement;
  streakCount: HTMLElement;
  streakCal: HTMLElement;
  tempoRow: HTMLElement;
  songBpmHint: HTMLElement;
  sectionList: HTMLElement;
  ghostToggle: HTMLElement;
  ghostRow: HTMLElement;
  metronomeToggle: HTMLElement;
  metronomeRow: HTMLElement;
  fullSongToggle: HTMLElement;
  fullSongRow: HTMLElement;
  songBack: HTMLElement;
  songStart: HTMLElement;
  practiceHud: HTMLElement;
  practiceTopBar: HTMLElement;
  ptbSection: HTMLElement;
  ptbTempo: HTMLElement;
  ptbProgress: HTMLElement;
  ptbToggleOsmd: HTMLElement;
  ptbQuit: HTMLElement;
  ptbInput: HTMLElement;
  osmdContainer: HTMLElement;
  sectionBanner: HTMLElement;

  // Section result modal
  sectionResult: HTMLElement;
  resTitle: HTMLElement;
  resSectionName: HTMLElement;
  resStars: HTMLElement;
  resAcc: HTMLElement;
  resTiming: HTMLElement;
  resDuration: HTMLElement;
  resDurationRow: HTMLElement;
  resCombo: HTMLElement;
  resMsg: HTMLElement;
  resUnlock: HTMLElement;
  resQuit: HTMLElement;
  resRetry: HTMLElement;
  resNext: HTMLElement;
  resTryPlay: HTMLElement;
  resHome: HTMLElement;
  resHistoryWrap: HTMLElement;
  resHistoryChart: HTMLElement;

  // Intro hint + mic + MIDI badge
  introHint: HTMLElement;
  micMeter: HTMLElement;
  micMeterFill: HTMLElement;
  midiBadge: HTMLElement;

  // Settings panel
  settingsBtn: HTMLElement;
  settingsPanel: HTMLElement;
  settingsCloseBtn: HTMLElement;
  audioOffsetSlider: HTMLElement;
  audioOffsetVal: HTMLElement;
  audioOffsetAuto: HTMLElement;
  audioOffsetReset: HTMLElement;
  settingsRescanBtn: HTMLElement;
  settingsBleBtn: HTMLElement;
  settingsResetBtn: HTMLElement;
  settingsInputStatus: HTMLElement;
  settingsDebugToggle: HTMLElement;
}

/** All ids the bag walks. Kept as a frozen const so a typo (or a
 *  rename in `index.html` without updating the bag) shows up via
 *  `missingIds` rather than a silent `undefined` deref later. */
export const DOM_BAG_IDS: readonly (keyof DomBag)[] = Object.freeze([
  'canvas',
  'startScreen',
  'startBtn',
  'themeBar',
  'hud',
  'encouragement',
  'flowFill',
  'stageLabel',
  'noteDisplay',
  'sessionStatus',
  'qualityScore',
  'debugOverlay',
  'questDisplay',
  'questDots',
  'questLabel',
  'questToast',
  'toastTitle',
  'toastSub',
  'homeBtn',
  'sessionSummary',
  'sumCombo',
  'sumQuestList',
  'sumStage',
  'sumTime',
  'radarChart',
  'sumBest',
  'sumClose',
  'sumHome',
  'playTime',
  'songTitle',
  'songComposer',
  'songPanel',
  'streakCount',
  'streakCal',
  'tempoRow',
  'songBpmHint',
  'sectionList',
  'ghostToggle',
  'ghostRow',
  'metronomeToggle',
  'metronomeRow',
  'fullSongToggle',
  'fullSongRow',
  'songBack',
  'songStart',
  'practiceHud',
  'practiceTopBar',
  'ptbSection',
  'ptbTempo',
  'ptbProgress',
  'ptbToggleOsmd',
  'ptbQuit',
  'ptbInput',
  'osmdContainer',
  'sectionBanner',
  'sectionResult',
  'resTitle',
  'resSectionName',
  'resStars',
  'resAcc',
  'resTiming',
  'resDuration',
  'resDurationRow',
  'resCombo',
  'resMsg',
  'resUnlock',
  'resQuit',
  'resRetry',
  'resNext',
  'resTryPlay',
  'resHome',
  'resHistoryWrap',
  'resHistoryChart',
  'introHint',
  'micMeter',
  'micMeterFill',
  'midiBadge',
  'settingsBtn',
  'settingsPanel',
  'settingsCloseBtn',
  'audioOffsetSlider',
  'audioOffsetVal',
  'audioOffsetAuto',
  'audioOffsetReset',
  'settingsRescanBtn',
  'settingsBleBtn',
  'settingsResetBtn',
  'settingsInputStatus',
  'settingsDebugToggle',
] as const) as readonly (keyof DomBag)[];

/** Build the DOM bag. Returns the populated object PLUS a list of
 *  any ids that didn't resolve (development-only safety net — the
 *  shell asserts the list is empty in dev mode). */
export function createDomBag(doc: Document = document): {
  bag: DomBag;
  missingIds: string[];
} {
  const bag: Partial<Record<keyof DomBag, HTMLElement>> = {};
  const missingIds: string[] = [];
  for (const id of DOM_BAG_IDS) {
    const el = doc.getElementById(id);
    if (el) {
      bag[id] = el;
    } else {
      missingIds.push(id);
    }
  }
  return { bag: bag as DomBag, missingIds };
}
