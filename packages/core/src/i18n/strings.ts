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
  settings: { en: 'Settings', jp: '設定', de: 'Einstellungen' },
  close: { en: 'Close', jp: '閉じる', de: 'Schließen' },
  backToTitle: { en: 'Back to title', jp: 'タイトルにもどる', de: 'Zurück zum Start' },
  display: { en: 'Display', jp: '表示', de: 'Anzeige' },
  synesthesia: {
    en: 'Synesthesia mode (each note has its own color)',
    jp: '音階色モード（音ごとに色が変わる）',
    de: 'Farbmodus (jeder Ton hat seine eigene Farbe)',
  },
  synesthesiaTitle: { en: 'Synesthesia mode', jp: '音階色モード', de: 'Farbmodus' },
  timingCalibration: { en: 'Timing Calibration', jp: 'タイミング調整', de: 'Timing einstellen' },
  audioOffset: { en: 'Audio offset', jp: '音と画面のずれ補正', de: 'Ton-Versatz' },
  audioOffsetHelp: {
    en: 'If you play on the beat but it\'s judged "late", raise the number. If your press is rejected as "early", lower it.',
    jp: '拍に合わせて弾いてるのに「遅い」判定になる時は数値を上げる。「早い」判定になる時は下げる。',
    de: 'Wenn du im Takt spielst, es aber als „zu spät“ gewertet wird, mach die Zahl größer. Wird dein Anschlag als „zu früh“ abgelehnt, mach sie kleiner.',
  },
  autoDetectedFmt: {
    en: 'Auto-detected value in use (currently {v} ms)',
    jp: '自動検出値を使用中（現在: {v} ms）',
    de: 'Automatisch erkannter Wert aktiv (aktuell {v} ms)',
  },
  resetToAuto: {
    en: 'Use auto-detected value',
    jp: '自動検出に戻す',
    de: 'Automatischen Wert verwenden',
  },
  input: { en: 'Input', jp: '入力', de: 'Eingabe' },
  micInput: { en: 'Mic input', jp: 'マイク入力', de: 'Mikrofon' },
  micStandby: { en: 'Standby', jp: '待機中', de: 'Bereit' },
  scanMidi: {
    en: 'Scan for MIDI keyboard',
    jp: 'MIDIキーボードを探す',
    de: 'MIDI-Keyboard suchen',
  },
  connectBluetooth: { en: 'Connect Bluetooth', jp: 'Bluetooth接続', de: 'Bluetooth verbinden' },
  other: { en: 'Other', jp: 'その他', de: 'Sonstiges' },
  // このボタンはフリープレイ専用の「セッション結果」(combo/stage/quest/レーダー)
  // を開くだけで、セッションを終了しない（終了は 🏠/やめる が担う）。過去に
  // 「リセット」「終了」と誤ったラベルを付けたが、実挙動＝サマリー表示に合わせ、
  // カード見出し sumTitle「セッション結果」と同じ語彙に統一。キーは互換で据置。
  resetSession: { en: 'Session results', jp: 'セッションの結果', de: 'Sitzungsergebnis' },
  debugOverlay: { en: 'Debug overlay', jp: 'デバッグ表示', de: 'Debug-Anzeige' },
  language: { en: 'Language', jp: '言語', de: 'Sprache' },
  // Intro hint / MIDI diagnostics
  introNeedMidi: {
    en: '🎹 Please connect a MIDI keyboard<br>(microphone unavailable)',
    jp: '🎹 MIDIキーボードを接続してください<br>（マイクが使えません）',
    de: '🎹 Bitte ein MIDI-Keyboard anschließen<br>(kein Mikrofon verfügbar)',
  },
  diagWebMidiUnsupported: {
    en: '🎹 This browser does not support Web MIDI',
    jp: '🎹 このブラウザは Web MIDI 非対応',
    de: '🎹 Dieser Browser unterstützt Web MIDI nicht',
  },
  diagNoMidiPort: {
    en: '🎹 No MIDI port found',
    jp: '🎹 MIDIポートが見つかりません',
    de: '🎹 Kein MIDI-Anschluss gefunden',
  },
  diagWmbHint: {
    en: 'In WMB, disconnect → reconnect the keyboard, then tap 🔄 again',
    jp: 'WMBの設定でキーボードを一度切断→再接続してから🔄を再度タップ',
    de: 'In WMB das Keyboard trennen → neu verbinden, dann wieder auf 🔄 tippen',
  },
  diagConnectHint: {
    en: 'Connect the keyboard via USB/Bluetooth, then tap 🔄',
    jp: 'キーボードをUSB/Bluetoothで接続してから🔄をタップ',
    de: 'Keyboard per USB/Bluetooth anschließen, dann auf 🔄 tippen',
  },
  // ネイティブ iOS（Capacitor）: アプリ内の OS ペアリング画面への実手順。
  diagNativeBleHint: {
    en: 'Tap ⚙ then 🔵 to connect a Bluetooth keyboard',
    jp: '⚙ → 🔵 でBluetoothキーボードをつなげるよ',
    de: 'Tippe ⚙ und dann 🔵, um ein Bluetooth-Keyboard zu verbinden',
  },
  diagDetectedFmt: { en: '🎹 Detected: {v}', jp: '🎹 認識中: {v}', de: '🎹 Erkannt: {v}' },
  diagCouldNotConnect: {
    en: 'Could not connect',
    jp: '接続できませんでした',
    de: 'Verbindung fehlgeschlagen',
  },
  diagMidiError: { en: '🎹 MIDI error', jp: '🎹 MIDIエラー', de: '🎹 MIDI-Fehler' },
  diagMidiWaiting: { en: '🎹 Waiting for MIDI…', jp: '🎹 MIDI待機中…', de: '🎹 Warte auf MIDI…' },
  midiConnectedFmt: { en: '🎹 Connected: {v}', jp: '🎹 接続: {v}', de: '🎹 Verbunden: {v}' },
  // Alerts
  alertWebBluetoothUnsupported: {
    en: 'This browser does not support Web Bluetooth.\n\nAndroid Chrome / Mac Chrome / Linux Chrome are supported.\niPad Safari is not — use the "Web MIDI Browser" app instead.',
    jp: 'このブラウザは Web Bluetooth に対応していません。\n\nAndroid Chrome / Mac Chrome / Linux Chrome は対応。\niPad Safari は非対応 → 「Web MIDI Browser」アプリを使ってください。',
    de: 'Dieser Browser unterstützt Web Bluetooth nicht.\n\nAndroid Chrome / Mac Chrome / Linux Chrome werden unterstützt.\niPad Safari nicht — nutze stattdessen die App „Web MIDI Browser“.',
  },
  alertBleConnectFailedFmt: {
    en: 'Could not connect to Bluetooth keyboard:\n{v}',
    jp: 'Bluetoothキーボードに接続できませんでした:\n{v}',
    de: 'Verbindung zum Bluetooth-Keyboard fehlgeschlagen:\n{v}',
  },
  alertScoreLoadFailedFmt: {
    en: 'Failed to load score\n{v}',
    jp: '楽譜の読み込みに失敗しました\n{v}',
    de: 'Noten konnten nicht geladen werden\n{v}',
  },
  // H2: song loaded but the extractor found no sections to play.
  songNoSections: {
    en: 'No parts to play in this score yet.',
    jp: 'この楽譜には弾けるパートがまだありません。',
    de: 'In diesen Noten gibt es noch keine spielbaren Teile.',
  },
  // H1: Start tapped but the section has no playable notes.
  noPlayableNotes: {
    en: 'This part has no notes to play. Try another part or “Listen” first.',
    jp: 'このパートには弾く音がありません。ほかのパートか「きく」を試してね。',
    de: 'Dieser Teil hat keine spielbaren Noten. Versuch einen anderen Teil oder „Hören“.',
  },
  noPlayableNotesHand: {
    en: 'That hand doesn’t play here. Switch hands (or pick “Both”) and try again.',
    jp: 'この手はここでは弾かないよ。手をかえる（か「りょうて」）ともう一度。',
    de: 'Diese Hand spielt hier nicht. Wechsel die Hand (oder „Beide“) und versuch es nochmal.',
  },
  // Session summary
  sumBestFmt: {
    en: '✨ All-time best: {combo} combo / Flow {flow}% (session #{n})',
    jp: '✨ 歴代ベスト: {combo}コンボ / フロー{flow}% (第{n}回セッション)',
    de: '✨ Bestleistung: {combo} Combo / Flow {flow}% (Sitzung #{n})',
  },
  sumAllClear: { en: '🎉 ALL CLEAR! 🎉', jp: '🎉 全クリア！ 🎉', de: '🎉 ALLES GESCHAFFT! 🎉' },
  sumQuestProgressFmt: {
    en: '{n}/{total} cleared',
    jp: '{n}/{total} クリア',
    de: '{n}/{total} geschafft',
  },
  // Input indicator tooltips
  tipMidiKeyboardFmt: {
    en: 'MIDI keyboard: {v}',
    jp: 'MIDIキーボード: {v}',
    de: 'MIDI-Keyboard: {v}',
  },
  tipMidiWaiting: {
    en: 'Waiting for MIDI keyboard… tap to rescan',
    jp: 'MIDIキーボード待機中… タップで再スキャン',
    de: 'Warte auf MIDI-Keyboard… tippen zum Suchen',
  },
  tipMicMode: { en: 'Mic input mode', jp: 'マイク入力モード', de: 'Mikrofon-Modus' },
  tipIosMidiBlocked: {
    en: 'iPad/iPhone Safari does not support Web MIDI. Use mic input. (For BLE-MIDI keyboards, install the "Web MIDI Browser" iOS app)',
    jp: 'iPad/iPhone のSafariはWeb MIDI非対応。マイク入力で演奏してください。（BLE-MIDIキーボードを使うには「Web MIDI Browser」アプリが必要）',
    de: 'iPad/iPhone-Safari unterstützt kein Web MIDI. Nutze das Mikrofon. (Für BLE-MIDI-Keyboards die iOS-App „Web MIDI Browser“ installieren)',
  },
  // Console-only iOS MIDI guidance
  consoleIosMidi: {
    en: 'iOS/iPadOS detected — Web MIDI is unavailable on Safari/WebKit. Use a desktop browser, Steam Deck, or the "Web MIDI Browser" iOS app for BLE-MIDI.',
    jp: 'iOS/iPadOS検出 — Safari/WebKitではWeb MIDI非対応。デスクトップブラウザ・Steam Deck・iOS「Web MIDI Browser」アプリのいずれかを利用。',
    de: 'iOS/iPadOS erkannt — Web MIDI ist in Safari/WebKit nicht verfügbar. Nutze einen Desktop-Browser, das Steam Deck oder die iOS-App „Web MIDI Browser“ für BLE-MIDI.',
  },
  // Start screen
  tagline: {
    en: 'Play the piano and watch the screen come alive',
    jp: 'ピアノを弾くと画面がきれいに光るよ',
    de: 'Spiel Klavier und der Bildschirm leuchtet auf',
  },
  freePlay: { en: 'Free Play', jp: 'フリープレイ', de: 'Freies Spiel' },
  // First-run welcome card — a gentle, dismissible "start here" on the title
  // screen when there's no progress yet. Not a blocking tutorial (kid-safe:
  // no forced gate); a single CTA to the recommended first song + a name nudge.
  welcomeTitle: { en: 'Welcome! 🎹', jp: 'ようこそ！ 🎹', de: 'Willkommen! 🎹' },
  welcomeBody: {
    en: 'Play the piano and the screen lights up. Ready to try your first song together?',
    jp: 'ピアノを弾くと画面が光るよ。まずは1曲、いっしょに弾いてみよう。',
    de: 'Spiel Klavier und der Bildschirm leuchtet. Probieren wir dein erstes Stück?',
  },
  welcomeStartFmt: {
    en: '▶ Start with “{song}”',
    jp: '▶ 「{song}」からはじめる',
    de: '▶ Mit „{song}“ starten',
  },
  welcomeSetName: {
    en: '🎹 Set my pianist name',
    jp: '🎹 なまえをきめる',
    de: '🎹 Meinen Namen setzen',
  },
  welcomeDismiss: { en: 'Maybe later', jp: 'あとで', de: 'Später' },
  // "Start here" chip on the recommended first (easiest untouched) song button.
  startHereChip: { en: '👈 Start here', jp: '👈 はじめてはここから', de: '👈 Fang hier an' },
  // Song panel
  // Leading space lives in EN so JP renders "1日れんしゅう中" without a half-width gap.
  dayStreak: { en: ' day streak', jp: '日れんしゅう中', de: ' Tage in Folge' },
  tempo: { en: 'Tempo', jp: 'テンポ', de: 'Tempo' },
  startFrom: { en: 'Start from', jp: 'どこからはじめる？', de: 'Wo starten?' },
  whichHand: { en: 'Which hand?', jp: 'どの手で弾く？', de: 'Welche Hand?' },
  leftOnly: { en: '👈 Left only', jp: '👈 左手だけ', de: '👈 Nur links' },
  bothHands: { en: '🤝 Both', jp: '🤝 両手', de: '🤝 Beide' },
  rightOnly: { en: 'Right only 👉', jp: '右手だけ 👉', de: 'Nur rechts 👉' },
  modeLabel: { en: 'Mode', jp: 'モード', de: 'Modus' },
  modeListen: { en: '🎧 Listen', jp: '🎧 きく', de: '🎧 Hören' },
  modeGuided: { en: '✨ Guided', jp: '✨ ガイド', de: '✨ Geführt' },
  modeRhythm: { en: '🎵 Rhythm', jp: '🎵 リズム', de: '🎵 Rhythmus' },
  // One-line, in-context explainer that updates under the mode row as the
  // kid taps a mode. Teaches the modes where the choice is made (no separate
  // tutorial); intentionally reassuring, never a warning.
  modeListenDesc: {
    en: 'Hear the song first — the app plays it for you.',
    jp: 'まずはお手本を聴いて、曲をおぼえよう。',
    de: 'Hör dir das Stück erst an — die App spielt es vor.',
  },
  modeGuidedDesc: {
    en: 'The notes wait for you. No rush, no mistakes.',
    jp: '音が待っててくれる。あせらなくて大丈夫。',
    de: 'Die Noten warten auf dich. Kein Stress, keine Fehler.',
  },
  modeRhythmDesc: {
    en: 'The real thing — play along in time and earn stars.',
    jp: '本番！テンポにのって弾いて、星をあつめよう。',
    de: 'Das Original — spiel im Takt mit und sammle Sterne.',
  },
  ghostPlayback: {
    en: '👻 Ghost playback (demo)',
    jp: '👻 おてほん再生（ゴースト）',
    de: '👻 Vorspiel (Demo)',
  },
  metronome: { en: '🥁 Metronome', jp: '🥁 メトロノーム', de: '🥁 Metronom' },
  loopPractice: {
    en: '🔁 Loop this part',
    jp: '🔁 くりかえし練習',
    de: '🔁 Diesen Teil wiederholen',
  },
  // Settings — note-name notation + practice-audio volume balance.
  noteNaming: { en: 'Note names', jp: 'おんめいの表示', de: 'Notennamen' },
  noteNamingAuto: { en: 'Auto', jp: 'じどう', de: 'Auto' },
  // Note fall speed (lane lookahead) — the rhythm-game hi-speed setting.
  noteSpeed: { en: 'Note speed', jp: 'ノーツの速さ', de: 'Noten-Tempo' },
  noteSpeedSlow: { en: '🐢 Slow', jp: '🐢 ゆっくり', de: '🐢 Langsam' },
  noteSpeedNormal: { en: 'Normal', jp: 'ふつう', de: 'Normal' },
  noteSpeedFast: { en: '🚀 Fast', jp: '🚀 はやい', de: '🚀 Schnell' },
  volumeSection: { en: 'Volume', jp: 'おんりょう', de: 'Lautstärke' },
  volGhost: { en: '👻 Demo piano', jp: '👻 おてほんピアノ', de: '👻 Demo-Klavier' },
  volBacking: { en: '🎶 Melody guide', jp: '🎶 おともパート', de: '🎶 Melodie-Begleitung' },
  volMetronome: {
    en: '🥁 Metronome / count-in',
    jp: '🥁 メトロノーム・カウント',
    de: '🥁 Metronom / Einzähler',
  },
  backupProgress: { en: 'Back up progress', jp: 'きろくをほぞん', de: 'Fortschritt sichern' },
  restoreProgress: { en: 'Restore progress', jp: 'きろくをもどす', de: 'Fortschritt laden' },
  calibrateBtn: {
    en: '🎯 Tap-along auto-set',
    jp: '🎯 タップで自動そくてい',
    de: '🎯 Mittippen & automatisch einstellen',
  },
  calibrateTapHere: {
    en: '👆 Tap here with the click!',
    jp: '👆 クリックに合わせてここをタップ！',
    de: '👆 Tippe hier im Takt des Klicks!',
  },
  calibrateListen: {
    en: 'Listen… clicks starting',
    jp: 'よく聞いてね…クリックが始まるよ',
    de: 'Hör gut zu… die Klicks starten',
  },
  calibrateTap: { en: '{n} / {total}', jp: '{n} / {total}', de: '{n} / {total}' },
  calibrateDone: {
    en: 'Done! Offset set to {v} ms',
    jp: 'できた！ズレを {v} ms に合わせたよ',
    de: 'Fertig! Versatz auf {v} ms gesetzt',
  },
  calibrateFail: {
    en: "Couldn't measure — try again",
    jp: 'うまく計れなかった…もう一回ためしてね',
    de: 'Messen ging nicht — versuch es nochmal',
  },
  pausePractice: { en: 'Pause', jp: 'ちょっと休憩', de: 'Pause' },
  resumePractice: { en: 'Resume', jp: 'つづける', de: 'Weiter' },
  // BLE 接続試行中の進捗（設定パネルの入力ピル）。
  bleConnecting: { en: 'Connecting…', jp: 'せつぞく中…', de: 'Verbinde…' },
  // ↻ クイックリスタート（練習トップバー）— ワンタップで同セクション再挑戦。
  restartSection: { en: 'Restart', jp: 'さいしょから', de: 'Neu starten' },
  back: { en: 'Back', jp: 'もどる', de: 'Zurück' },
  startPractice: { en: '▶ Start practice', jp: '▶ れんしゅうスタート', de: '▶ Üben starten' },
  startListening: { en: '🎧 Start listening', jp: '🎧 きいてみる', de: '🎧 Anhören' },
  // Listen-mode "play the whole song through" toggle (only shown when mode === 'listen')
  playFullSong: { en: '🎵 Play full song', jp: '🎵 全曲再生', de: '🎵 Ganzes Stück abspielen' },
  fullSongLabel: { en: 'Full song', jp: '曲全体', de: 'Ganzes Stück' },
  // Full-song challenge — the "play the whole song" finale row at the end of
  // the section list (guided / rhythm). Unlocks once every part has ★1.
  fullSongChallengeName: {
    en: 'Full-song challenge',
    jp: '1曲チャレンジ',
    de: 'Ganzes-Stück-Challenge',
  },
  fullSongChallengeLockedFmt: {
    en: 'Earn ★1 on every part to unlock ({n} to go)',
    jp: 'ぜんぶのパートで★1をとると挑戦できるよ（あと{n}）',
    de: 'Hol dir ★1 in jedem Teil ({n} fehlen noch)',
  },
  fullSongChallengeReady: {
    en: 'Play it start to finish!',
    jp: 'さいしょからさいごまで、通して弾いてみよう！',
    de: 'Spiel es von Anfang bis Ende!',
  },
  startChallenge: {
    en: '🏆 Start the challenge!',
    jp: '🏆 チャレンジスタート！',
    de: '🏆 Challenge starten!',
  },
  // Scored full-song result card (★1+ replaces the section-tier title).
  songClearTitle: { en: '🏆 Song clear!', jp: '🏆 1曲クリア！', de: '🏆 Stück geschafft!' },
  songClearMsg: {
    en: 'You played the whole song, start to finish!',
    jp: '1曲まるごと、さいごまで弾けたね！',
    de: 'Du hast das ganze Stück gespielt — von Anfang bis Ende!',
  },
  // Listen-mode result (per-section vs full song variants)
  listenedTitle: {
    en: '🎧 Nicely listened!',
    jp: '🎧 さいごまで聴けたね！',
    de: '🎧 Gut zugehört!',
  },
  listenedMsg: {
    en: 'Now try playing along.',
    jp: 'つぎは弾いてみよう。',
    de: 'Jetzt spiel mal mit.',
  },
  listenedFullTitle: {
    en: '🎧 You heard the whole song!',
    jp: '🎧 曲を聴き終わりました！',
    de: '🎧 Du hast das ganze Stück gehört!',
  },
  listenedFullMsg: {
    en: 'Try playing it now.',
    jp: 'つぎは弾いてみよう。',
    de: 'Jetzt spiel es mal.',
  },
  tryPlayingNow: { en: '▶ Try playing', jp: '▶ 弾いてみる', de: '▶ Selbst spielen' },
  stretchBtn: {
    en: '🌳 Try a stretch piece',
    jp: '🌳 ちがう曲に挑戦',
    de: '🌳 Schwereres Stück testen',
  },
  // Guided-mode completion (no scoring — pure practice)
  guidedCompleteTitle: {
    en: '✨ Practice complete!',
    jp: '✨ 練習おつかれさま！',
    de: '✨ Übung geschafft!',
  },
  guidedCompleteMsg: {
    en: 'Try again, or move to the next part.',
    jp: 'もう一度練習する? 次の部分に進む?',
    de: 'Nochmal üben oder zum nächsten Teil.',
  },
  // Kid-friendly difficulty bands (challenge axis, separate from stars).
  // 🌱 sprout / 🌿 leaf / 🌳 tree / 🏔️ mountain — visible self-calibration.
  difficultySprout: {
    en: '🌱 Sprout (beginner)',
    jp: '🌱 ふたば（はじめてさん）',
    de: '🌱 Keimling (Anfänger)',
  },
  difficultyLeaf: { en: '🌿 Leaf (easy)', jp: '🌿 葉（やさしめ）', de: '🌿 Blatt (leicht)' },
  difficultyTree: { en: '🌳 Tree (steady)', jp: '🌳 木（しっかり練習）', de: '🌳 Baum (solide)' },
  difficultyMountain: {
    en: '🏔️ Mountain (stretch!)',
    jp: '🏔️ 山（チャレンジ！）',
    de: '🏔️ Berg (Herausforderung!)',
  },
  // Practice HUD
  score: { en: 'Score', jp: '楽譜', de: 'Noten' },
  quit: { en: 'Quit', jp: 'やめる', de: 'Beenden' },
  inputSource: { en: 'Input source', jp: '入力ソース', de: 'Eingabequelle' },
  // Result screen
  pitchAccuracy: { en: 'Pitch accuracy', jp: '音程の正確さ', de: 'Tongenauigkeit' },
  timing: { en: 'Timing', jp: 'タイミング', de: 'Timing' },
  noteLength: { en: 'Note length', jp: '音の長さ', de: 'Tonlänge' },
  bestComboLabel: { en: 'Best combo', jp: '連続成功（最高）', de: 'Beste Combo' },
  // 誤打の事実行（rhythm のみ、0 は非表示）。数字が事実、説教なし。
  extraPresses: { en: 'Extra notes', jp: 'よけいな音', de: 'Extra-Töne' },
  songSelect: { en: 'Song select', jp: 'きょく選択', de: 'Stück wählen' },
  tryAgainBtn: { en: 'Try again', jp: 'もう一度', de: 'Nochmal' },
  nextBtn: { en: 'Next →', jp: 'つぎへ →', de: 'Weiter →' },
  // Hit chips / dynamic
  perfect: { en: 'Perfect!', de: 'Perfekt!' },
  nice: { en: 'Nice!', de: 'Toll!' },
  missChip: { en: 'Miss', jp: 'ミス', de: 'Daneben' },
  youPlayedFmt: { en: 'You played: {v}', jp: '弾いた音: {v}', de: 'Gespielt: {v}' },
  tooShort: { en: '⏱ Too short', jp: '⏱ 短い', de: '⏱ Zu kurz' },
  tooLong: { en: '⏱ Too long', jp: '⏱ 長い', de: '⏱ Zu lang' },
  // Per-note timing grades (real-time, direction-aware). `perfect` is reused for
  // the top tier; these cover the rest. Celebratory tiers stay English-styled
  // (like perfect/nice); the corrective ones carry JP so the nudge is clear.
  gradeGreat: { en: 'Great!', de: 'Super!' },
  gradeEarly: { en: '⏱ A little early', jp: '⏱ ちょっと早いよ', de: '⏱ Etwas früh' },
  gradeLate: { en: '⏱ A little late', jp: '⏱ ちょっと遅いよ', de: '⏱ Etwas spät' },
  // Per-note length grades (on release). Two-sided — a good hold is celebrated,
  // not only off-length ones flagged. Gentle, no shame (banned-list).
  lengthGood: { en: '✓ Nice hold!', jp: '✓ いい長さ！', de: '✓ Schön gehalten!' },
  lengthShort: { en: '⏱ Hold a bit longer', jp: '⏱ もう少し長く', de: '⏱ Etwas länger halten' },
  lengthLong: { en: '⏱ A bit long', jp: '⏱ 少し長いよ', de: '⏱ Etwas zu lang' },
  // Lane labels
  laneLeft: { en: 'LEFT', jp: '左手', de: 'LINKS' },
  laneRight: { en: 'RIGHT', jp: '右手', de: 'RECHTS' },
  countInGo: { en: 'GO!', de: 'LOS!' },
  // Stages
  stage1: { en: 'Awakening', jp: 'めざめ', de: 'Erwachen' },
  stage2: { en: 'Blooming', jp: 'はなひらく', de: 'Erblühen' },
  stage3: { en: 'Aurora', jp: 'オーロラ', de: 'Polarlicht' },
  stage4: { en: 'Cosmos', jp: 'コスモス', de: 'Kosmos' },
  stage5: { en: 'Radiance', jp: 'かがやき', de: 'Strahlen' },
  stage6: { en: 'Legend', jp: 'でんせつ', de: 'Legende' },
  // Encouragement tiers
  enc1: { en: 'Nice!', jp: 'いいよ！', de: 'Gut so!' },
  enc2: { en: 'Great!', jp: 'すごい！', de: 'Super!' },
  enc3: { en: 'On a roll!', jp: 'のってきた！', de: 'Es läuft!' },
  enc4: { en: 'Sparkle!', jp: 'きらきら！', de: 'Funkelnd!' },
  enc5: { en: 'Beautiful!', jp: 'すてきなおと！', de: 'Wunderschön!' },
  enc6: { en: 'Like magic!', jp: 'まほうみたい！', de: 'Wie Zauberei!' },
  enc7: { en: 'Shining!', jp: 'かがやいてる！', de: 'Es leuchtet!' },
  enc8: { en: 'Awesome!', jp: 'さいこう！', de: 'Fantastisch!' },
  // Result tiers
  // tier0 uses Dweck "Not yet" + specific next strategy (Mueller & Dweck
  // 1998; EEF 2019 — generic "not yet" alone failed, the specific
  // strategy is what carries the effect).
  tier0Title: { en: 'Not yet — keep going!', jp: 'もうちょっと！', de: 'Noch nicht — bleib dran!' },
  tier0Msg: {
    en: 'Try a slower tempo, or play one hand at a time first.',
    jp: 'ゆっくりテンポにするか、片手ずつ弾いてみよう。',
    de: 'Nimm ein langsameres Tempo oder spiel erst mit einer Hand.',
  },
  // tier0 escalation — after 2+ consecutive 0-star attempts, switch to a
  // mode-switch suggestion (listen the section, take a breath).
  tier0RetryTitle: { en: 'Tough section!', jp: '難しいところだね！', de: 'Schwierige Stelle!' },
  tier0RetryMsg: {
    en: 'Many kids struggle here. Try Listen mode to hear it first.',
    jp: 'ここは多くの人がつまずく場所。まずリッスンで聴いてみよう。',
    de: 'Viele tun sich hier schwer. Hör es erst im Hör-Modus an.',
  },
  // One-tap "retry with support" button on a 0-star result — applies the
  // scaffold strategy (listen / one-hand / slower tempo) and restarts the
  // same section. Always available, no time pressure (banned-list safe).
  resRetryListen: {
    en: '🎧 Listen, then retry',
    jp: '🎧 きいてから もう一度',
    de: '🎧 Hören, dann nochmal',
  },
  // Speed trainer — one-tap "climb to the next tempo" button on a cleared
  // result card (planTempoStepUp). Achievement-gated, no time pressure.
  resTempoUpFmt: { en: '🚀 Try {v}%', jp: '🚀 {v}% で挑戦', de: '🚀 {v}% probieren' },
  resRetryOneHand: {
    en: '👉 Retry right hand only',
    jp: '👉 右手だけで もう一度',
    de: '👉 Nochmal nur rechte Hand',
  },
  resRetrySlowFmt: { en: '🐢 Retry at {v}%', jp: '🐢 {v}%で もう一度', de: '🐢 Nochmal mit {v}%' },
  // Practice-minute stats (journal calendar tab). Cumulative-only — never
  // framed as a goal or a shortfall (banned-list).
  calendarTodayMinutes: { en: 'Today', jp: 'きょうの練習', de: 'Heute' },
  calendarLifetimeMinutes: { en: 'Total time', jp: 'これまでの合計', de: 'Gesamtzeit' },
  minutesValueFmt: { en: '{v} min', jp: '{v}分', de: '{v} Min' },
  tier1Title: { en: 'Clear!', jp: 'クリア！', de: 'Geschafft!' },
  tier1Msg: {
    en: 'Clear! Keep practicing to get even better.',
    jp: 'クリアおめでとう！くりかえしで上達するよ。',
    de: 'Geschafft! Üb weiter und werde noch besser.',
  },
  tier2Title: { en: '🎉 Part Clear!', jp: '🎉 章クリア！', de: '🎉 Teil geschafft!' },
  tier2Msg: {
    en: 'Great job! Almost perfect!',
    jp: 'よくがんばったね！もう少しでパーフェクト！',
    de: 'Toll gemacht! Fast perfekt!',
  },
  tier3Title: { en: '🌟 Perfect!', jp: '🌟 パーフェクト！', de: '🌟 Perfekt!' },
  tier3Msg: {
    en: 'Brilliant! Try the next difficulty!',
    jp: 'すばらしい！次の難しさにチャレンジ！',
    de: 'Klasse! Probier die nächste Stufe!',
  },
  // Songs (Für Elise)
  furElise: { en: 'Für Elise', jp: 'エリーゼのために', de: 'Für Elise' },
  feA1: { en: 'Part 1: Theme', jp: '第1章 主題', de: 'Teil 1: Thema' },
  feA1desc: {
    en: 'The famous melody. Start gently.',
    jp: '有名なあのメロディ。やさしく始めよう。',
    de: 'Die berühmte Melodie. Fang sanft an.',
  },
  feB: { en: 'Part 2: Gentle Middle', jp: '第2章 おだやかな中間', de: 'Teil 2: Sanfte Mitte' },
  feBdesc: {
    en: 'A bright C-major section, then back to the theme.',
    jp: 'C長調のあかるい部分→主題に戻ります。',
    de: 'Ein heller C-Dur-Teil, dann zurück zum Thema.',
  },
  feA2: { en: 'Part 3: Storm & Finale', jp: '第3章 嵐とフィナーレ', de: 'Teil 3: Sturm & Finale' },
  feA2desc: {
    en: 'A D-minor storm, then back to the theme — the climax!',
    jp: 'D短調の嵐→主題に戻りラスト！ここがクライマックス。',
    de: 'Ein d-Moll-Sturm, dann zurück zum Thema — der Höhepunkt!',
  },
  // Songs (Turkish March)
  turkishMarch: { en: 'Turkish March', jp: 'トルコ行進曲', de: 'Türkischer Marsch' },
  taA1: { en: 'Part 1: Light Theme', jp: '第1章 軽やかな主題', de: 'Teil 1: Leichtes Thema' },
  taA1desc: {
    en: 'The famous theme plus an A-major contrasting section. Right-hand scales feel great.',
    jp: '有名な主題＋A長調の対比部。右手のスケールが気持ちいい。',
    de: 'Das berühmte Thema plus ein A-Dur-Kontrastteil. Die Läufe der rechten Hand machen Spaß.',
  },
  taB: {
    en: 'Part 2: Theme Variations',
    jp: '第2章 主題のへんそう',
    de: 'Teil 2: Themen-Variationen',
  },
  taBdesc: {
    en: 'The theme returns transformed — chord practice.',
    jp: '主題が形を変えてかえってくる。和音の練習。',
    de: 'Das Thema kehrt verwandelt zurück — Akkord-Übung.',
  },
  taA2: { en: 'Part 3: March Festival', jp: '第3章 マルチアの祭り', de: 'Teil 3: Marsch-Fest' },
  taA2desc: {
    en: "The coda's powerful octaves! Race to the finale.",
    jp: 'コーダの力強いオクターブ！フィナーレに駆けあがろう。',
    de: 'Die kraftvollen Oktaven der Coda! Sprint zum Finale.',
  },
  // Misc
  loadingScore: { en: 'Loading score…', jp: '楽譜を読み込み中…', de: 'Noten werden geladen…' },
  starting: { en: 'Starting...', jp: '起動中...', de: 'Startet...' },
  audioInitFailedFmt: {
    en: 'Audio init failed: {v}\n\nReload the browser and try again.',
    jp: 'オーディオ初期化に失敗しました: {v}\n\nブラウザを更新してリトライしてみてください。',
    de: 'Audio-Start fehlgeschlagen: {v}\n\nLade den Browser neu und versuch es nochmal.',
  },
  // C3: gentle chip when audio couldn't start (session stays playable, silent).
  audioStartWarn: {
    en: '🔇 Sound couldn’t start — you can still play',
    jp: '🔇 音が出せなかったけど、そのまま弾けるよ',
    de: '🔇 Ton ging nicht — du kannst trotzdem spielen',
  },
  // C1: persistent banner when records can't be saved (private mode / quota).
  storageWarning: {
    en: '⚠️ Records can’t be saved right now (private mode?). Progress will only last this session.',
    jp: '⚠️ いま記録がほぞんできません（プライベートモード？）。がんばりは今回だけになるよ。',
    de: '⚠️ Fortschritt kann gerade nicht gespeichert werden (Privatmodus?). Nur diese Sitzung bleibt erhalten.',
  },
  // C2: restore aborted because the write didn't persist (quota/blocked).
  restoreFailedStorage: {
    en: 'Restore failed — storage is full or blocked, nothing was changed.',
    jp: 'もどせませんでした — ほぞん先がいっぱい/ブロックされています。変更はありません。',
    de: 'Wiederherstellen fehlgeschlagen — Speicher voll oder blockiert, nichts geändert.',
  },
  // Composers — last-name katakana for JP (common in JP music ed)
  composerBeethoven: { en: 'L. v. Beethoven', jp: 'ベートーヴェン', de: 'L. v. Beethoven' },
  composerMozart: { en: 'W. A. Mozart', jp: 'モーツァルト', de: 'W. A. Mozart' },
  // Result-screen unlock messages
  tempoUnlockedFmt: {
    en: '🚀 Tempo {v}% unlocked!  ',
    jp: '🚀 テンポ {v}% 解放！  ',
    de: '🚀 Tempo {v}% freigeschaltet!  ',
  },
  sectionUnlockedFmt: { en: '🔓 {v} unlocked!', jp: '🔓 {v} 解放！', de: '🔓 {v} freigeschaltet!' },
  streakDaysFmt: {
    en: ' ✨ {v}-day streak!',
    jp: ' ✨ ストリーク {v}日！',
    de: ' ✨ {v} Tage in Folge!',
  },
  // Result-screen growth chart
  growthChartFmt: {
    en: 'Growth ({v} attempts)',
    jp: '成長グラフ ({v}回)',
    de: 'Fortschritt ({v} Versuche)',
  },
  trendSimilar: { en: '→ similar', jp: '→ おなじくらい', de: '→ ähnlich' },
  // Growth-framed trajectory caption (replaces the old red "↓ -8%" loss-frame
  // — no down-arrow, ever; self-referenced to the kid's own past, not a target).
  // A new personal best, else gain-since-first, else a neutral encouragement.
  trendBestYet: { en: '🌟 Best yet!', jp: '🌟 自己ベスト！', de: '🌟 Bestleistung!' },
  trendUpFmt: { en: '↑ +{v}% vs. first', jp: '↑ 最初より +{v}%', de: '↑ +{v}% seit dem Start' },
  trendKeepGoing: { en: 'Keep going 🌱', jp: 'この調子 🌱', de: 'Weiter so 🌱' },
  // Two-line chart legend (accuracy = gold, timing = cyan).
  legendAccuracy: { en: 'Acc', jp: '正確さ', de: 'Treffer' },
  legendTiming: { en: 'Time', jp: 'テンポ', de: 'Tempo' },
  sustainLabel: { en: 'SUSTAIN', de: 'SUSTAIN' },
  // Free-play HUD (session status while playing without a song)
  listeningFmt: { en: '{p}Listening{p}', jp: '{p}きいてるよ{p}', de: '{p}Ich höre zu{p}' },
  goalCelebrate: {
    en: '✨ Goal reached! Keep it up! ✨',
    jp: '✨ 目標達成！この調子！ ✨',
    de: '✨ Ziel erreicht! Weiter so! ✨',
  },
  goalCountdownFmt: {
    en: 'Goal: stable play for {v}s',
    jp: '目標: 安定演奏 {v}秒',
    de: 'Ziel: {v}s stabil spielen',
  },
  // Free-play quality coaching (shown in the qualityScore HUD)
  strengthFmt: { en: 'Strength: {v}', jp: 'できた点: {v}', de: 'Stärke: {v}' },
  nextStepFmt: { en: 'Next: {v}', jp: '次の1手: {v}', de: 'Nächster Schritt: {v}' },
  // Quality coaching strengths
  strNotesClear: {
    en: 'playing each note clearly',
    jp: '音をしっかり鳴らせている',
    de: 'du spielst jeden Ton klar',
  },
  strGrowing: {
    en: 'improving steadily over the last 30s',
    jp: '直近30秒で着実に伸びている',
    de: 'du wirst in den letzten 30 s stetig besser',
  },
  strRhythmSteady: {
    en: 'rhythm is steady',
    jp: 'リズムが安定している',
    de: 'dein Rhythmus ist gleichmäßig',
  },
  strDynamicsGood: {
    en: 'good dynamic control',
    jp: '強弱のコントロールが良い',
    de: 'gute Lautstärke-Kontrolle',
  },
  strPitchStable: {
    en: 'pitch is stable',
    jp: '音程の安定感が高い',
    de: 'deine Tonhöhe ist stabil',
  },
  // Quality coaching next steps
  nxtBreathe: {
    en: 'breathe and hold tempo for 20s',
    jp: '深呼吸して同じテンポを20秒キープ',
    de: 'atme und halte das Tempo 20 s',
  },
  nxtOneHand: {
    en: 'one hand slowly, hold tempo for 20s',
    jp: '片手でゆっくり、一定テンポを20秒キープ',
    de: 'eine Hand langsam, Tempo 20 s halten',
  },
  nxtSoftLoud: {
    en: 'build soft to loud across one phrase',
    jp: '1フレーズの中で弱→強を2段階つける',
    de: 'werde in einer Phrase von leise zu laut',
  },
  nxtHoldNotes: {
    en: 'hold each note fully before moving on',
    jp: '1音ずつ最後まで伸ばしてから次の音へ',
    de: 'halte jeden Ton ganz aus, bevor du weiterspielst',
  },
  // Section-result coaching (Knowledge of Performance). Shown on the result
  // card under ★3: pairs one real strength with one specific next step so
  // the kid leaves knowing *what* to work on, not just the outcome (KP > KR
  // for multi-dimensional tasks; EEF 2019 specific-strategy; Dweck process-
  // praise). {s}=strength clause, {f}=next-step clause.
  sectionFocusFmt: {
    en: 'Nice — {s}. Next: {f}.',
    jp: 'いいね、{s}。次は{f}。',
    de: 'Toll — {s}. Als Nächstes: {f}.',
  },
  // Strength clauses (named only when the dimension actually cleared a
  // floor; 'sfEffort' is the honest fallback when nothing did).
  sfEffort: {
    en: 'you played the whole part through',
    jp: 'さいごまで弾けたね',
    de: 'du hast den ganzen Teil durchgespielt',
  },
  sfNotesStrong: {
    en: 'you found most of the notes',
    jp: '音をよく見つけられている',
    de: 'du hast die meisten Töne getroffen',
  },
  sfTimingStrong: {
    en: 'your timing fits the beat',
    jp: 'リズムがビートに合ってきた',
    de: 'dein Timing passt zum Takt',
  },
  sfHoldStrong: {
    en: 'you held the notes their full length',
    jp: '音を最後まで伸ばせている',
    de: 'du hast die Töne ganz ausgehalten',
  },
  // Next-step clauses (one specific, actionable strategy per weak axis).
  fNotes: {
    en: 'play one hand slowly to lock in the notes',
    jp: '片手でゆっくり弾いて音をおぼえよう',
    de: 'spiel eine Hand langsam, um die Töne zu festigen',
  },
  fTiming: {
    en: 'count out loud, or drop one tempo step to catch the beat',
    jp: '声に出して数えるか、テンポを1だんおとしてビートに合わせよう',
    de: 'zähl laut mit oder geh ein Tempo runter, um den Takt zu treffen',
  },
  fHold: {
    en: "hold each note until the next one — don't lift early",
    jp: '次の音まで指をはなさず、最後までのばそう',
    de: 'halte jeden Ton bis zum nächsten — heb nicht zu früh ab',
  },
  // Pre-flight scaffold (feed-forward) — shown on the song panel BEFORE the kid
  // re-attempts a section they recently got stuck on. Kid-initiated, gentle, no
  // shame (Hattie & Timperley 2007 "where to next?").
  preflightHint: {
    en: '💡 Tricky last time? Tap 🎧 Listen to hear it first.',
    jp: '💡 前回は難しかったかな？🎧 リッスンで先に聴いてみよう。',
    de: '💡 Letztes Mal knifflig? Tippe auf 🎧 Hören und hör erst rein.',
  },
  // Escalated variants — shown when the struggle runs deeper (3+ misses),
  // matched to the bottleneck: notes (one hand) vs timing (slower tempo).
  preflightHintOneHand: {
    en: '💡 Still tricky? Try one hand (👈 / 👉) slowly, then 🎧 Listen.',
    jp: '💡 まだ難しい？片手（👈 / 👉）でゆっくり→🎧 リッスンもしてみよう。',
    de: '💡 Immer noch knifflig? Nimm eine Hand (👈 / 👉) langsam, dann 🎧 Hören.',
  },
  preflightHintSlow: {
    en: '💡 Still tricky? Pick a slower tempo, then 🎧 Listen first.',
    jp: '💡 まだ難しい？テンポを下げて、🎧 リッスンで先に聴こう。',
    de: '💡 Immer noch knifflig? Wähl ein langsameres Tempo, dann erst 🎧 Hören.',
  },
  // One-tap "set it up for me" button on the pre-flight nudge. Applies the
  // suggested strategy (the kid can still change it by hand — autonomy kept).
  preflightApplyListen: {
    en: '🎧 Switch to Listen',
    jp: '🎧 リッスンにする',
    de: '🎧 Auf Hören umstellen',
  },
  preflightApplyOneHand: {
    en: '👉 Right hand only',
    jp: '👉 右手だけにする',
    de: '👉 Nur rechte Hand',
  },
  preflightApplySlowFmt: {
    en: '🐢 Slow to {v}%',
    jp: '🐢 {v}% にする',
    de: '🐢 Auf {v}% verlangsamen',
  },
  // Self-assessment (self-regulated-learning reflection phase). One optional,
  // non-persisted tap on the result card. The *act* of self-rating is the
  // documented benefit (Int J Soc Robotics 2023 — raised both motivation and
  // performance in children's piano practice; Zimmerman/McPherson SRL
  // self-evaluation). Replies never contradict the kid's own feeling and
  // never shame a low score (calibration honesty + growth mindset).
  selfAssessPrompt: {
    en: 'How did that feel?',
    jp: 'どんなかんじだった？',
    de: 'Wie hat sich das angefühlt?',
  },
  selfAssessBtnTricky: { en: '😣 Tricky', jp: '😣 むずかしかった', de: '😣 Schwierig' },
  selfAssessBtnOk: { en: '🙂 Okay', jp: '🙂 まあまあ', de: '🙂 Ganz okay' },
  selfAssessBtnGreat: { en: '😄 Great', jp: '😄 ばっちり', de: '😄 Super' },
  // Felt tricky but actually cleared (★2+): validate effort + reframe.
  selfAssessReplyTrickyWin: {
    en: 'Felt tricky — and you still did it! Tricky means you are leveling up.',
    jp: 'むずかしく感じたのに、できてる！むずかしい＝レベルアップ中のサインだよ。',
    de: 'Fühlte sich schwierig an — und du hast es trotzdem geschafft! Schwierig heißt, du wirst besser.',
  },
  // Felt tricky, not yet there: praise the noticing (metacognition).
  selfAssessReplyTricky: {
    en: 'Noticing it feels tricky is a real skill — that is where practice goes next.',
    jp: '「むずかしい」と気づけるのは大事な力。そこが次のびしろだよ。',
    de: 'Zu merken, dass es schwierig ist, ist echtes Können — genau da geht das Üben weiter.',
  },
  selfAssessReplyOk: {
    en: 'Trust that feeling — it tells you what to practice next.',
    jp: 'その「まあまあ」の感覚を大切に。次の練習のヒントになるよ。',
    de: 'Vertrau diesem Gefühl — es zeigt dir, was du als Nächstes übst.',
  },
  // Felt great and cleared: affirm the earned confidence.
  selfAssessReplyGreatWin: {
    en: 'That confidence is well earned. Trust it!',
    jp: 'その自信はホンモノ。信じていいよ！',
    de: 'Dieses Selbstvertrauen hast du dir verdient. Vertrau darauf!',
  },
  // Felt great, score not there yet: honor the joy, never contradict it.
  selfAssessReplyGreat: {
    en: 'Loving how it felt is what keeps you playing. Keep that joy!',
    jp: '「楽しかった！」がいちばん大事。その気持ちでつづけよう！',
    de: 'Dass es sich toll anfühlt, hält dich am Spielen. Behalte die Freude!',
  },
  // Quest names + descriptions (free-play)
  qst1Name: { en: 'First Notes', jp: 'はじまりの音', de: 'Erste Töne' },
  qst1Desc: { en: 'Play 3 notes', jp: '音を3回鳴らしてみよう', de: 'Spiel 3 Töne' },
  qst2Name: { en: 'Catch the Flow', jp: '流れに乗って', de: 'Komm in den Flow' },
  qst2Desc: {
    en: 'Fill the flow gauge halfway',
    jp: 'フローゲージを半分までためよう',
    de: 'Füll die Flow-Anzeige zur Hälfte',
  },
  qst3Name: { en: 'Combo Master', jp: 'コンボマスター', de: 'Combo-Meister' },
  qst3Desc: { en: 'Reach 30 combo!', jp: '30コンボ達成！', de: 'Erreiche 30 Combo!' },
  qst4Name: { en: 'Clean Tone', jp: 'きれいな音', de: 'Klarer Klang' },
  qst4Desc: {
    en: 'Keep stability at 80%+',
    jp: '安定性80%以上をキープ',
    de: 'Halte die Stabilität bei 80 %+',
  },
  qst5Name: { en: 'Pianist', jp: 'ピアニスト', de: 'Pianist' },
  qst5Desc: {
    en: 'Play with confidence',
    jp: '自信を持って演奏しよう',
    de: 'Spiel mit Selbstvertrauen',
  },
  qst6Name: { en: 'Rhythm Master', jp: 'リズムの達人', de: 'Rhythmus-Meister' },
  qst6Desc: { en: 'Rhythm score 85%+', jp: 'リズムスコア85%以上！', de: 'Rhythmus-Wert 85 %+' },
  qst7Name: { en: 'Peak Flow', jp: 'フローの極み', de: 'Flow-Gipfel' },
  qst7Desc: { en: 'Reach 95% flow', jp: 'フローゲージを95%以上にしよう', de: 'Erreiche 95 % Flow' },
  qst8Name: { en: '100 Combo', jp: '100コンボ', de: '100 Combo' },
  qst8Desc: { en: 'Reach 100 combo!', jp: '100コンボ達成！', de: 'Erreiche 100 Combo!' },
  qst9Name: { en: 'Dynamics', jp: 'ダイナミクス', de: 'Dynamik' },
  qst9Desc: { en: 'Dynamics 80%+', jp: 'ダイナミクス80%以上！', de: 'Dynamik 80 %+' },
  qst10Name: { en: 'Full Focus', jp: '全集中', de: 'Volle Konzentration' },
  qst10Desc: { en: 'Overall score 85%+', jp: '総合スコア85%以上！', de: 'Gesamtwert 85 %+' },
  qst11Name: { en: 'Legendary Pianist', jp: '伝説のピアニスト', de: 'Legendärer Pianist' },
  qst11Desc: {
    en: '200 combo & 90% flow',
    jp: '200コンボ&フロー90%以上',
    de: '200 Combo & 90 % Flow',
  },
  // Quest display chrome
  questAllClearFmt: {
    en: '🎉 {n}/{n} All Clear!',
    jp: '🎉 {n}/{n} 全クリア！',
    de: '🎉 {n}/{n} Alles geschafft!',
  },
  questTargetFmt: { en: '🎯 {v}', jp: '🎯 {v}', de: '🎯 {v}' },
  questClearedFmt: { en: '✅ {v} CLEARED!', jp: '✅ {v} クリア！', de: '✅ {v} GESCHAFFT!' },
  // Free-play quest reward taglines (were hardcoded English; now localized).
  qstReward1: { en: 'Nice start!', jp: 'いいスタート！', de: 'Guter Start!' },
  qstReward2: { en: 'Good flow!', jp: 'ながれに乗ってる！', de: 'Guter Flow!' },
  qstReward3: { en: 'Combo master!', jp: 'コンボ名人！', de: 'Combo-Meister!' },
  qstReward4: { en: 'Clean tone!', jp: 'きれいな音！', de: 'Sauberer Ton!' },
  qstReward5: { en: 'Virtuoso!', jp: '名演奏！', de: 'Virtuose!' },
  qstReward6: { en: 'Rhythm master!', jp: 'リズム名人！', de: 'Rhythmus-Meister!' },
  qstReward7: { en: 'Peak flow!', jp: 'フロー最高潮！', de: 'Flow-Gipfel!' },
  qstReward8: { en: 'Century combo!', jp: '100コンボ！', de: '100er-Combo!' },
  qstReward9: { en: 'Dynamic range!', jp: '強弱ゆたか！', de: 'Dynamik!' },
  qstReward10: { en: 'Full focus!', jp: 'しゅうちゅう満点！', de: 'Volle Konzentration!' },
  qstReward11: { en: 'LEGENDARY!', jp: 'でんせつ級！', de: 'LEGENDÄR!' },
  // Session summary (post free-play)
  sumTitle: { en: '🎹 Session Results', jp: '🎹 セッション結果', de: '🎹 Sitzungs-Ergebnis' },
  sumBestCombo: { en: '🎵 Best Combo', jp: '🎵 ベストコンボ', de: '🎵 Beste Combo' },
  sumStageReached: { en: '🏔 Stage Reached', jp: '🏔 到達ステージ', de: '🏔 Erreichte Stufe' },
  sumPlayTime: { en: '⏱ Play Time', jp: '⏱ 演奏時間', de: '⏱ Spielzeit' },
  sumQuests: { en: '⭐ Quests', jp: '⭐ クエスト', de: '⭐ Quests' },
  sumTitleBtn: { en: '🏠 Title', jp: '🏠 タイトル', de: '🏠 Start' },
  sumContinue: { en: 'Continue →', jp: 'つづける →', de: 'Weiter →' },
  // User-song UI
  addSongBtn: { en: '➕ Add a song', jp: '➕ 曲を追加', de: '➕ Stück hinzufügen' },
  addSongTitle: { en: 'Add a song', jp: '曲を追加', de: 'Stück hinzufügen' },
  addSongTabLibrary: { en: '📚 Library', jp: '📚 ライブラリ', de: '📚 Bibliothek' },
  addSongTabFile: { en: '📁 File', jp: '📁 ファイル', de: '📁 Datei' },
  addSongTabUrl: { en: '🔗 URL', de: '🔗 URL' },
  addSongLibraryHelp: {
    en: 'Free public-domain pieces from MuseTrainer (jsDelivr CDN). Tap to download.',
    jp: 'MuseTrainer のパブリックドメイン曲（jsDelivr経由）。タップでダウンロード。',
    de: 'Kostenlose gemeinfreie Stücke von MuseTrainer (jsDelivr CDN). Zum Herunterladen tippen.',
  },
  addSongFilePick: {
    en: 'Choose .mxl / .musicxml / .xml file',
    jp: '.mxl / .musicxml / .xml ファイルを選択',
    de: '.mxl / .musicxml / .xml-Datei wählen',
  },
  addSongFileHelp: {
    en: 'Drop a MusicXML file. I confirm it is public domain or my own work.',
    jp: 'MusicXML ファイルをドロップ。パブリックドメインまたは自作の曲であることを確認します。',
    de: 'Zieh eine MusicXML-Datei hierher. Ich bestätige, dass sie gemeinfrei oder mein eigenes Werk ist.',
  },
  addSongPdAttest: {
    en: 'I confirm this score is public domain or my own work',
    jp: 'パブリックドメインまたは自作の曲です',
    de: 'Ich bestätige, dass diese Noten gemeinfrei oder mein eigenes Werk sind',
  },
  // File-picker-free import (for browsers without <input type=file>, e.g.
  // the Web MIDI Browser on iPad): drag a file from the Files app.
  addSongDropHint: {
    en: '…or drag a file here from the Files app',
    jp: '…または Files アプリからここにドラッグ＆ドロップ',
    de: '…oder zieh eine Datei aus der Dateien-App hierher',
  },
  // Two-tap delete + inline rename (native confirm()/prompt() don't work
  // in constrained WKWebViews like the Web MIDI Browser).
  addSongConfirmTap: {
    en: 'Tap again to delete',
    jp: 'もう一度タップで削除',
    de: 'Zum Löschen nochmal tippen',
  },
  addSongRenameSave: { en: 'Save', jp: '保存', de: 'Speichern' },
  addSongRenameCancel: { en: 'Cancel', jp: 'やめる', de: 'Abbrechen' },
  addSongUrlPlaceholder: {
    en: 'https://cdn.jsdelivr.net/.../score.mxl',
    de: 'https://cdn.jsdelivr.net/.../score.mxl',
  },
  addSongUrlHelp: {
    en: 'Paste a direct .mxl / .musicxml URL (must be CORS-enabled, e.g. jsDelivr).',
    jp: '.mxl / .musicxml の直リンク（CORS対応URL、例: jsDelivr）。',
    de: 'Füge eine direkte .mxl / .musicxml-URL ein (muss CORS-fähig sein, z. B. jsDelivr).',
  },
  addSongFetch: { en: '⬇ Download', jp: '⬇ ダウンロード', de: '⬇ Herunterladen' },
  addSongAdded: { en: 'Added!', jp: '追加しました！', de: 'Hinzugefügt!' },
  addSongFailed: { en: 'Failed: {v}', jp: '失敗: {v}', de: 'Fehlgeschlagen: {v}' },
  myLibrary: { en: 'My library', jp: 'マイライブラリ', de: 'Meine Bibliothek' },
  addSongRemove: { en: 'Delete', jp: '削除', de: 'Löschen' },
  addSongConfirmRemove: {
    en: 'Delete "{v}"? This cannot be undone.',
    jp: '「{v}」を削除しますか？元に戻せません。',
    de: 'Löschen „{v}“? Das kann nicht rückgängig gemacht werden.',
  },
  addSongSearch: {
    en: 'Search composer / title…',
    jp: '作曲家・曲名で検索…',
    de: 'Komponist / Titel suchen…',
  },
  addSongLibraryLoading: {
    en: 'Loading catalog…',
    jp: 'カタログ取得中…',
    de: 'Katalog wird geladen…',
  },
  addSongLibraryCount: { en: '{n} pieces', jp: '{n} 曲', de: '{n} Stücke' },
  addSongLibraryOffline: {
    en: 'Catalog offline — showing seed list',
    jp: 'カタログ取得失敗 — 既定リストを表示',
    de: 'Katalog offline — Standardliste wird angezeigt',
  },
  addSongExport: { en: '⬇ Export library', jp: '⬇ エクスポート', de: '⬇ Bibliothek exportieren' },
  addSongImport: { en: '⬆ Import', jp: '⬆ インポート', de: '⬆ Importieren' },
  addSongImportDone: {
    en: 'Imported {n} song(s)',
    jp: '{n} 曲をインポートしました',
    de: '{n} Stück(e) importiert',
  },
  addSongEditSections: { en: '✎ Edit sections', jp: '✎ 章を編集', de: '✎ Teile bearbeiten' },
  addSongRename: { en: '✎ Rename', jp: '✎ 名前を変更', de: '✎ Umbenennen' },
  addSongRenamePromptTitle: { en: 'New title:', jp: '新しい曲名：', de: 'Neuer Titel:' },
  addSongRenamePromptComposer: {
    en: 'New composer:',
    jp: '新しい作曲家：',
    de: 'Neuer Komponist:',
  },
  sectionEditTitle: { en: 'Edit sections', jp: '章の編集', de: 'Teile bearbeiten' },
  sectionEditHelp: {
    en: 'Set start measure (1-based) for each part. Total: {v} measures.',
    jp: '各章の開始小節を入力（1始まり）。全{v}小節。',
    de: 'Lege für jeden Teil den Starttakt fest (ab 1). Insgesamt: {v} Takte.',
  },
  sectionEditSave: { en: 'Save', jp: '保存', de: 'Speichern' },
  sectionEditCancel: { en: 'Cancel', jp: 'キャンセル', de: 'Abbrechen' },
  sectionEditError: {
    en: 'Boundaries must be increasing and within range.',
    jp: '小節番号は昇順かつ範囲内で入力してください。',
    de: 'Die Grenzen müssen aufsteigend und im gültigen Bereich sein.',
  },
  // Auto-section names for user-added songs (no human-curated descriptions)
  userSecA1: { en: 'Part 1', jp: '第1章', de: 'Teil 1' },
  userSecA1desc: { en: 'Opening section', jp: '冒頭の部分', de: 'Anfangsteil' },
  userSecB: { en: 'Part 2', jp: '第2章', de: 'Teil 2' },
  userSecBdesc: { en: 'Middle section', jp: 'まんなかの部分', de: 'Mittelteil' },
  userSecA2: { en: 'Part 3 (climax)', jp: '第3章（クライマックス）', de: 'Teil 3 (Höhepunkt)' },
  userSecA2desc: { en: 'Final section', jp: 'おわりの部分', de: 'Schlussteil' },

  // ==== 0.14 — Practice journal (completion visualization) ====
  // Title screen button + library strip
  journalBtn: { en: '📔 Practice journal', jp: '📔 練習ジャーナル', de: '📔 Übungstagebuch' },
  // Pianist Card — identity primer per McPherson 10-yr longitudinal.
  pianistCardCta: {
    en: '🎹 Tap to set your pianist name',
    jp: '🎹 ピアニスト名を決める',
    de: '🎹 Tippe, um deinen Pianistennamen festzulegen',
  },
  pianistCommitFmt: {
    en: 'Playing until {y}',
    jp: '{y}年まで続ける',
    de: 'Ich spiele bis {y}',
  },
  pianistDaysLeftFmt: { en: '{n} days to go', jp: 'あと{n}日', de: 'Noch {n} Tage' },
  pianistGoalReached: {
    en: '🎯 You reached your goal year!',
    jp: '🎯 目標の年に到達!',
    de: '🎯 Du hast dein Zieljahr erreicht!',
  },
  pianistEditTitle: { en: 'Pianist card', jp: 'ピアニストカード', de: 'Pianisten-Karte' },
  pianistAvatarLabel: { en: 'Choose an avatar', jp: 'アバターを選ぶ', de: 'Wähle einen Avatar' },
  pianistNameLabel: { en: 'Pianist name', jp: 'ピアニスト名', de: 'Pianistenname' },
  pianistNamePlaceholder: { en: 'Your name', jp: '名前', de: 'Dein Name' },
  pianistCommitLabel: {
    en: 'Playing until (year)',
    jp: '何年まで続ける?',
    de: 'Ich spiele bis (Jahr)',
  },
  pianistCommitPlaceholder: { en: '2035', jp: '2035', de: '2035' },
  pianistCommitHelp: {
    en: "How long do you think you'll keep playing? (Optional)",
    jp: '何年までピアノを続けると思う? (任意)',
    de: 'Wie lange willst du wohl weiterspielen? (Optional)',
  },
  startScreenPianistGreetingFmt: {
    en: "{name}'s piano journey",
    jp: '{name}のピアノ・ジャーニー',
    de: '{name}s Klavier-Reise',
  },
  cancel: { en: 'Cancel', jp: 'キャンセル', de: 'Abbrechen' },
  save: { en: 'Save', jp: '保存', de: 'Speichern' },
  // Weekly practice meter — Zhao 2022 weekly-cadence safety.
  weeklyMeterLabel: { en: 'This week', jp: '今週の練習', de: 'Diese Woche' },
  weeklyMeterFmt: { en: '{n} / {target} days', jp: '{n} / {target} 日', de: '{n} / {target} Tage' },
  // Goal-gradient hint that rides beneath the section banner.
  // Kept short: the banner is on-screen for ~2 s.
  sectionBannerHintFmt: {
    en: '{n} more star to {seal}!',
    jp: 'あと{n}星で{seal}!',
    de: 'Noch {n} Stern bis {seal}!',
  },
  libStripStarsFmt: {
    en: '{earned} / {total} stars',
    jp: '{earned} / {total} 星',
    de: '{earned} / {total} Sterne',
  },
  libStripStampsFmt: { en: '{n} stamps', jp: 'スタンプ {n} 個', de: '{n} Stempel' },
  libStripDaysFmt: { en: '{n} days', jp: '{n} 日', de: '{n} Tage' },
  libStripNearFmt: {
    en: '⭐ {n} more star{n,plural} to level up "{song}"!',
    jp: 'あと{n}星で「{song}」がレベルアップ！',
    de: '⭐ Noch {n} Stern bis „{song}“ aufsteigt!',
  },
  // Modal chrome
  // J6: title-screen "Continue" back into the last practiced song.
  continueLabel: { en: 'Continue', jp: 'つづきから', de: 'Weiter' },
  // J4: practice-session recap card (return-to-title after a scored session).
  recapTitle: { en: '🎉 Nice practice!', jp: '🎉 おつかれさま！', de: '🎉 Schön geübt!' },
  recapClearedFmt: {
    en: '{n} cleared',
    jp: '{n}こクリア',
    de: '{n} geschafft',
  },
  journalTitle: { en: 'Practice journal', jp: '練習ジャーナル', de: 'Übungstagebuch' },
  journalTabRepertoire: { en: '📚 Repertoire', jp: '📚 レパートリー', de: '📚 Repertoire' },
  journalTabStamps: { en: '🏅 Stamps', jp: '🏅 スタンプ', de: '🏅 Stempel' },
  journalTabCalendar: { en: '📅 Calendar', jp: '📅 カレンダー', de: '📅 Kalender' },
  // Per-song self-best line (accuracy % + combo). "Best" prefix; the icons
  // (🎯 / 🔥) carry the meaning so the label stays short in every language.
  journalBestLabel: { en: 'Best', jp: '自己ベスト', de: 'Best' },
  journalEmptyRepertoire: {
    en: 'No songs yet — add one from the title screen.',
    jp: 'まだ曲がありません — タイトル画面から追加してね。',
    de: 'Noch keine Stücke — füg eins über den Startbildschirm hinzu.',
  },
  journalEmptyCalendar: {
    en: 'Practice once to start your calendar.',
    jp: '一度練習するとカレンダーが始まるよ。',
    de: 'Üb einmal, um deinen Kalender zu starten.',
  },
  // Rollup at the top of the modal
  rollupStarsLabel: { en: 'Stars', jp: '星', de: 'Sterne' },
  rollupStampsLabel: { en: 'Stamps', jp: 'スタンプ', de: 'Stempel' },
  rollupDaysLabel: { en: 'Practice days', jp: '練習日数', de: 'Übungstage' },
  rollupStarsFmt: { en: '{earned} / {total}', jp: '{earned} / {total}', de: '{earned} / {total}' },
  rollupStampsFmt: { en: '{earned} / {total}', jp: '{earned} / {total}', de: '{earned} / {total}' },
  rollupDaysFmt: { en: '{n}', jp: '{n} 日', de: '{n} Tage' },
  // Weekly growth rollup — shown only when the kid actually improved this week
  // (positive-only; never a "you went down" line). Self-referenced to their
  // own past week.
  rollupGrowthLabel: { en: 'This week', jp: '今週', de: 'Diese Woche' },
  rollupGrowthAccFmt: {
    en: 'Accuracy +{v}pt 📈',
    jp: '正確さ +{v}pt 📈',
    de: 'Genauigkeit +{v} Pkt 📈',
  },
  rollupGrowthTimeFmt: { en: 'Timing +{v}pt 📈', jp: 'テンポ +{v}pt 📈', de: 'Timing +{v} Pkt 📈' },
  // Library seals row — surfaces gold/platinum song counts (previously
  // computed but never shown). Always visible once the kid has any songs.
  rollupSealsLabel: { en: 'Medals', jp: 'メダル', de: 'Medaillen' },
  rollupSealsFmt: {
    en: '🥇 {gold}  💎 {plat}',
    jp: '🥇 {gold}  💎 {plat}',
    de: '🥇 {gold}  💎 {plat}',
  },
  // Library capstone row — a positive-only "how far across the whole library"
  // acknowledgment so mastery never dead-ends silently. Shows the HIGHEST
  // milestone reached (never a shortfall). Endgame recognition (banned-list:
  // no shame, no false-progress — every tier is reachable and named).
  capstoneLabel: { en: 'Library', jp: 'ライブラリ', de: 'Bibliothek' },
  capstoneAllTouched: {
    en: '🌱 Every piece started!',
    jp: '🌱 ぜんぶの曲にチャレンジ！',
    de: '🌱 Jedes Stück begonnen!',
  },
  capstoneAllFullCleared: {
    en: '🎼 Every piece played through!',
    jp: '🎼 ぜんぶの曲を通しでクリア！',
    de: '🎼 Jedes Stück durchgespielt!',
  },
  capstoneAllSilver: {
    en: '🥈 Whole library at Silver!',
    jp: '🥈 ライブラリぜんぶ銀！',
    de: '🥈 Ganze Bibliothek in Silber!',
  },
  capstoneAllGold: {
    en: '🥇 Whole library at Gold!',
    jp: '🥇 ライブラリぜんぶ金！',
    de: '🥇 Ganze Bibliothek in Gold!',
  },
  capstoneAllPlatinum: {
    en: '💎 Every piece Platinum! One goal left: full-song ★★★',
    jp: '💎 ぜんぶ白金！のこりは通し ★★★ だけ',
    de: '💎 Alles Platin! Nur noch: ganzes Stück ★★★',
  },
  // The TRUE 100% — every piece platinum AND every full-song run three-starred,
  // so the library mastery ring reads exactly 100%. The named final goal.
  capstoneLibraryMastered: {
    en: '👑 True Master — 100%! Every piece, every full run ★★★',
    jp: '👑 まことのマスター — 100%！ぜんぶ通しで ★★★',
    de: '👑 Wahrer Meister — 100%! Jedes Stück, jeder Durchlauf ★★★',
  },
  // "Add more songs" CTA that replaces the stretch-piece button once every
  // touched song is maxed out, so the practice path routes to new content
  // instead of hiding the button (the old endgame dead-end).
  stretchAddSong: {
    en: '➕ Add more free songs',
    jp: '➕ もっと曲をふやす',
    de: '➕ Mehr Stücke hinzufügen',
  },
  // Repertoire tab
  sealNone: { en: 'Just starting', jp: 'これから', de: 'Frisch dabei' },
  sealBronze: { en: 'Bronze', jp: '銅', de: 'Bronze' },
  sealSilver: { en: 'Silver', jp: '銀', de: 'Silber' },
  sealGold: { en: 'Gold', jp: '金', de: 'Gold' },
  sealPlatinum: { en: 'Platinum', jp: '白金', de: 'Platin' },
  // Calendar tab
  calendarPracticed: { en: 'Practiced', jp: '練習した日', de: 'Geübt' },
  calendarLifetimeDays: {
    en: 'Lifetime practice days',
    jp: '通算練習日数',
    de: 'Übungstage insgesamt',
  },
  // 「最高連続日数」— 減少する現在ストリークではなく非減少のベストを表示する
  // ため、ラベルも実体（best）に合わせる（banned-list）。キーは互換で据置。
  calendarCurrentStreak: { en: 'Best streak', jp: '最高連続日数', de: 'Längste Serie' },
  // Stamps tab — category labels + hidden placeholder
  stampCatCompletion: { en: 'Completion', jp: '達成', de: 'Abschluss' },
  stampCatPerformance: { en: 'Performance', jp: 'パフォーマンス', de: 'Leistung' },
  stampCatPractice: { en: 'Practice', jp: '練習の工夫', de: 'Übung' },
  stampCatMilestone: { en: 'Milestone', jp: '節目', de: 'Meilenstein' },
  stampHidden: { en: '???', jp: '？？？', de: '???' },
  // Per-stamp strings (24 stamps × name+desc+earned = 72 entries)
  // -- Completion --
  stampFirstSectionName: { en: 'First Section', jp: 'はじめの一歩', de: 'Erster Teil' },
  stampFirstSectionDesc: {
    en: 'Cleared your first section',
    jp: 'はじめてセクションをクリア',
    de: 'Deinen ersten Teil geschafft',
  },
  stampFirstSectionEarned: {
    en: 'First section cleared!',
    jp: 'はじめてのクリア!',
    de: 'Erster Teil geschafft!',
  },
  stampFirstThreeStarName: { en: 'Triple Star', jp: '三ツ星', de: 'Dreifachstern' },
  stampFirstThreeStarDesc: {
    en: 'Earned 3 stars for the first time',
    jp: 'はじめて三ツ星を獲得',
    de: 'Zum ersten Mal 3 Sterne bekommen',
  },
  stampFirstThreeStarEarned: { en: '★★★ Three stars!', jp: '★★★ 三ツ星!', de: '★★★ Drei Sterne!' },
  stampSongAllSectionsName: { en: 'Whole Piece', jp: '全曲制覇', de: 'Ganzes Stück' },
  stampSongAllSectionsDesc: {
    en: 'Cleared every section of a song',
    jp: '1曲のすべてのセクションをクリア',
    de: 'Alle Teile eines Stücks geschafft',
  },
  stampSongAllSectionsEarned: {
    en: 'Every section cleared!',
    jp: '全セクションクリア!',
    de: 'Alle Teile geschafft!',
  },
  stampSongSilverName: { en: 'Silver Songbook', jp: '銀の楽譜', de: 'Silbernes Notenbuch' },
  stampSongSilverDesc: {
    en: 'Every section at 2+ stars',
    jp: 'すべてのセクションが二ツ星以上',
    de: 'Jeder Teil mit 2+ Sternen',
  },
  stampSongSilverEarned: { en: 'Silver-rank piece!', jp: '銀ランクの曲!', de: 'Stück in Silber!' },
  stampSongGoldName: { en: 'Gold Songbook', jp: '金の楽譜', de: 'Goldenes Notenbuch' },
  stampSongGoldDesc: {
    en: 'Every section at 3 stars',
    jp: 'すべてのセクションが三ツ星',
    de: 'Jeder Teil mit 3 Sternen',
  },
  stampSongGoldEarned: { en: 'Gold-rank piece!', jp: '金ランクの曲!', de: 'Stück in Gold!' },
  stampFullSongClearName: {
    en: 'First Song Clear',
    jp: 'はじめての1曲クリア',
    de: 'Erstes ganzes Stück',
  },
  stampFullSongClearDesc: {
    en: 'Clear the full-song challenge (★1+)',
    jp: '1曲チャレンジを★1以上でクリア',
    de: 'Die Ganzes-Stück-Challenge schaffen (★1+)',
  },
  stampFullSongClearEarned: {
    en: 'A whole song, start to finish!',
    jp: '1曲まるごと、さいごまで弾けた!',
    de: 'Ein ganzes Stück, von Anfang bis Ende!',
  },
  // Endgame long-tail chases — reachable capstones that keep goals alive after
  // a single song is maxed (the "no ending" gap). Achievement-gated, no RNG.
  stampFirstPlatinumName: { en: 'Platinum Piece', jp: '白金の一曲', de: 'Platin-Stück' },
  stampFirstPlatinumDesc: {
    en: 'Take a song all the way to Platinum',
    jp: '1曲を白金ランクまで仕上げる',
    de: 'Ein Stück bis Platin bringen',
  },
  stampFirstPlatinumEarned: {
    en: 'Platinum — every part, full speed!',
    jp: '白金達成 — 全部、本来の速さで!',
    de: 'Platin — jeder Teil, volles Tempo!',
  },
  stampFirstPlatinumTip: {
    en: 'Platinum = every section 3★ AND 100% tempo. Mastery.',
    jp: '白金 = 全セクション三ツ星＋100%テンポ。まさに熟達。',
    de: 'Platin = jeder Teil 3★ und 100 % Tempo. Meisterschaft.',
  },
  stampFullSongMasterName: { en: 'Concert Ready', jp: 'コンサート級', de: 'Konzertreif' },
  stampFullSongMasterDesc: {
    en: 'Play 3 different songs start to finish',
    jp: '3曲を通しでクリアする',
    de: 'Spiel 3 Stücke von Anfang bis Ende',
  },
  stampFullSongMasterEarned: {
    en: 'Three whole songs — a real repertoire!',
    jp: '3曲を通しで — りっぱなレパートリー!',
    de: 'Drei ganze Stücke — ein echtes Repertoire!',
  },
  stampFullSongMasterTip: {
    en: 'A repertoire of pieces you can play end-to-end is what performing is.',
    jp: '通して弾ける曲が増える = 「演奏できる」ってこと。',
    de: 'Ein Repertoire, das du ganz spielen kannst — das ist Auftreten.',
  },
  stampTempo100Name: { en: 'Full Tempo', jp: '本来の速さ', de: 'Volles Tempo' },
  stampTempo100Desc: {
    en: 'Unlocked 100% tempo on a song',
    jp: '100%テンポを解放',
    de: '100 % Tempo bei einem Stück freigeschaltet',
  },
  stampTempo100Earned: {
    en: 'Full tempo unlocked!',
    jp: '100%テンポ解放!',
    de: 'Volles Tempo freigeschaltet!',
  },
  // -- Performance --
  stampCombo25Name: { en: 'Combo 25', jp: '25コンボ', de: 'Combo 25' },
  stampCombo25Desc: { en: 'Built a 25-note combo', jp: '25連続ヒット', de: '25er-Combo geschafft' },
  stampCombo25Earned: { en: 'Combo 25!', jp: '25コンボ!', de: 'Combo 25!' },
  stampCombo50Name: { en: 'Combo 50', jp: '50コンボ', de: 'Combo 50' },
  stampCombo50Desc: { en: 'Built a 50-note combo', jp: '50連続ヒット', de: '50er-Combo geschafft' },
  stampCombo50Earned: { en: 'Combo 50!', jp: '50コンボ!', de: 'Combo 50!' },
  stampCombo100Name: { en: 'Combo 100', jp: '100コンボ', de: 'Combo 100' },
  stampCombo100Desc: {
    en: 'Built a 100-note combo',
    jp: '100連続ヒット',
    de: '100er-Combo geschafft',
  },
  stampCombo100Earned: { en: 'Combo 100!', jp: '100コンボ!', de: 'Combo 100!' },
  stampPerfectAccName: { en: 'Perfect', jp: 'パーフェクト', de: 'Perfekt' },
  stampPerfectAccDesc: {
    en: '100% accurate run',
    jp: '正確率100%',
    de: 'Durchgang mit 100 % Treffern',
  },
  stampPerfectAccEarned: {
    en: 'Perfect accuracy!',
    jp: 'パーフェクト達成!',
    de: 'Alles getroffen!',
  },
  stampFlowPeak80Name: { en: 'High Flow', jp: 'フローの波', de: 'Hoher Flow' },
  stampFlowPeak80Desc: {
    en: 'Flow reached 80',
    jp: 'フローが80に到達',
    de: 'Flow hat 80 erreicht',
  },
  stampFlowPeak80Earned: { en: 'High flow!', jp: '高いフロー!', de: 'Hoher Flow!' },
  stampFlowPeakMaxName: { en: 'Flow Master', jp: 'フローの達人', de: 'Flow-Meister' },
  stampFlowPeakMaxDesc: {
    en: 'Flow nearly maxed out',
    jp: 'フローがほぼ満タン',
    de: 'Flow fast am Maximum',
  },
  stampFlowPeakMaxEarned: { en: 'Flow mastered!', jp: 'フローの達人!', de: 'Flow gemeistert!' },
  // -- Practice --
  stampSameSection5xName: { en: 'Polished', jp: 'コツコツ磨き', de: 'Poliert' },
  stampSameSection5xDesc: {
    en: 'Practiced one section 5 times',
    jp: '同じセクションを5回練習',
    de: 'Einen Teil 5-mal geübt',
  },
  stampSameSection5xEarned: { en: 'Polish complete!', jp: 'よく磨いた!', de: 'Fertig poliert!' },
  stampSameSection8xName: { en: 'Diamond Polish', jp: 'ダイヤモンド磨き', de: 'Diamant-Politur' },
  stampSameSection8xDesc: {
    en: 'Practiced one section 8 times',
    jp: '同じセクションを8回練習',
    de: 'Einen Teil 8-mal geübt',
  },
  stampSameSection8xEarned: {
    en: 'Diamond-level practice!',
    jp: 'ダイヤモンド級!',
    de: 'Übung auf Diamant-Niveau!',
  },
  stampSlowTempo5Name: { en: 'Slow Starter', jp: 'ゆっくり派', de: 'Langsam-Starter' },
  stampSlowTempo5Desc: {
    en: 'Practiced 5 sections at 60% tempo',
    jp: '60%テンポで5セクション練習',
    de: '5 Teile mit 60 % Tempo geübt',
  },
  stampSlowTempo5Earned: {
    en: 'Slow & steady!',
    jp: 'ゆっくりが上達への近道!',
    de: 'Langsam und stetig!',
  },
  stampVarietyTodayName: { en: 'Variety', jp: 'いろいろチャレンジ', de: 'Abwechslung' },
  stampVarietyTodayDesc: {
    en: 'Practiced 3 different sections today',
    jp: '今日3つ違うセクションを練習',
    de: 'Heute 3 verschiedene Teile geübt',
  },
  stampVarietyTodayEarned: {
    en: 'Variety practice!',
    jp: 'バラエティ練習!',
    de: 'Abwechslungsreich geübt!',
  },
  stampComebackName: { en: 'Comeback', jp: 'ぐんと上達', de: 'Comeback' },
  stampComebackDesc: {
    en: 'Improved by 20%+ in one attempt',
    jp: '1回で20%以上アップ',
    de: 'In einem Versuch um 20 %+ verbessert',
  },
  stampComebackEarned: { en: 'Big comeback!', jp: 'ぐんと上達!', de: 'Starkes Comeback!' },
  stampStarUpName: { en: 'Star Up', jp: '星アップ', de: 'Stern mehr' },
  stampStarUpDesc: {
    en: 'Earned a new star (2+)',
    jp: '新しい星を獲得（2つ以上）',
    de: 'Einen neuen Stern bekommen (2+)',
  },
  stampStarUpEarned: { en: 'New star!', jp: '星アップ!', de: 'Neuer Stern!' },
  // -- Milestone --
  stampTwoSongsName: { en: 'Two-Song Explorer', jp: '2曲チャレンジ', de: 'Zwei-Stücke-Entdecker' },
  stampTwoSongsDesc: {
    en: 'Touched 2 different songs',
    jp: '2曲に挑戦',
    de: '2 verschiedene Stücke angespielt',
  },
  stampTwoSongsEarned: {
    en: 'Two-song explorer!',
    jp: '2曲チャレンジ達成!',
    de: 'Zwei-Stücke-Entdecker!',
  },
  stampFiveSongsName: {
    en: 'Five-Song Explorer',
    jp: '5曲チャレンジ',
    de: 'Fünf-Stücke-Entdecker',
  },
  stampFiveSongsDesc: {
    en: 'Touched 5 different songs',
    jp: '5曲に挑戦',
    de: '5 verschiedene Stücke angespielt',
  },
  stampFiveSongsEarned: {
    en: 'Five-song explorer!',
    jp: '5曲チャレンジ達成!',
    de: 'Fünf-Stücke-Entdecker!',
  },
  stampTenSectionsName: { en: 'Ten Sections', jp: '10セクション制覇', de: 'Zehn Teile' },
  stampTenSectionsDesc: {
    en: 'Cleared 10 sections in total',
    jp: '通算10セクションをクリア',
    de: 'Insgesamt 10 Teile geschafft',
  },
  stampTenSectionsEarned: {
    en: '10 sections cleared!',
    jp: '10セクションクリア!',
    de: '10 Teile geschafft!',
  },
  stampLifetime3DaysName: { en: '3 Days', jp: '3日達成', de: '3 Tage' },
  stampLifetime3DaysDesc: {
    en: 'Practiced on 3 different days',
    jp: '3日練習',
    de: 'An 3 verschiedenen Tagen geübt',
  },
  stampLifetime3DaysEarned: { en: '3 practice days!', jp: '3日達成!', de: '3 Übungstage!' },
  stampLifetime7DaysName: { en: '7 Days', jp: '7日達成', de: '7 Tage' },
  stampLifetime7DaysDesc: {
    en: 'Practiced on 7 different days',
    jp: '7日練習',
    de: 'An 7 verschiedenen Tagen geübt',
  },
  stampLifetime7DaysEarned: { en: '7 practice days!', jp: '7日達成!', de: '7 Übungstage!' },
  stampLifetime30DaysName: { en: '30 Days', jp: '30日達成', de: '30 Tage' },
  stampLifetime30DaysDesc: {
    en: 'Practiced on 30 different days',
    jp: '30日練習',
    de: 'An 30 verschiedenen Tagen geübt',
  },
  stampLifetime30DaysEarned: { en: '30 practice days!', jp: '30日達成!', de: '30 Übungstage!' },
  // Stamp coaching tips — one-line Knowledge-of-Performance hints fired
  // on earn. Salmoni 1984 guidance hypothesis: intermittent KP > per-
  // attempt KP. Once-per-stamp-event is the right cadence for kids 9-12.
  stampFirstSectionTip: {
    en: 'That feeling is your brain mapping the keys.',
    jp: 'いまの感覚は、脳がキーを覚えた合図だよ。',
    de: 'Dieses Gefühl ist dein Gehirn, das sich die Tasten merkt.',
  },
  stampFirstThreeStarTip: {
    en: 'Accuracy, timing, and length all clicked together.',
    jp: '音・タイミング・長さが全部そろった証。',
    de: 'Töne, Timing und Länge haben alle zusammengepasst.',
  },
  stampSongAllSectionsTip: {
    en: 'Most players take 5-10 tries per section. Normal!',
    jp: '1章あたり5〜10回トライは普通。当たり前!',
    de: 'Die meisten brauchen 5–10 Versuche pro Teil. Ganz normal!',
  },
  stampSongSilverTip: {
    en: 'Silver = every part is solidly playable.',
    jp: '銀ランクは「どこもしっかり弾ける」レベル。',
    de: 'Silber = jeder Teil sitzt sicher.',
  },
  stampSongGoldTip: {
    en: 'Gold takes weeks of practice. You earned this.',
    jp: '金は週単位の積み重ね。あなたが続けた結果。',
    de: 'Gold braucht Wochen Übung. Das hast du dir verdient.',
  },
  stampFullSongClearTip: {
    en: 'A slow full run is still a full run — any tempo counts.',
    jp: 'ゆっくりテンポでも、通せたらりっぱな「1曲」。',
    de: 'Langsam durchgespielt ist trotzdem durchgespielt.',
  },
  stampTempo100Tip: {
    en: 'Full tempo means the song is in your body now.',
    jp: '本来の速さで弾ける = 体に入った状態。',
    de: 'Volles Tempo heißt: Das Stück sitzt jetzt in dir.',
  },
  stampCombo25Tip: {
    en: 'Your focus held for 25 in a row. Breathe, continue.',
    jp: '25連続で集中が続いた。深呼吸して次へ。',
    de: 'Deine Konzentration hielt 25-mal am Stück. Atmen, weiter.',
  },
  stampCombo50Tip: {
    en: '50-combo shows the rhythm has internalized.',
    jp: '50コンボはリズムが体に染みた印。',
    de: '50er-Combo zeigt: Der Rhythmus sitzt.',
  },
  stampCombo100Tip: {
    en: '100-combo is the flow zone — athletes train for this.',
    jp: '100コンボは「フロー」。アスリートも目指す境地。',
    de: '100er-Combo ist die Flow-Zone — auch Sportler trainieren dafür.',
  },
  stampPerfectAccTip: {
    en: 'Every note hit. Your map of the score is precise.',
    jp: '全音正解。楽譜の地図ができてる。',
    de: 'Jeder Ton getroffen. Deine Landkarte der Noten stimmt genau.',
  },
  stampFlowPeak80Tip: {
    en: 'High flow happens when challenge meets ability.',
    jp: 'フローは、難しさと実力が釣り合うときに来る。',
    de: 'Hoher Flow entsteht, wenn Herausforderung und Können passen.',
  },
  stampFlowPeakMaxTip: {
    en: 'Peak flow. Remember this feeling — chase it again.',
    jp: 'フローのピーク。この感覚を覚えておこう。',
    de: 'Flow-Gipfel. Merk dir dieses Gefühl — such es wieder.',
  },
  stampSameSection5xTip: {
    en: 'Repetition wires the finger map (Wulf, motor learning).',
    jp: '反復で指の地図ができる（Wulf 2008の研究）。',
    de: 'Wiederholung verankert die Fingerbewegungen (Wulf, Motorik-Forschung).',
  },
  stampSameSection8xTip: {
    en: '8 reps and the movement becomes automatic.',
    jp: '8回でその動きが自動化する。',
    de: 'Nach 8 Wiederholungen läuft die Bewegung von selbst.',
  },
  stampSlowTempo5Tip: {
    en: 'Slow practice IS fast practice — not a shortcut.',
    jp: 'ゆっくり練習が結局いちばん早い近道。',
    de: 'Langsam üben IST schnell üben — keine Abkürzung.',
  },
  stampVarietyTodayTip: {
    en: 'Mixing sections beats grinding one (research-backed).',
    jp: '色々な箇所を回す方が、1ヶ所連続より上達する。',
    de: 'Teile mischen bringt mehr als einen zu pauken (durch Studien belegt).',
  },
  stampComebackTip: {
    en: '+20% in one try means you changed something. Keep it.',
    jp: '1回で20%アップ = 何かを変えた証。その方法をキープ。',
    de: '+20 % in einem Versuch heißt: Du hast etwas geändert. Behalt das bei.',
  },
  stampStarUpTip: {
    en: 'New star = your brain found a better pattern.',
    jp: '星アップ = 脳が新しいパターンを見つけた。',
    de: 'Neuer Stern = dein Gehirn hat ein besseres Muster gefunden.',
  },
  stampTwoSongsTip: {
    en: 'Two songs in rotation lets skills transfer between them.',
    jp: '2曲回しは技が曲間で移る相乗効果あり。',
    de: 'Zwei Stücke im Wechsel lassen Können von einem zum anderen wandern.',
  },
  stampFiveSongsTip: {
    en: 'Five-piece rotation is where many pianists actually live.',
    jp: '5曲回しはピアニストの定番。',
    de: 'Fünf Stücke im Wechsel — so üben viele Pianisten wirklich.',
  },
  stampTenSectionsTip: {
    en: '10 sections under your hands. You play piano now.',
    jp: '10章クリア。もう「弾ける人」だね。',
    de: '10 Teile in deinen Händen. Du spielst jetzt Klavier.',
  },
  stampLifetime3DaysTip: {
    en: 'Three days is the habit seed sprouting.',
    jp: '3日 = 習慣のたねが芽を出した。',
    de: 'Drei Tage — die Gewohnheit fängt an zu keimen.',
  },
  stampLifetime7DaysTip: {
    en: "A week of practice — your brain accepts this as 'who I am'.",
    jp: '1週間続けると脳が「これは続けるもの」と認識する。',
    de: 'Eine Woche Übung — dein Gehirn nimmt das als „so bin ich“ an.',
  },
  stampLifetime30DaysTip: {
    en: '30 days of practice. You are a pianist, full stop.',
    jp: '30日 = もう「ピアノを弾く人」。',
    de: '30 Tage Übung. Du bist Pianist, Punkt.',
  },
};
