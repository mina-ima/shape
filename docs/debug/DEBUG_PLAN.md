# テスト失敗のデバッグ計画（shape）

## 目的

pnpm test 実行時の大量エラーを**安定的にゼロ**へ。最短で「テスト実行が通る最小セット」→ 既存テストの順次復帰。

## スコープ

- ユニット/DOMテスト（Vitest + Testing Library）
- 型エラー(TypeScript)と実行時エラーの解消
- 重いネイティブ/ブラウザ依存（onnxruntime-web / opencv-js / workbox等）は**モック前提**

## 期待成果（Exit Criteria）

- `pnpm test` がローカルで **0 fail / 0 error**（スナップショット含む）
- `pnpm test --run` で **並列・CI互換**に耐える
- 主要テストが**フレーク無し**（3回連続パス）

---

## 既知症状（初期観測）

- `Cannot find module 'vitest' / '@testing-library/react'`：依存の未設定or解決漏れ
- JSX/JSX-Runtime 未定義エラー：テスト環境の `jsxImportSource` / `jsdom` 未設定
- `onnxruntime-web` / `@techstark/opencv-js` 由来の ESM/WASM 読み込み失敗
- `vi.mock("happy-dom", ..., { virtual: true })` の**引数過多**（Vitest v3 API差異）
- PWA/`workbox-window` の ESM 参照（ブラウザ前提）での失敗

---

## 方針（高精度・短期収束）

1. **テスト基盤を正す**
   - `vitest.config.ts` で `environment: "jsdom"`, `setupFiles`, `alias:@ → src` を明示
   - `tsconfig.test.json`（必要なら）で JSX/DOM 型を固定
2. **重い依存をモック**
   - `__mocks__/onnxruntime-web.ts` ：`Tensor`/`InferenceSession` を軽量ダミー
   - `__mocks__/@techstark/opencv-js.ts` ：最低限の `Mat`/関数スタブ
   - `__mocks__/workbox-window.ts` ：参照だけ満たす空モック
3. **セットアップ統一**
   - `src/test/setup.ts`：`@testing-library/jest-dom`、`fetch`/`URL.createObjectURL`/`canvas` のポリフィル
   - **問題の `vi.mock("happy-dom", ..., { virtual: true })` を削除**（v3は2引数で十分）
4. **テストの段階復帰**
   - まず `core/` と `ui/` の軽量テストを通す
   - 次に `segmentation/` `encode/` 等は**モック前提**で有効化
5. **CI前提の実行**（並列/ウォッチ無効）
   - `pnpm test --run --reporter=verbose`

---

## 実施タスク（チェックリスト）

- [ ] `vitest.config.ts` を追加/更新（jsdom, setupFiles, alias, coverage 設定）
- [ ] `src/test/setup.ts` を更新（jest-dom、fetch/canvas polyfill、不要な `vi.mock` 削除）
- [ ] `__mocks__/onnxruntime-web.ts` 作成（Tensor/Session/run をスタブ）
- [ ] `__mocks__/@techstark/opencv-js.ts` 作成（最小APIのみ）
- [ ] `__mocks__/workbox-window.ts` 作成（空実装）
- [ ] PWA 仮想モジュール（`virtual:pwa-register`）の参照をテスト時にモック
- [ ] `package.json` に `test`, `test:ci` スクリプトを定義
- [ ] 失敗テストのカテゴリー分け & 一時 `describe.skip`（段階復帰用）
- [ ] 連続3回パスを確認

---

## 変更ファイル（予定）

- `vitest.config.ts`（新規/更新）
- `src/test/setup.ts`（更新）
- `__mocks__/onnxruntime-web.ts`（新規）
- `__mocks__/@techstark/opencv-js.ts`（新規）
- `__mocks__/workbox-window.ts`（新規）
- （必要に応じ）`src/main.tsx` 内の PWA 登録を `if (import.meta.vitest) {}` で無効化

---

## 実行コマンド

```bash
# 依存の再確認
pnpm i

# 一括テスト（監視なし）
pnpm test --run

# 失敗箇所の詳細
pnpm test --run --reporter=verbose

# 単体（例）
pnpm vitest run src/core/store.test.ts
```
