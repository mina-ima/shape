// src/App.tsx
import React, { useEffect, useCallback, useState } from "react";
import { useStore, MAX_RETRIES } from "./core/store";
import SegmentationDemo from "./ui/SegmentationDemo";

function parseHashParams(): Record<string, string> {
  const raw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params: Record<string, string> = {};
  for (const part of raw.split("&")) {
    if (!part) continue;
    const [k, v] = part.split("=");
    if (k) params[decodeURIComponent(k)] = v ? decodeURIComponent(v) : "";
  }
  return params;
}

const App: React.FC = () => {
  const { status, error, retryCount, processingResolution, unsplashApiKey } =
    useStore();
  const setUnsplashApiKey = useStore((s) => s.setUnsplashApiKey);
  const startProcessFlow = useStore((s) => s.startProcessFlow);
  const reset = useStore((s) => s.reset);

  // 「処理中…」を一瞬でも確実に見せるためのヒント
  const [processingHint, setProcessingHint] = useState(false);
  // クリック時点の解像度スナップショット（UI表示固定用）
  const [processingResSnapshot, setProcessingResSnapshot] = useState<
    number | null
  >(null);

  // 初回 & ハッシュ変更で unsplash_api_key を取り込む
  const syncKeyFromHash = useCallback(() => {
    const p = parseHashParams();
    if (p.unsplash_api_key && p.unsplash_api_key !== unsplashApiKey) {
      setUnsplashApiKey(p.unsplash_api_key);
      console.log("Unsplash API key set from URL hash.");
    }
  }, [setUnsplashApiKey, unsplashApiKey]);

  useEffect(() => {
    syncKeyFromHash();
    window.addEventListener("hashchange", syncKeyFromHash);
    return () => window.removeEventListener("hashchange", syncKeyFromHash);
  }, [syncKeyFromHash]);

  const handleStart = async () => {
    if (!unsplashApiKey) {
      alert(
        "Unsplash API Key が未設定です。URLの #unsplash_api_key=... を確認してください。",
      );
      return;
    }
    // 表示用に開始時点の解像度を固定
    setProcessingResSnapshot(processingResolution);
    // まずは「処理中」を見せる
    setProcessingHint(true);
    try {
      await startProcessFlow();
    } finally {
      // microtask だと同フレームで消えてしまう可能性があるため、次フレームで解除
      setTimeout(() => setProcessingHint(false), 0);
    }
  };

  // “Attempt: x / MAX” の x は：
  // - idle なら 0（表示しない）
  // - processing 中で retryCount が 0 のこともあるので最低 1 にする
  const displayAttempt =
    status === "processing" ? Math.max(1, retryCount || 1) : retryCount;

  const isProcessingUI = status === "processing" || processingHint;
  const processingResolutionForUI =
    isProcessingUI && processingResSnapshot != null
      ? processingResSnapshot
      : processingResolution;

  return (
    <div
      style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}
    >
      <h1>shape</h1>

      <section style={{ marginBottom: 16 }}>
        {/* 画像入力→推論→マスク表示のMVPデモ（ここで loading-cloud も出ます） */}
        <SegmentationDemo />

        <div>
          <strong>Unsplash API Key:</strong>{" "}
          {unsplashApiKey ? (
            <span style={{ color: "green" }}>
              設定済み（{unsplashApiKey.slice(0, 6)}…）
            </span>
          ) : (
            <span style={{ color: "red" }}>未設定</span>
          )}
        </div>
        <div>
          <strong>Processing Resolution:</strong> {processingResolution}px
        </div>
        <div>
          <strong>Status:</strong> {status}
          {status === "error" && (
            <span style={{ color: "red" }}> — {error ?? "unknown error"}</span>
          )}
          {status === "success" && (
            <span style={{ color: "green" }}>
              {" "}
              — retryCount: {retryCount}/{MAX_RETRIES}
            </span>
          )}
        </div>
      </section>

      {/* メインの開始ボタン */}
      <button
        aria-label="撮影/選択"
        onClick={handleStart}
        disabled={!unsplashApiKey || isProcessingUI}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: !unsplashApiKey ? "#eee" : "#000",
          color: !unsplashApiKey ? "#999" : "#fff",
          cursor: !unsplashApiKey ? "not-allowed" : "pointer",
        }}
      >
        {isProcessingUI ? "処理中..." : "処理を開始"}
      </button>

      {/* processing 中の補助表示（テストで期待） */}
      {isProcessingUI && (
        <div style={{ marginTop: 16 }}>
          <div
            aria-label="loading"
            data-testid="loading-cloud"
            style={{ display: "inline-block" }}
          >
            <div
              aria-label="loading animation"
              data-testid="animated-cloud"
              role="img"
              style={{
                width: 48,
                height: 32,
                borderRadius: 16,
                background:
                  "radial-gradient(circle at 30% 60%, rgba(200,200,200,.9) 0 40%, transparent 41%)," +
                  "radial-gradient(circle at 55% 50%, rgba(200,200,200,.9) 0 45%, transparent 46%)," +
                  "radial-gradient(circle at 75% 60%, rgba(200,200,200,.9) 0 35%, transparent 36%)",
              }}
            />
          </div>
          <p>処理中... (解像度: {processingResolutionForUI})</p>
          <p>{`Attempt: ${displayAttempt}/${MAX_RETRIES}`}</p>
        </div>
      )}

      {/* 成功時の UI（処理中ヒントが下りてから表示） */}
      {!isProcessingUI && status === "success" && (
        <div style={{ marginTop: 16 }}>
          <h3>成功!</h3>
          <button onClick={reset}>もう一度</button>
        </div>
      )}

      {/* エラー時の UI（処理中ヒントが下りてから表示） */}
      {!isProcessingUI && status === "error" && (
        <div style={{ marginTop: 16 }}>
          <h3>エラー</h3>
          {error && <p>{error}</p>}
          <button onClick={reset}>リトライ</button>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
        例：<code>http://localhost:4173/#unsplash_api_key=YOUR_KEY</code>{" "}
        の形式で開けば自動設定されます。
      </p>
    </div>
  );
};

export default App;
