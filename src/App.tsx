// src/App.tsx
import React, { useEffect, useCallback } from "react";
import { useStore, MAX_RETRIES } from "./core/store";

function parseHashParams(): Record<string, string> {
  // 例: "#unsplash_api_key=XXXX&foo=bar"
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
  const { status, error, retryCount, processingResolution, unsplashApiKey } = useStore();
  const setUnsplashApiKey = useStore((s) => s.setUnsplashApiKey);
  const startProcessFlow = useStore((s) => s.startProcessFlow);

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
      alert("Unsplash API Key が未設定です。URLの #unsplash_api_key=... を確認してください。");
      return;
    }
    await startProcessFlow(); // runProcessing は解像度:numberで実行されます
  };

  // 簡易UI
  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>shape</h1>

      <section style={{ marginBottom: 16 }}>
        <div>
          <strong>Unsplash API Key:</strong>{" "}
          {unsplashApiKey ? (
            <span style={{ color: "green" }}>設定済み（{unsplashApiKey.slice(0, 6)}…）</span>
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
            <span style={{ color: "green" }}> — retryCount: {retryCount}/{MAX_RETRIES}</span>
          )}
        </div>
      </section>

      <button
        onClick={handleStart}
        disabled={!unsplashApiKey || status === "processing"}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: !unsplashApiKey ? "#eee" : "#000",
          color: !unsplashApiKey ? "#999" : "#fff",
          cursor: !unsplashApiKey ? "not-allowed" : "pointer",
        }}
      >
        {status === "processing" ? "処理中..." : "処理を開始"}
      </button>

      <p style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
        例：<code>http://localhost:4173/#unsplash_api_key=YOUR_KEY</code> の形式で開けば自動設定されます。
      </p>
    </div>
  );
};

export default App;
