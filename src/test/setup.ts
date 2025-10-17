// src/test/setup.ts
import "@testing-library/jest-dom";
import { vi } from "vitest";
import "fake-indexeddb/auto";

/* -------------------------------------------
 * Polyfills
 * ----------------------------------------- */

// structuredClone
if (!(globalThis as any).structuredClone) {
  (globalThis as any).structuredClone = (val: any) =>
    JSON.parse(JSON.stringify(val));
}

// ImageData（jsdom 未実装対策）
if (typeof (globalThis as any).ImageData === "undefined") {
  (globalThis as any).ImageData = class {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = data;
    }
  };
}

// URL.createObjectURL / revokeObjectURL
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "mock-object-url";
}
if (!URL.revokeObjectURL) {
  // @ts-ignore
  URL.revokeObjectURL = () => {};
}

// Canvas の最小モック
if (!(HTMLCanvasElement.prototype as any).getContext) {
  (HTMLCanvasElement.prototype as any).getContext = () =>
    ({
      drawImage() {},
      getImageData() {
        return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
      },
      putImageData() {},
      clearRect() {},
      fillRect() {},
      beginPath() {},
      closePath() {},
    }) as unknown as CanvasRenderingContext2D;
}

// createImageBitmap
if (!(globalThis as any).createImageBitmap) {
  (globalThis as any).createImageBitmap = async () => ({}) as any;
}

// fetch モック（モデルURLはダミーの ArrayBuffer を返す）
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("/models/u2net.onnx")) {
    const buf = new ArrayBuffer(1024 * 1024);
    return new Response(buf, { status: 200 });
  }
  if (realFetch) return realFetch(input as any, init);
  throw new Error(`fetch not mocked for URL: ${url}`);
}) as any;

// File System Access API
if (!(window as any).showSaveFilePicker) {
  (window as any).showSaveFilePicker = vi.fn(async () => ({
    createWritable: async () => ({
      write: vi.fn(),
      close: vi.fn(),
    }),
  }));
}

// AudioContext ダミー
if (!(globalThis as any).AudioContext) {
  (globalThis as any).AudioContext = class {
    close() {}
    createOscillator() {
      return { connect() {}, start() {}, stop() {} };
    }
    createGain() {
      return { connect() {}, gain: { value: 0 } };
    }
    destination = {};
  };
}

// Blob constructor mock for fake-indexeddb
if (typeof Blob === "undefined") {
  (globalThis as any).Blob = class Blob {
    data: any[];
    type: string;
    constructor(data: any[], type: string) {
      this.data = data;
      this.type = type;
    }
    async text(): Promise<string> {
      return this.data.join("");
    }
  };
}

/* -------------------------------------------
 * onnxruntime-web をモック
 *  - Tensor / InferenceSession
 *  - run() は 30ms 遅延
 *  - outputNames も用意
 * ----------------------------------------- */
vi.mock("onnxruntime-web", () => {
  class Tensor {
    type: string;
    data: Float32Array | Uint8Array;
    dims: number[];
    constructor(type: string, data: Float32Array | Uint8Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }

  class InferenceSession {
    inputNames = ["input"];
    outputNames = ["output"];
    static async create(_bytes: Uint8Array | ArrayBuffer, _opts?: any) {
      return new InferenceSession();
    }
    async run(_inputs: Record<string, Tensor>) {
      await new Promise((r) => setTimeout(r, 30));
      const size = 320 * 320;
      const out = new Tensor(
        "float32",
        new Float32Array(size).fill(0.5),
        [1, 1, 320, 320],
      );
      return { output: out, out, d0: out };
    }
  }

  return { Tensor, InferenceSession };
});

// 注意：OpenCV ラッパ（@/lib/cv）のモックはここでは行いません。
// 実装は src/lib/cv.ts 側の thenable デフォルトエクスポートに一本化しています。

export {};
