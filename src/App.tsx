import React, { useEffect, useCallback, useState } from "react";
import { useStore, MAX_RETRIES } from "./core/store";
import { getCameraInput } from "./camera";
import SegmentationDemo from "./ui/SegmentationDemo";
import licensesMarkdown from "./docs/licenses.md?raw"; // Import licenses.md as raw string
import { marked } from "marked"; // Import marked

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

  const [showLicenses, setShowLicenses] = useState(false); // State for license modal visibility

  // Convert markdown to HTML
  const licensesHtml = marked(licensesMarkdown);

  // 「処理中…」を一瞬でも確実に見せるためのヒント
  const [processingHint, setProcessingHint] = useState(false);
  // クリック時点の解像度スナップショット（UI表示固定用）
  const [processingResSnapshot, setProcessingResSnapshot] = useState<
    number | null
  >(null);
  const [inputImage, setInputImage] = useState<ImageBitmap | null>(null);

  // 初回 & ハッシュ変更で unsplash_api_key を取り込む
  const syncKeyFromHash = useCallback(() => {
    const p = parseHashParams();
    if (p.unsplash_api_key && p.unsplash_api_key !== unsplashApiKey) {
      setUnsplashApiKey(p.unsplash_api_key);
      console.log("Unsplash API key set from URL hash.");
      // Clear the hash from the URL after processing
      window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [setUnsplashApiKey, unsplashApiKey]);

  useEffect(() => {
    syncKeyFromHash();
    window.addEventListener("hashchange", syncKeyFromHash);
    return () => window.removeEventListener("hashchange", syncKeyFromHash);
  }, [syncKeyFromHash]);

  const handleImageSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      const imageBitmap = await createImageBitmap(file);
      setInputImage(imageBitmap);
    }
  };

  const handleCameraInput = async () => {
    try {
      const imageBitmap = await getCameraInput();
      if (imageBitmap) {
        setInputImage(imageBitmap);
      } else {
        useStore.setState({
          status: "error",
          error: "カメラ入力またはファイル選択に失敗しました。",
        });
      }
    } catch (error) {
      console.error("Error during camera input:", error);
      useStore.setState({
        status: "error",
        error: `カメラ入力エラー: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const handleStart = async () => {
    if (!unsplashApiKey) {
      useStore.setState({
        status: "error",
        error:
          "Unsplash API Key が未設定です。URLの #unsplash_api_key=... を確認してください。",
      });
      return;
    }
    if (!inputImage) {
      useStore.setState({
        status: "error",
        error: "画像が選択されていません。",
      });
      return;
    }
    setProcessingResSnapshot(processingResolution);
    setProcessingHint(true); // 先に true にする
    try {
      await startProcessFlow(inputImage); // Pass inputImage to startProcessFlow
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
      {(() => {
        console.log(
          "App Render: status=",
          status,
          "isProcessingUI=",
          isProcessingUI,
        );
        return null;
      })()}
      <h1>shape</h1>

      <section style={{ marginBottom: 16 }}>
        {/* 画像入力エリア */}
        <div style={{ marginBottom: 16 }}>
          <label>
            ファイルを選択:
            <input type="file" accept="image/*" onChange={handleImageSelect} />
          </label>
          <button onClick={handleCameraInput}>カメラで撮影</button>
          {inputImage && (
            <p>
              選択中の画像: {inputImage.width}x{inputImage.height}
            </p>
          )}
        </div>

        <div>
          <strong>Unsplash API Key:</strong>{" "}
          {unsplashApiKey ? (
            <span style={{ color: "green" }}>
              設定済み（{unsplashApiKey.slice(0, 6)}…）
            </span>
          ) : (
            <span style={{ color: "#CC0000" }}>未設定</span>
          )}
        </div>
        <div>
          <strong>Processing Resolution:</strong> {processingResolution}px
        </div>
        <div>
          <strong>Status:</strong> {status}
          {status === "error" && (
            <span style={{ color: "#CC0000" }}>
              {" "}
              — {error ?? "unknown error"}
            </span>
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
        disabled={!unsplashApiKey || isProcessingUI || !inputImage}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: !unsplashApiKey || !inputImage ? "#ddd" : "#000",
          color: !unsplashApiKey || !inputImage ? "#666" : "#fff",
          cursor: !unsplashApiKey || !inputImage ? "not-allowed" : "pointer",
        }}
      >
        {isProcessingUI ? "処理中..." : "撮影/選択"}
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
          {error && (
            <p data-testid="error-message" style={{ color: "#CC0000" }}>
              {error}
            </p>
          )}
          <button onClick={reset}>リトライ</button>
        </div>
      )}

      <p style={{ marginTop: 12, fontSize: 12, color: "#555" }}>
        例：<code>http://localhost:4173/#unsplash_api_key=YOUR_KEY</code>{" "}
        の形式で開けば自動設定されます。
      </p>

      <button
        onClick={() => setShowLicenses(true)}
        style={{
          marginTop: "20px",
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid #ccc",
          background: "#f0f0f0",
          color: "#333",
          cursor: "pointer",
        }}
      >
        Licenses
      </button>

      {showLicenses && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 2000,
          }}
        >
          <div
            data-testid="licenses-modal-content"
            style={{
              backgroundColor: "white",
              padding: "20px",
              borderRadius: "8px",
              maxWidth: "80%",
              maxHeight: "80%",
              overflowY: "auto",
              color: "#333",
            }}
          >
            <button
              onClick={() => setShowLicenses(false)}
              style={{
                float: "right",
                background: "none",
                border: "none",
                fontSize: "1.2em",
                cursor: "pointer",
              }}
            >
              &times;
            </button>
            <div dangerouslySetInnerHTML={{ __html: licensesHtml }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
