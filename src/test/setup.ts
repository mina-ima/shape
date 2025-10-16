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
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
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

/* -------------------------------------------
 * OpenCV ラッパ `src/lib/cv` を Promise でモック
 *  - parallax/fill/descriptors で必要な API を実装
 * ----------------------------------------- */

const makeCvMock = () => {
  const CV_32SC2 = 0;
  const CV_8UC3 = 16;
  const CV_8UC4 = 24;
  const CV_64F = 6;

  const COLOR_RGBA2RGB = 1;
  const COLOR_RGB2RGBA = 2;

  const BORDER_REFLECT = 3;
  const INTER_LINEAR = 4;

  class Size {
    constructor(
      public width: number,
      public height: number,
    ) {}
  }

  class Mat {
    rows: number;
    cols: number;
    private _type: number;
    private _ch: number;
    data: Uint8Array;
    data32S: Int32Array;
    data64F: Float64Array;

    // 関数形式の channels() を持たせる（OpenCV 互換）
    channels: () => number;

    constructor(r = 0, c = 0, t = CV_32SC2) {
      this.rows = r;
      this.cols = c;
      this._type = t;
      this._ch = t === CV_8UC4 ? 4 : t === CV_8UC3 ? 3 : 2;
      this.channels = () => this._ch;

      const n8 = Math.max(1, r * c * Math.max(1, this._ch));
      this.data = new Uint8Array(n8);
      this.data32S = new Int32Array(Math.max(1, r * c * 2));
      this.data64F = new Float64Array(0);
    }

    type() {
      return this._type;
    }
    delete() {}

    copyTo(dst: Mat) {
      dst.rows = this.rows;
      dst.cols = this.cols;
      dst._type = this._type;
      dst._ch = this._ch;
      dst.channels = () => dst._ch;
      dst.data = new Uint8Array(this.data);
      dst.data32S = new Int32Array(this.data32S);
      dst.data64F = new Float64Array(this.data64F);
    }
  }

  // matFromArray（2x3 などのアフィン行列想定）
  const matFromArray = (
    rows: number,
    cols: number,
    type: number,
    arr: number[],
  ) => {
    const m = new Mat(rows, cols, type);
    m.data64F = new Float64Array(arr);
    return m;
  };

  // RGBA -> RGB / RGB -> RGBA
  const cvtColor = (src: Mat, dst: Mat, code: number) => {
    if (code === COLOR_RGBA2RGB) {
      const out = new Uint8Array(Math.floor((src.data.length / 4) * 3));
      for (let i = 0, j = 0; i < src.data.length; i += 4, j += 3) {
        out[j] = src.data[i];
        out[j + 1] = src.data[i + 1];
        out[j + 2] = src.data[i + 2];
      }
      dst.rows = src.rows;
      dst.cols = src.cols;
      dst.data = out;
      (dst as any)._type = CV_8UC3;
      (dst as any)._ch = 3;
      dst.channels = () => 3;
      return;
    }
    if (code === COLOR_RGB2RGBA) {
      const out = new Uint8Array(Math.floor((src.data.length / 3) * 4));
      for (let i = 0, j = 0; i < src.data.length; i += 3, j += 4) {
        out[j] = src.data[i];
        out[j + 1] = src.data[i + 1];
        out[j + 2] = src.data[i + 2];
        out[j + 3] = 255;
      }
      dst.rows = src.rows;
      dst.cols = src.cols;
      dst.data = out;
      (dst as any)._type = CV_8UC4;
      (dst as any)._ch = 4;
      dst.channels = () => 4;
      return;
    }
    // その他はコピー
    src.copyTo(dst);
  };

  // resize: 単色でも値が消えないように埋める
  const resize = (src: Mat, dst: Mat, dsize: Size) => {
    dst.rows = dsize.height;
    dst.cols = dsize.width;
    const ch =
      typeof (src as any).channels === "function"
        ? (src as any).channels()
        : ((src as any)._ch ?? 3);

    dst.data = new Uint8Array(dst.rows * dst.cols * ch);
    const fill = src.data[0] ?? 0;
    dst.data.fill(fill);
    (dst as any)._ch = ch;
    dst.channels = () => ch;
    dst.data32S = new Int32Array(dst.rows * dst.cols * 2);
  };

  const GaussianBlur = (src: Mat, dst: Mat, _ksize: Size, _sigmaX: number) => {
    // テスト的には「値が保たれる」方が重要なのでコピーでOK
    src.copyTo(dst);
  };

  const copyMakeBorder = (
    src: Mat,
    dst: Mat,
    _top: number,
    _bottom: number,
    _left: number,
    _right: number,
    _borderType = BORDER_REFLECT,
  ) => {
    src.copyTo(dst);
  };

  const addWeighted = (
    src1: Mat,
    alpha: number,
    src2: Mat,
    beta: number,
    _gamma: number,
    dst: Mat,
  ) => {
    const n = Math.min(src1.data.length, src2.data.length);
    dst.rows = src1.rows;
    dst.cols = src1.cols;
    dst.data = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const v = Math.round(alpha * src1.data[i] + beta * src2.data[i]);
      dst.data[i] = Math.max(0, Math.min(255, v));
    }
    (dst as any)._ch =
      typeof (src1 as any).channels === "function"
        ? (src1 as any).channels()
        : ((src1 as any)._ch ?? 3);
    dst.channels = () => (dst as any)._ch;
  };

  const split = (src: Mat, out: MatVector) => {
    const ch =
      typeof (src as any).channels === "function"
        ? (src as any).channels()
        : ((src as any)._ch ?? 3);
    const planeSize = Math.floor(src.data.length / ch);
    for (let c = 0; c < ch; c++) {
      const m = new Mat(src.rows, src.cols, CV_8UC3);
      (m as any)._ch = 1;
      m.channels = () => 1;
      m.data = new Uint8Array(planeSize);
      for (let i = 0, j = c; i < planeSize; i++, j += ch) {
        m.data[i] = src.data[j];
      }
      out.push_back(m);
    }
  };

  const merge = (mv: MatVector, dst: Mat) => {
    if (mv.size() === 0) return;
    const ch = mv.size();
    const first = mv.get(0);
    const planeSize = first.data.length;
    dst.rows = first.rows;
    dst.cols = first.cols;
    dst.data = new Uint8Array(planeSize * ch);
    for (let c = 0; c < ch; c++) {
      const m = mv.get(c);
      for (let i = 0, j = c; i < planeSize; i++, j += ch) {
        dst.data[j] = m.data[i];
      }
    }
    (dst as any)._ch = ch;
    dst.channels = () => ch;
  };

  class MatVector {
    private arr: Mat[] = [];
    push_back(m: Mat) {
      this.arr.push(m);
    }
    get(i: number) {
      return this.arr[i];
    }
    size() {
      return this.arr.length;
    }
    delete() {
      this.arr.length = 0;
    }
  }

  // 形状記述（Hu）
  const moments = (_contour: any) => ({
    m00: 1,
    m10: 0,
    m01: 0,
    m11: 0,
    m20: 0,
    m02: 0,
    m30: 0,
    m03: 0,
  });
  const HuMoments = (_m: any, out: Mat) => {
    out.rows = 7;
    out.cols = 1;
    out.data64F = new Float64Array([
      1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625,
    ]);
  };

  return {
    CV_32SC2,
    CV_8UC3,
    CV_8UC4,
    CV_64F,
    COLOR_RGBA2RGB,
    COLOR_RGB2RGBA,
    BORDER_REFLECT,
    INTER_LINEAR,
    Size,
    Mat,
    MatVector,
    cvtColor,
    resize,
    GaussianBlur,
    copyMakeBorder,
    addWeighted,
    split,
    merge,
    moments,
    HuMoments,
    matFromArray,
  };
};

// ★ Promise 兼モジュール（thenable）で返す：
//   - default: Promise
//   - 名前空間 import でも .then が使えるようにする（「then called on incompatible receiver」対策）
function cvMockPromiseFactory() {
  const cvObject = makeCvMock();
  const promise = Promise.resolve(cvObject);
  return {
    __esModule: true,
    default: promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  } as any;
}

// いろんな import 形に対応してモックを登録
vi.mock("src/lib/cv", cvMockPromiseFactory);
vi.mock("@/lib/cv", cvMockPromiseFactory);
vi.mock("../lib/cv", cvMockPromiseFactory);
/* -------------------------------------------
 * ここまで OpenCV モック
 * ----------------------------------------- */
