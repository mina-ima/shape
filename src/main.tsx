import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import * as ort from "onnxruntime-web";

// ONNX Runtime Web の WASM ファイルパスを設定
// vite.config.ts で dest: '.' に設定した場合、ルートからのパスになります。
ort.env.wasm.wasmPaths = "/";

// vitest 実行時や SSR/Node 実行時は SW 登録をスキップ
if (!(import.meta as any).vitest && typeof window !== "undefined") {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegistered(r) {
        if (r) console.log("[PWA] Service Worker registered:", r);
      },
      onRegisterError(e) {
        console.warn("[PWA] SW registration failed:", e);
      },
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
