// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        // 相対URLの基準（/models/... の fetch 等で必要）
        url: "http://localhost/",
        // アニメーション等の挙動が安定（requestAnimationFrame系）
        pretendToBeVisual: true,
      },
    },
    globals: true,
    setupFiles: ["src/test/setup.ts", "./vitest.setup.ts"],

    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
