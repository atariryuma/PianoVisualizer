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
  loopToggle: HTMLElement;
  loopRow: HTMLElement;
  modeHint: HTMLElement;
  songBack: HTMLElement;
  songPreflightHint: HTMLElement;
  songPreflightText: HTMLElement;
  songPreflightApply: HTMLElement;
  songStart: HTMLElement;
  practiceHud: HTMLElement;
  practiceTopBar: HTMLElement;
  ptbSection: HTMLElement;
  ptbTempo: HTMLElement;
  ptbProgress: HTMLElement;
  ptbProgressFill: HTMLElement;
  ptbToggleOsmd: HTMLElement;
  ptbPause: HTMLElement;
  ptbRestart: HTMLElement;
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
  resExtraRow: HTMLElement;
  resExtra: HTMLElement;
  resMsg: HTMLElement;
  resFocus: HTMLElement;
  resUnlock: HTMLElement;
  resSelfAssess: HTMLElement;
  resFeelTricky: HTMLElement;
  resFeelOk: HTMLElement;
  resFeelGreat: HTMLElement;
  resFeelResult: HTMLElement;
  resQuit: HTMLElement;
  resRetry: HTMLElement;
  resRetrySlow: HTMLElement;
  resTempoUp: HTMLElement;
  resStretch: HTMLElement;
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

  // Practice journal (0.14 — completion visualization)
  journalBtn: HTMLElement;
  journalModal: HTMLElement;
  journalCloseBtn: HTMLElement;
  journalPianistCard: HTMLElement;
  journalWeeklyMeter: HTMLElement;
  pianistEditModal: HTMLElement;
  pianistEditCloseBtn: HTMLElement;
  pianistAvatarGrid: HTMLElement;
  pianistNameInput: HTMLElement;
  pianistCommitInput: HTMLElement;
  pianistEditCancelBtn: HTMLElement;
  pianistEditSaveBtn: HTMLElement;
  startScreenPianistBadge: HTMLElement;
  firstRunWelcome: HTMLElement;
  practiceRecap: HTMLElement;
  titleContinue: HTMLElement;
  journalLibraryRollup: HTMLElement;
  journalRepertoireList: HTMLElement;
  journalStampsGrid: HTMLElement;
  journalCalendar: HTMLElement;
  journalActivityList: HTMLElement;
  libraryMasteryStrip: HTMLElement;
  resStampsEarned: HTMLElement;
  sectionBannerHint: HTMLElement;

  // Settings panel
  settingsBtn: HTMLElement;
  settingsPanel: HTMLElement;
  settingsCloseBtn: HTMLElement;
  audioOffsetSlider: HTMLElement;
  audioOffsetVal: HTMLElement;
  audioOffsetAuto: HTMLElement;
  calibrateBtn: HTMLElement;
  calibrateStatus: HTMLElement;
  audioOffsetReset: HTMLElement;
  settingsRescanBtn: HTMLElement;
  settingsBleBtn: HTMLElement;
  settingsResetBtn: HTMLElement;
  settingsInputStatus: HTMLElement;
  settingsDebugToggle: HTMLElement;
  // 0.15: note-name notation segment + practice-audio volume sliders.
  noteNamingAuto: HTMLElement;
  noteNamingAbc: HTMLElement;
  noteNamingSolfege: HTMLElement;
  // ノーツ落下速度セグメント（A3）。
  noteSpeedSlow: HTMLElement;
  noteSpeedNormal: HTMLElement;
  noteSpeedFast: HTMLElement;
  volGhostSlider: HTMLElement;
  volGhostVal: HTMLElement;
  volBackingSlider: HTMLElement;
  volBackingVal: HTMLElement;
  volMetronomeSlider: HTMLElement;
  volMetronomeVal: HTMLElement;
  // 0.15: progress backup / restore.
  backupExportBtn: HTMLElement;
  backupImportBtn: HTMLElement;
  backupImportFile: HTMLElement;
  backupStatus: HTMLElement;
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
  'loopToggle',
  'loopRow',
  'modeHint',
  'songBack',
  'songPreflightHint',
  'songPreflightText',
  'songPreflightApply',
  'songStart',
  'practiceHud',
  'practiceTopBar',
  'ptbSection',
  'ptbTempo',
  'ptbProgress',
  'ptbProgressFill',
  'ptbToggleOsmd',
  'ptbPause',
  'ptbRestart',
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
  'resExtraRow',
  'resExtra',
  'resMsg',
  'resFocus',
  'resUnlock',
  'resSelfAssess',
  'resFeelTricky',
  'resFeelOk',
  'resFeelGreat',
  'resFeelResult',
  'resQuit',
  'resRetry',
  'resRetrySlow',
  'resTempoUp',
  'resStretch',
  'resNext',
  'resTryPlay',
  'resHome',
  'resHistoryWrap',
  'resHistoryChart',
  'introHint',
  'micMeter',
  'micMeterFill',
  'midiBadge',
  'journalBtn',
  'journalModal',
  'journalCloseBtn',
  'journalPianistCard',
  'journalWeeklyMeter',
  'pianistEditModal',
  'pianistEditCloseBtn',
  'pianistAvatarGrid',
  'pianistNameInput',
  'pianistCommitInput',
  'pianistEditCancelBtn',
  'pianistEditSaveBtn',
  'startScreenPianistBadge',
  'firstRunWelcome',
  'practiceRecap',
  'titleContinue',
  'journalLibraryRollup',
  'journalRepertoireList',
  'journalStampsGrid',
  'journalCalendar',
  'journalActivityList',
  'libraryMasteryStrip',
  'resStampsEarned',
  'sectionBannerHint',
  'settingsBtn',
  'settingsPanel',
  'settingsCloseBtn',
  'audioOffsetSlider',
  'audioOffsetVal',
  'audioOffsetAuto',
  'calibrateBtn',
  'calibrateStatus',
  'audioOffsetReset',
  'settingsRescanBtn',
  'settingsBleBtn',
  'settingsResetBtn',
  'settingsInputStatus',
  'settingsDebugToggle',
  'noteNamingAuto',
  'noteNamingAbc',
  'noteNamingSolfege',
  'noteSpeedSlow',
  'noteSpeedNormal',
  'noteSpeedFast',
  'volGhostSlider',
  'volGhostVal',
  'volBackingSlider',
  'volBackingVal',
  'volMetronomeSlider',
  'volMetronomeVal',
  'backupExportBtn',
  'backupImportBtn',
  'backupImportFile',
  'backupStatus',
] as const) as readonly (keyof DomBag)[];

/** Project a subset of an existing DOM bag onto a new object. The
 *  shell uses this to hand factory `dom: {...}` deps without listing
 *  each `key: bag.key` line — `pickDom(bag, 'a', 'b', 'c')` returns
 *  `{ a: bag.a, b: bag.b, c: bag.c }`. Generic over the bag's exact
 *  type so the typed `DomBag` flows through without an index-signature
 *  cast; each picked field retains its source type via `Pick<T, K>`. */
export function pickDom<T extends object, K extends keyof T & string>(
  bag: T,
  ...keys: K[]
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    out[k] = bag[k];
  }
  return out;
}

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
