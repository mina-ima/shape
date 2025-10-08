// src/test/setup.ts
import { vi, expect } from "vitest";
// RTL の拡張マッチャを有効化（toBeInTheDocument, toHaveAttribute 等）
import "@testing-library/jest-dom/vitest";

/* =========================
 * Vitest のタイムアウト緩和
 * ========================= */
vi.setConfig({
  hookTimeout: 30000,
  testTimeout: 30000,
});

/* =========================
 * "happy-dom" を参照しようとして失敗する件の抑止
 * （Vitest 内部で optional import されることがある）
 * ========================= */
vi.mock("happy-dom", () => ({}), { virtual: true });

/* =========================
 * OpenCV ライトモック
 * ========================= */

type CvType = number;
const CV_8UC1 = 1;
const CV_8UC3 = 3;
const CV_8UC4 = 4;
const CV_32SC2 = 100; // 擬似用（2ch int32）

function channelsOf(type: CvType): number {
  if (type === CV_8UC1) return 1;
  if (type === CV_8UC3) return 3;
  if (type === CV_8UC4) return 4;
  if (type === CV_32SC2) return 2;
  return 1;
}
function bytePerChannel(type: CvType): number {
  return type === CV_32SC2 ? 4 : 1; // int32 or uint8
}

class MatMock {
  rows: number;
  cols: number;
  typeId: CvType;
  data: Uint8Array;
  data32S: Int32Array;

  constructor(rows = 0, cols = 0, type: CvType = CV_8UC1, fill?: number[]) {
    this.rows = rows;
    this.cols = cols;
    this.typeId = type;

    const ch = channelsOf(type);
    const bpc = bytePerChannel(type);
    const length = rows * cols * ch;

    if (type === CV_32SC2) {
      this.data32S = new Int32Array(length);
      this.data = new Uint8Array(this.data32S.buffer);
      if (fill?.length) this.data32S.set(fill as any);
    } else {
      // Uint8 ベース（RGBA / GRAY / RGB）
      this.data = new Uint8Array(length * (bpc === 1 ? 1 : bpc));
      this.data32S = new Int32Array(0);
      if (fill?.length) this.data.set(Uint8Array.from(fill));
    }
  }

  channels() {
    return channelsOf(this.typeId);
  }
  delete() {
    // no-op
  }
  ptr(y: number, x: number) {
    const ch = this.channels();
    const idx = (y * this.cols + x) * ch;
    return this.data.subarray(idx, idx + ch);
  }

  static ones(r: number, c: number, _t?: CvType) {
    const m = new MatMock(r, c, CV_8UC1);
    m.data.fill(1);
    return m;
  }
}

class MatVectorMock {
  arr: MatMock[] = [];
  push_back(m: MatMock) {
    this.arr.push(m);
  }
  get _data() {
    return this.arr;
  }
  delete() {}
}

function matFromArray(rows: number, cols: number, type: CvType, arr: number[]) {
  const m = new MatMock(rows, cols, type);
  if (type === CV_32SC2) m.data32S.set(arr as any);
  else m.data.set(Uint8Array.from(arr));
  return m;
}

function matFromImageData(imageData: ImageData) {
  const { width, height, data } = imageData;
  const m = new MatMock(height, width, CV_8UC4);
  m.data.set(data);
  return m;
}

function cvtColor(src: MatMock, dst: MatMock, _code: number) {
  // 簡易：dstにsrcをコピー（精度不要）
  dst.rows = src.rows;
  dst.cols = src.cols;
  dst.typeId = src.typeId;
  dst.data = new Uint8Array(src.data);
}

function rectangle(
  mat: MatMock,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  _color: any,
  _thick: number,
) {
  const minX = Math.max(0, Math.min(p1.x, p2.x));
  const maxX = Math.min(mat.cols - 1, Math.max(p1.x, p2.x));
  const minY = Math.max(0, Math.min(p1.y, p2.y));
  const maxY = Math.min(mat.rows - 1, Math.max(p1.y, p2.y));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = (y * mat.cols + x) * mat.channels();
      if (mat.channels() === 1) {
        mat.data[px] = 255;
      } else {
        mat.data[px] = 255;
        mat.data[px + 1] = 255;
        mat.data[px + 2] = 255;
        if (mat.channels() === 4) mat.data[px + 3] = 255;
      }
    }
  }
}

function circle(
  mat: MatMock,
  center: { x: number; y: number },
  r: number,
  _color: any,
  _thick: number,
) {
  for (let y = 0; y < mat.rows; y++) {
    for (let x = 0; x < mat.cols; x++) {
      const dx = x - center.x;
      const dy = y - center.y;
      if (dx * dx + dy * dy <= r * r) {
        const px = (y * mat.cols + x) * mat.channels();
        if (mat.channels() === 1) mat.data[px] = 255;
        else {
          mat.data[px] = 255;
          mat.data[px + 1] = 255;
          mat.data[px + 2] = 255;
          if (mat.channels() === 4) mat.data[px + 3] = 255;
        }
      }
    }
  }
}

// findContours は単純な矩形輪郭を1つ返す（テストが contour を必要とするための最小実装）
function findContours(
  src: MatMock,
  contours: MatVectorMock,
  _mode: number,
  _method: number,
) {
  const w = Math.max(0, src.cols - 1);
  const h = Math.max(0, src.rows - 1);
  const contour = matFromArray(4, 1, CV_32SC2, [0, 0, w, 0, w, h, 0, h]);
  contours.push_back(contour);
}

// 形態学・モーメントはダミー（テストが「呼べること」を重視）
function morphologyEx(_src: MatMock, dst: MatMock, _op: number, _kernel: MatMock) {
  cvtColor(_src, dst, 0);
}
function moments(_contour: MatMock) {
  return {}; // ダミー
}
function HuMoments(_m: any, dst: MatMock) {
  // 7要素のダミー
  const arr = new Float64Array(7).fill(0);
  dst.data = new Uint8Array(arr.buffer);
}

// cv モック本体
const cvMock: any = {
  Mat: MatMock as any,
  MatVector: MatVectorMock as any,
  Point: (x: number, y: number) => ({ x, y }),
  Scalar: (...v: number[]) => v,
  cvtColor,
  rectangle,
  circle,
  matFromArray,
  matFromImageData,
  findContours,
  morphologyEx,
  moments,
  HuMoments,
  // 定数
  COLOR_GRAY2RGBA: 0,
  COLOR_RGBA2RGB: 1,
  MORPH_OPEN: 2,
  MORPH_CLOSE: 3,
  RETR_EXTERNAL: 0,
  CHAIN_APPROX_SIMPLE: 0,
  CV_8UC1,
  CV_8UC3,
  CV_8UC4,
  CV_32SC2,
  onRuntimeInitialized: Promise.resolve(),
};

// 未実装のアクセスは no-op 関数を返す（安全網）
const cvProxy = new Proxy(cvMock, {
  get(target, prop) {
    if (prop in target) return (target as any)[prop];
    const fn = vi.fn();
    (target as any)[prop] = fn;
    return fn;
  },
});

// 両方の import 形態に耐えるモック：
//   import cvPromise from "@techstark/opencv-js"
//   import * as cv from "@techstark/opencv-js"
vi.mock("@techstark/opencv-js", () => {
  const defaultExport = Promise.resolve(cvProxy);
  return {
    default: defaultExport, // cvPromise
    __esModule: true,
    // namespace import用に「中身っぽいもの」も同時に出す
    Mat: cvProxy.Mat,
    MatVector: cvProxy.MatVector,
    Point: cvProxy.Point,
    Scalar: cvProxy.Scalar,
    cvtColor: cvProxy.cvtColor,
    rectangle: cvProxy.rectangle,
    circle: cvProxy.circle,
    matFromArray: cvProxy.matFromArray,
    matFromImageData: cvProxy.matFromImageData,
    findContours: cvProxy.findContours,
    morphologyEx: cvProxy.morphologyEx,
    moments: cvProxy.moments,
    HuMoments: cvProxy.HuMoments,
    COLOR_GRAY2RGBA: cvProxy.COLOR_GRAY2RGBA,
    COLOR_RGBA2RGB: cvProxy.COLOR_RGBA2RGB,
    MORPH_OPEN: cvProxy.MORPH_OPEN,
    MORPH_CLOSE: cvProxy.MORPH_CLOSE,
    RETR_EXTERNAL: cvProxy.RETR_EXTERNAL,
    CHAIN_APPROX_SIMPLE: cvProxy.CHAIN_APPROX_SIMPLE,
    CV_8UC1: cvProxy.CV_8UC1,
    CV_8UC3: cvProxy.CV_8UC3,
    CV_8UC4: cvProxy.CV_8UC4,
    CV_32SC2: cvProxy.CV_32SC2,
    onRuntimeInitialized: cvProxy.onRuntimeInitialized,
  };
});

/* =========================
 * DOM / Web API ポリフィル
 * ========================= */

// matchMedia（LoadingCloud 用）
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  (window as any).matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// ImageData（Node 環境向け）
if (typeof (globalThis as any).ImageData !== "function") {
  class SimpleImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  (globalThis as any).ImageData = SimpleImageData as any;
}

// createImageBitmap（camera テスト用）
if (typeof (globalThis as any).createImageBitmap !== "function") {
  (globalThis as any).createImageBitmap = vi.fn(async (_src: any) => {
    // 返り値は最低限のダミー
    return { close: vi.fn?.() } as any;
  });
}

// navigator.mediaDevices.getUserMedia（camera テストが spy できるように雛形を用意）
if (typeof navigator !== "undefined") {
  (navigator as any).mediaDevices ??= {};
  (navigator.mediaDevices as any).getUserMedia ??= vi.fn();
}

// URL.createObjectURL / revokeObjectURL（Preview / save 用）
if (typeof URL.createObjectURL !== "function") {
  (URL as any).createObjectURL = vi.fn(() => "blob:mock-url");
}
if (typeof URL.revokeObjectURL !== "function") {
  (URL as any).revokeObjectURL = vi.fn();
}

// document.body がないケースの保険（通常 jsdom ならある）
if (typeof document !== "undefined" && !document.body) {
  (document as any).body = document.createElement("body");
  document.documentElement.appendChild(document.body);
}

// showSaveFilePicker（存在しない環境のデフォルト）
// ※ 各テストで上書き／削除できるようシンプルに定義
if (typeof (globalThis as any).showSaveFilePicker !== "function") {
  (globalThis as any).showSaveFilePicker = vi.fn(async () => ({
    createWritable: async () => ({
      write: vi.fn(async (_blob?: Blob) => {}),
      close: vi.fn(async () => {}),
    }),
  }));
}
