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

// Mock Canvas API for tests
const mockCanvasContext = {
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })), // ダミーのImageDataを返す
  fillRect: vi.fn(),
  // 必要に応じて他のメソッドも追加
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext as any);

// Mock createImageBitmap
if (!(globalThis as any).createImageBitmap) {
  (globalThis as any).createImageBitmap = vi.fn(async (image) => {
    // ImageBitmap のモックを返す
    return {
      width: image.width || 1,
      height: image.height || 1,
      close: vi.fn(),
    };
  });
}

// NOTE:
// - グローバルな "@/lib/cv" の vi.mock は行いません。
// - cv は src/lib/cv.ts 側で Promise 兼 名前空間として提供します。
// - ここにモックを置くとホイスト順序が原因で default export 解析が壊れるため避けます。

export {};
