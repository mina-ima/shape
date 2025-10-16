// vitest.setup.ts
// -------------------------------------------------------------
// Test bootstrap (no global cv mock; cv is provided by src/lib/cv.ts)
// -------------------------------------------------------------

import "@testing-library/jest-dom/vitest";

// ---- Minimal DOM shims (if needed by components) ----------------
if (!(globalThis as any).ImageData) {
  (globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  } as any;
}

// NOTE:
// - グローバルな "@/lib/cv" の vi.mock は行いません。
// - cv は src/lib/cv.ts 側で Promise 兼 名前空間として提供します。
// - ここにモックを置くとホイスト順序が原因で default export 解析が壊れるため避けます。

export {};
