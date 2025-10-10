// src/lib/cv.ts
// テスト環境では OpenCV を最小実装の thenable で返す。
// 本番・開発では既存のローダーにフォールバック。

type MatType = number;

const CV_8UC1 = 0x0000 as MatType;
const CV_8UC3 = 0x0003 as MatType;
const CV_8UC4 = 0x0004 as MatType;
const CV_32FC1 = 0x1000 as MatType;
const CV_32SC2 = 0x2002 as MatType;

const COLOR_RGB2RGBA = 0x20;

function channelsOf(type: MatType) {
  const depth = (type as number) & 0x000f;
  if (type === CV_32SC2) return 2;
  if (depth === 0x0004) return 4;
  if (depth === 0x0003) return 3;
  return 1;
}

class Size {
  constructor(
    public width = 0,
    public height = 0,
  ) {}
}

class Scalar {
  constructor(
    public v0 = 0,
    public v1 = 0,
    public v2 = 0,
    public v3 = 0,
  ) {}
}

class Mat {
  rows = 0;
  cols = 0;
  private _type: MatType = CV_8UC1;
  data?: Uint8Array;
  data32S?: Int32Array;
  data64F?: Float64Array;

  constructor(rows = 0, cols = 0, type: MatType = CV_8UC1) {
    this.create(rows, cols, type);
  }

  create(rows: number, cols: number, type: MatType) {
    this.rows = rows | 0;
    this.cols = cols | 0;
    this._type = type;

    const ch = channelsOf(type);
    const n = Math.max(0, this.rows * this.cols * ch);

    this.data = undefined;
    this.data32S = undefined;
    this.data64F = undefined;

    if (type === CV_32SC2) {
      this.data32S = new Int32Array(Math.max(0, this.rows * this.cols * 2));
    } else if (((type as number) & 0xf000) === 0x1000) {
      this.data64F = new Float64Array(n);
    } else {
      this.data = new Uint8Array(n);
    }
  }

  type() {
    return this._type;
  }

  channels() {
    return channelsOf(this._type);
  }

  copyTo(dst: Mat) {
    dst.create(this.rows, this.cols, this._type);
    if (this.data && dst.data) dst.data.set(this.data);
    if (this.data32S && dst.data32S) dst.data32S.set(this.data32S);
    if (this.data64F && dst.data64F) dst.data64F.set(this.data64F);
  }

  delete() {
    this.data = undefined;
    this.data32S = undefined;
    this.data64F = undefined;
    this.rows = 0;
    this.cols = 0;
  }
}

class MatVector {
  private arr: Mat[] = [];
  size() {
    return this.arr.length;
  }
  get(i: number) {
    return this.arr[i];
  }
  push_back(m: Mat) {
    this.arr.push(m);
  }
  pushBack(m: Mat) {
    this.push_back(m);
  }
  set(i: number, m: Mat) {
    this.arr[i] = m;
  }
  delete() {
    this.arr.length = 0;
  }
}

// ---- ops ----
function split(src: Mat, mv: MatVector) {
  const ch = src.channels();
  for (let c = 0; c < ch; c++)
    mv.push_back(new Mat(src.rows, src.cols, CV_8UC1));
  if (!src.data) return;
  for (let y = 0; y < src.rows; y++) {
    for (let x = 0; x < src.cols; x++) {
      const base = (y * src.cols + x) * ch;
      for (let c = 0; c < ch; c++) {
        const dst = mv.get(c);
        dst.data![y * src.cols + x] = src.data[base + c] ?? 0;
      }
    }
  }
}

function merge(mv: MatVector, dst: Mat) {
  const ch = mv.size();
  const rows = mv.get(0)?.rows ?? 0;
  const cols = mv.get(0)?.cols ?? 0;
  const type = ch === 4 ? CV_8UC4 : ch === 3 ? CV_8UC3 : CV_8UC1;
  dst.create(rows, cols, type);
  if (!dst.data) return;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      for (let c = 0; c < ch; c++) {
        const srcP = mv.get(c);
        dst.data[(y * cols + x) * ch + c] = srcP?.data?.[y * cols + x] ?? 0;
      }
    }
  }
}

function resize(src: Mat, dst: Mat, dsize: Size) {
  dst.create(dsize.height, dsize.width, src.type());
  if (src.data && dst.data) {
    const ch = src.channels();
    const minRows = Math.min(src.rows, dst.rows);
    const minCols = Math.min(src.cols, dst.cols);
    for (let y = 0; y < minRows; y++) {
      for (let x = 0; x < minCols; x++) {
        for (let c = 0; c < ch; c++) {
          dst.data[(y * dst.cols + x) * ch + c] =
            src.data[(y * src.cols + x) * ch + c];
        }
      }
    }
  }
}

function GaussianBlur(src: Mat, dst: Mat) {
  dst.create(src.rows, src.cols, src.type());
  if (src.data && dst.data) dst.data.set(src.data);
}

function cvtColor(src: Mat, dst: Mat, code: number) {
  if (code === COLOR_RGB2RGBA && src.channels() === 3) {
    dst.create(src.rows, src.cols, CV_8UC4);
    if (src.data && dst.data) {
      for (let i = 0; i < src.rows * src.cols; i++) {
        dst.data[i * 4 + 0] = src.data[i * 3 + 0] ?? 0;
        dst.data[i * 4 + 1] = src.data[i * 3 + 1] ?? 0;
        dst.data[i * 4 + 2] = src.data[i * 3 + 2] ?? 0;
        dst.data[i * 4 + 3] = 255;
      }
    }
    return;
  }
  src.copyTo(dst);
}

function warpAffine(
  src: Mat,
  dst: Mat,
  _M: Mat,
  dsize: Size,
  _flags?: number,
  _borderMode?: number,
  _borderValue?: Scalar,
) {
  dst.create(dsize.height, dsize.width, src.type());
  if (src.data && dst.data) {
    const ch = src.channels();
    const minRows = Math.min(src.rows, dst.rows);
    const minCols = Math.min(src.cols, dst.cols);
    for (let y = 0; y < minRows; y++) {
      for (let x = 0; x < minCols; x++) {
        for (let c = 0; c < ch; c++) {
          dst.data[(y * dst.cols + x) * ch + c] =
            src.data[(y * src.cols + x) * ch + c];
        }
      }
    }
  }
}

function matFromArray(
  rows: number,
  cols: number,
  type: MatType,
  arr: number[],
) {
  const m = new Mat(rows, cols, type);
  if (m.data64F) m.data64F.set(arr);
  if (m.data32S) m.data32S.set(arr.map((v) => v | 0));
  if (m.data) m.data.set(arr.map((v) => v | 0));
  return m;
}

function moments(_img: Mat, _binaryImage = true) {
  return {
    m00: 0,
    m10: 0,
    m01: 0,
    m20: 0,
    m11: 0,
    m02: 0,
    mu20: 0,
    mu11: 0,
    mu02: 0,
  };
}

function HuMoments(_m: any) {
  return [0, 0, 0, 0, 0, 0, 0];
}

function mean(_img: Mat) {
  return new Scalar(0, 0, 0, 0);
}

const cvCore = {
  Mat,
  Size,
  Scalar,
  MatVector,
  CV_8UC1,
  CV_8UC3,
  CV_8UC4,
  CV_32FC1,
  CV_32SC2,
  COLOR_RGB2RGBA,
  split,
  merge,
  resize,
  GaussianBlur,
  cvtColor,
  warpAffine,
  matFromArray,
  moments,
  HuMoments,
  mean,
  onRuntimeInitialized: Promise.resolve(true),
};

let cvPromise: Promise<any>;

if (process.env.NODE_ENV === "test") {
  // thenable にして、await / .then の両対応にする
  const thenable: any = Promise.resolve(cvCore);
  thenable.then = (onFulfilled: any, onRejected?: any) =>
    Promise.resolve(cvCore).then(onFulfilled, onRejected);
  cvPromise = thenable as Promise<any>;
} else {
  // 実環境は従来どおりのローダーへ
  cvPromise = import("./opencv-loader").then((m: any) => m.default());
}

export default cvPromise;
export {
  // （named import が必要な場合のためにエクスポートしておく）
  Mat,
  Size,
  Scalar,
  MatVector,
  CV_8UC1,
  CV_8UC3,
  CV_8UC4,
  CV_32FC1,
  CV_32SC2,
  COLOR_RGB2RGBA,
  split,
  merge,
  resize,
  GaussianBlur,
  cvtColor,
  warpAffine,
  matFromArray,
  moments,
  HuMoments,
  mean,
};
