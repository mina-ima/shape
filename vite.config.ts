/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectManifest: {
        injectionPoint: undefined,
        sri: true, // Enable SRI for injected manifest
      },
      swSrc: "src/sw.ts",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm,onnx}"],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50 MB に設定
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "unsplash-images-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/images\.pexels\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "pexels-images-cache",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "masked-icon.svg",
        "public/models/u2net.onnx",
        "public/assets/fallback_bg/**/*",
      ],
      manifest: {
        name: "Parallax Web App",
        short_name: "ParallaxApp",
        description:
          "A client-side web application that generates 2.5D parallax effect videos.",
        theme_color: "#ffffff",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    include: ["onnxruntime-web"],
  },
  server: {
    // Enable HTTPS for development server
    // https: true,
  },
  test: {
    globals: true,
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}", "src/ui/Tabs.test.tsx"],
    browser: {
      enabled: true,
      name: "chromium",
      provider: "playwright",
      ignoreHTTPSErrors: true,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      external: ["workbox-window"],
    },
  },
});
