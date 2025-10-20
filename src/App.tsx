// src/App.tsx
import React, { useEffect, useCallback, useState } from "react";
import { useStore, MAX_RETRIES } from "./core/store";
import SegmentationDemo from "./ui/SegmentationDemo"; // 未使用でも将来用に残す
import licensesMarkdown from "./docs/licenses.md?raw"; // ライセンス文面（Markdown）の生文字列を取り込む
import { marked } from "marked"; // MarkdownをHTMLに変換

// URLハッシュからパラメータを取得（#key=value&...）
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

  // ライセンスモーダル表示
  const [showLicenses, setShowLicenses] = useState(false);
  // Markdown -> HTML
  const licensesHtml = marked(licensesMarkdown);

  // 「処理中…」を一瞬でも確実に見せるためのヒント
  const [processingHint, setProcessingHint] = useState(false);
  // クリック時の解像度スナップショット（UI表示固定用）
  const [processingResSnapshot, setProcessingResSnapshot] = useState<number | null>(null);
  // 入力画像（ファイル選択 or カメラ撮影）
  const [inputImage, setInputImage] = useState<ImageBitmap | null>(null);

  // カメラモーダル表示 & クリック直下で取得したストリーム
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // 初回 & ハッシュ変更で unsplash_api_key を取り込む
  const syncKeyFromHash = useCallback(() => {
    const p = parseHashParams();
    if (p.unsplash_api_key && p.unsplash_api_key !== unsplashApiKey) {
      setUnsplashApiKey(p.unsplash_api_key);
      console.log("Unsplash API key set from URL hash.");
      // ハッシュをURLから除去（見た目きれいに）
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  }, [setUnsplashApiKey, unsplashApiKey]);

  useEffect(() => {
    syncKeyFromHash();
    window.addEventListener("hashchange", syncKeyFromHash);
    return () => window.removeEventListener("hashchange", syncKeyFromHash);
  }, [syncKeyFromHash]);

  // 端末ファイル選択
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const imageBitmap = await createImageBitmap(file);
      setInputImage(imageBitmap);
    }
  };

  // カメラ起動（クリック直下で getUserMedia を開始）
  const handleCameraInput = async () => {
    console.log("[Camera] handleCameraInput called.");
    if (!navigator.mediaDevices) {
      console.error("[Camera] navigator.mediaDevices is not available.");
      alert("このブラウザはカメラAPIに対応していません。");
      return;
    }
    try {
      console.log("[Camera] click: requesting getUserMedia");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      console.log("[Camera] click: gUM success, tracks=", stream.getVideoTracks().length);
      setCameraStream(stream);
      setShowCamera(true);
    } catch (e: any) {
      console.error("[Camera] click: gUM failed:", e?.name || String(e));
      alert(
        e?.name === "NotAllowedError"
          ? "カメラ権限が拒否されています。ブラウザ/OSのサイト権限でカメラを許可して再試行してください。"
          : e?.name === "NotFoundError"
          ? "利用可能なカメラが見つかりません。外付けカメラや他アプリの占有をご確認ください。"
          : "カメラを初期化できませんでした。別のブラウザ/端末でお試しください。"
      );
    }
  };

  // 処理開始
  const handleStart = async () => {
    if (!unsplashApiKey) {
      useStore.setState({
        status: "error",
        error: "Unsplash API Key が未設定です。URLの #unsplash_api_key=... を確認してください。",
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
    setProcessingHint(true);
    try {
      await startProcessFlow(inputImage);
    } finally {
      // microtask だと同フレームで消えてしまう可能性があるため、次フレームで解除
      setTimeout(() => setProcessingHint(false), 0);
    }
  };

  // “Attempt: x / MAX” の x は：
  // - idle なら 0（表示しない）
  // - processing 中で retryCount が 0 のこともあるので最低 1 にする
  const displayAttempt = status === "processing" ? Math.max(1, retryCount || 1) : retryCount;

  const isProcessingUI = status === "processing" || processingHint;
  const processingResolutionForUI =
    isProcessingUI && processingResSnapshot != null
      ? processingResSnapshot
      : processingResolution;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      {(() => {
        console.log("App Render: status=", status, "isProcessingUI=", isProcessingUI);
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
            <span style={{ color: "green" }}>設定済み（{unsplashApiKey.slice(0, 6)}…）</span>
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
            <span style={{ color: "#CC0000" }}> — {error ?? "unknown error"}</span>
          )}
          {status === "success" && (
            <span style={{ color: "green" }}> — retryCount: {retryCount}/{MAX_RETRIES}</span>
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
          <div aria-label="loading" data-testid="loading-cloud" style={{ display: "inline-block" }}>
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
        例：<code>http://localhost:4173/#unsplash_api_key=YOUR_KEY</code> の形式で開けば自動設定されます。
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
              aria-label="close-licenses"
            >
              &times;
            </button>
            <div dangerouslySetInnerHTML={{ __html: licensesHtml }} />
          </div>
        </div>
      )}

      {/* カメラ撮影モーダル */}
      {showCamera && (
        <CameraModal
          initialStream={cameraStream}
          onClose={() => {
            cameraStream?.getTracks().forEach((t) => t.stop());
            setCameraStream(null);
            setShowCamera(false);
          }}
          onCapture={(bmp) => {
            setInputImage(bmp);
            cameraStream?.getTracks().forEach((t) => t.stop());
            setCameraStream(null);
            setShowCamera(false);
          }}
        />
      )}
    </div>
  );
};

export default App;

/* --- ここから：カメラモーダル（クリック直下取得ストリーム対応 & 詳細ログ） --- */
const CameraModal: React.FC<{
  onClose: () => void;
  onCapture: (image: ImageBitmap) => void;
  initialStream?: MediaStream | null;
}> = ({ onClose, onCapture, initialStream }) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const [logLines, setLogLines] = React.useState<string[]>([]);
  const log = React.useCallback((...args: any[]) => {
    const msg = ["[Camera]", ...args].join(" ");
    console.log(msg);
    setLogLines((prev) => [...prev, msg].slice(-15));
  }, []);

  // ストリーム設定：initialStream があればそれを使い、なければここで取得
  React.useEffect(() => {
    let stopped = false;
    (async () => {
      try {
        let stream = initialStream || null;
        if (!stream) {
          if (typeof navigator === "undefined" || !navigator.mediaDevices) {
            setErrorMsg("このブラウザはカメラAPIに対応していません。");
            log("error: mediaDevices not available");
            return;
          }
          log("effect: requesting getUserMedia (fallback)");
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        }
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        v.playsInline = true;
        v.muted = true;

        log("video srcObject set. waiting for metadata...");

        await new Promise<void>((resolve) => {
          if (v.readyState >= 1) {
            log("metadata already loaded (readyState=", v.readyState, "). resolving promise.");
            resolve();
          }
          else {
            v.onloadedmetadata = () => {
              log("onloadedmetadata event fired. resolving promise.");
              resolve();
            };
          }
        });

        log("metadata loaded. calling video.play()...");
        try {
          await v.play();
          log("video.play() successfully awaited.", "readyState=", String(v.readyState), "size=", v.videoWidth, "x", v.videoHeight);
        } catch (pe: any) {
          log("video.play() failed on first attempt:", pe?.name || String(pe));
          setErrorMsg("映像の再生開始に失敗。リトライします...");
          await new Promise(res => setTimeout(res, 100)); // 少し待つ
          try {
            await v.play();
            log("video.play() successfully awaited on retry.");
            setErrorMsg(null); // 成功したのでエラーメッセージを消す
          } catch (pe2) {
            log("video.play() failed on retry:", String(pe2));
            setErrorMsg("カメラ映像の再生に失敗しました。別のブラウザ/端末でお試しください。");
            return; // これ以上進めないので抜ける
          }
        }
        log("setting ready state to true...");
        setReady(true);
        log("ready state set to true.");
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          log("devices:", devs.map((d) => `${d.kind}:${d.label || "(no label)"}`).join(", "));
        } catch {}
      } catch (e: any) {
        log("getUserMedia failed:", e?.name || String(e));
        const msg =
          e?.name === "NotAllowedError"
            ? "カメラ権限が拒否されました。ブラウザ設定から許可してください。"
            : e?.name === "NotFoundError"
            ? "利用可能なカメラが見つかりません。"
            : e?.name === "NotReadableError"
            ? "他のアプリがカメラを使用中の可能性があります。アプリを閉じて再試行してください。"
            : "カメラを初期化できませんでした。別のブラウザ/端末でお試しください。";
        setErrorMsg(msg);
      }
    })();
    return () => {
      stopped = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [initialStream, log]);

  // 1フレーム撮影して ImageBitmap にする
  const handleSnap = async () => {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErrorMsg("Canvas が使用できません。");
      return;
    }
    ctx.drawImage(v, 0, 0, w, h);
    try {
      let bmp: ImageBitmap;
      if (typeof window !== "undefined" && "createImageBitmap" in window) {
        bmp = await createImageBitmap(canvas);
      } else {
        const blob: Blob | null = await new Promise((res) =>
          canvas.toBlob((b) => res(b), "image/png")
        );
        if (!blob) throw new Error("Blob 生成に失敗しました。");
        bmp = await createImageBitmap(blob);
      }
      log("snap ok:", String(w), "x", String(h));
      onCapture(bmp);
    } catch (e) {
      log("snap failed:", String(e));
      setErrorMsg("画像の取得に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.85)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(96vw, 720px)",
          background: "#111",
          borderRadius: 12,
          padding: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,.5)",
          color: "#fff",
        }}
      >
        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "auto",
              background: "#000",
              borderRadius: 8,
            }}
          />
          {!ready && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 8px, transparent 8px 16px)",
                borderRadius: 8,
              }}
            >
              <span>カメラを初期化中…</span>
            </div>
          )}
        </div>
        {errorMsg && <p style={{ color: "#ff8080", marginTop: 8 }}>{errorMsg}</p>}

        {/* デバッグログ（直近15行） */}
        <pre
          style={{
            marginTop: 8,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            background: "#000",
            padding: 8,
            borderRadius: 8,
            opacity: 0.8,
            maxHeight: 160,
            overflow: "auto",
            display: logLines.length ? "block" : "none",
          }}
        >
          {logLines.join("\n")}
        </pre>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #555",
              background: "#222",
              color: "#ddd",
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSnap}
            disabled={!ready}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #09f",
              background: ready ? "#09f" : "#555",
              color: "#fff",
              cursor: ready ? "pointer" : "not-allowed",
            }}
            aria-label="シャッター"
          >
            撮影
          </button>
        </div>
      </div>
    </div>
  );
};
// deploy marker 2025年 10月20日 月曜日 16時47分15秒 JST
