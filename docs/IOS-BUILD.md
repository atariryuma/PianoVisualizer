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

1. capacitor-piano-midi の実機動作（USB / BLE 両方。stuck note・再接続）
2. polyfill 経由でシェルの MIDI 経路が全部動くか（鍵盤点灯 → 練習判定）
3. マイク: `getUserMedia`
   が capacitor://→https スキームで通るか（capacitor.config.ts の iosScheme:'https' 済み）+
   AGC/検出感度

## 提出前チェック

`docs/COMPLIANCE.md`（Kids カテゴリ / 4.7 / 5.2.3）を参照。
