# TODO Checklist — MVP Parallax Web App

> このチェックリストに従えば、MVPを**フロントエンド単体**で完成できます。各項目は**Doneの定義**と**検証方法**を含みます。

## 0. プロジェクト初期化 / 基盤

- [ ] Node.js LTS を使用（v18+）。`nvmrc` を作成。
  - **Verify**: `node -v` が LTS、CIでも一致。
- [ ] Vite + TypeScript + React で雛形生成（PWAプラグイン導入）。
  - **Verify**: `pnpm dev` 起動、`/` が表示。
- [ ] 状態管理に Zustand を導入（小規模・軽量）。
  - **Verify**: サンプルstoreのget/setが動作。
- [ ] ESLint + Prettier + TypeCheck（`tsc --noEmit`）を CI に組込み。
  - **Verify**: `pnpm lint` / `pnpm typecheck` が成功。
- [ ] パスエイリアス設定（`@/` → `src/`）。
  - **Verify**: 相対パス削減、ビルド成功。

## 1. ディレクトリと雛形

- [ ] 提案構成で空ファイル作成：

  ```
  /src
    /camera/index.ts
    /segmentation/{model.ts,onnx.ts,tf.ts}
    /search/{unsplash.ts,pexels.ts}
    /similarity/{contour.ts,descriptors.ts,score.ts}
    /compose/{parallax.ts,fill.ts}
    /encode/{webcodecs.ts,mediarec.ts,ffmpeg.ts}
    /storage/{save.ts,attribution.ts}
    /ui/{LoadingCloud.tsx,App.tsx}
    core/store.ts
    main.tsx
  /public/models/u2net.onnx
  /public/assets/fallback_bg/...
  ```

  - **Verify**: `vite build` が成功し空実装でも壊れない。

## 2. PWA / キャッシュ

- [ ] Workbox で precache：`u2net.onnx`, `wasm/*.wasm`, UI静的資産。
  - **Verify**: オフライン時でもUI表示可（素材検索は不可）。
- [ ] runtime cache：素材サムネは `StaleWhileRevalidate`。
  - **Verify**: 2回目アクセスでネットワーク節約。
- [ ] SRI（Subresource Integrity）でモデル/wasmにハッシュ付与。
  - **Verify**: 改ざん時にロード失敗を検出。

## 3. 画像入力（カメラ/ファイル）

- [ ] カメラ取得 `getUserMedia`（権限拒否ハンドル）。
  - **Verify**: 拒否時に自動でギャラリー選択へ。
- [ ] 端末ファイル選択（PhotoPicker/`<input type=file>`）。
  - **Verify**: HEICでも `createImageBitmap` 経由で表示可。
- [ ] EXIF向き補正 & 受領画像の長辺最大 **1440px** に縮小。
  - **Verify**: ランドスケープ/ポートレイト双方で正しい向き。

## 4. セグメンテーション（自動切り抜き）

- [ ] ONNX Runtime Web を導入（WASM + WebGL/WebGPU 有効化）。
  - **Verify**: feature detect で backend 選択。
- [ ] U²-Net（軽量版）を 320/512 入力で推論、αマスク生成。
  - **Verify**: A14/中位Androidで **<300ms**（WASM SIMD）/ **<120ms**（WebGL）。
- [ ] 後処理：開閉処理→ガウシアン（フェザー 3–5px）。
  - **Verify**: 境界が滑らか、穴あき低減。

## 5. 類似画像検索（32件）

- [ ] Unsplash/Pexels クライアント実装（無料枠、クエリは固定プリセット）。
  - **Verify**: 32枚のサムネ（~256px）を取得。
- [ ] 画像は**外部送信しない**（クエリ語のみ）。
  - **Verify**: DevTools Network で画像送信が無いこと。
- [ ] ローカル形状特徴：Canny→最大輪郭→N=128 サンプリング。
  - **Verify**: 前景と候補に対し記述子を生成。
- [ ] Huモーメント + EFD の混合スコアで**トップ1**自動選択。
  - **Verify**: 合成図形テストで順位の一貫性。

## 6. 合成 & 2.5D パララックス

- [ ] レイヤー生成：`FG=image*mask`, `BG=bestCandidate`。
  - **Verify**: 透明漏れがない。
- [ ] BG 拡張塗り（拡大→ぼかし）で隙間を埋める。
  - **Verify**: パン時の端が目立たない。
- [ ] アニメ：5s（端末で 3–5s 自動調整）、`easeInOutSine`。
  - **Verify**: FG/ BG の逆方向パン、`scale` 差で視差が出る。
- [ ] ループ用クロスフェード 0.3s（MVPは任意）。
  - **Verify**: ループ時の境界が自然。

## 7. 動画エンコード & 保存

- [ ] 優先順実装：①WebCodecs → ②MediaRecorder → ③ffmpeg.wasm。
  - **Verify**: feature detectで自動切替、各パスが動画生成可能。
- [ ] 出力形式：iOSは MP4 優先、他は WebM 優先。
  - **Verify**: 実機で再生可否を確認（Safari/Chrome）。
- [ ] ファイル名：`parallax_YYYYMMDD_HHMMSS.webm|mp4`。
  - **Verify**: タイムゾーンに依存しないISO生成。
- [ ] 保存：`showSaveFilePicker` → iOS は `a[download]` フォールバック。
  - **Verify**: 実機でアルバム保存 or ファイル保存が成功。

## 8. UI/UX（ミニマル）

- [ ] 1画面目：中央に「撮影/選択」ボタン（1タップ完結）。
  - **Verify**: 余計な選択肢なし。
- [ ] ローディング：雲が集まるアニメ（Canvas/Lottie）。`prefers-reduced-motion` 対応。
  - **Verify**: 低モーション環境で静的代替表示。
- [ ] プレビュー：自動再生 + 「保存」ボタンのみ。
  - **Verify**: 意図しないタップ領域がない（ヒットボックス >= 44px）。
- [ ] 成功トースト + 素材の attribution 表示。
  - **Verify**: 表示義務を満たしつつ主張しすぎない。

## 9. エラー処理 / リトライ

- [ ] カメラ拒否 → ギャラリー選択に自動フォールバック。
- [ ] モデル/資産読み込み失敗 → 低精度モードへ自動切替。
- [ ] API 4xx/5xx/Rate → ローカル背景へ切替。
- [ ] WebCodecs 不可 → MediaRecorder → ffmpeg と段階降格。
- [ ] メモリ不足/タイムアウト → 解像度段階降格（720→540→360）。
- [ ] 保存失敗 → 別MIME/別形式で自動再試行。
  - **Verify**: すべての分岐でユーザーに過度な入力を求めない。
- [ ] リトライは指数バックオフ 最大3回、失敗はローカルログへ。
  - **Verify**: ログ閲覧/削除UI（設定）にて確認可（MVPは隠しでも可）。

## 10. パフォーマンス目標（CIで計測）

- [ ] 初回インタラクティブ < **2.5s**（モデルは遅延ロード）。
- [ ] セグメンテーション1枚 < **300ms**（中位端末）。
- [ ] 類似スコアリング32枚 < **400ms**（WebWorker並列）。
- [ ] 5s@720p のエンコード：WebCodecs < **2s** / ffmpeg < **15s**。
- [ ] 初期バンドル < **250KB**、遅延合計 < **12MB**（モデル/ffmpeg除く）。
  - **Verify**: `performance.mark` で各工程を計測し CI に閾値保存。

## 11. セキュリティ / プライバシー

- [ ] **画像・マスク・特徴量を外部送信しない**ことを技術的に担保。
  - **Verify**: CSP/ネットワーク検査でアップロード無し。
- [ ] APIキーは**ランタイム受け渡し**（URLフラグメント/設定画面）で保持、ビルドに埋め込まない。
  - **Verify**: ビルド成果物にキーが含まれない。
- [ ] SRI + HTTPS + 同一発信元ポリシーを遵守。
  - **Verify**: Mixed Content 警告なし。

## 12. アクセシビリティ

- [ ] コントラスト AA 準拠（白背景/主色2色）。
- [ ] フォーカスリング可視、キーボード操作可能。
- [ ] 動画・アニメは `prefers-reduced-motion` 準拠。
  - **Verify**: Lighthouse/Axe で検査。

## 13. テレメトリ（端末内オプトイン）

- [ ] ローカルのみで処理時間・失敗理由を記録（デフォルトOFF）。
  - **Verify**: localStorage への保存/削除がユーザー操作で可能。

## 14. テスト

### 14.1 ユニット

- [ ] `segmentation`：基準画像で IoU しきい値を確認（擬似）。
- [ ] `similarity`：合成図形で期待順位を満たす。
- [ ] `composer`：フレーム数・α合成の境界値試験。
- [ ] `encode`：フォールバック分岐網羅。
  - **Verify**: `pnpm test` 緑。カバレッジしきい値設定。

### 14.2 結合

- [ ] サンプル入力 → 最終 Blob の MIME / 再生可否を検証。

### 14.3 E2E（Playwright）

- [ ] 権限拒否 → ギャラリーフォールバック成功。
- [ ] API 500 → ローカル背景で動画生成完了。
- [ ] PWAオフラインで再実行（素材はローカル代替）。

### 14.4 互換/実機

- [ ] iOS14 Safari（iPhone 11/12/SE3）で保存成功（MP4）。
- [ ] Android10+ Chrome（Pixel 5/6/7 他）で保存成功（WebM）。
- [ ] Firefox 最新で生成/保存の動作確認。

## 15. リリース準備

- [ ] `.env.example` にキー受け渡し方法を明記。
- [ ] ライセンス/アトリビューション文面を同梱し UI でも表示。
- [ ] README（起動・ビルド・テスト手順、既知の制約）。
- [ ] バージョンタグ付け、ビルド成果物をアーカイブ。

## 16. 将来拡張のフック（MVP外だが下準備）

- [ ] 長さ/ズーム/明るさのパラメータを内部定数から取得（将来UI接続しやすく）。
- [ ] 共有機能（Web Share API）の軽いプレースホルダー。
- [ ] ギャラリー用 IndexedDB スキーマの最小ダミー。

---

### Definition of Done（最終受け入れ）

- [ ] **1タップ**で「撮影→自動処理→プレビュー→保存」まで完了。
- [ ] **オフライン**でもローカル背景で動画生成可能。
- [ ] **入力画像が外部送信されない**ことをネットワーク検査で確認。
- [ ] iOS14/Safari と Android10/Chrome の実機で保存成功。
- [ ] 性能しきい値（セグメンテーション/スコアリング/エンコード）を満たす。
