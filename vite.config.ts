// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      // 巨大な onnx/ffmpeg の wasm は precache しない（runtime cache 想定）
      workbox: {
        // wasm を含めない（コメントに合わせる）
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        // onnx / ffmpeg / opencv 等の大物を precache から明示的に除外
        globIgnores: [
          "**/*ort-*.wasm",
          "ffmpeg/**",
          "**/*opencv*.wasm",
          "**/*.wasm" // 念のため、その他の wasm も precache 対象外
        ],
        // （必要なら）上限は控えめのままでもよい
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      }
    }),
    viteStaticCopy({
      targets: [
        // onnxruntime の wasm は配信に必要（runtimeでfetchされる）
        { src: "node_modules/onnxruntime-web/dist/*.wasm", dest: "." },
        // ffmpeg core を /ffmpeg/ にまとめて配置（encoder.ts の corePath=/ffmpeg/ffmpeg-core.js と一致）
        { src: "node_modules/@ffmpeg/core/dist/*", dest: "ffmpeg" }
      ]
    })
  ],
  worker: {
    format: "es"
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web", "@ffmpeg/ffmpeg"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
