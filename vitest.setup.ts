// vitest.setup.ts
// -------------------------------------------------------------
// Test bootstrap & lightweight OpenCV mock for unit tests
// -------------------------------------------------------------
import { vi, beforeAll, afterAll } from "vitest";

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

// -------------------------------------------------------------
// OpenCV-lite mock (just enough for our tests)
// - RGBA-focused buffers
// - Basic Mat/MatVector, split/merge/resize/warpAffine
// - A few CV constants and utility helpers
// -------------------------------------------------------------

type Views = {
  u8: Uint8Array;
  u8c: Uint8ClampedArray;
  i32: Int32Array;
  f64: Float64Array;
};

function makeViews(buf: ArrayBuffer): Views {
  // Float64Array は 8 の倍数長でなければならないので安全に確保
  const f64Len = buf.byteLength - (buf.byteLength % 8);
  return {
    u8: new Uint8Array(buf),
    u8c: new Uint8ClampedArray(buf),
    i32: new Int32Array(buf.byteLength - (buf.byteLength % 4)),
    f64: new Float64Array(f64Len),
  };
}

class Mat {
  rows: number;
  cols: number;
  type: number;
  channels: number;
  _buf: ArrayBuffer;
  _views: Views;

  constructor(rows = 0, cols = 0, type = cv2.CV_8UC4) {
    this.rows = rows;
    this.cols = cols;
    this.type = type;

    if (type === cv2.CV_8UC1) this.channels = 1;
    else if (type === cv2.CV_8UC3) this.channels = 3;
    else if (type === cv2.CV_32SC2) this.channels = 2;
    else if (type === cv2.CV_64F) this.channels = 1;
    else this.channels = 4;

    const bytesPerElem =
      type === cv2.CV_32SC2 ? 4 : type === cv2.CV_64F ? 8 : 1;

    const byteLength = Math.max(1, rows * cols * this.channels * bytesPerElem);
    this._buf = new ArrayBuffer(byteLength);
    this._views = makeViews(this._buf);
  }

  get data() {
    return this._views.u8;
  }
  get data8U() {
    return this._views.u8;
  }
  get data32S() {
    return this._views.i32;
  }
  get data64F() {
    return this._views.f64;
  }

  setTo(scalar: number | [number, number, number, number]) {
    if (typeof scalar === "number") {
      this._views.u8c.fill(scalar);
      return;
    }
    const [r = 0, g = 0, b = 0, a = 255] = scalar;
    if (this.channels === 4) {
      for (let i = 0; i < this.rows * this.cols; i++) {
        const base = i * 4;
        this._views.u8c[base + 0] = r;
        this._views.u8c[base + 1] = g;
        this._views.u8c[base + 2] = b;
        this._views.u8c[base + 3] = a;
      }
    } else if (this.channels === 1) {
      this._views.u8c.fill(a);
    } else if (this.channels === 3) {
      for (let i = 0; i < this.rows * this.cols; i++) {
        const base = i * 3;
        this._views.u8c[base + 0] = r;
        this._views.u8c[base + 1] = g;
        this._views.u8c[base + 2] = b;
      }
    }
  }

  copyTo(dst: Mat) {
    if (
      dst.rows !== this.rows ||
      dst.cols !== this.cols ||
      dst.type !== this.type
    ) {
      dst.rows = this.rows;
      dst.cols = this.cols;
      dst.type = this.type;
      dst.channels = this.channels;
      dst._buf = new ArrayBuffer(this._buf.byteLength);
      dst._views = makeViews(dst._buf);
    }
    new Uint8Array(dst._buf).set(new Uint8Array(this._buf));
  }

  clone() {
    const m = new Mat(this.rows, this.cols, this.type);
    this.copyTo(m);
    return m;
  }

  convertTo(dst: Mat, _rtype: number = -1, alpha = 1, beta = 0) {
    const target = dst ?? this;
    if (dst && dst !== this) {
      target.rows = this.rows;
      target.cols = this.cols;
      target.type = this.type;
      target.channels = this.channels;
      target._buf = new ArrayBuffer(this._buf.byteLength);
      target._views = makeViews(target._buf);
    }
    const src = this._views.u8c;
    const out = target._views.u8c;
    for (let i = 0; i < out.length; i++) {
      const v = Math.round(src[i] * alpha + beta);
      out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  ptr(y: number, x: number) {
    const step = this.channels;
    const idx = (y * this.cols + x) * step;
    return this._views.u8c.subarray(idx, idx + step);
  }

  delete() {
    // no-op
  }
}

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

const cv2 = {
  // types
  CV_8UC1: 0x0100,
  CV_8UC3: 0x0300,
  CV_8UC4: 0x0400,
  CV_32SC2: 0x2200,
  CV_64F: 0x800,

  BORDER_CONSTANT: 0,
  INTER_LINEAR: 1,

  Mat,
  MatVector,

  Size: class Size {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },

  split(src: Mat, mv: MatVector) {
    const total = src.rows * src.cols;
    const channels = src.channels;
    const chMats: Mat[] = [];
    for (let c = 0; c < channels; c++) {
      chMats[c] = new Mat(src.rows, src.cols, cv2.CV_8UC1);
    }
    const s = src._views.u8c;
    for (let i = 0; i < total; i++) {
      const base = i * channels;
      for (let c = 0; c < channels; c++) {
        chMats[c]._views.u8c[i] = s[base + c];
      }
    }
    for (const m of chMats) mv.push_back(m);
  },

  merge(mv: MatVector, dst: Mat) {
    let channels = mv.size();
    if (channels !== 1 && channels !== 3 && channels !== 4) {
      channels = 4;
    }

    const rows = mv.get(0).rows;
    const cols = mv.get(0).cols;

    dst.rows = rows;
    dst.cols = cols;
    dst.channels = channels === 1 ? 1 : 4;
    dst.type = dst.channels === 1 ? cv2.CV_8UC1 : cv2.CV_8UC4;
    dst._buf = new ArrayBuffer(Math.max(1, rows * cols * dst.channels));
    dst._views = makeViews(dst._buf);

    const total = rows * cols;
    for (let i = 0; i < total; i++) {
      const base = i * dst.channels;
      if (channels === 1) {
        dst._views.u8c[base] = mv.get(0)._views.u8c[i];
      } else if (channels === 3) {
        dst._views.u8c[base + 0] = mv.get(0)._views.u8c[i];
        dst._views.u8c[base + 1] = mv.get(1)._views.u8c[i];
        dst._views.u8c[base + 2] = mv.get(2)._views.u8c[i];
        dst._views.u8c[base + 3] = 255;
      } else {
        dst._views.u8c[base + 0] = mv.get(0)._views.u8c[i];
        dst._views.u8c[base + 1] = mv.get(1)._views.u8c[i];
        dst._views.u8c[base + 2] = mv.get(2)._views.u8c[i];
        dst._views.u8c[base + 3] = mv.get(3)._views.u8c[i];
      }
    }
  },

  resize(src: Mat, dst: Mat, size: { width: number; height: number }) {
    const { width, height } = size;
    const channels = src.channels;
    dst.rows = height;
    dst.cols = width;
    dst.channels = channels;
    dst.type = src.type;
    dst._buf = new ArrayBuffer(Math.max(1, width * height * channels));
    dst._views = makeViews(dst._buf);

    const minRows = Math.min(src.rows, height);
    const minCols = Math.min(src.cols, width);
    for (let y = 0; y < minRows; y++) {
      for (let x = 0; x < minCols; x++) {
        const si = (y * src.cols + x) * channels;
        const di = (y * width + x) * channels;
        for (let c = 0; c < channels; c++) {
          dst._views.u8c[di + c] = src._views.u8c[si + c];
        }
      }
    }
  },

  matFromArray(rows: number, cols: number, type: number, arr: number[]) {
    const m = new Mat(rows, cols, type);
    if (type === cv2.CV_64F) {
      const len = Math.min(rows * cols, arr.length);
      for (let i = 0; i < len; i++) m._views.f64[i] = arr[i];
    } else {
      const len = Math.min(rows * cols, arr.length);
      for (let i = 0; i < len; i++) m._views.u8[i] = arr[i] as any;
    }
    return m;
  },

  warpAffine(
    src: Mat,
    dst: Mat,
    _M: Mat,
    dsize: { width: number; height: number },
  ) {
    cv2.resize(src, dst, dsize);
  },

  moments(_contour: Mat) {
    return {} as any;
  },
  HuMoments(_moments: any, out: Mat) {
    out.rows = 7;
    out.cols = 1;
    out.type = cv2.CV_64F;
    out.channels = 1;
    out._buf = new ArrayBuffer(7 * 8);
    out._views = makeViews(out._buf);
    for (let i = 0; i < 7; i++) out._views.f64[i] = i * 0.001;
  },
};

// emulate OpenCV startup flag used in some tests
(cv2 as any).onRuntimeInitialized = Promise.resolve();

// expose on global just in case
(globalThis as any).cv = cv2;

// -------------------------------------------------------------
// Vitest hooks
// -------------------------------------------------------------
beforeAll(() => {});
afterAll(() => {});

// -------------------------------------------------------------
// "@/lib/cv" モック
// - import パスのブレを全てカバー（@/lib/cv, @/lib/cv.ts, src/lib/cv）
// - default は Promise<cv>（本物の Promise）
// - モジュール namespace に対し then を呼ばれても動くよう `then` も生やす
// - 一部のコードが `;(await cv).Mat` のように参照しても動くよう
//   Promise 自体に cv のプロパティを合成
// -------------------------------------------------------------
function makeCvPromise() {
  const p: any = Promise.resolve(cv2);
  // Promise を namespace 的にも使えるようにメソッドを合成
  Object.assign(p, cv2);
  return p;
}
const cvPromise = makeCvPromise();

function cvMockFactory() {
  const mod: any = {
    __esModule: true,
    default: cvPromise,
  };
  // `import * as m from '@/lib/cv'; await m` のような扱いにも対応
  mod.then = (resolve: (v: any) => void, reject?: (e: any) => void) =>
    (cvPromise as Promise<any>).then(resolve, reject);
  return mod;
}

// 主要な解決パスをすべてモック
vi.mock("@/lib/cv", cvMockFactory);
vi.mock("@/lib/cv.ts", cvMockFactory);
vi.mock("src/lib/cv", cvMockFactory);
