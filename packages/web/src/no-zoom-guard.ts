// ネイティブアプリらしい「勝手に拡大しない」挙動を強制する。
//
// viewport の `user-scalable=no, maximum-scale=1` は WKWebView（Capacitor の
// 出荷ビルド）と Android/デスクトップは尊重するが、iOS Safari はアクセシビリ
// ティ優先で無視する。そこで web ビルドの保険として、iOS のピンチズーム
// （gesturestart/change/end）を JS でも抑止する。
//
// あえて touchend の preventDefault によるダブルタップズーム抑止は使わない
// ——ボタンの合成 click を握り潰し、タップが効かなくなるため。ピンチ
// （gesture*）の抑止 + viewport の user-scalable=no + CSS の touch-action:none
// で「全体拡大」は塞げる。楽譜の拡大は設定の専用ズームで行う。

/** iOS の非標準ジェスチャイベント（Safari のピンチズーム）。 */
const PINCH_GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const;

let installed = false;

/** ピンチズーム系ジェスチャを抑止するリスナーを一度だけ設置する。
 *  戻り値は解除関数（テスト用途／将来の無効化用）。既に設置済みなら
 *  no-op で空の解除関数を返す。 */
export function installNoZoomGuards(target: EventTarget = document): () => void {
  if (installed) return () => {};
  installed = true;
  const prevent = (e: Event): void => {
    e.preventDefault();
  };
  for (const ev of PINCH_GESTURE_EVENTS) {
    target.addEventListener(ev, prevent, { passive: false });
  }
  return () => {
    for (const ev of PINCH_GESTURE_EVENTS) {
      target.removeEventListener(ev, prevent);
    }
    installed = false;
  };
}
