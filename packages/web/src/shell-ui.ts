// UI shell — Phase 0d batch 108.
//
// Bundles the user-flow UI cluster: intro-hint + result-card +
// song-panel render+controls + select-song + practice-flow +
// the two boot-session start buttons. These all participate in the
// "title screen → song picker → practice → result → back to title"
// state machine.
//
// Many cross-references between the children (result-card writes
// into `completePracticeSection` / `renderResultCard`; song-panel
// reads `songProg`; practice-flow exposes `returnToTitle` etc.).
// Bundling lets us hide that orchestration behind the public surface.

import type { MidiState } from '@piano/core';
import type { MidiInputRef } from './shell-midi';
import type { InitialGameState } from './game-state-init';
import type { InitialPrefs, InitialPracticeState } from './practice-state-init';
import type { PianoConfig } from './piano-config';
import * as PianoCore from '@piano/core';
import type { T } from '@piano/core';
import * as IntroHintUi from './intro-hint-ui';
import * as ResultCard from './result-card';
import type { AttemptCompletionInput } from './result-card';
import * as JournalModal from './journal-modal';
import type { JournalSongRef } from './journal-modal';
import * as PianistEditor from './pianist-editor';
import { PIANIST_AVATARS } from './prefs-storage';
import * as SongPanelRender from './song-panel-render';
import * as SongPanelControls from './song-panel-controls';
import * as SelectSong from './select-song';
import * as PracticeFlow from './practice-flow';
import * as BootSession from './boot-session';
import * as DomBag from './dom-bag';

export interface ShellUiDeps {
  document: Document;
  songs: any;
  state: InitialGameState;
  practice: InitialPracticeState;
  midiInput: MidiInputRef;
  midiState: MidiState;
  prefs: InitialPrefs;
  savePrefs?: () => void;
  config: PianoConfig;
  /** Mutable currentSong — getter/setter. */
  getCurrentSong: () => any;
  setCurrentSong: (s: unknown) => void;
  dom: DomBag.DomBag;
  t: T;
  dateKey: (d: Date) => string;
  /** OSMD shell. */
  getOsmd: () => any;
  setOsmd: (o: unknown) => void;
  clearHighlights: () => void;
  loadCurrentScore: () => Promise<void>;
  /** Practice cluster forwarders. */
  songProg: () => any;
  loadPracticeProgress: () => any;
  savePracticeProgress: () => void;
  recordPracticeDay: () => void;
  startPracticeSection: (sectionIdx: number) => Promise<void>;
  stopPracticeAudio: () => void;
  /** Audio + boot. */
  initAudio: () => Promise<void>;
  initBgStars: () => void;
  loop: (timeMs: number) => void;
  alertAudioInitError: (e: unknown) => void;
  /** MIDI input forwarders. */
  initWebMIDI: () => Promise<any>;
  startMidiAutoRescan: () => void;
  stopMidiAutoRescan: () => void;
  rescanMidi: (silent?: boolean) => Promise<boolean>;
  /** Misc shell forwarders. */
  releaseWakeLock: () => void;
  requestWakeLock: () => Promise<unknown>;
  hideIntroHint: () => void;
  resetSession: () => void;
  /** Effects + visual primitives. */
  effectGoldenBurst: any;
  effectStarShower: any;
  effectFlowerBurst: any;
  /** Score helpers. */
  setupHiDPICanvas: (
    canvas: HTMLCanvasElement,
    w: number,
    h: number
  ) => CanvasRenderingContext2D | null;
  clamp01: (n: number) => number;
  remoteLogEnabled: boolean;
  getHeight: () => number;
  /** byId shorthand — for the `resTryPlay` element pickup. */
  byId: (id: string) => HTMLElement;
}

export interface ShellUi {
  /** showHitChip — invoked from MIDI handlers + score-loader after-load. */
  showHitChip: (kind: string, text: string) => void;
  /** intro-hint-ui forwarders. */
  refreshIntroHint: () => void;
  showRunningUI: () => void;
  hideIntroHint: () => void;
  alertAudioInitError: (e: unknown) => void;
  /** Result-card forwarders — assigned by the shell into placeholders. */
  renderResultCard: () => void;
  completePracticeSection: () => void;
  /** Song-panel render thunk. */
  renderSongPanel: () => void;
  /** SelectSong + practice-song-btn listener installed via hook. */
  selectSong: (songId: string) => void;
  installPracticeSongButtons: () => void;
  /** PracticeFlow.returnToTitle — assigned to the shell placeholder. */
  returnToTitle: () => void;
  /** Boot start button installers — `installStartButtons(opts)` registers
   *  click handlers on both start buttons. */
  installStartButtons: () => void;
  /** 0.14 — Practice journal forwarders. */
  refreshJournal: () => void;
  openJournal: (initialTab?: 'repertoire' | 'stamps' | 'calendar') => void;
  closeJournal: () => void;
  closePianistEditor: () => void;
  isPianistEditorOpen: () => boolean;
}

export function createShellUi(deps: ShellUiDeps): ShellUi {
  const { document: doc, dom, t } = deps;

  // ── Intro-hint UI + hit feedback chip ──
  const _introHintUi = IntroHintUi.createIntroHintUi({
    dom: DomBag.pickDom(dom, 'introHint', 'startScreen', 'hud', 'micMeter') as any,
    state: deps.state,
    midiInput: deps.midiInput,
    practice: deps.practice,
    t,
    getHeight: deps.getHeight,
    requestWakeLock: () => deps.requestWakeLock(),
    startMidiAutoRescan: deps.startMidiAutoRescan,
    rescanMidi: deps.rescanMidi,
  } as any);

  const showHitChip = (kind: string, text: string) => _introHintUi.showHitChip(kind, text);

  // ── Practice journal (must be built before result-card so its
  //    onSectionAttemptDone hook can delegate to _journal.applyAttempt) ──
  function buildJournalSongRefs(): JournalSongRef[] {
    const out: JournalSongRef[] = [];
    const songsObj = deps.songs as Record<string, any>;
    for (const id of Object.keys(songsObj)) {
      const s = songsObj[id];
      if (!s || typeof s !== 'object') continue;
      const titleKey: string = s.titleKey ?? '__userTitle:' + id;
      const composer: string | undefined = s._userComposer
        ? String(s._userComposer)
        : s.composerKey
          ? t(s.composerKey)
          : undefined;
      const sections: JournalSongRef['sections'] = Array.isArray(s.sections)
        ? s.sections.map((sec: any, i: number) => ({
            id: String(sec.id ?? String.fromCharCode(65 + i)),
            nameKey: String(sec.nameKey ?? ''),
          }))
        : [];
      const difficulty = ['sprout', 'leaf', 'tree', 'mountain'].includes(s.difficulty)
        ? (s.difficulty as JournalSongRef['difficulty'])
        : undefined;
      out.push({ id, titleKey, composer, difficulty, sections });
    }
    return out;
  }
  const _journal = JournalModal.createJournalModal({
    dom: DomBag.pickDom(
      dom,
      'journalBtn',
      'journalModal',
      'journalCloseBtn',
      'journalPianistCard',
      'journalWeeklyMeter',
      'journalLibraryRollup',
      'journalRepertoireList',
      'journalStampsGrid',
      'journalCalendar',
      'journalActivityList',
      'libraryMasteryStrip',
      'resStampsEarned',
      'sectionBannerHint'
    ),
    getProgress: () => deps.practice.progress as PianoCore.PracticeProgress,
    getSongs: () => buildJournalSongRefs(),
    saveProgress: () => deps.savePracticeProgress(),
    getSessionPeakFlow: () => Number((deps.state as any).peakFlow ?? 0),
    t,
    formatDateKey: PianoCore.formatDateKey,
    getPianistIdentity: () => ({
      name: (deps.prefs as any).pianistName,
      commitYear: (deps.prefs as any).pianistCommitYear,
    }),
    setPianistIdentity: (id) => {
      (deps.prefs as any).pianistName = id.name;
      (deps.prefs as any).pianistCommitYear = id.commitYear;
      (deps.prefs as any).pianistAvatar = id.avatar;
      deps.savePrefs?.();
    },
    openPianistEditor: () => _pianistEditor.open(),
  });

  function getPianistIdentity(): JournalModal.PianistIdentity {
    const p = deps.prefs as any;
    const avatar = typeof p.pianistAvatar === 'string' ? p.pianistAvatar : undefined;
    return {
      name: p.pianistName,
      commitYear: p.pianistCommitYear,
      avatar: avatar && PIANIST_AVATARS.includes(avatar) ? avatar : undefined,
    };
  }

  function renderPianistBadge(): void {
    const target = dom.startScreenPianistBadge;
    if (!target) return;
    const id = getPianistIdentity();
    target.innerHTML = '';
    if (!id.name) return;
    const avatar = document.createElement('span');
    avatar.className = 'start-pianist-avatar';
    avatar.textContent = id.avatar ?? '🎹';
    const name = document.createElement('span');
    name.className = 'start-pianist-name';
    name.textContent = t('startScreenPianistGreetingFmt', { name: id.name });
    target.appendChild(avatar);
    target.appendChild(name);
  }

  const _pianistEditor = PianistEditor.createPianistEditor({
    dom: DomBag.pickDom(
      dom,
      'pianistEditModal',
      'pianistEditCloseBtn',
      'pianistAvatarGrid',
      'pianistNameInput',
      'pianistCommitInput',
      'pianistEditCancelBtn',
      'pianistEditSaveBtn'
    ),
    getIdentity: getPianistIdentity,
    setIdentity: (id) => {
      (deps.prefs as any).pianistName = id.name;
      (deps.prefs as any).pianistCommitYear = id.commitYear;
      (deps.prefs as any).pianistAvatar = id.avatar;
      deps.savePrefs?.();
    },
    onSaved: () => {
      _journal.render();
      _journal.renderLibraryStrip();
      renderPianistBadge();
    },
    t,
  });

  renderPianistBadge();

  // ── Result-card ──
  const SECTION_IDS = ['A1', 'B', 'A2'];
  const _resultCard = ResultCard.createResultCard({
    dom: DomBag.pickDom(
      dom,
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
      'resFocus',
      'resUnlock',
      'resSelfAssess',
      'resFeelTricky',
      'resFeelOk',
      'resFeelGreat',
      'resFeelResult',
      'resHistoryWrap',
      'resHistoryChart',
      'resNext',
      'resStretch',
      'resTryPlay'
    ) as any,
    practice: deps.practice,
    getCurrentSong: deps.getCurrentSong,
    songProg: deps.songProg,
    sectionIds: SECTION_IDS,
    stopPracticeAudio: deps.stopPracticeAudio,
    releaseWakeLock: deps.releaseWakeLock as any,
    recordPracticeDay: deps.recordPracticeDay,
    savePracticeProgress: deps.savePracticeProgress,
    computeStars: PianoCore.computeStars,
    resolveResultTier: PianoCore.resolveResultTier,
    pickSectionFocus: PianoCore.pickSectionFocus,
    computeUnlocks: PianoCore.computeUnlocks,
    effectGoldenBurst: deps.effectGoldenBurst,
    effectStarShower: deps.effectStarShower,
    effectFlowerBurst: deps.effectFlowerBurst,
    setupHiDPICanvas: deps.setupHiDPICanvas,
    clamp01: deps.clamp01,
    t,
    remoteLogEnabled: deps.remoteLogEnabled,
    onSectionAttemptDone: (input: AttemptCompletionInput) => {
      const earned = _journal.applyAttempt({
        songId: input.songId,
        sectionId: input.sectionId,
        stars: input.stars,
        accPct: input.accPct,
        tempoPct: input.tempoPct,
        sectionBestCombo: input.sectionBestCombo,
        isListenMode: input.isListenMode,
        priorStars: input.priorStars,
        priorBestPct: input.priorBestPct,
      });
      // Amplify the highest-rarity stamp this attempt with extra
      // particle effects; commons stay text-only so the rarer moments
      // don't get diluted.
      if (earned.length > 0) {
        const rank: Record<string, number> = {
          common: 0,
          rare: 1,
          epic: 2,
          legendary: 3,
        };
        let topRank = -1;
        let topRarity = '';
        for (const id of earned) {
          const def = _journal.getStampDef(id);
          if (!def) continue;
          const r = rank[def.rarity] ?? 0;
          if (r > topRank) {
            topRank = r;
            topRarity = def.rarity;
          }
        }
        if (topRarity === 'legendary') {
          deps.effectGoldenBurst();
          deps.effectStarShower(12);
        } else if (topRarity === 'epic') {
          deps.effectFlowerBurst();
          deps.effectStarShower(6);
        } else if (topRarity === 'rare') {
          deps.effectStarShower(3);
        }
      }
      return earned;
    },
    getStretchSongId: () => {
      const current = deps.getCurrentSong();
      const currentId = (current && typeof current === 'object' && current.id) || '';
      return _journal.pickStretchSong(currentId);
    },
  } as any);

  // resStretch click — jump to the suggested stretch song. selectSong
  // closes the result card via the song-panel transition.
  dom.resStretch.addEventListener('click', () => {
    const id = (dom.resStretch as HTMLElement).dataset.songId;
    if (!id) return;
    dom.sectionResult.classList.remove('visible');
    selectSong(id);
  });

  // ── Song-panel render ──
  const _songPanelRender = SongPanelRender.createSongPanelRender({
    dom: DomBag.pickDom(
      dom,
      'songTitle',
      'songComposer',
      'streakCount',
      'streakCal',
      'songBpmHint',
      'tempoRow',
      'sectionList',
      'ghostToggle',
      'metronomeToggle',
      'ghostRow',
      'metronomeRow',
      'fullSongRow',
      'fullSongToggle',
      'songStart'
    ) as any,
    practice: deps.practice,
    getCurrentSong: deps.getCurrentSong,
    songProg: deps.songProg,
    t,
    dateKey: deps.dateKey,
  } as any);
  const renderSongPanel = _songPanelRender.render;

  // ── Song-panel controls (back button, ghost / metronome / full-song toggles) ──
  let _returnToTitle: () => void = () => {};
  SongPanelControls.createSongPanelControls({
    dom: DomBag.pickDom(dom, 'ghostToggle', 'metronomeToggle', 'fullSongToggle', 'songBack') as any,
    practice: deps.practice,
    renderSongPanel,
    // Thunked so the placeholder-then-reassigned `returnToTitle` reads its
    // live binding at click time (after createPracticeFlow runs below).
    returnToTitle: () => _returnToTitle(),
  } as any);

  // ── Boot — song-start button (▶ Practice) ──
  let _selectSong: any = null;
  BootSession.installSongStartButton(dom.songStart, {
    state: deps.state,
    practice: deps.practice,
    initAudio: deps.initAudio,
    showRunningUI: () => _introHintUi.showRunningUI(),
    initBgStars: deps.initBgStars,
    loop: deps.loop,
    alertAudioInitError: (e: unknown) => _introHintUi.alertAudioInitError(e),
    startPracticeSection: deps.startPracticeSection,
    songPanel: dom.songPanel,
  } as any);

  // ── SelectSong ──
  _selectSong = SelectSong.createSelectSong({
    songs: deps.songs,
    state: deps.state,
    practice: deps.practice,
    dom: DomBag.pickDom(
      dom,
      'osmdContainer',
      'songTitle',
      'songComposer',
      'startScreen',
      'songPanel',
      'questDisplay'
    ) as any,
    getCurrentSong: deps.getCurrentSong,
    setCurrentSong: deps.setCurrentSong,
    getOsmd: deps.getOsmd,
    setOsmd: deps.setOsmd,
    clearHighlights: deps.clearHighlights,
    t,
    loadPracticeProgress: deps.loadPracticeProgress,
    showRunningUI: () => _introHintUi.showRunningUI(),
    renderSongPanel: () => renderSongPanel(),
    initWebMIDI: () => {
      void deps.initWebMIDI();
    },
    loadCurrentScore: deps.loadCurrentScore,
    remoteLogEnabled: deps.remoteLogEnabled,
  } as any);
  const selectSong = (songId: string) => {
    _selectSong.selectSong(songId);
    _journal.paintSectionBannerHint(songId);
  };

  // ── PracticeFlow — installed at construction time. returnToTitle is wired
  //   back into the song-panel-controls thunk via _returnToTitle assignment. ──
  const _practiceFlow = PracticeFlow.createPracticeFlow({
    dom: {
      ...DomBag.pickDom(
        dom,
        'ptbQuit',
        'ptbToggleOsmd',
        'resQuit',
        'resRetry',
        'resNext',
        'sumClose',
        'homeBtn',
        'sumHome',
        'resHome',
        'practiceHud',
        'osmdContainer',
        'songPanel',
        'sectionResult',
        'sessionSummary',
        'hud',
        'questDisplay',
        'micMeter',
        'startScreen'
      ),
      resTryPlay: deps.byId('resTryPlay'),
    } as any,
    practice: deps.practice,
    state: deps.state,
    midiState: deps.midiState,
    getCurrentSong: deps.getCurrentSong,
    songProg: deps.songProg,
    startPracticeSection: deps.startPracticeSection,
    renderSongPanel,
    stopPracticeAudio: deps.stopPracticeAudio,
    releaseWakeLock: deps.releaseWakeLock as any,
    hideIntroHint: deps.hideIntroHint,
    stopMidiAutoRescan: deps.stopMidiAutoRescan,
    resetSession: deps.resetSession,
  } as any);
  _returnToTitle = _practiceFlow.returnToTitle;

  return {
    showHitChip,
    refreshIntroHint: () => _introHintUi.refreshIntroHint(),
    showRunningUI: () => _introHintUi.showRunningUI(),
    hideIntroHint: () => _introHintUi.hideIntroHint(),
    alertAudioInitError: (e: unknown) => _introHintUi.alertAudioInitError(e),
    renderResultCard: () => _resultCard.renderResultCard(),
    completePracticeSection: () => _resultCard.completePracticeSection(),
    renderSongPanel,
    selectSong,
    installPracticeSongButtons: () => {
      doc.querySelectorAll('.practice-song-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-song');
          if (id) selectSong(id);
        });
      });
    },
    returnToTitle: () => {
      _returnToTitle();
      // Refresh the title-screen mastery strip — progress may have
      // grown during the session that just ended.
      _journal.renderLibraryStrip();
    },
    refreshJournal: () => {
      _journal.renderLibraryStrip();
      renderPianistBadge();
    },
    openJournal: (initialTab?: 'repertoire' | 'stamps' | 'calendar') => _journal.open(initialTab),
    closeJournal: () => _journal.close(),
    closePianistEditor: () => _pianistEditor.close(),
    isPianistEditorOpen: () => _pianistEditor.isOpen(),
    installStartButtons: () => {
      BootSession.installStartButton(dom.startBtn, {
        state: deps.state,
        practice: deps.practice,
        initAudio: deps.initAudio,
        showRunningUI: () => _introHintUi.showRunningUI(),
        initBgStars: deps.initBgStars,
        loop: deps.loop,
        alertAudioInitError: (e: unknown) => _introHintUi.alertAudioInitError(e),
      } as any);
    },
  };
}
