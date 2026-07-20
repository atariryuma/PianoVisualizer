# iOS ビルド手順（Mac 作業日ガイド）

Windows 側の準備（2026-07-19 完了済み）:

- `packages/mobile/ios/` — ネイティブ Xcode プロジェクト生成済み（cap add ios）
- `packages/mobile/dist/` — **web 本体そのもの**を
  `--mode mobile`（SW 無効）でビルドしたもの。`pnpm --filter @piano/mobile build`
  で再生成
- アイコン/スプラッシュ — `assets/icon.png`(1024) から全 13 サイズ生成済み
- Info.plist — マイク・Bluetooth の利用目的文、Background Audio 設定済み
- **ネイティブ MIDI は Web MIDI polyfill 方式**
  （`packages/web/src/native-midi-polyfill.ts`）:
  capacitor-piano-midi（CoreMIDI + CoreBluetooth）を
  `navigator.requestMIDIAccess`
  として露出。シェルは無変更でデスクトップ Chrome と同じ経路で動く（単体テスト済み・実機未検証）

## Mac での手順（初回）

1. リポジトリ clone → `nvm use && corepack enable && pnpm install`
2. `pnpm --filter @piano/mobile build`（dist 再生成 + cap sync）
3. `cd packages/mobile/ios/App && pod install` （CocoaPods 未導入なら
   `brew install cocoapods`。Windows では実行不可のため未実施 —
   **Mac 側の最初の必須ステップ**）
4. `pnpm --filter @piano/mobile open:ios` → Xcode が開く
5. Signing & Capabilities → Team に自分の Apple
   ID（無料アカウントで実機デバッグ可。App Store 提出時に Developer Program
   $99/年）
6. シミュレータで起動確認（iPhone / iPad 各サイズ。MIDI はシミュレータ不可 →
   UI 崩れの確認用）
7. 実機 iPad: マイク許可 → 演奏反応、GO:PIANO の BLE 接続（**iOS 設定の Bluetooth からペアリングしないこと**
   — アプリ内接続）
8. 動いたら TestFlight: Xcode → Product → Archive → Distribute

## 実機で最初に検証すること（Windows では検証不能だった 3 点）

**2026-07-20 実機（iPad Pro 12.9" 第3世代 / iPadOS 26.5.2 /
GO:PIANO88）で検証済み:**

1. ~~capacitor-piano-midi の実機動作~~ ✅ **BLE 動作確認済み**。接続方式は
   **アプリ内 ⚙ → Bluetooth ボタン → Apple の OS 標準ペアリング画面**
   （CABTMIDICentralViewController）。ペア後は OS の MIDIBluetoothDriver が CoreMIDI ソースとして公開し、USB と同一経路で流れる。自前 CoreBluetooth パーサは MIDI
   1.0 非準拠（Active Sensing で running
   status 汚染 = スタックノート）のため削除。**USB はケーブル未所持のため未検証**。※「ネットワーク Session
   1」（RTP-MIDI 仮想ポート）はネイティブ側で MIDINetworkSession 同一性判定により除外（表示名ロケール依存のため名前フィルタでは不可 — 実機で本物より先に attach される事故を確認済み）。
2. ~~polyfill 経由でシェルの MIDI 経路~~
   ✅ 鍵盤点灯まで確認。ネイティブ listInputs は `{devices:[…]}`
   を返す（Capacitor は配列直返し不可）— polyfill 側はこの形状前提。
3. ~~マイク~~ ✅ `getUserMedia`
   動作・演奏反応確認済み（実機は capacitor://localhost で起動、マイクは通った）。

**残タスク**:
USB-MIDI 実機検証（要 USB-C ケーブル）／Android 実機一式（BLE は scanBle/connectBle 未配線 —
iOS は OS 画面方式のため不要になった）。

## 提出前チェック

`docs/COMPLIANCE.md`（Kids カテゴリ / 4.7 / 5.2.3）を参照。
