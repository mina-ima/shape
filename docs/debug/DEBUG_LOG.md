---

### `docs/debug/DEBUG_LOG.md`

```markdown
# デバッグ履歴（shape / pnpm test）

> 作業ごとに以下テンプレで追記してください。

---

## [YYYY-MM-DD HH:mm] 事象

- `pnpm test` で **xxx件失敗 / 型エラー多数**。
- 主エラー例：
  - `TS2307: Cannot find module 'vitest' / '@testing-library/react'`
  - `TS2875: JSX tag requires 'react/jsx-runtime'`
  - `onnxruntime-web` / `@techstark/opencv-js` 読み込み失敗
  - `TS2554: vi.mock expected 1-2 args, got 3`（`happy-dom` モック）

## 原因仮説

- Vitest 環境未設定（`jsdom`/`setupFiles`/alias 不足）
- ブラウザネイティブ依存（WASM/Canvas/PWA）をテストで直読みにより失敗
- Vitest v3 の API 差異（`vi.mock` 引数）

## 対処（今回）

- `vitest.config.ts` を導入（`environment: "jsdom"`, `setupFiles`）
- `src/test/setup.ts` を整備（`@testing-library/jest-dom`、polyfill）
- `__mocks__` で **onnx/opencv/workbox** をスタブ
- `vi.mock("happy-dom", ..., { virtual: true })` を削除/簡略化

## コマンド/ログ抜粋

```bash
pnpm test --run --reporter=verbose
# ...（エラーログ先頭10行を貼る）...
```
