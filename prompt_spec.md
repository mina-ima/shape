フロントエンド単体（サーバなし）で、端末内処理・無料API・PWA対応を満たします。技術スタックは TypeScript + Vite + React（または Svelte）+ ONNX Runtime Web / TensorFlow.js、エンコードは WebCodecs / MediaRecorder / ffmpeg.wasm フォールバック。画像は端末内処理、外部APIへ送るのは検索クエリのみです。
要約（要点）
完全クライアント：画像処理・類似検索・動画生成を端末内で実行。外部は素材API検索のみ。
主なアルゴリズム：前景抽出（U²-Net などのSODモデル or GrabCut代替）、形状類似（Huモーメント/輪郭FD + Canny）、2レイヤー合成で2.5D風ズーム。
出力：3–5sのWebM/MP4。WebCodecs優先、未対応はMediaRecorder、最終フォールバックでffmpeg.wasm。
UI：ワンタップ起動→自動処理→雲アニメのローディング→プレビュー→保存。
非機能：iOS14+/Android10+主要ブラウザ、PWA、オフライン（モデル/静的資産キャッシュ）、プライバシー最優先。
テスト：機能・互換・性能・無線/権限エラー系の網羅プランを提示。

1. スコープと制約（MVP）
   対象：自然物（雲・森など）のざっくり前景。人物・細密マスクは対象外。
   長さ：3–5秒（固定、ユーザー調整なし）。
   完全自動。編集UIなし。
   保存：端末ローカル（ファイル保存 / 写真アルバム相当）。
   無料API：Unsplash/Pexels。APIキーは埋め込みではなく**ランタイム読込（環境変数注入やURL Fragment）**を推奨。
   送信データ：検索クエリとライセンス要件充足のための attribution 取得のみ。ユーザー画像は送信しない。
2. アーキテクチャ
   2.1 構成
   クライアントSPA（PWA）：TS + Vite + React
   モジュール
   camera：カメラ/画像入力
   segmentation：前景抽出（ONNX/TensorFlow.js）
   search：素材APIクライアント（Unsplash/Pexels）
   similarity：形状類似（輪郭抽出＋記述子）
   composer：2.5Dコンポジット/アニメーション
   encode：動画エンコード（WebCodecs/MediaRecorder/ffmpeg.wasm）
   storage：保存/権限/FS API
   ui：雲アニメ・トースト・プレビュー
   core：状態管理（軽量：Zustand/Recoil/Context）
   2.2 データフロー（シーケンス）
   ユーザー：撮影/選択 → camera.getImage()（ImageBitmap or HTMLCanvasElement）
   segmentation.run(image) → mask（0–255 α）
   similarity.contour(image, mask) → foregroundSilhouette
   search.fetchCandidates(query, 32) → cand[i].image（縮小サムネ）
   各 cand：similarity.score(foregroundSilhouette, silhouette(cand))
   select best（最高スコア）→ composer.compose(fg, bg_best, mask)
   encode.renderToVideo(canvasStream) → Blob（WebM/MP4）
   storage.save(blob, filename) / navigator.share（MVPでは保存のみ）
   2.3 実行環境
   推奨：WebGL2/WebGPU（利用可なら）＋ WASM SIMD
   フォールバック：WASM（SIMD無し）→低解像度パス（短辺≤720px）
   PWA：service worker でモデルと静的資産キャッシュ、オフラインでも生成可（素材検索は不可時にローカル代替）
3. 機能仕様
   3.1 画像入力
   要件
   カメラ撮影（getUserMedia）/ 端末から選択（ファイル入力/PhotoPicker）
   EXIFの向きを補正
   入力時に長辺最大 1440pxへ縮小（性能と画質のバランス）
   失敗時
   権限拒否 → ギャラリー選択に自動フォールバック
   HEICなど非対応 → createImageBitmap + Canvas再エンコード
   3.2 自動切り抜き（前景抽出）
   モデル候補
   ONNX Runtime Web で U²-Net（salient object detection） or MobileSAM派生の軽量SOD
   実装容易・自然物向け・1枚物体に強い
   代替：TF.js の DeepLab-lite（汎用セグメンテーション）
   推論
   入力を短辺512/320へ縮小 → 正規化 → 推論 → mask（0–1）
   ポスト処理：開閉処理 + ガウシアン（フェザー3–5px）
   出力
   mask: Uint8ClampedArray、foregroundCanvas（α合成）
   性能ターゲット
   A14/Android中位：<300ms（WASM SIMD）/ <120ms（WebGL/WebGPU）
   3.3 類似画像検索（32件）
   API：Unsplash / Pexels の無料枠。クエリはローカルタグ推定（色相/テクスチャ/簡易CLIP-liteはMVP外、キーワードはUI選択 or 固定プリセット：cloud/forest/sky/mountain など）
   取得：各候補は**サムネ（~256px）**のみ取得（帯域削減）
   形状類似（ローカル）
   候補画像：Canny → 二値 → 最大連結成分輪郭 → リサンプリング（N=128）
   前景とのHuモーメント + フーリエ記述子（EFD） の混合スコア
   score = w1 _ cos_sim(EFD_fg, EFD_bg) + w2 _ (1 - norm(|Hu_fg - Hu_bg|))
   トップ1を自動選択（同点は彩度/露出ヒューリスティクス）
   プライバシー
   外部送信：クエリ語のみ。画像や形状特徴量は送信しない。
   3.4 動画生成（2.5Dパララックス）
   合成
   レイヤー：FG = image \* mask、BG = bestCandidate
   BG をコンテンツアウェア拡張の簡易代替：拡張塗りつぶし（拡張キャンバスに拡大-ぼかしで隙間埋め）
   アニメーション
   時間 T=3–5s（端末性能で自動選択、標準5s）
   イージング：easeInOutSine
   キーフレーム：
   BG：scale 1.0 → 1.06、微小パン（±10px）
   FG：scale 1.03 → 1.12、逆方向パン（視差表現）
   ループ：クロスフェード0.3sで繋ぎ目抑制（MVPではループ必須ではない）
   描画
   OffscreenCanvas + requestAnimationFrame / Web Animations
   合成は globalCompositeOperation = 'source-over' + α
   3.5 エンコード & 保存
   優先順
   WebCodecs（VP9/AV1/H.264端末依存）→ videoEncoder.encode(frame)
   MediaRecorder（canvas.captureStream() → webm）
   ffmpeg.wasm（重い：遅延ロード、MP4/H.264生成）
   出力
   端末判定で WebM/MP4 を選択（iOSはMP4優先）
   ファイル名：parallax_YYYYMMDD_HHMMSS.webm|mp4
   保存
   showSaveFilePicker / File System Access API、iOSは a[download] フォールバック
   可能なら navigator.storage.persist() で永続化
4. UI/UX
   4.1 画面とフロー
   ホーム：中央に「撮影/選択」ボタン（ワンタップ）
   ローディング：雲が集まるアニメーション（Lottie/Canvas procedural）
   プレビュー：自動再生、保存ボタンのみ
   保存完了：トースト + アトリビューション表示（素材提供者）
   4.2 デザイン原則
   ミニマル（白背景、主要2色、角丸8–12px）
   操作1タップ、戻る/やり直しは長押しで表示
   A11y：コントラスト AA、prefers-reduced-motion 対応、音無し
5. エラー処理方針
   事象 検知 ユーザー通知 リカバリ
   カメラ権限拒否 NotAllowedError 「権限がありません。写真を選択に切替えます」 ギャラリー選択UIへ
   モデル読込失敗 fetch/Cache miss 「オフラインのため低精度モードに切替え」 低解像度+単純Cannyマスク
   API失敗/レート HTTP 4xx/5xx 「素材検索に失敗。ローカル背景で代替」 ローカル同梱の数枚から選択
   WebCodecs不可 feature detect 非表示（自動フォールバック） MediaRecorder/ffmpeg.wasm
   メモリ不足 RangeError/slow 「解像度を落として再実行」 短辺720→540→360
   保存失敗 FS API失敗 「保存できません。別形式を試行」 自動で別MIMEを再出力
   共通：最大3回指数バックオフ、失敗ログは**端末内（localStorage）**に匿名保存（ユーザーの明示操作で消去）。
6. 性能要件（目標値）
   初回インタラクティブ：< 2.5s（モデル遅延ロード）
   セグメンテーション1枚：< 300ms（中位端末）
   類似スコアリング32枚：< 400ms（並列 + WebWorker）
   レンダ→エンコード（5s@720p）：WebCodecs < 2s、MediaRecorder 実時間、ffmpeg.wasm < 15s
   バンドル：初期 < 250KB、遅延ロード合計 < 12MB（モデル・ffmpeg除く）
7. セキュリティ / プライバシー
   画像・マスク・特徴量は外部送信しない。
   PWAキャッシュに保存するモデルは**整合性（SRI）**付き。
   AttributionとAPIキーは環境変数注入（.envはビルド時のみ、ランタイムは ?k= 受け取り可）。
   クリップボード/ファイル保存はユーザー操作必須イベントでのみ実行。
8. 実装詳細
   8.1 主要依存
   ONNX Runtime Web（WASM/WebGL/WebGPU）
   代替：TensorFlow.js
   画像：glfx.js 相当の自前シェーダ/Canvasフィルタ
   エンコード：WebCodecs / MediaRecorder / ffmpeg.wasm（遅延）
   状態：Zustand（~1KB）
   PWA：Workbox（stale-while-revalidate + precacheManifest）
   8.2 ディレクトリ構成（例）
   /src
   /camera
   index.ts
   /segmentation
   model.ts onnx.ts tf.ts
   /search
   unsplash.ts pexels.ts
   /similarity
   contour.ts descriptors.ts score.ts
   /compose
   parallax.ts fill.ts
   /encode
   webcodecs.ts mediarec.ts ffmpeg.ts
   /storage
   save.ts attribution.ts
   /ui
   LoadingCloud.tsx App.tsx
   core/store.ts
   main.tsx
   /public
   /models/u2net.onnx
   /assets/fallback_bg/\*
   8.3 型・API（抜粋：TypeScript）
   // 入出力
   export type RGBAImage = { width: number; height: number; data: Uint8ClampedArray };

export interface Segmentation {
run(img: RGBAImage): Promise<Uint8ClampedArray>; // alpha 0..255
}

export interface Candidate {
id: string; provider: 'unsplash'|'pexels'|'local';
thumb: HTMLImageElement | ImageBitmap;
attribution?: string; // 表示用
}

export async function fetchCandidates(q: string, n=32): Promise<Candidate[]> {}

export interface Similarity {
silhouette(img: RGBAImage, mask?: Uint8ClampedArray): Float32Array; // EFD
score(a: Float32Array, b: Float32Array): number; // 0..1
}

export interface Composer {
renderSequence(fg: RGBAImage, bg: RGBAImage, mask: Uint8ClampedArray, seconds: number): AsyncGenerator<VideoFrame>;
}

export interface Encoder {
encode(frames: AsyncGenerator<VideoFrame>, fps: number): Promise<Blob>;
}
輪郭・記述子（概略）
// Canny -> 最大輪郭抽出 -> N点均等サンプリング -> 離散フーリエ記述子(EFD)
// 正規化（平行移動/スケール/回転不変）
雲ローディング
Canvas procedural：ノイズフィールド（Simplex）で雲が中心に集まる頂点フィールドアニメ。
8.4 PWA/キャッシュ
precache：u2net.onnx, wasm/\*.wasm, UI静的資産
runtime：候補サムネは StaleWhileRevalidate（帯域節約）
オフライン：素材API不可時は /assets/fallback_bg よりランダム選択
8.5 ライセンス/表記
Unsplash/Pexelsのクレジット表記をプレビュー/保存後画面に表示（小さく目立たぬ位置）9. テスト計画
9.1 受け入れ基準（MVP）
1タップで撮影→自動→プレビュー→保存が完了する
オフラインでも、ローカル背景で動画生成ができる
入力画像が外部送信されないことをネットワーク検査で確認
iOS14/Safari と Android10/Chrome で保存成功（それぞれの推奨形式）
9.2 テストマトリクス
端末：iPhone 11/12/SE3、Pixel 5/6/7、ミドル級Android
ブラウザ：Safari 14–、Chrome 100–、Firefox（生成/保存動作）
回線：オフライン/3G/4G、API失敗/タイムアウト
画像：明暗/コントラスト/複数物体/空だけ/森だけ
9.3 自動テスト
ユニット
segmentation: 入力→マスクの形態学的特性（IoUしきい値は固定画像で代替）
similarity: 合成図形でスコアの順序性を検証
composer: フレーム数・バッファ境界・α合成の正しさ
encode: フォールバック切替の分岐網羅
結合
サンプル画像→最終BlobのMIME/再生可否
E2E（Playwright）
権限拒否→ギャラリーにフォールバック
API 500→ローカル背景で成功
PWAオフラインでの再実行
9.4 性能/安定
performance.mark で各段階を計測、しきい値をCIに記録
メモリ使用量ピーク < 300MB（720p時）10. エッジケース指針
前景が極小/空一色：**閾値で「前景なし」**と判定→単層ズームに切替
類似スコアが僅差：色相マッチ（平均色差ΔE）でタイブレーク
透明領域多すぎ：inpaint風拡張を強く（ぼかし半径↑）11. ログ/テレメトリ（端末内） [DONE]
収集：処理時間、失敗理由、機能フラグ（オンデバイスのみ）
既定は保存しない、ユーザーが明示ON時のみlocalStorageに保存・閲覧・消去可能12. 実装タスク（順序）
プロジェクト雛形（Vite + TS + PWA + Zustand）
画像I/O（EXIF補正・縮小）
セグメンテーション（U²-Net onnx） + 低解像度フォールバック
類似スコアリング（Canny + EFD + Hu）とAPIクライアント
コンポジット＆アニメ（雲ローディング含む）
エンコード三段フォールバック
保存フロー＆アトリビューション
エラー処理網羅・E2E
パフォーマンス最適化（Worker・遅延ロード）
PWAキャッシュ・オフライン13. サンプル疑似コード（超要約）
// main flow
const img = await getInputImage(); // 撮影/選択
const mask = await segmentor.run(img); // 前景抽出
const fgSil = silhouette(img, mask); // 輪郭記述子
const cands = await fetchCandidates(pickQuery(), 32);
const best = selectBest(cands, fgSil); // 類似スコア最大
const frames = composeParallax(img, best.image, mask, 5); // AsyncGenerator
const blob = await encodeWithFallback(frames, 30);
await saveBlob(blob, suggestFilename()); 14. 将来拡張の前提（MVP外）
クリエイティブ制御（長さ/ズーム/明るさ）
SNS共有・ギャラリー
人物・キャラクター対応（背景差分 + matting強化 or depth推定）
CLIP系埋め込みでの意味的類似（ローカル推論）15. 既知のリスクと緩和
iOSのエンコード制約：WebCodecs/MediaRecorderの実装差 → ffmpeg.wasm フォールバック＋720p上限。
モデルサイズ：初回DLが重い → 遅延ロード＋SWキャッシュ、低精度モデル先行。
APIレート：バックオフ＋ローカル背景代替、事前ダウンロード不可のためキャッシュ短寿命。16. 受け渡し物
動くMVP（上記ディレクトリ構成）
.env.example（APIキーの受け渡し方式記載）
ライセンス/アトリビューション文面
テストスクリプト（Playwright/CI）
前提/未確実点
U²-Net等のONNXモデルの最適サイズは端末差で調整（320/512）。
iOS14の実デバイスでのWebCodecs挙動はOS/機種差あり→実測でフォールバック分岐を確定。
Unsplash/Pexelsの利用規約細部（埋め込みでの帰属表記）— 実装時に最新版を再確認してください。
