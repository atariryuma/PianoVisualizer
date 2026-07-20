// T_STRINGS — the translation table for practice-flow UI strings.
//
// Conventions:
//   - Every key has `en`. `jp` is optional — omit it ONLY for true loanwords
//     that read identically in JP context (Perfect, Nice, GO!, SUSTAIN, URL).
//     `translate()` falls back to `en` when `jp` is missing.
//   - Keys ending in `Fmt` use {placeholder} interpolation.
//   - Free-play / quest / dev-only strings stay English (they're intentionally not in here).
//
// Extracted verbatim from app.js (keep in sync until Phase 0b.3 wires the
// bundled core into the legacy build).

import type { TranslationTable } from './types';

export const T_STRINGS: TranslationTable = {
  // Settings panel
  settings: { en: 'Settings', jp: '設定' },
  close: { en: 'Close', jp: '閉じる' },
  backToTitle: { en: 'Back to title', jp: 'タイトルにもどる' },
  display: { en: 'Display', jp: '表示' },
  synesthesia: {
    en: 'Synesthesia mode (each note has its own color)',
    jp: '音階色モード（音ごとに色が変わる）',
  },
  synesthesiaTitle: { en: 'Synesthesia mode', jp: '音階色モード' },
  timingCalibration: { en: 'Timing Calibration', jp: 'タイミング調整' },
  audioOffset: { en: 'Audio offset', jp: '音と画面のずれ補正' },
  audioOffsetHelp: {
    en: 'If you play on the beat but it\'s judged "late", raise the number. If your press is rejected as "early", lower it.',
    jp: '拍に合わせて弾いてるのに「遅い」判定になる時は数値を上げる。「早い」判定になる時は下げる。',
  },
  autoDetectedFmt: {
    en: 'Auto-detected value in use (currently {v} ms)',
    jp: '自動検出値を使用中（現在: {v} ms）',
  },
  resetToAuto: { en: 'Use auto-detected value', jp: '自動検出に戻す' },
  input: { en: 'Input', jp: '入力' },
  micInput: { en: 'Mic input', jp: 'マイク入力' },
  micStandby: { en: 'Standby', jp: '待機中' },
  scanMidi: { en: 'Scan for MIDI keyboard', jp: 'MIDIキーボードを探す' },
  connectBluetooth: { en: 'Connect Bluetooth', jp: 'Bluetooth接続' },
  other: { en: 'Other', jp: 'その他' },
  resetSession: { en: 'Reset session', jp: 'セッションをリセット' },
  debugOverlay: { en: 'Debug overlay', jp: 'デバッグ表示' },
  language: { en: 'Language', jp: '言語' },
  // Intro hint / MIDI diagnostics
  introNeedMidi: {
    en: '🎹 Please connect a MIDI keyboard<br>(microphone unavailable)',
    jp: '🎹 MIDIキーボードを接続してください<br>（マイクが使えません）',
  },
  diagWebMidiUnsupported: {
    en: '🎹 This browser does not support Web MIDI',
    jp: '🎹 このブラウザは Web MIDI 非対応',
  },
  diagNoMidiPort: { en: '🎹 No MIDI port found', jp: '🎹 MIDIポートが見つかりません' },
  diagWmbHint: {
    en: 'In WMB, disconnect → reconnect the keyboard, then tap 🔄 again',
    jp: 'WMBの設定でキーボードを一度切断→再接続してから🔄を再度タップ',
  },
  diagConnectHint: {
    en: 'Connect the keyboard via USB/Bluetooth, then tap 🔄',
    jp: 'キーボードをUSB/Bluetoothで接続してから🔄をタップ',
  },
  diagDetectedFmt: { en: '🎹 Detected: {v}', jp: '🎹 認識中: {v}' },
  diagCouldNotConnect: { en: 'Could not connect', jp: '接続できませんでした' },
  diagMidiError: { en: '🎹 MIDI error', jp: '🎹 MIDIエラー' },
  diagMidiWaiting: { en: '🎹 Waiting for MIDI…', jp: '🎹 MIDI待機中…' },
  midiConnectedFmt: { en: '🎹 Connected: {v}', jp: '🎹 接続: {v}' },
  // Alerts
  alertWebBluetoothUnsupported: {
    en: 'This browser does not support Web Bluetooth.\n\nAndroid Chrome / Mac Chrome / Linux Chrome are supported.\niPad Safari is not — use the "Web MIDI Browser" app instead.',
    jp: 'このブラウザは Web Bluetooth に対応していません。\n\nAndroid Chrome / Mac Chrome / Linux Chrome は対応。\niPad Safari は非対応 → 「Web MIDI Browser」アプリを使ってください。',
  },
  alertBleConnectFailedFmt: {
    en: 'Could not connect to Bluetooth keyboard:\n{v}',
    jp: 'Bluetoothキーボードに接続できませんでした:\n{v}',
  },
  alertScoreLoadFailedFmt: {
    en: 'Failed to load score\n{v}',
    jp: '楽譜の読み込みに失敗しました\n{v}',
  },
  // Session summary
  sumBestFmt: {
    en: '✨ All-time best: {combo} combo / Flow {flow}% (session #{n})',
    jp: '✨ 歴代ベスト: {combo}コンボ / フロー{flow}% (第{n}回セッション)',
  },
  sumAllClear: { en: '🎉 ALL CLEAR! 🎉', jp: '🎉 全クリア！ 🎉' },
  sumQuestProgressFmt: { en: '{n}/{total} cleared', jp: '{n}/{total} クリア' },
  // Input indicator tooltips
  tipMidiKeyboardFmt: { en: 'MIDI keyboard: {v}', jp: 'MIDIキーボード: {v}' },
  tipMidiWaiting: {
    en: 'Waiting for MIDI keyboard… tap to rescan',
    jp: 'MIDIキーボード待機中… タップで再スキャン',
  },
  tipMicMode: { en: 'Mic input mode', jp: 'マイク入力モード' },
  tipIosMidiBlocked: {
    en: 'iPad/iPhone Safari does not support Web MIDI. Use mic input. (For BLE-MIDI keyboards, install the "Web MIDI Browser" iOS app)',
    jp: 'iPad/iPhone のSafariはWeb MIDI非対応。マイク入力で演奏してください。（BLE-MIDIキーボードを使うには「Web MIDI Browser」アプリが必要）',
  },
  // Console-only iOS MIDI guidance
  consoleIosMidi: {
    en: 'iOS/iPadOS detected — Web MIDI is unavailable on Safari/WebKit. Use a desktop browser, Steam Deck, or the "Web MIDI Browser" iOS app for BLE-MIDI.',
    jp: 'iOS/iPadOS検出 — Safari/WebKitではWeb MIDI非対応。デスクトップブラウザ・Steam Deck・iOS「Web MIDI Browser」アプリのいずれかを利用。',
  },
  // Start screen
  tagline: {
    en: 'Play the piano and watch the screen come alive',
    jp: 'ピアノを弾くと画面がきれいに光るよ',
  },
  freePlay: { en: 'Free Play', jp: 'フリープレイ' },
  // Song panel
  // Leading space lives in EN so JP renders "1日れんしゅう中" without a half-width gap.
  dayStreak: { en: ' day streak', jp: '日れんしゅう中' },
  tempo: { en: 'Tempo', jp: 'テンポ' },
  startFrom: { en: 'Start from', jp: 'どこからはじめる？' },
  whichHand: { en: 'Which hand?', jp: 'どの手で弾く？' },
  leftOnly: { en: '👈 Left only', jp: '👈 左手だけ' },
  bothHands: { en: '🤝 Both', jp: '🤝 両手' },
  rightOnly: { en: 'Right only 👉', jp: '右手だけ 👉' },
  modeLabel: { en: 'Mode', jp: 'モード' },
  modeListen: { en: '🎧 Listen', jp: '🎧 きく' },
  modeGuided: { en: '✨ Guided', jp: '✨ ガイド' },
  modeRhythm: { en: '🎵 Rhythm', jp: '🎵 リズム' },
  ghostPlayback: { en: '👻 Ghost playback (demo)', jp: '👻 おてほん再生（ゴースト）' },
  metronome: { en: '🥁 Metronome', jp: '🥁 メトロノーム' },
  loopPractice: { en: '🔁 Loop this part', jp: '🔁 くりかえし練習' },
  // Settings — note-name notation + practice-audio volume balance.
  noteNaming: { en: 'Note names', jp: 'おんめいの表示' },
  noteNamingAuto: { en: 'Auto', jp: 'じどう' },
  volumeSection: { en: 'Volume', jp: 'おんりょう' },
  volGhost: { en: '👻 Demo piano', jp: '👻 おてほんピアノ' },
  volBacking: { en: '🎶 Melody guide', jp: '🎶 おともパート' },
  volMetronome: { en: '🥁 Metronome / count-in', jp: '🥁 メトロノーム・カウント' },
  backupProgress: { en: 'Back up progress', jp: 'きろくをほぞん' },
  restoreProgress: { en: 'Restore progress', jp: 'きろくをもどす' },
  calibrateBtn: { en: '🎯 Tap-along auto-set', jp: '🎯 タップで自動そくてい' },
  calibrateTapHere: {
    en: '👆 Tap here with the click!',
    jp: '👆 クリックに合わせてここをタップ！',
  },
  calibrateListen: { en: 'Listen… clicks starting', jp: 'よく聞いてね…クリックが始まるよ' },
  calibrateTap: { en: '{n} / {total}', jp: '{n} / {total}' },
  calibrateDone: { en: 'Done! Offset set to {v} ms', jp: 'できた！ズレを {v} ms に合わせたよ' },
  calibrateFail: {
    en: "Couldn't measure — try again",
    jp: 'うまく計れなかった…もう一回ためしてね',
  },
  pausePractice: { en: 'Pause', jp: 'ちょっと休憩' },
  resumePractice: { en: 'Resume', jp: 'つづける' },
  back: { en: 'Back', jp: 'もどる' },
  startPractice: { en: '▶ Start practice', jp: '▶ れんしゅうスタート' },
  startListening: { en: '🎧 Start listening', jp: '🎧 きいてみる' },
  // Listen-mode "play the whole song through" toggle (only shown when mode === 'listen')
  playFullSong: { en: '🎵 Play full song', jp: '🎵 全曲再生' },
  fullSongLabel: { en: 'Full song', jp: '曲全体' },
  // Listen-mode result (per-section vs full song variants)
  listenedTitle: { en: '🎧 Nicely listened!', jp: '🎧 さいごまで聴けたね！' },
  listenedMsg: { en: 'Now try playing along.', jp: 'つぎは弾いてみよう。' },
  listenedFullTitle: { en: '🎧 You heard the whole song!', jp: '🎧 曲を聴き終わりました！' },
  listenedFullMsg: { en: 'Try playing it now.', jp: 'つぎは弾いてみよう。' },
  tryPlayingNow: { en: '▶ Try playing', jp: '▶ 弾いてみる' },
  stretchBtn: { en: '🌳 Try a stretch piece', jp: '🌳 ちがう曲に挑戦' },
  // Guided-mode completion (no scoring — pure practice)
  guidedCompleteTitle: { en: '✨ Practice complete!', jp: '✨ 練習おつかれさま！' },
  guidedCompleteMsg: {
    en: 'Try again, or move to the next part.',
    jp: 'もう一度練習する? 次の部分に進む?',
  },
  // Kid-friendly difficulty bands (challenge axis, separate from stars).
  // 🌱 sprout / 🌿 leaf / 🌳 tree / 🏔️ mountain — visible self-calibration.
  difficultySprout: { en: '🌱 Sprout (beginner)', jp: '🌱 ふたば（はじめてさん）' },
  difficultyLeaf: { en: '🌿 Leaf (easy)', jp: '🌿 葉（やさしめ）' },
  difficultyTree: { en: '🌳 Tree (steady)', jp: '🌳 木（しっかり練習）' },
  difficultyMountain: { en: '🏔️ Mountain (stretch!)', jp: '🏔️ 山（チャレンジ！）' },
  // Practice HUD
  score: { en: 'Score', jp: '楽譜' },
  quit: { en: 'Quit', jp: 'やめる' },
  inputSource: { en: 'Input source', jp: '入力ソース' },
  // Result screen
  pitchAccuracy: { en: 'Pitch accuracy', jp: '音程の正確さ' },
  timing: { en: 'Timing', jp: 'タイミング' },
  noteLength: { en: 'Note length', jp: '音の長さ' },
  bestComboLabel: { en: 'Best combo', jp: '連続成功（最高）' },
  songSelect: { en: 'Song select', jp: 'きょく選択' },
  tryAgainBtn: { en: 'Try again', jp: 'もう一度' },
  nextBtn: { en: 'Next →', jp: 'つぎへ →' },
  // Hit chips / dynamic
  perfect: { en: 'Perfect!' },
  nice: { en: 'Nice!' },
  missChip: { en: 'Miss', jp: 'ミス' },
  youPlayedFmt: { en: 'You played: {v}', jp: '弾いた音: {v}' },
  tooShort: { en: '⏱ Too short', jp: '⏱ 短い' },
  tooLong: { en: '⏱ Too long', jp: '⏱ 長い' },
  // Lane labels
  laneLeft: { en: 'LEFT', jp: '左手' },
  laneRight: { en: 'RIGHT', jp: '右手' },
  countInGo: { en: 'GO!' },
  // Stages
  stage1: { en: 'Awakening', jp: 'めざめ' },
  stage2: { en: 'Blooming', jp: 'はなひらく' },
  stage3: { en: 'Aurora', jp: 'オーロラ' },
  stage4: { en: 'Cosmos', jp: 'コスモス' },
  stage5: { en: 'Radiance', jp: 'かがやき' },
  stage6: { en: 'Legend', jp: 'でんせつ' },
  // Encouragement tiers
  enc1: { en: 'Nice!', jp: 'いいよ！' },
  enc2: { en: 'Great!', jp: 'すごい！' },
  enc3: { en: 'On a roll!', jp: 'のってきた！' },
  enc4: { en: 'Sparkle!', jp: 'きらきら！' },
  enc5: { en: 'Beautiful!', jp: 'すてきなおと！' },
  enc6: { en: 'Like magic!', jp: 'まほうみたい！' },
  enc7: { en: 'Shining!', jp: 'かがやいてる！' },
  enc8: { en: 'Awesome!', jp: 'さいこう！' },
  // Result tiers
  // tier0 uses Dweck "Not yet" + specific next strategy (Mueller & Dweck
  // 1998; EEF 2019 — generic "not yet" alone failed, the specific
  // strategy is what carries the effect).
  tier0Title: { en: 'Not yet — keep going!', jp: 'もうちょっと！' },
  tier0Msg: {
    en: 'Try a slower tempo, or play one hand at a time first.',
    jp: 'ゆっくりテンポにするか、片手ずつ弾いてみよう。',
  },
  // tier0 escalation — after 2+ consecutive 0-star attempts, switch to a
  // mode-switch suggestion (listen the section, take a breath).
  tier0RetryTitle: { en: 'Tough section!', jp: '難しいところだね！' },
  tier0RetryMsg: {
    en: 'Many kids struggle here. Try Listen mode to hear it first.',
    jp: 'ここは多くの人がつまずく場所。まずリッスンで聴いてみよう。',
  },
  // One-tap "retry with support" button on a 0-star result — applies the
  // scaffold strategy (listen / one-hand / slower tempo) and restarts the
  // same section. Always available, no time pressure (banned-list safe).
  resRetryListen: { en: '🎧 Listen, then retry', jp: '🎧 きいてから もう一度' },
  resRetryOneHand: { en: '👉 Retry right hand only', jp: '👉 右手だけで もう一度' },
  resRetrySlowFmt: { en: '🐢 Retry at {v}%', jp: '🐢 {v}%で もう一度' },
  // Practice-minute stats (journal calendar tab). Cumulative-only — never
  // framed as a goal or a shortfall (banned-list).
  calendarTodayMinutes: { en: 'Today', jp: 'きょうの練習' },
  calendarLifetimeMinutes: { en: 'Total time', jp: 'これまでの合計' },
  minutesValueFmt: { en: '{v} min', jp: '{v}分' },
  tier1Title: { en: 'Clear!', jp: 'クリア！' },
  tier1Msg: {
    en: 'Clear! Keep practicing to get even better.',
    jp: 'クリアおめでとう！くりかえしで上達するよ。',
  },
  tier2Title: { en: '🎉 Part Clear!', jp: '🎉 章クリア！' },
  tier2Msg: { en: 'Great job! Almost perfect!', jp: 'よくがんばったね！もう少しでパーフェクト！' },
  tier3Title: { en: '🌟 Perfect!', jp: '🌟 パーフェクト！' },
  tier3Msg: {
    en: 'Brilliant! Try the next difficulty!',
    jp: 'すばらしい！次の難しさにチャレンジ！',
  },
  // Songs (Für Elise)
  furElise: { en: 'Für Elise', jp: 'エリーゼのために' },
  feA1: { en: 'Part 1: Theme', jp: '第1章 主題' },
  feA1desc: {
    en: 'The famous melody. Start gently.',
    jp: '有名なあのメロディ。やさしく始めよう。',
  },
  feB: { en: 'Part 2: Gentle Middle', jp: '第2章 おだやかな中間' },
  feBdesc: {
    en: 'A bright C-major section, then back to the theme.',
    jp: 'C長調のあかるい部分→主題に戻ります。',
  },
  feA2: { en: 'Part 3: Storm & Finale', jp: '第3章 嵐とフィナーレ' },
  feA2desc: {
    en: 'A D-minor storm, then back to the theme — the climax!',
    jp: 'D短調の嵐→主題に戻りラスト！ここがクライマックス。',
  },
  // Songs (Turkish March)
  turkishMarch: { en: 'Turkish March', jp: 'トルコ行進曲' },
  taA1: { en: 'Part 1: Light Theme', jp: '第1章 軽やかな主題' },
  taA1desc: {
    en: 'The famous theme plus an A-major contrasting section. Right-hand scales feel great.',
    jp: '有名な主題＋A長調の対比部。右手のスケールが気持ちいい。',
  },
  taB: { en: 'Part 2: Theme Variations', jp: '第2章 主題のへんそう' },
  taBdesc: {
    en: 'The theme returns transformed — chord practice.',
    jp: '主題が形を変えてかえってくる。和音の練習。',
  },
  taA2: { en: 'Part 3: March Festival', jp: '第3章 マルチアの祭り' },
  taA2desc: {
    en: "The coda's powerful octaves! Race to the finale.",
    jp: 'コーダの力強いオクターブ！フィナーレに駆けあがろう。',
  },
  // Misc
  loadingScore: { en: 'Loading score…', jp: '楽譜を読み込み中…' },
  starting: { en: 'Starting...', jp: '起動中...' },
  audioInitFailedFmt: {
    en: 'Audio init failed: {v}\n\nReload the browser and try again.',
    jp: 'オーディオ初期化に失敗しました: {v}\n\nブラウザを更新してリトライしてみてください。',
  },
  // Composers — last-name katakana for JP (common in JP music ed)
  composerBeethoven: { en: 'L. v. Beethoven', jp: 'ベートーヴェン' },
  composerMozart: { en: 'W. A. Mozart', jp: 'モーツァルト' },
  // Result-screen unlock messages
  tempoUnlockedFmt: { en: '🚀 Tempo {v}% unlocked!  ', jp: '🚀 テンポ {v}% 解放！  ' },
  sectionUnlockedFmt: { en: '🔓 {v} unlocked!', jp: '🔓 {v} 解放！' },
  streakDaysFmt: { en: ' ✨ {v}-day streak!', jp: ' ✨ ストリーク {v}日！' },
  // Result-screen growth chart
  growthChartFmt: { en: 'Growth ({v} attempts)', jp: '成長グラフ ({v}回)' },
  trendSimilar: { en: '→ similar', jp: '→ おなじくらい' },
  // Growth-framed trajectory caption (replaces the old red "↓ -8%" loss-frame
  // — no down-arrow, ever; self-referenced to the kid's own past, not a target).
  // A new personal best, else gain-since-first, else a neutral encouragement.
  trendBestYet: { en: '🌟 Best yet!', jp: '🌟 自己ベスト！' },
  trendUpFmt: { en: '↑ +{v}% vs. first', jp: '↑ 最初より +{v}%' },
  trendKeepGoing: { en: 'Keep going 🌱', jp: 'この調子 🌱' },
  // Two-line chart legend (accuracy = gold, timing = cyan).
  legendAccuracy: { en: 'Acc', jp: '正確さ' },
  legendTiming: { en: 'Time', jp: 'テンポ' },
  sustainLabel: { en: 'SUSTAIN' },
  // Free-play HUD (session status while playing without a song)
  listeningFmt: { en: '{p}Listening{p}', jp: '{p}きいてるよ{p}' },
  goalCelebrate: { en: '✨ Goal reached! Keep it up! ✨', jp: '✨ 目標達成！この調子！ ✨' },
  goalCountdownFmt: { en: 'Goal: stable play for {v}s', jp: '目標: 安定演奏 {v}秒' },
  // Free-play quality coaching (shown in the qualityScore HUD)
  strengthFmt: { en: 'Strength: {v}', jp: 'できた点: {v}' },
  nextStepFmt: { en: 'Next: {v}', jp: '次の1手: {v}' },
  // Quality coaching strengths
  strNotesClear: { en: 'playing each note clearly', jp: '音をしっかり鳴らせている' },
  strGrowing: { en: 'improving steadily over the last 30s', jp: '直近30秒で着実に伸びている' },
  strRhythmSteady: { en: 'rhythm is steady', jp: 'リズムが安定している' },
  strDynamicsGood: { en: 'good dynamic control', jp: '強弱のコントロールが良い' },
  strPitchStable: { en: 'pitch is stable', jp: '音程の安定感が高い' },
  // Quality coaching next steps
  nxtBreathe: { en: 'breathe and hold tempo for 20s', jp: '深呼吸して同じテンポを20秒キープ' },
  nxtOneHand: {
    en: 'one hand slowly, hold tempo for 20s',
    jp: '片手でゆっくり、一定テンポを20秒キープ',
  },
  nxtSoftLoud: {
    en: 'build soft to loud across one phrase',
    jp: '1フレーズの中で弱→強を2段階つける',
  },
  nxtHoldNotes: {
    en: 'hold each note fully before moving on',
    jp: '1音ずつ最後まで伸ばしてから次の音へ',
  },
  // Section-result coaching (Knowledge of Performance). Shown on the result
  // card under ★3: pairs one real strength with one specific next step so
  // the kid leaves knowing *what* to work on, not just the outcome (KP > KR
  // for multi-dimensional tasks; EEF 2019 specific-strategy; Dweck process-
  // praise). {s}=strength clause, {f}=next-step clause.
  sectionFocusFmt: { en: 'Nice — {s}. Next: {f}.', jp: 'いいね、{s}。次は{f}。' },
  // Strength clauses (named only when the dimension actually cleared a
  // floor; 'sfEffort' is the honest fallback when nothing did).
  sfEffort: { en: 'you played the whole part through', jp: 'さいごまで弾けたね' },
  sfNotesStrong: { en: 'you found most of the notes', jp: '音をよく見つけられている' },
  sfTimingStrong: { en: 'your timing fits the beat', jp: 'リズムがビートに合ってきた' },
  sfHoldStrong: { en: 'you held the notes their full length', jp: '音を最後まで伸ばせている' },
  // Next-step clauses (one specific, actionable strategy per weak axis).
  fNotes: {
    en: 'play one hand slowly to lock in the notes',
    jp: '片手でゆっくり弾いて音をおぼえよう',
  },
  fTiming: {
    en: 'count out loud, or drop one tempo step to catch the beat',
    jp: '声に出して数えるか、テンポを1だんおとしてビートに合わせよう',
  },
  fHold: {
    en: "hold each note until the next one — don't lift early",
    jp: '次の音まで指をはなさず、最後までのばそう',
  },
  // Pre-flight scaffold (feed-forward) — shown on the song panel BEFORE the kid
  // re-attempts a section they recently got stuck on. Kid-initiated, gentle, no
  // shame (Hattie & Timperley 2007 "where to next?").
  preflightHint: {
    en: '💡 Tricky last time? Tap 🎧 Listen to hear it first.',
    jp: '💡 前回は難しかったかな？🎧 リッスンで先に聴いてみよう。',
  },
  // Escalated variants — shown when the struggle runs deeper (3+ misses),
  // matched to the bottleneck: notes (one hand) vs timing (slower tempo).
  preflightHintOneHand: {
    en: '💡 Still tricky? Try one hand (👈 / 👉) slowly, then 🎧 Listen.',
    jp: '💡 まだ難しい？片手（👈 / 👉）でゆっくり→🎧 リッスンもしてみよう。',
  },
  preflightHintSlow: {
    en: '💡 Still tricky? Pick a slower tempo, then 🎧 Listen first.',
    jp: '💡 まだ難しい？テンポを下げて、🎧 リッスンで先に聴こう。',
  },
  // One-tap "set it up for me" button on the pre-flight nudge. Applies the
  // suggested strategy (the kid can still change it by hand — autonomy kept).
  preflightApplyListen: { en: '🎧 Switch to Listen', jp: '🎧 リッスンにする' },
  preflightApplyOneHand: { en: '👉 Right hand only', jp: '👉 右手だけにする' },
  preflightApplySlowFmt: { en: '🐢 Slow to {v}%', jp: '🐢 {v}% にする' },
  // Self-assessment (self-regulated-learning reflection phase). One optional,
  // non-persisted tap on the result card. The *act* of self-rating is the
  // documented benefit (Int J Soc Robotics 2023 — raised both motivation and
  // performance in children's piano practice; Zimmerman/McPherson SRL
  // self-evaluation). Replies never contradict the kid's own feeling and
  // never shame a low score (calibration honesty + growth mindset).
  selfAssessPrompt: { en: 'How did that feel?', jp: 'どんなかんじだった？' },
  selfAssessBtnTricky: { en: '😣 Tricky', jp: '😣 むずかしかった' },
  selfAssessBtnOk: { en: '🙂 Okay', jp: '🙂 まあまあ' },
  selfAssessBtnGreat: { en: '😄 Great', jp: '😄 ばっちり' },
  // Felt tricky but actually cleared (★2+): validate effort + reframe.
  selfAssessReplyTrickyWin: {
    en: 'Felt tricky — and you still did it! Tricky means you are leveling up.',
    jp: 'むずかしく感じたのに、できてる！むずかしい＝レベルアップ中のサインだよ。',
  },
  // Felt tricky, not yet there: praise the noticing (metacognition).
  selfAssessReplyTricky: {
    en: 'Noticing it feels tricky is a real skill — that is where practice goes next.',
    jp: '「むずかしい」と気づけるのは大事な力。そこが次のびしろだよ。',
  },
  selfAssessReplyOk: {
    en: 'Trust that feeling — it tells you what to practice next.',
    jp: 'その「まあまあ」の感覚を大切に。次の練習のヒントになるよ。',
  },
  // Felt great and cleared: affirm the earned confidence.
  selfAssessReplyGreatWin: {
    en: 'That confidence is well earned. Trust it!',
    jp: 'その自信はホンモノ。信じていいよ！',
  },
  // Felt great, score not there yet: honor the joy, never contradict it.
  selfAssessReplyGreat: {
    en: 'Loving how it felt is what keeps you playing. Keep that joy!',
    jp: '「楽しかった！」がいちばん大事。その気持ちでつづけよう！',
  },
  // Quest names + descriptions (free-play)
  qst1Name: { en: 'First Notes', jp: 'はじまりの音' },
  qst1Desc: { en: 'Play 3 notes', jp: '音を3回鳴らしてみよう' },
  qst2Name: { en: 'Catch the Flow', jp: '流れに乗って' },
  qst2Desc: { en: 'Fill the flow gauge halfway', jp: 'フローゲージを半分までためよう' },
  qst3Name: { en: 'Combo Master', jp: 'コンボマスター' },
  qst3Desc: { en: 'Reach 30 combo!', jp: '30コンボ達成！' },
  qst4Name: { en: 'Clean Tone', jp: 'きれいな音' },
  qst4Desc: { en: 'Keep stability at 80%+', jp: '安定性80%以上をキープ' },
  qst5Name: { en: 'Pianist', jp: 'ピアニスト' },
  qst5Desc: { en: 'Play with confidence', jp: '自信を持って演奏しよう' },
  qst6Name: { en: 'Rhythm Master', jp: 'リズムの達人' },
  qst6Desc: { en: 'Rhythm score 85%+', jp: 'リズムスコア85%以上！' },
  qst7Name: { en: 'Peak Flow', jp: 'フローの極み' },
  qst7Desc: { en: 'Reach 95% flow', jp: 'フローゲージを95%以上にしよう' },
  qst8Name: { en: '100 Combo', jp: '100コンボ' },
  qst8Desc: { en: 'Reach 100 combo!', jp: '100コンボ達成！' },
  qst9Name: { en: 'Dynamics', jp: 'ダイナミクス' },
  qst9Desc: { en: 'Dynamics 80%+', jp: 'ダイナミクス80%以上！' },
  qst10Name: { en: 'Full Focus', jp: '全集中' },
  qst10Desc: { en: 'Overall score 85%+', jp: '総合スコア85%以上！' },
  qst11Name: { en: 'Legendary Pianist', jp: '伝説のピアニスト' },
  qst11Desc: { en: '200 combo & 90% flow', jp: '200コンボ&フロー90%以上' },
  // Quest display chrome
  questAllClearFmt: { en: '🎉 {n}/{n} All Clear!', jp: '🎉 {n}/{n} 全クリア！' },
  questTargetFmt: { en: '🎯 {v}', jp: '🎯 {v}' },
  questClearedFmt: { en: '✅ {v} CLEARED!', jp: '✅ {v} クリア！' },
  // Session summary (post free-play)
  sumTitle: { en: '🎹 Session Results', jp: '🎹 セッション結果' },
  sumBestCombo: { en: '🎵 Best Combo', jp: '🎵 ベストコンボ' },
  sumStageReached: { en: '🏔 Stage Reached', jp: '🏔 到達ステージ' },
  sumPlayTime: { en: '⏱ Play Time', jp: '⏱ 演奏時間' },
  sumQuests: { en: '⭐ Quests', jp: '⭐ クエスト' },
  sumTitleBtn: { en: '🏠 Title', jp: '🏠 タイトル' },
  sumContinue: { en: 'Continue →', jp: 'つづける →' },
  // User-song UI
  addSongBtn: { en: '➕ Add a song', jp: '➕ 曲を追加' },
  addSongTitle: { en: 'Add a song', jp: '曲を追加' },
  addSongTabLibrary: { en: '📚 Library', jp: '📚 ライブラリ' },
  addSongTabFile: { en: '📁 File', jp: '📁 ファイル' },
  addSongTabUrl: { en: '🔗 URL' },
  addSongLibraryHelp: {
    en: 'Free public-domain pieces from MuseTrainer (jsDelivr CDN). Tap to download.',
    jp: 'MuseTrainer のパブリックドメイン曲（jsDelivr経由）。タップでダウンロード。',
  },
  addSongFilePick: {
    en: 'Choose .mxl / .musicxml / .xml file',
    jp: '.mxl / .musicxml / .xml ファイルを選択',
  },
  addSongFileHelp: {
    en: 'Drop a MusicXML file. I confirm it is public domain or my own work.',
    jp: 'MusicXML ファイルをドロップ。パブリックドメインまたは自作の曲であることを確認します。',
  },
  addSongPdAttest: {
    en: 'I confirm this score is public domain or my own work',
    jp: 'パブリックドメインまたは自作の曲です',
  },
  // File-picker-free import (for browsers without <input type=file>, e.g.
  // the Web MIDI Browser on iPad): drag a file from the Files app.
  addSongDropHint: {
    en: '…or drag a file here from the Files app',
    jp: '…または Files アプリからここにドラッグ＆ドロップ',
  },
  // Two-tap delete + inline rename (native confirm()/prompt() don't work
  // in constrained WKWebViews like the Web MIDI Browser).
  addSongConfirmTap: { en: 'Tap again to delete', jp: 'もう一度タップで削除' },
  addSongRenameSave: { en: 'Save', jp: '保存' },
  addSongRenameCancel: { en: 'Cancel', jp: 'やめる' },
  addSongUrlPlaceholder: { en: 'https://cdn.jsdelivr.net/.../score.mxl' },
  addSongUrlHelp: {
    en: 'Paste a direct .mxl / .musicxml URL (must be CORS-enabled, e.g. jsDelivr).',
    jp: '.mxl / .musicxml の直リンク（CORS対応URL、例: jsDelivr）。',
  },
  addSongFetch: { en: '⬇ Download', jp: '⬇ ダウンロード' },
  addSongAdded: { en: 'Added!', jp: '追加しました！' },
  addSongFailed: { en: 'Failed: {v}', jp: '失敗: {v}' },
  myLibrary: { en: 'My library', jp: 'マイライブラリ' },
  addSongRemove: { en: 'Delete', jp: '削除' },
  addSongConfirmRemove: {
    en: 'Delete "{v}"? This cannot be undone.',
    jp: '「{v}」を削除しますか？元に戻せません。',
  },
  addSongSearch: { en: 'Search composer / title…', jp: '作曲家・曲名で検索…' },
  addSongLibraryLoading: { en: 'Loading catalog…', jp: 'カタログ取得中…' },
  addSongLibraryCount: { en: '{n} pieces', jp: '{n} 曲' },
  addSongLibraryOffline: {
    en: 'Catalog offline — showing seed list',
    jp: 'カタログ取得失敗 — 既定リストを表示',
  },
  addSongExport: { en: '⬇ Export library', jp: '⬇ エクスポート' },
  addSongImport: { en: '⬆ Import', jp: '⬆ インポート' },
  addSongImportDone: { en: 'Imported {n} song(s)', jp: '{n} 曲をインポートしました' },
  addSongEditSections: { en: '✎ Edit sections', jp: '✎ 章を編集' },
  addSongRename: { en: '✎ Rename', jp: '✎ 名前を変更' },
  addSongRenamePromptTitle: { en: 'New title:', jp: '新しい曲名：' },
  addSongRenamePromptComposer: { en: 'New composer:', jp: '新しい作曲家：' },
  sectionEditTitle: { en: 'Edit sections', jp: '章の編集' },
  sectionEditHelp: {
    en: 'Set start measure (1-based) for each part. Total: {v} measures.',
    jp: '各章の開始小節を入力（1始まり）。全{v}小節。',
  },
  sectionEditSave: { en: 'Save', jp: '保存' },
  sectionEditCancel: { en: 'Cancel', jp: 'キャンセル' },
  sectionEditError: {
    en: 'Boundaries must be increasing and within range.',
    jp: '小節番号は昇順かつ範囲内で入力してください。',
  },
  // Auto-section names for user-added songs (no human-curated descriptions)
  userSecA1: { en: 'Part 1', jp: '第1章' },
  userSecA1desc: { en: 'Opening section', jp: '冒頭の部分' },
  userSecB: { en: 'Part 2', jp: '第2章' },
  userSecBdesc: { en: 'Middle section', jp: 'まんなかの部分' },
  userSecA2: { en: 'Part 3 (climax)', jp: '第3章（クライマックス）' },
  userSecA2desc: { en: 'Final section', jp: 'おわりの部分' },

  // ==== 0.14 — Practice journal (completion visualization) ====
  // Title screen button + library strip
  journalBtn: { en: '📔 Practice journal', jp: '📔 練習ジャーナル' },
  // Pianist Card — identity primer per McPherson 10-yr longitudinal.
  pianistCardCta: {
    en: '🎹 Tap to set your pianist name',
    jp: '🎹 ピアニスト名を決める',
  },
  pianistCommitFmt: {
    en: 'Playing until {y}',
    jp: '{y}年まで続ける',
  },
  pianistDaysLeftFmt: { en: '{n} days to go', jp: 'あと{n}日' },
  pianistGoalReached: { en: '🎯 You reached your goal year!', jp: '🎯 目標の年に到達!' },
  pianistEditTitle: { en: 'Pianist card', jp: 'ピアニストカード' },
  pianistAvatarLabel: { en: 'Choose an avatar', jp: 'アバターを選ぶ' },
  pianistNameLabel: { en: 'Pianist name', jp: 'ピアニスト名' },
  pianistNamePlaceholder: { en: 'Your name', jp: '名前' },
  pianistCommitLabel: { en: 'Playing until (year)', jp: '何年まで続ける?' },
  pianistCommitPlaceholder: { en: '2035', jp: '2035' },
  pianistCommitHelp: {
    en: "How long do you think you'll keep playing? (Optional)",
    jp: '何年までピアノを続けると思う? (任意)',
  },
  startScreenPianistGreetingFmt: {
    en: "{name}'s piano journey",
    jp: '{name}のピアノ・ジャーニー',
  },
  cancel: { en: 'Cancel', jp: 'キャンセル' },
  save: { en: 'Save', jp: '保存' },
  // Weekly practice meter — Zhao 2022 weekly-cadence safety.
  weeklyMeterLabel: { en: 'This week', jp: '今週の練習' },
  weeklyMeterFmt: { en: '{n} / {target} days', jp: '{n} / {target} 日' },
  // Goal-gradient hint that rides beneath the section banner.
  // Kept short: the banner is on-screen for ~2 s.
  sectionBannerHintFmt: {
    en: '{n} more star to {seal}!',
    jp: 'あと{n}星で{seal}!',
  },
  libStripStarsFmt: { en: '{earned} / {total} stars', jp: '{earned} / {total} 星' },
  libStripStampsFmt: { en: '{n} stamps', jp: 'スタンプ {n} 個' },
  libStripDaysFmt: { en: '{n} days', jp: '{n} 日' },
  libStripNearFmt: {
    en: '⭐ {n} more star{n,plural} to level up "{song}"!',
    jp: 'あと{n}星で「{song}」がレベルアップ！',
  },
  // Modal chrome
  journalTitle: { en: 'Practice journal', jp: '練習ジャーナル' },
  journalTabRepertoire: { en: '📚 Repertoire', jp: '📚 レパートリー' },
  journalTabStamps: { en: '🏅 Stamps', jp: '🏅 スタンプ' },
  journalTabCalendar: { en: '📅 Calendar', jp: '📅 カレンダー' },
  journalEmptyRepertoire: {
    en: 'No songs yet — add one from the title screen.',
    jp: 'まだ曲がありません — タイトル画面から追加してね。',
  },
  journalEmptyCalendar: {
    en: 'Practice once to start your calendar.',
    jp: '一度練習するとカレンダーが始まるよ。',
  },
  // Rollup at the top of the modal
  rollupStarsLabel: { en: 'Stars', jp: '星' },
  rollupStampsLabel: { en: 'Stamps', jp: 'スタンプ' },
  rollupDaysLabel: { en: 'Practice days', jp: '練習日数' },
  rollupStarsFmt: { en: '{earned} / {total}', jp: '{earned} / {total}' },
  rollupStampsFmt: { en: '{earned} / {total}', jp: '{earned} / {total}' },
  rollupDaysFmt: { en: '{n}', jp: '{n} 日' },
  // Weekly growth rollup — shown only when the kid actually improved this week
  // (positive-only; never a "you went down" line). Self-referenced to their
  // own past week.
  rollupGrowthLabel: { en: 'This week', jp: '今週' },
  rollupGrowthAccFmt: { en: 'Accuracy +{v}pt 📈', jp: '正確さ +{v}pt 📈' },
  rollupGrowthTimeFmt: { en: 'Timing +{v}pt 📈', jp: 'テンポ +{v}pt 📈' },
  // Repertoire tab
  sealNone: { en: 'Just starting', jp: 'これから' },
  sealBronze: { en: 'Bronze', jp: '銅' },
  sealSilver: { en: 'Silver', jp: '銀' },
  sealGold: { en: 'Gold', jp: '金' },
  sealPlatinum: { en: 'Platinum', jp: '白金' },
  // Calendar tab
  calendarPracticed: { en: 'Practiced', jp: '練習した日' },
  calendarLifetimeDays: { en: 'Lifetime practice days', jp: '通算練習日数' },
  calendarCurrentStreak: { en: 'Current streak', jp: '現在の連続日数' },
  // Stamps tab — category labels + hidden placeholder
  stampCatCompletion: { en: 'Completion', jp: '達成' },
  stampCatPerformance: { en: 'Performance', jp: 'パフォーマンス' },
  stampCatPractice: { en: 'Practice', jp: '練習の工夫' },
  stampCatMilestone: { en: 'Milestone', jp: '節目' },
  stampHidden: { en: '???', jp: '？？？' },
  // Per-stamp strings (24 stamps × name+desc+earned = 72 entries)
  // -- Completion --
  stampFirstSectionName: { en: 'First Section', jp: 'はじめの一歩' },
  stampFirstSectionDesc: { en: 'Cleared your first section', jp: 'はじめてセクションをクリア' },
  stampFirstSectionEarned: { en: 'First section cleared!', jp: 'はじめてのクリア!' },
  stampFirstThreeStarName: { en: 'Triple Star', jp: '三ツ星' },
  stampFirstThreeStarDesc: {
    en: 'Earned 3 stars for the first time',
    jp: 'はじめて三ツ星を獲得',
  },
  stampFirstThreeStarEarned: { en: '★★★ Three stars!', jp: '★★★ 三ツ星!' },
  stampSongAllSectionsName: { en: 'Whole Piece', jp: '全曲制覇' },
  stampSongAllSectionsDesc: {
    en: 'Cleared every section of a song',
    jp: '1曲のすべてのセクションをクリア',
  },
  stampSongAllSectionsEarned: { en: 'Every section cleared!', jp: '全セクションクリア!' },
  stampSongSilverName: { en: 'Silver Songbook', jp: '銀の楽譜' },
  stampSongSilverDesc: {
    en: 'Every section at 2+ stars',
    jp: 'すべてのセクションが二ツ星以上',
  },
  stampSongSilverEarned: { en: 'Silver-rank piece!', jp: '銀ランクの曲!' },
  stampSongGoldName: { en: 'Gold Songbook', jp: '金の楽譜' },
  stampSongGoldDesc: { en: 'Every section at 3 stars', jp: 'すべてのセクションが三ツ星' },
  stampSongGoldEarned: { en: 'Gold-rank piece!', jp: '金ランクの曲!' },
  stampTempo100Name: { en: 'Full Tempo', jp: '本来の速さ' },
  stampTempo100Desc: {
    en: 'Unlocked 100% tempo on a song',
    jp: '100%テンポを解放',
  },
  stampTempo100Earned: { en: 'Full tempo unlocked!', jp: '100%テンポ解放!' },
  // -- Performance --
  stampCombo25Name: { en: 'Combo 25', jp: '25コンボ' },
  stampCombo25Desc: { en: 'Built a 25-note combo', jp: '25連続ヒット' },
  stampCombo25Earned: { en: 'Combo 25!', jp: '25コンボ!' },
  stampCombo50Name: { en: 'Combo 50', jp: '50コンボ' },
  stampCombo50Desc: { en: 'Built a 50-note combo', jp: '50連続ヒット' },
  stampCombo50Earned: { en: 'Combo 50!', jp: '50コンボ!' },
  stampCombo100Name: { en: 'Combo 100', jp: '100コンボ' },
  stampCombo100Desc: { en: 'Built a 100-note combo', jp: '100連続ヒット' },
  stampCombo100Earned: { en: 'Combo 100!', jp: '100コンボ!' },
  stampPerfectAccName: { en: 'Perfect', jp: 'パーフェクト' },
  stampPerfectAccDesc: { en: '100% accurate run', jp: '正確率100%' },
  stampPerfectAccEarned: { en: 'Perfect accuracy!', jp: 'パーフェクト達成!' },
  stampFlowPeak80Name: { en: 'High Flow', jp: 'フローの波' },
  stampFlowPeak80Desc: { en: 'Flow reached 80', jp: 'フローが80に到達' },
  stampFlowPeak80Earned: { en: 'High flow!', jp: '高いフロー!' },
  stampFlowPeakMaxName: { en: 'Flow Master', jp: 'フローの達人' },
  stampFlowPeakMaxDesc: { en: 'Flow nearly maxed out', jp: 'フローがほぼ満タン' },
  stampFlowPeakMaxEarned: { en: 'Flow mastered!', jp: 'フローの達人!' },
  // -- Practice --
  stampSameSection5xName: { en: 'Polished', jp: 'コツコツ磨き' },
  stampSameSection5xDesc: {
    en: 'Practiced one section 5 times',
    jp: '同じセクションを5回練習',
  },
  stampSameSection5xEarned: { en: 'Polish complete!', jp: 'よく磨いた!' },
  stampSameSection8xName: { en: 'Diamond Polish', jp: 'ダイヤモンド磨き' },
  stampSameSection8xDesc: {
    en: 'Practiced one section 8 times',
    jp: '同じセクションを8回練習',
  },
  stampSameSection8xEarned: { en: 'Diamond-level practice!', jp: 'ダイヤモンド級!' },
  stampSlowTempo5Name: { en: 'Slow Starter', jp: 'ゆっくり派' },
  stampSlowTempo5Desc: {
    en: 'Practiced 5 sections at 60% tempo',
    jp: '60%テンポで5セクション練習',
  },
  stampSlowTempo5Earned: { en: 'Slow & steady!', jp: 'ゆっくりが上達への近道!' },
  stampVarietyTodayName: { en: 'Variety', jp: 'いろいろチャレンジ' },
  stampVarietyTodayDesc: {
    en: 'Practiced 3 different sections today',
    jp: '今日3つ違うセクションを練習',
  },
  stampVarietyTodayEarned: { en: 'Variety practice!', jp: 'バラエティ練習!' },
  stampComebackName: { en: 'Comeback', jp: 'ぐんと上達' },
  stampComebackDesc: { en: 'Improved by 20%+ in one attempt', jp: '1回で20%以上アップ' },
  stampComebackEarned: { en: 'Big comeback!', jp: 'ぐんと上達!' },
  stampStarUpName: { en: 'Star Up', jp: '星アップ' },
  stampStarUpDesc: { en: 'Earned a new star (2+)', jp: '新しい星を獲得（2つ以上）' },
  stampStarUpEarned: { en: 'New star!', jp: '星アップ!' },
  // -- Milestone --
  stampTwoSongsName: { en: 'Two-Song Explorer', jp: '2曲チャレンジ' },
  stampTwoSongsDesc: { en: 'Touched 2 different songs', jp: '2曲に挑戦' },
  stampTwoSongsEarned: { en: 'Two-song explorer!', jp: '2曲チャレンジ達成!' },
  stampFiveSongsName: { en: 'Five-Song Explorer', jp: '5曲チャレンジ' },
  stampFiveSongsDesc: { en: 'Touched 5 different songs', jp: '5曲に挑戦' },
  stampFiveSongsEarned: { en: 'Five-song explorer!', jp: '5曲チャレンジ達成!' },
  stampTenSectionsName: { en: 'Ten Sections', jp: '10セクション制覇' },
  stampTenSectionsDesc: { en: 'Cleared 10 sections in total', jp: '通算10セクションをクリア' },
  stampTenSectionsEarned: { en: '10 sections cleared!', jp: '10セクションクリア!' },
  stampLifetime3DaysName: { en: '3 Days', jp: '3日達成' },
  stampLifetime3DaysDesc: { en: 'Practiced on 3 different days', jp: '3日練習' },
  stampLifetime3DaysEarned: { en: '3 practice days!', jp: '3日達成!' },
  stampLifetime7DaysName: { en: '7 Days', jp: '7日達成' },
  stampLifetime7DaysDesc: { en: 'Practiced on 7 different days', jp: '7日練習' },
  stampLifetime7DaysEarned: { en: '7 practice days!', jp: '7日達成!' },
  stampLifetime30DaysName: { en: '30 Days', jp: '30日達成' },
  stampLifetime30DaysDesc: { en: 'Practiced on 30 different days', jp: '30日練習' },
  stampLifetime30DaysEarned: { en: '30 practice days!', jp: '30日達成!' },
  // Stamp coaching tips — one-line Knowledge-of-Performance hints fired
  // on earn. Salmoni 1984 guidance hypothesis: intermittent KP > per-
  // attempt KP. Once-per-stamp-event is the right cadence for kids 9-12.
  stampFirstSectionTip: {
    en: 'That feeling is your brain mapping the keys.',
    jp: 'いまの感覚は、脳がキーを覚えた合図だよ。',
  },
  stampFirstThreeStarTip: {
    en: 'Accuracy, timing, and length all clicked together.',
    jp: '音・タイミング・長さが全部そろった証。',
  },
  stampSongAllSectionsTip: {
    en: 'Most players take 5-10 tries per section. Normal!',
    jp: '1章あたり5〜10回トライは普通。当たり前!',
  },
  stampSongSilverTip: {
    en: 'Silver = every part is solidly playable.',
    jp: '銀ランクは「どこもしっかり弾ける」レベル。',
  },
  stampSongGoldTip: {
    en: 'Gold takes weeks of practice. You earned this.',
    jp: '金は週単位の積み重ね。あなたが続けた結果。',
  },
  stampTempo100Tip: {
    en: 'Full tempo means the song is in your body now.',
    jp: '本来の速さで弾ける = 体に入った状態。',
  },
  stampCombo25Tip: {
    en: 'Your focus held for 25 in a row. Breathe, continue.',
    jp: '25連続で集中が続いた。深呼吸して次へ。',
  },
  stampCombo50Tip: {
    en: '50-combo shows the rhythm has internalized.',
    jp: '50コンボはリズムが体に染みた印。',
  },
  stampCombo100Tip: {
    en: '100-combo is the flow zone — athletes train for this.',
    jp: '100コンボは「フロー」。アスリートも目指す境地。',
  },
  stampPerfectAccTip: {
    en: 'Every note hit. Your map of the score is precise.',
    jp: '全音正解。楽譜の地図ができてる。',
  },
  stampFlowPeak80Tip: {
    en: 'High flow happens when challenge meets ability.',
    jp: 'フローは、難しさと実力が釣り合うときに来る。',
  },
  stampFlowPeakMaxTip: {
    en: 'Peak flow. Remember this feeling — chase it again.',
    jp: 'フローのピーク。この感覚を覚えておこう。',
  },
  stampSameSection5xTip: {
    en: 'Repetition wires the finger map (Wulf, motor learning).',
    jp: '反復で指の地図ができる（Wulf 2008の研究）。',
  },
  stampSameSection8xTip: {
    en: '8 reps and the movement becomes automatic.',
    jp: '8回でその動きが自動化する。',
  },
  stampSlowTempo5Tip: {
    en: 'Slow practice IS fast practice — not a shortcut.',
    jp: 'ゆっくり練習が結局いちばん早い近道。',
  },
  stampVarietyTodayTip: {
    en: 'Mixing sections beats grinding one (research-backed).',
    jp: '色々な箇所を回す方が、1ヶ所連続より上達する。',
  },
  stampComebackTip: {
    en: '+20% in one try means you changed something. Keep it.',
    jp: '1回で20%アップ = 何かを変えた証。その方法をキープ。',
  },
  stampStarUpTip: {
    en: 'New star = your brain found a better pattern.',
    jp: '星アップ = 脳が新しいパターンを見つけた。',
  },
  stampTwoSongsTip: {
    en: 'Two songs in rotation lets skills transfer between them.',
    jp: '2曲回しは技が曲間で移る相乗効果あり。',
  },
  stampFiveSongsTip: {
    en: 'Five-piece rotation is where many pianists actually live.',
    jp: '5曲回しはピアニストの定番。',
  },
  stampTenSectionsTip: {
    en: '10 sections under your hands. You play piano now.',
    jp: '10章クリア。もう「弾ける人」だね。',
  },
  stampLifetime3DaysTip: {
    en: 'Three days is the habit seed sprouting.',
    jp: '3日 = 習慣のたねが芽を出した。',
  },
  stampLifetime7DaysTip: {
    en: "A week of practice — your brain accepts this as 'who I am'.",
    jp: '1週間続けると脳が「これは続けるもの」と認識する。',
  },
  stampLifetime30DaysTip: {
    en: '30 days of practice. You are a pianist, full stop.',
    jp: '30日 = もう「ピアノを弾く人」。',
  },
};
